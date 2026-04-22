'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

interface Transaction {
  id: string;
  userId: string;
  user?: { name: string; email: string; numericId?: number } | null;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  note: string | null;
  relatedOrderId: string | null;
  relatedServerId: string | null;
  operatorId: string | null;
  createdAt: string;
}

const TYPE_MAP: Record<string, { label: string; cls: string }> = {
  RECHARGE: { label: '充值', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  PURCHASE: { label: '购买', cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
  RENEW: { label: '续费', cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
  REFUND: { label: '退款', cls: 'bg-orange-50 text-orange-700 border border-orange-200' },
  ADMIN_ADJUST: { label: '管理员调整', cls: 'bg-purple-50 text-purple-700 border border-purple-200' },
  COMMISSION: { label: '佣金', cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
};

const FILTERS = [
  { value: '', label: '全部' },
  { value: 'RECHARGE', label: '充值' },
  { value: 'PURCHASE', label: '购买' },
  { value: 'RENEW', label: '续费' },
  { value: 'REFUND', label: '退款' },
  { value: 'ADMIN_ADJUST', label: '调整' },
  { value: 'COMMISSION', label: '佣金' },
];

export default function FinanceTransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (typeFilter) params.set('type', typeFilter);
    try {
      const res = await apiFetch(`/api/admin/finance/transactions?${params}`, { method: 'GET' });
      const json = await res.json();
      if (json.success) {
        setTransactions(json.data.transactions);
        setTotal(json.data.total);
      }
    } catch {}
    setLoading(false);
  }, [page, typeFilter]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const totalPages = Math.ceil(total / 50);
  const totalIn = transactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
  const totalOut = transactions.filter((t) => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return (
    <div className="admin-page">
      <div className="mb-5">
        <h1 className="page-title">交易流水</h1>
        <p className="text-xs text-surface-400 mt-1">查看所有用户的余额变动记录，支持按类型筛选。</p>
      </div>

      {/* 统计概览 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="admin-panel">
          <div className="admin-panel-body py-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center">
              <svg className="h-4.5 w-4.5 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            </div>
            <div>
              <p className="text-[11px] text-surface-400">总记录数</p>
              <p className="text-lg font-bold text-surface-700">{total}</p>
            </div>
          </div>
        </div>
        <div className="admin-panel">
          <div className="admin-panel-body py-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center">
              <svg className="h-4.5 w-4.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </div>
            <div>
              <p className="text-[11px] text-surface-400">本期收入</p>
              <p className="text-lg font-bold text-emerald-600">+{totalIn.toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="admin-panel">
          <div className="admin-panel-body py-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center">
              <svg className="h-4.5 w-4.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
            </div>
            <div>
              <p className="text-[11px] text-surface-400">本期支出</p>
              <p className="text-lg font-bold text-red-600">-{totalOut.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 筛选 */}
      <div className="admin-panel mb-4">
        <div className="admin-panel-body py-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => { setTypeFilter(f.value); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    typeFilter === f.value
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'bg-surface-50 text-surface-500 hover:bg-surface-100 border border-surface-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-surface-400">共 {total} 条</span>
          </div>
        </div>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="admin-panel">
          <div className="admin-panel-body space-y-3 py-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-12 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ) : transactions.length === 0 ? (
        <div className="admin-panel">
          <div className="empty-state py-20">
            <svg className="h-10 w-10 text-surface-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            <p className="text-surface-400 text-sm">暂无流水记录</p>
          </div>
        </div>
      ) : (
        <div className="admin-panel overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-surface-100 bg-surface-50/60 text-[11px] font-medium text-surface-400">
            <div className="col-span-2">用户</div>
            <div className="col-span-1">类型</div>
            <div className="col-span-2 text-right">金额</div>
            <div className="col-span-2 text-right">变动前</div>
            <div className="col-span-2 text-right">变动后</div>
            <div className="col-span-2">备注</div>
            <div className="col-span-1 text-right">时间</div>
          </div>
          {transactions.map(t => {
            const typeInfo = TYPE_MAP[t.type] || { label: t.type, cls: 'bg-surface-50 text-surface-500 border border-surface-200' };
            return (
              <div key={t.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-surface-50 last:border-b-0 hover:bg-surface-50/40 text-xs items-center">
                <div className="col-span-2 min-w-0">
                  <p className="truncate font-medium text-surface-600">{t.user?.name ?? '-'}</p>
                  <p className="truncate text-[10px] text-surface-400">{t.user?.email ?? '-'}</p>
                </div>
                <div className="col-span-1">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${typeInfo.cls}`}>{typeInfo.label}</span>
                </div>
                <div className={`col-span-2 text-right font-semibold ${t.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {t.amount > 0 ? '+' : ''}{t.amount.toFixed(2)}
                </div>
                <div className="col-span-2 text-right text-surface-400">{t.balanceBefore.toFixed(2)}</div>
                <div className="col-span-2 text-right font-medium text-surface-500">{t.balanceAfter.toFixed(2)}</div>
                <div className="col-span-2 truncate text-surface-400" title={t.note || ''}>{t.note || '-'}</div>
                <div className="col-span-1 text-right text-surface-400">{new Date(t.createdAt).toLocaleDateString()}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary btn-sm disabled:opacity-40">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-xs text-surface-400">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="btn-secondary btn-sm disabled:opacity-40">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
