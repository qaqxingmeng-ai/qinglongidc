'use client';

import { useState, useEffect } from 'react';
import { apiFetch, extractApiError } from '@/lib/api-client';
import { useToast } from '@/components/admin/layout';

interface UserBalance {
  id: string;
  name: string;
  email: string;
  balance: number;
  level: string;
  role: string;
  transactionCount: number;
}

const LEVEL_MAP: Record<string, string> = {
  PARTNER: '合作商',
  VIP_TOP: '大客户',
  VIP: 'VIP',
  GUEST: '普通',
};

const ROLE_MAP: Record<string, string> = {
  ADMIN: '管理员',
  AGENT: '渠道商',
  USER: '用户',
};

export default function FinanceBalancePage() {
  const toast = useToast();
  const [users, setUsers] = useState<UserBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adjustModal, setAdjustModal] = useState<UserBalance | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async (q?: string) => {
    setLoading(true);
    const params = q ? `?search=${encodeURIComponent(q)}` : '';
    try {
      const res = await apiFetch(`/api/admin/finance/balance${params}`, { method: 'GET' });
      const json = await res.json();
      if (json.success) setUsers(json.data.users);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleSearch = () => { fetchUsers(search); };

  const handleAdjust = async () => {
    if (!adjustModal || !adjustAmount || !adjustNote.trim()) return;
    const amount = parseFloat(adjustAmount);
    if (isNaN(amount) || amount === 0) return;

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/admin/finance/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: adjustModal.id, amount, note: adjustNote.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setAdjustModal(null);
        setAdjustAmount('');
        setAdjustNote('');
        toast.success('调账成功');
        fetchUsers(search);
      } else {
        toast.error(extractApiError(json.error, '操作失败'));
      }
    } catch {
      toast.error('网络错误');
    }
    setSubmitting(false);
  };

  const totalBalance = users.reduce((s, u) => s + u.balance, 0);

  return (
    <div>
      <h1 className="page-title">充值 & 调账</h1>

      {/* Summary */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="bg-white rounded-8 border border-surface-100 p-5">
          <p className="text-xs text-surface-400 mb-1">平台总余额</p>
          <p className="text-2xl font-semibold text-surface-600">{totalBalance.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-8 border border-surface-100 p-5">
          <p className="text-xs text-surface-400 mb-1">有余额用户数</p>
          <p className="text-2xl font-semibold text-brand-500">{users.filter(u => u.balance > 0).length}</p>
        </div>
        <div className="bg-white rounded-8 border border-surface-100 p-5">
          <p className="text-xs text-surface-400 mb-1">用户总数</p>
          <p className="text-2xl font-semibold text-surface-500">{users.length}</p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="搜索用户名/邮箱..."
          className="w-full flex-1 rounded-lg border border-surface-200 px-3 py-2 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 sm:max-w-xs"
        />
        <button onClick={handleSearch} className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm hover:bg-brand-600 transition">搜索</button>
      </div>

      {/* User list */}
      {loading ? (
        <div className="text-surface-400 py-20 text-center">加载中...</div>
      ) : users.length === 0 ? (
        <div className="text-surface-400 py-20 text-center text-sm">暂无数据</div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {users.map(u => (
              <div key={u.id} className="rounded-8 border border-surface-100 bg-white p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-surface-600">{u.name}</p>
                    <p className="truncate text-xs text-surface-400">{u.email}</p>
                  </div>
                  <p className={`text-sm font-semibold ${u.balance > 0 ? 'text-semantic-success' : 'text-surface-400'}`}>
                    {u.balance.toFixed(2)}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 rounded-8 bg-surface-50 px-3 py-3 text-xs">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-surface-400">角色/等级</p>
                    <p className="mt-1 text-surface-500">{ROLE_MAP[u.role] || u.role} / {LEVEL_MAP[u.level] || u.level}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-surface-400">流水数</p>
                    <p className="mt-1 text-surface-500">{u.transactionCount}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => { setAdjustModal(u); setAdjustAmount(''); setAdjustNote(''); }}
                    className="flex-1 rounded-8 bg-semantic-info-light px-3 py-2 text-xs font-medium text-brand-500 transition hover:bg-brand-50"
                  >
                    充值
                  </button>
                  <button
                    onClick={() => { setAdjustModal(u); setAdjustAmount('-'); setAdjustNote(''); }}
                    className="flex-1 rounded-8 bg-semantic-danger-light px-3 py-2 text-xs font-medium text-semantic-danger transition hover:bg-red-100"
                  >
                    扣款
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-8 border border-surface-100 bg-white md:block">
            <div className="grid grid-cols-12 gap-2 border-b border-surface-100 bg-surface-50/50 px-4 py-2 text-[11px] font-medium text-surface-400">
              <div className="col-span-3">用户</div>
              <div className="col-span-2">角色/等级</div>
              <div className="col-span-2 text-right">余额</div>
              <div className="col-span-2 text-right">流水数</div>
              <div className="col-span-3 text-right">操作</div>
            </div>
            {users.map(u => (
              <div key={u.id} className="grid grid-cols-12 gap-2 border-b border-surface-50 px-4 py-2.5 text-xs transition last:border-b-0 hover:bg-semantic-info-light/20 items-center">
                <div className="col-span-3">
                  <p className="truncate font-medium text-surface-600">{u.name}</p>
                  <p className="truncate text-[10px] text-surface-400">{u.email}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-surface-500">{ROLE_MAP[u.role] || u.role}</span>
                  <span className="ml-1 text-[10px] text-surface-400">/ {LEVEL_MAP[u.level] || u.level}</span>
                </div>
                <div className={`col-span-2 text-right font-semibold ${u.balance > 0 ? 'text-semantic-success' : 'text-surface-400'}`}>
                  {u.balance.toFixed(2)}
                </div>
                <div className="col-span-2 text-right text-surface-400">{u.transactionCount}</div>
                <div className="col-span-3 flex items-center justify-end gap-2 text-right">
                  <button
                    onClick={() => { setAdjustModal(u); setAdjustAmount(''); setAdjustNote(''); }}
                    className="rounded bg-semantic-info-light px-2.5 py-1 text-[11px] font-medium text-brand-500 transition hover:bg-brand-50"
                  >
                    充值
                  </button>
                  <button
                    onClick={() => { setAdjustModal(u); setAdjustAmount('-'); setAdjustNote(''); }}
                    className="rounded bg-semantic-danger-light px-2.5 py-1 text-[11px] font-medium text-semantic-danger transition hover:bg-red-100"
                  >
                    扣款
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Adjust Modal */}
      {adjustModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center modal-overlay"
          onMouseDown={e => { if (e.target === e.currentTarget) setAdjustModal(null); }}
        >
          <div className="w-full max-w-md p-6 modal-panel">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-surface-600">余额调整</h3>
                <p className="text-xs text-surface-400 mt-0.5">{adjustModal.name} ({adjustModal.email})</p>
                <p className="text-xs text-surface-400 mt-1">当前余额: <span className="font-semibold">{adjustModal.balance.toFixed(2)}</span></p>
              </div>
              <button onClick={() => setAdjustModal(null)} className="text-surface-400 hover:text-surface-500 text-xl leading-none">&times;</button>
            </div>

            <div className="admin-page animate-fade-in-up">
              <div>
                <label className="text-xs text-surface-400 mb-1 block">金额（正数充值，负数扣款）</label>
                <input
                  type="number"
                  step="0.01"
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                  placeholder="如 100 或 -50"
                />
              </div>

              {/* Quick amount buttons */}
              <div className="grid grid-cols-2 gap-2 sm:flex">
                {[100, 500, 1000, 5000].map(v => (
                  <button
                    key={v}
                    onClick={() => setAdjustAmount(String(v))}
                    className="px-3 py-1.5 rounded-lg bg-surface-50 border border-surface-200 text-xs text-surface-500 hover:border-brand-300 hover:text-brand-500 transition"
                  >
                    +{v}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs text-surface-400 mb-1 block">备注（必填）</label>
                <input
                  type="text"
                  value={adjustNote}
                  onChange={e => setAdjustNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                  placeholder="如: 充值、活动补贴、误操作退回等"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pb-safe">
              <button onClick={() => setAdjustModal(null)} className="px-4 py-2 rounded-lg border border-surface-200 text-sm text-surface-500 hover:bg-surface-50">取消</button>
              <button
                onClick={handleAdjust}
                disabled={submitting || !adjustAmount || !adjustNote.trim() || parseFloat(adjustAmount) === 0 || isNaN(parseFloat(adjustAmount))}
                className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm hover:bg-brand-600 transition disabled:opacity-40"
              >
                {submitting ? '处理中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
