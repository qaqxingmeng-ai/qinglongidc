'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import { apiFetch, extractApiError } from '@/lib/api-client';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  level: string;
  inviteCode?: string | null;
  createdAt: string;
  _count: { servers: number; orders: number };
}

const LEVEL_LABELS: Record<string, string> = {
  PARTNER: '合作商',
  VIP_TOP: '高级会员',
  VIP: '会员',
  GUEST: '普通用户',
};

const SETTABLE_LEVELS = ['GUEST', 'VIP', 'VIP_TOP'];

export default function AgentUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', level: 'GUEST' });
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isPartner = currentUser?.level === 'PARTNER';

  useEffect(() => {
    apiFetch('/api/agent/users', { method: 'GET' })
      .then((r) => r.json())
      .then((json) => { if (json.success) setUsers(json.data?.users || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const createUser = async () => {
    setCreating(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/agent/users', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      const json = await res.json();
      if (!json.success) throw new Error(extractApiError(json.error, '创建失败'));
      setUsers((prev) => [{ ...json.data, _count: { servers: 0, orders: 0 } }, ...prev]);
      setShowCreate(false);
      setCreateForm({ name: '', email: '', password: '', level: 'GUEST' });
      setMessage({ type: 'success', text: '用户已创建' });
      setTimeout(() => setMessage(null), 3000);
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : '创建失败' });
    } finally {
      setCreating(false);
    }
  };

  const updateLevel = async (userId: string, level: string) => {
    try {
      const res = await apiFetch(`/api/agent/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ level }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(extractApiError(json.error, '更新失败'));
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, level } : u)));
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : '更新失败' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  if (loading) return <div className="text-surface-400 py-20 text-center">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="section-title">我的客户</h1>
        {isPartner && (
          <button onClick={() => { setShowCreate(true); setMessage(null); }} className="btn-primary btn-sm">新增用户</button>
        )}
      </div>

      {message && !showCreate && (
        <div className={`mb-4 rounded-8 px-4 py-2 text-sm ${message.type === 'success' ? 'bg-semantic-success-light text-semantic-success-dark' : 'bg-semantic-danger-light text-semantic-danger'}`}>
          {message.text}
        </div>
      )}

      {users.length === 0 ? (
        <div className="text-center py-20 text-surface-400">暂无下属用户</div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-xs text-surface-400 font-medium select-none">
            <span className="col-span-3">用户名</span>
            <span className="col-span-3">邮箱</span>
            <span className="col-span-2">等级</span>
            <span className="col-span-1 text-center">服务器</span>
            <span className="col-span-1 text-center">订单</span>
            <span className="col-span-1 text-center">详情</span>
            <span className="col-span-1 text-right">时间</span>
          </div>

          {users.map((u) => (
            <div key={u.id} className="card py-3">
              <div className="grid grid-cols-12 gap-2 items-center text-sm">
                <span className="col-span-3 font-medium text-surface-600 truncate">
                  <Link href={`/agent/users/${u.id}`} className="hover:text-brand-500 transition">{u.name}</Link>
                </span>
                <span className="col-span-3 text-surface-400 text-xs truncate">{u.email}</span>
                <span className="col-span-2">
                  <div className="space-y-1">
                    <select
                      className="text-xs border border-surface-200 rounded px-1.5 py-0.5 bg-white"
                      value={u.level}
                      onChange={(e) => void updateLevel(u.id, e.target.value)}
                    >
                      {SETTABLE_LEVELS.map((l) => (
                        <option key={l} value={l}>{LEVEL_LABELS[l] || l}</option>
                      ))}
                    </select>
                    {u.role === 'AGENT' && u.inviteCode && (
                      <div className="text-[10px] text-surface-400 font-mono">邀请码 {u.inviteCode}</div>
                    )}
                  </div>
                </span>
                <span className="col-span-1 text-center text-surface-500">{u._count?.servers || 0}</span>
                <span className="col-span-1 text-center">
                  <Link href={`/agent/users/${u.id}?tab=orders`} className="text-brand-500 hover:underline text-xs">{u._count?.orders || 0}</Link>
                </span>
                <span className="col-span-1 text-center">
                  <Link href={`/agent/users/${u.id}`} className="text-brand-500 hover:underline text-xs">查看</Link>
                </span>
                <span className="col-span-1 text-right text-xs text-surface-400">{new Date(u.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div className="bg-white rounded-8 shadow-modal w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
              <p className="font-semibold text-surface-600">新增下属用户</p>
              <button onClick={() => setShowCreate(false)} className="text-surface-400 hover:text-surface-500 text-lg leading-none">x</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {message && (
                <div className={`rounded-8 px-3 py-2 text-sm ${message.type === 'success' ? 'bg-semantic-success-light text-semantic-success-dark' : 'bg-semantic-danger-light text-semantic-danger'}`}>
                  {message.text}
                </div>
              )}
              <div>
                <label className="label">用户名</label>
                <input className="input" value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">邮箱</label>
                <input className="input" type="email" value={createForm.email} onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label className="label">密码</label>
                <input className="input" type="password" value={createForm.password} onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))} />
              </div>
              <div>
                <label className="label">等级</label>
                <select className="input" value={createForm.level} onChange={(e) => setCreateForm((p) => ({ ...p, level: e.target.value }))}>
                  {SETTABLE_LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l] || l}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-surface-100">
              <button onClick={() => setShowCreate(false)} className="btn-secondary btn-sm">取消</button>
              <button onClick={createUser} disabled={creating} className="btn-primary btn-sm disabled:opacity-50">
                {creating ? '创建中...' : '创建用户'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

