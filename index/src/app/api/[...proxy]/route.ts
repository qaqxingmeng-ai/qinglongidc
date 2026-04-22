import { NextRequest, NextResponse } from 'next/server';

const GO_BACKEND_URL = process.env.GO_BACKEND_URL || 'http://127.0.0.1:8080';
const INTERNAL_KEY = process.env.API_INTERNAL_KEY || '';

// 上游请求超时（毫秒）。超时后 fetch 会被 AbortController 取消，避免挂死 Next.js 事件循环。
const UPSTREAM_TIMEOUT_MS = Number(process.env.BFF_UPSTREAM_TIMEOUT_MS || 30_000);

// 请求体大小上限（字节）。默认 4 MB，可通过环境变量覆盖。
// 防止恶意客户端用超大 body 耗尽 Node.js 内存（F-606）。
const MAX_BODY_BYTES = Number(process.env.BFF_MAX_BODY_BYTES || 4 * 1024 * 1024);

// 启动自检：生产环境必须显式设置 API_INTERNAL_KEY，否则后端 internal_key 中间件将无法区分"来自 BFF"与"直连"。
if (process.env.NODE_ENV === 'production' && !INTERNAL_KEY) {
  // 仅打印警告，不 throw，让开发者有机会在启动日志中看到提示。
  // eslint-disable-next-line no-console
  console.warn('[BFF] API_INTERNAL_KEY is empty in production; backend internal-key middleware will deny requests.');
}

/**
 * 从 NextRequest 中提取客户端真实 IP。
 * - 优先读取 Next.js 部署平台填充的 `x-forwarded-for`（多值时取第一个）。
 * - 退回到 `x-real-ip`。
 * - 最终退回到连接地址（某些平台通过 req.ip 暴露）。
 * 解决 F-605：不注入 XFF 会让后端所有 IP 维度（登录限速、登录历史、admin IP 白名单、WAF）失效。
 */
function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri.trim();
  // @ts-expect-error -- NextRequest.ip exists on Vercel / Edge runtimes
  return (req.ip as string | undefined) || '';
}

async function proxyRequest(req: NextRequest) {
  const url = new URL(req.url);
  const targetPath = url.pathname; // e.g. /api/auth/login
  const targetUrl = `${GO_BACKEND_URL}${targetPath}${url.search}`;

  const headers = new Headers();
  // Forward safe headers
  const forwardHeaders = [
    'content-type',
    'accept',
    'accept-language',
    'accept-encoding',
    'authorization',
    'cookie',
    'user-agent',
    'x-request-id',
    'x-csrf-token',
    'x-device-id',
    'x-requested-with',
    'range',
    'if-none-match',
    'if-modified-since',
  ];
  for (const h of forwardHeaders) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }

  // 注入真实客户端 IP（F-605）。
  const clientIp = getClientIp(req);
  if (clientIp) {
    // 追加（而不是覆盖）原有 XFF 链，让后端可以追溯代理层次。
    const existing = headers.get('x-forwarded-for');
    headers.set('x-forwarded-for', existing ? `${existing}, ${clientIp}` : clientIp);
    headers.set('x-real-ip', clientIp);
  }

  // Inject internal key (server-side only, never exposed to browser)
  if (INTERNAL_KEY) {
    headers.set('X-Internal-Key', INTERNAL_KEY);
  }
  headers.set('X-Proxy-Mode', 'next-bff');

  // 读取 body 并强制执行大小上限（F-606）。
  let body: ArrayBuffer | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    try {
      const buf = await req.arrayBuffer();
      if (buf.byteLength > MAX_BODY_BYTES) {
        return NextResponse.json(
          { error: '请求体过大', ok: false },
          { status: 413 },
        );
      }
      body = buf;
    } catch {
      return NextResponse.json(
        { error: '请求体解析失败', ok: false },
        { status: 400 },
      );
    }
  }

  // 上游超时控制（F-607）。
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let backendRes: Response | null = null;
  try {
    backendRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
      // @ts-expect-error -- Node fetch supports duplex
      duplex: body ? 'half' : undefined,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const isAbort = err instanceof Error && err.name === 'AbortError';
    if (isAbort) {
      return NextResponse.json(
        { error: '后端响应超时', ok: false },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { error: 'Backend service unavailable', ok: false },
      { status: 503 },
    );
  }
  clearTimeout(timeoutId);

  if (!backendRes) {
    return NextResponse.json(
      { error: 'Backend service unavailable', ok: false },
      { status: 503 },
    );
  }

  const resHeaders = new Headers();
  // Forward response headers
  const passthroughHeaders = [
    'content-type',
    'content-disposition',
    'content-length',
    'content-encoding',
    'etag',
    'last-modified',
    'set-cookie',
    'cache-control',
    'vary',
    'content-language',
    'retry-after',
    'x-request-id',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
  ];
  for (const h of passthroughHeaders) {
    const values = backendRes.headers.getSetCookie
      ? h === 'set-cookie'
        ? backendRes.headers.getSetCookie()
        : [backendRes.headers.get(h)]
      : [backendRes.headers.get(h)];
    for (const v of values) {
      if (v) resHeaders.append(h, v);
    }
  }

  return new NextResponse(backendRes.body, {
    status: backendRes.status,
    headers: resHeaders,
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const HEAD = proxyRequest;
export const OPTIONS = proxyRequest;
