'use client';

import { useMemo, useState } from 'react';
import { withApiBase } from '@/lib/api-client';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type EndpointDoc = {
  module: '认证' | '产品' | '订单' | '服务器' | '财务';
  name: string;
  method: Method;
  path: string;
  auth: '公开' | '用户' | '管理员';
  description: string;
  requestExample?: string;
  responseExample: string;
};

const endpointDocs: EndpointDoc[] = [
  {
    module: '认证',
    name: '用户登录',
    method: 'POST',
    path: '/api/auth/login',
    auth: '公开',
    description: '使用邮箱和密码登录，成功后下发 HttpOnly Cookie。',
    requestExample: JSON.stringify({ email: 'demo@example.com', password: 'your-password' }, null, 2),
    responseExample: JSON.stringify({ success: true, data: { user: { id: 'u_xxx', email: 'demo@example.com', role: 'USER' } } }, null, 2),
  },
  {
    module: '认证',
    name: '获取当前用户',
    method: 'GET',
    path: '/api/auth/me',
    auth: '用户',
    description: '获取当前登录用户信息。',
    responseExample: JSON.stringify({ success: true, data: { id: 'u_xxx', email: 'demo@example.com', role: 'USER' } }, null, 2),
  },
  {
    module: '产品',
    name: '产品列表',
    method: 'GET',
    path: '/api/products?page=1&pageSize=20',
    auth: '公开',
    description: '分页查询产品列表，支持筛选和排序参数。',
    responseExample: JSON.stringify({ success: true, data: { products: [{ id: 'p_xxx', name: 'E5-2680v4', price: 299 }], total: 1, page: 1, pageSize: 20 } }, null, 2),
  },
  {
    module: '产品',
    name: '产品详情',
    method: 'GET',
    path: '/api/products/{id}',
    auth: '公开',
    description: '获取单个产品的完整信息。',
    responseExample: JSON.stringify({ success: true, data: { id: 'p_xxx', name: 'E5-2680v4', region: '华东', status: 'ACTIVE' } }, null, 2),
  },
  {
    module: '订单',
    name: '创建订单',
    method: 'POST',
    path: '/api/orders',
    auth: '用户',
    description: '创建新订单，支持优惠券和积分抵扣。',
    requestExample: JSON.stringify({ productId: 'p_xxx', months: 1, couponCode: 'WELCOME50', pointsToUse: 100 }, null, 2),
    responseExample: JSON.stringify({ success: true, data: { id: 'o_xxx', status: 'PENDING', totalAmount: 249 } }, null, 2),
  },
  {
    module: '订单',
    name: '订单列表',
    method: 'GET',
    path: '/api/orders?page=1&pageSize=20',
    auth: '用户',
    description: '分页查询当前用户订单。',
    responseExample: JSON.stringify({ success: true, data: { orders: [{ id: 'o_xxx', status: 'PAID' }], total: 1 } }, null, 2),
  },
  {
    module: '服务器',
    name: '我的服务器列表',
    method: 'GET',
    path: '/api/dashboard/servers?page=1&pageSize=20',
    auth: '用户',
    description: '查询当前用户服务器实例。',
    responseExample: JSON.stringify({ success: true, data: { servers: [{ id: 's_xxx', status: 'ACTIVE', expireDate: '2026-12-31' }], total: 1 } }, null, 2),
  },
  {
    module: '服务器',
    name: '服务器续费',
    method: 'POST',
    path: '/api/dashboard/servers/{id}/renew',
    auth: '用户',
    description: '续费服务器，扣减余额并延长到期时间。',
    requestExample: JSON.stringify({ months: 1 }, null, 2),
    responseExample: JSON.stringify({ success: true, data: { renewedMonths: 1, newExpireDate: '2027-01-31' } }, null, 2),
  },
  {
    module: '财务',
    name: '财务总览',
    method: 'GET',
    path: '/api/dashboard/finance',
    auth: '用户',
    description: '获取余额、总充值、总消费等财务汇总。',
    responseExample: JSON.stringify({ success: true, data: { balance: 1234.56, totalRecharge: 3000, totalConsume: 1765.44 } }, null, 2),
  },
  {
    module: '财务',
    name: '交易流水',
    method: 'GET',
    path: '/api/dashboard/finance/transactions?page=1&pageSize=20',
    auth: '用户',
    description: '分页查询交易明细。',
    responseExample: JSON.stringify({ success: true, data: { transactions: [{ id: 't_xxx', type: 'RECHARGE', amount: 100 }], total: 1 } }, null, 2),
  },
];

const endpointTemplates = endpointDocs.map((item) => ({
  label: `[${item.method}] ${item.path}`,
  method: item.method,
  path: item.path.includes('{id}') ? item.path.replace('{id}', '') : item.path,
  body: item.requestExample || '',
}));

const errorCodes = [
  { code: 400, meaning: '请求参数错误', suggestion: '检查请求体字段、类型、枚举范围是否正确。' },
  { code: 401, meaning: '未登录或凭证失效', suggestion: '确认已登录，或在 Authorization 头传 Bearer Token。' },
  { code: 403, meaning: '权限不足', suggestion: '确认当前角色是否有权限访问该接口。' },
  { code: 404, meaning: '资源不存在', suggestion: '确认路径参数和资源 ID 是否正确。' },
  { code: 429, meaning: '请求过于频繁', suggestion: '降低调用频率，增加重试退避。' },
  { code: 500, meaning: '服务内部错误', suggestion: '记录请求参数和时间，联系管理员排查日志。' },
  { code: 503, meaning: '后端服务暂不可用', suggestion: '稍后重试，检查后端服务与网络状态。' },
];

export default function ApiDocsPage() {
  const [token, setToken] = useState('');
  const [selected, setSelected] = useState(0);
  const [customPath, setCustomPath] = useState(endpointTemplates[0]?.path || '/api/health');
  const [customMethod, setCustomMethod] = useState<Method>(endpointTemplates[0]?.method || 'GET');
  const [customBody, setCustomBody] = useState(endpointTemplates[0]?.body || '');
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [resultText, setResultText] = useState('');

  const moduleGroups = useMemo(() => {
    return {
      认证: endpointDocs.filter((item) => item.module === '认证'),
      产品: endpointDocs.filter((item) => item.module === '产品'),
      订单: endpointDocs.filter((item) => item.module === '订单'),
      服务器: endpointDocs.filter((item) => item.module === '服务器'),
      财务: endpointDocs.filter((item) => item.module === '财务'),
    };
  }, []);

  const applyTemplate = (index: number) => {
    const tpl = endpointTemplates[index];
    if (!tpl) return;
    setSelected(index);
    setCustomMethod(tpl.method);
    setCustomPath(tpl.path);
    setCustomBody(tpl.body);
  };

  const sendRequest = async () => {
    const path = customPath.trim();
    if (!path.startsWith('/api/')) {
      setStatusText('请求未发送');
      setResultText('路径必须以 /api/ 开头。');
      return;
    }

    setSending(true);
    setStatusText('请求中...');
    setResultText('');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token.trim()) {
        headers.Authorization = `Bearer ${token.trim()}`;
      }

      const init: RequestInit = {
        method: customMethod,
        headers,
      };

      if (customMethod !== 'GET' && customMethod !== 'DELETE') {
        const bodyText = customBody.trim();
        if (bodyText) {
          JSON.parse(bodyText);
          init.body = bodyText;
        }
      }

      const response = await fetch(withApiBase(path), init);
      const contentType = response.headers.get('content-type') || '';
      let parsed: unknown;
      if (contentType.includes('application/json')) {
        parsed = await response.json();
      } else {
        parsed = await response.text();
      }

      setStatusText(`HTTP ${response.status} ${response.statusText}`);
      setResultText(typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2));
    } catch (err) {
      setStatusText('请求失败');
      setResultText(err instanceof Error ? err.message : '未知错误');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-surface-600">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <header className="bg-white border border-surface-100 rounded-8 p-6">
          <h1 className="text-2xl font-semibold tracking-tight">API 文档</h1>
          <p className="text-sm text-surface-400 mt-2">
            覆盖认证、产品、订单、服务器、财务五大模块，含请求/响应示例、错误码说明、SDK 示例与在线调试。
          </p>
        </header>

        <section className="bg-white border border-surface-100 rounded-8 p-6 space-y-6">
          <h2 className="text-lg font-semibold">接口目录</h2>
          {(['认证', '产品', '订单', '服务器', '财务'] as const).map((module) => (
            <div key={module} className="space-y-3">
              <h3 className="text-sm font-semibold text-surface-500">{module}</h3>
              <div className="space-y-3 sm:hidden">
                {moduleGroups[module].map((item) => (
                  <div key={`${module}-${item.name}-${item.path}`} className="rounded-8 border border-surface-100 bg-surface-50/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-surface-600">{item.name}</p>
                        <p className="mt-1 break-all font-mono text-[11px] text-surface-400">{item.path}</p>
                      </div>
                      <span className="inline-flex rounded bg-semantic-info-light px-2 py-0.5 text-[10px] text-brand-600">{item.method}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                      <span className="rounded bg-white px-2 py-1 text-surface-400">{item.auth}</span>
                    </div>
                    <p className="mt-3 text-xs leading-6 text-surface-500">{item.description}</p>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto rounded-8 border border-surface-100 sm:block">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 text-surface-400">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">接口</th>
                      <th className="text-left px-4 py-3 font-medium">方法</th>
                      <th className="text-left px-4 py-3 font-medium">路径</th>
                      <th className="text-left px-4 py-3 font-medium">权限</th>
                      <th className="text-left px-4 py-3 font-medium">说明</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {moduleGroups[module].map((item) => (
                      <tr key={`${module}-${item.name}-${item.path}`} className="hover:bg-surface-50/60">
                        <td className="px-4 py-3 text-surface-600 font-medium">{item.name}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-0.5 rounded text-xs bg-semantic-info-light text-brand-600">{item.method}</span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-surface-500">{item.path}</td>
                        <td className="px-4 py-3 text-surface-500">{item.auth}</td>
                        <td className="px-4 py-3 text-surface-500">{item.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-surface-100 rounded-8 p-6 space-y-4">
            <h2 className="text-lg font-semibold">请求/响应示例</h2>
            <div>
              <label className="block text-xs text-surface-400 mb-1">选择接口</label>
              <select
                className="w-full border border-surface-200 rounded-lg px-3 py-2 text-sm"
                value={selected}
                onChange={(e) => applyTemplate(parseInt(e.target.value, 10))}
              >
                {endpointTemplates.map((tpl, idx) => (
                  <option key={tpl.label} value={idx}>{tpl.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-surface-400">请求示例</p>
              <pre className="bg-surface-50 border border-surface-200 rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap">
                {endpointDocs[selected]?.requestExample || '该接口无需请求体'}
              </pre>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-surface-400">响应示例</p>
              <pre className="bg-surface-50 border border-surface-200 rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap">
                {endpointDocs[selected]?.responseExample}
              </pre>
            </div>
          </div>

          <div className="bg-white border border-surface-100 rounded-8 p-6 space-y-4">
            <h2 className="text-lg font-semibold">在线调试</h2>
            <p className="text-xs text-surface-400">支持输入 Bearer Token 进行接口联调。请求会走同源 /api 代理。</p>
            <div>
              <label className="block text-xs text-surface-400 mb-1">Bearer Token（可选）</label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="输入 API Token"
                className="w-full border border-surface-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <select
                value={customMethod}
                onChange={(e) => setCustomMethod(e.target.value as Method)}
                className="border border-surface-200 rounded-lg px-3 py-2 text-sm sm:col-span-1"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
              <input
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                className="border border-surface-200 rounded-lg px-3 py-2 text-sm font-mono sm:col-span-2"
                placeholder="/api/products?page=1&pageSize=20"
              />
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1">请求体（JSON）</label>
              <textarea
                value={customBody}
                onChange={(e) => setCustomBody(e.target.value)}
                rows={6}
                className="w-full border border-surface-200 rounded-lg px-3 py-2 text-xs font-mono"
                placeholder={`{\n  "field": "value"\n}`}
              />
            </div>
            <button
              onClick={sendRequest}
              disabled={sending}
              className="w-full bg-surface-800 text-white text-sm rounded-lg py-2.5 hover:bg-surface-700 disabled:opacity-40"
            >
              {sending ? '请求中...' : '发送请求'}
            </button>
            <div className="space-y-2">
              <p className="text-xs text-surface-400">响应状态</p>
              <div className="text-xs text-surface-500 bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 min-h-8">{statusText || '尚未发送请求'}</div>
              <p className="text-xs text-surface-400">响应内容</p>
              <pre className="bg-surface-50 border border-surface-200 rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap min-h-32">
                {resultText || '尚无响应'}
              </pre>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-surface-100 rounded-8 p-6 space-y-3">
            <h2 className="text-lg font-semibold">错误码对照表</h2>
            <div className="space-y-3 sm:hidden">
              {errorCodes.map((item) => (
                <div key={item.code} className="rounded-8 border border-surface-100 bg-surface-50/60 p-4">
                  <p className="font-mono text-xs text-surface-500">{item.code}</p>
                  <p className="mt-2 text-sm font-medium text-surface-600">{item.meaning}</p>
                  <p className="mt-2 text-xs leading-6 text-surface-500">{item.suggestion}</p>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto border border-surface-100 rounded-8 sm:block">
              <table className="w-full text-sm">
                <thead className="bg-surface-50 text-surface-400">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">状态码</th>
                    <th className="text-left px-4 py-3 font-medium">含义</th>
                    <th className="text-left px-4 py-3 font-medium">处理建议</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {errorCodes.map((item) => (
                    <tr key={item.code}>
                      <td className="px-4 py-3 font-mono text-xs text-surface-500">{item.code}</td>
                      <td className="px-4 py-3 text-surface-500">{item.meaning}</td>
                      <td className="px-4 py-3 text-surface-500">{item.suggestion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-surface-100 rounded-8 p-6 space-y-3">
            <h2 className="text-lg font-semibold">SDK 示例代码</h2>
            <div className="space-y-2">
              <p className="text-xs text-surface-400">Python</p>
              <pre className="bg-surface-50 border border-surface-200 rounded-lg p-3 text-xs overflow-auto">
{`import requests\n\nbase = \"https://your-domain.com\"\ntoken = \"your_token\"\nresp = requests.get(\n    f\"{base}/api/products?page=1&pageSize=20\",\n    headers={\"Authorization\": f\"Bearer {token}\"},\n    timeout=10,\n)\nprint(resp.status_code, resp.json())`}
              </pre>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-surface-400">Node.js</p>
              <pre className="bg-surface-50 border border-surface-200 rounded-lg p-3 text-xs overflow-auto">
{`const token = 'your_token';\nconst res = await fetch('https://your-domain.com/api/orders?page=1&pageSize=20', {\n  headers: { Authorization: \`Bearer ${token}\` }\n});\nconsole.log(res.status, await res.json());`}
              </pre>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-surface-400">Go</p>
              <pre className="bg-surface-50 border border-surface-200 rounded-lg p-3 text-xs overflow-auto">
{`client := &http.Client{Timeout: 10 * time.Second}\nreq, _ := http.NewRequest("GET", "https://your-domain.com/api/dashboard/finance", nil)\nreq.Header.Set("Authorization", "Bearer your_token")\nresp, err := client.Do(req)\nif err != nil {\n  log.Fatal(err)\n}\ndefer resp.Body.Close()`}
              </pre>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
