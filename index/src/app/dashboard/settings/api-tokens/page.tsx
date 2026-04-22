'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

interface ApiToken {
  id: string;
  name: string;
  tokenSuffix: string;
  scope: string;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
}

export default function ApiTokensPage() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [form, setForm] = useState({ name: '', scope: 'READ', expiresIn: 90 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const r = await apiFetch('/api/dashboard/api-tokens');
    const j = await r.json();
    if (j.success) setTokens(j.data.tokens ?? []);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim()) { setError('请填写 Token 名称'); return; }
    setSaving(true);
    setError('');
    const r = await apiFetch('/api/dashboard/api-tokens', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    const j = await r.json();
    setSaving(false);
    if (j.success) {
      setNewToken(j.data.token);
      setShowCreate(false);
      load();
    } else {
      setError(j.error ?? '创建失败');
    }
  };

  const deleteToken = async (id: string) => {
    if (!confirm('确认删除此 Token？删除后无法恢复。')) return;
    await apiFetch(`/api/dashboard/api-tokens/${id}`, { method: 'DELETE' });
    load();
  };

  const scopeLabel = (s: string) => s === 'READWRITE' ? '读写' : '只读';
  const scopeColor = (s: string) => s === 'READWRITE' ? 'text-semantic-warning bg-orange-50' : 'text-brand-500 bg-semantic-info-light';

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-surface-600">API Token 管理</h1>
          <p className="text-sm text-surface-400 mt-0.5">PARTNER 等级用户可创建最多 5 个 API Token</p>
          <Link href="/api-docs" className="inline-block mt-2 text-xs text-brand-500 hover:text-brand-600 hover:underline">
            查看 API 文档与在线调试
          </Link>
          <Link href="/dashboard/settings/api-usage" className="inline-block mt-1 text-xs text-brand-500 hover:text-brand-600 hover:underline">
            查看 API 调用统计
          </Link>
        </div>
        <button
          onClick={() => { setShowCreate(true); setNewToken(''); setError(''); }}
          className="px-4 py-2 bg-surface-800 text-white text-sm rounded-lg hover:bg-surface-700 transition-colors"
        >
          创建 Token
        </button>
      </div>

      {/* New token display — shown only once */}
      {newToken && (
        <div className="bg-semantic-success-light border border-green-200 rounded-8 p-4 space-y-2">
          <p className="text-sm font-medium text-green-800">Token 已创建，请立即复制保存，之后将无法再次查看：</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-green-200 rounded px-3 py-2 text-xs font-mono text-surface-600 break-all">
              {newToken}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(newToken)}
              className="px-3 py-2 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700"
            >
              复制
            </button>
          </div>
          <button onClick={() => setNewToken('')} className="text-xs text-semantic-success hover:text-green-800">
            已复制，关闭提示
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="bg-white border border-surface-200 rounded-8 p-5 space-y-4">
          <h2 className="text-sm font-medium text-surface-600">创建新 Token</h2>
          {error && <p className="text-sm text-semantic-danger">{error}</p>}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-surface-400 block mb-1">名称</label>
              <input
                type="text"
                placeholder="如：我的脚本"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={100}
                className="w-full border border-surface-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-surface-400 block mb-1">权限范围</label>
                <select
                  value={form.scope}
                  onChange={(e) => setForm({ ...form, scope: e.target.value })}
                  className="w-full border border-surface-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                >
                  <option value="READ">只读（查询产品/订单/服务器）</option>
                  <option value="READWRITE">读写（+创建订单/续费）</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-surface-400 block mb-1">有效期</label>
                <select
                  value={form.expiresIn}
                  onChange={(e) => setForm({ ...form, expiresIn: parseInt(e.target.value) })}
                  className="w-full border border-surface-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                >
                  <option value={30}>30 天</option>
                  <option value={90}>90 天</option>
                  <option value={180}>180 天</option>
                  <option value={365}>365 天</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-surface-500 hover:text-surface-600">取消</button>
            <button onClick={create} disabled={saving}
              className="px-4 py-2 bg-surface-800 text-white text-sm rounded-lg hover:bg-surface-700 disabled:opacity-40">
              {saving ? '创建中...' : '创建'}
            </button>
          </div>
        </div>
      )}

      {/* Token list */}
      <div className="bg-white border border-surface-100 rounded-8 overflow-hidden">
        {tokens.length === 0 ? (
          <div className="p-8 text-center text-sm text-surface-400">暂无 Token，点击右上角创建</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-50 border-b border-surface-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-surface-400">名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-surface-400">Token</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-surface-400">权限</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-surface-400">到期时间</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-surface-400">最后使用</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tokens.map((t) => (
                <tr key={t.id} className="hover:bg-surface-50/50">
                  <td className="px-4 py-3 font-medium text-surface-600">{t.name}</td>
                  <td className="px-4 py-3 font-mono text-surface-400 text-xs">...{t.tokenSuffix}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${scopeColor(t.scope)}`}>
                      {scopeLabel(t.scope)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-surface-400 text-xs">
                    {t.expiresAt ? new Date(t.expiresAt).toLocaleDateString('zh-CN') : '永不到期'}
                  </td>
                  <td className="px-4 py-3 text-surface-400 text-xs">
                    {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString('zh-CN') : '从未使用'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => deleteToken(t.id)}
                      className="text-xs text-semantic-danger hover:text-red-700">
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="bg-surface-50 border border-surface-100 rounded-8 p-4 text-xs text-surface-400 space-y-1">
        <p className="font-medium text-surface-500">使用说明</p>
        <p>在 API 请求头中添加：<code className="bg-white border border-surface-200 px-1 rounded">Authorization: Bearer &lt;your_token&gt;</code></p>
        <p>只读 Token 可访问：产品列表、订单查询、服务器状态。读写 Token 额外可：创建订单、续费服务器。</p>
      </div>
    </div>
  );
}
