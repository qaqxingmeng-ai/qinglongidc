const trimSlash = (value: string) => value.replace(/\/+$/, '');
const ensureLeadingSlash = (value: string) => (value.startsWith('/') ? value : `/${value}`);
const CSRF_COOKIE_NAME = 'csrf_token';
const DEVICE_STORAGE_KEY = 'device_id';

type ApiMode = 'proxy' | 'direct';

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function getApiMode(): ApiMode {
  const mode = (process.env.NEXT_PUBLIC_API_MODE || 'proxy').toLowerCase();
  return mode === 'direct' ? 'direct' : 'proxy';
}

export function getPublicApiBaseUrl(): string {
  return trimSlash(process.env.NEXT_PUBLIC_API_BASE_URL || '');
}

export function withApiBase(path: string): string {
  if (isAbsoluteUrl(path)) return path;

  const normalizedPath = ensureLeadingSlash(path);
  const mode = getApiMode();

  // Default and recommended mode for browser: same-origin /api proxy.
  if (mode === 'proxy') {
    return normalizedPath;
  }

  // Direct mode for true frontend/backend split deployments.
  const base = getPublicApiBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const encoded = `${encodeURIComponent(name)}=`;
  const parts = document.cookie ? document.cookie.split('; ') : [];
  for (const part of parts) {
    if (part.startsWith(encoded)) {
      return decodeURIComponent(part.slice(encoded.length));
    }
  }
  return '';
}

let csrfTokenPromise: Promise<string> | null = null;

function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  const saved = window.localStorage.getItem(DEVICE_STORAGE_KEY);
  if (saved) return saved;

  const next = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(DEVICE_STORAGE_KEY, next);
  return next;
}

async function ensureCsrfToken(): Promise<string> {
  if (typeof window === 'undefined') return '';

  const cached = readCookie(CSRF_COOKIE_NAME);
  if (cached) return cached;

  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch(withApiBase('/api/auth/csrf'), {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) return '';
        try {
          const json = await res.json();
          if (json?.token) return String(json.token);
          if (json?.data?.token) return String(json.data.token);
        } catch {
          // ignore json parse errors
        }
        return readCookie(CSRF_COOKIE_NAME);
      })
      .catch(() => '')
      .finally(() => {
        csrfTokenPromise = null;
      });
  }

  return csrfTokenPromise;
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = withApiBase(input);
  const method = (init?.method || 'GET').toUpperCase();
  const isFormDataBody = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> || {}),
  };
  if (!isFormDataBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && typeof window !== 'undefined' && !headers['X-CSRF-Token']) {
    const csrfToken = await ensureCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  if (typeof window !== 'undefined' && !headers['X-Device-Id']) {
    const deviceId = getDeviceId();
    if (deviceId) headers['X-Device-Id'] = deviceId;
  }

  return fetch(url, {
    credentials: 'include',
    ...init,
    headers,
  });
}

export function isApiSuccess(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.success === 'boolean') return obj.success;
  if (obj.error !== undefined && obj.error !== null && obj.error !== '') return false;
  return true;
}

export function pickApiData<T>(payload: unknown, fallbackKeys: string[] = []): T {
  if (!payload || typeof payload !== 'object') return payload as T;

  const obj = payload as Record<string, unknown>;
  if ('data' in obj) return obj.data as T;

  for (const key of fallbackKeys) {
    if (key in obj) return obj[key] as T;
  }

  return payload as T;
}

export function extractApiError(err: unknown, fallback = '操作失败'): string {
  if (typeof err === 'string') return err || fallback;
  if (!err || typeof err !== 'object') return fallback;
  const obj = err as Record<string, unknown>;
  if (typeof obj.message === 'string') return obj.message || fallback;
  if (typeof obj.error === 'string') return obj.error || fallback;
  if (obj.error && typeof obj.error === 'object') {
    const e = obj.error as Record<string, unknown>;
    if (typeof e.message === 'string') return e.message || fallback;
  }
  return fallback;
}
