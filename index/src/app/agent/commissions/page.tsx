'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

interface CommissionItem {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  status: 'FROZEN' | 'SETTLED' | 'CANCELLED';
  freezeUntil: string;
  settledAt: string | null;
  createdAt: string;
  order?: {
    orderNo: string;
    totalPrice: number;
    user?: { name: string };
  };
}

interface PageData {
  commissions: CommissionItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: {
    frozen: number;
    settled: number;
    total: number;
  };
}

interface AvailableData {
  frozen: number;
  settled: number;
  pendingWithdraw: number;
  available: number;
}

interface Withdrawal {
  id: string;
  amount: number;
  status: string;
  adminNote: string | null;
  reviewedAt: string | null;
  settledAt: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  FROZEN: '冻结中',
  AVAILABLE: '可提现',
  SETTLED: '已结算',
  CANCELLED: '已取消',
};

const STATUS_COLORS: Record<string, string> = {
  FROZEN: 'text-semantic-warning bg-semantic-warning-light',
  AVAILABLE: 'text-brand-500 bg-semantic-info-light',
  SETTLED: 'text-semantic-success bg-semantic-success-light',
  CANCELLED: 'text-surface-400 bg-surface-50',
};

const W_STATUS_LABELS: Record<string, string> = {
  PENDING: '待审核', APPROVED: '已批准', REJECTED: '已拒绝', SETTLED: '已结算',
};
const W_STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-brand-500 bg-semantic-info-light',
  APPROVED: 'text-semantic-success bg-semantic-success-light',
  REJECTED: 'text-semantic-danger bg-semantic-danger-light',
  SETTLED: 'text-surface-400 bg-surface-50',
};

export default function CommissionsPage() {
  const [data, setData] = useState<PageData | null>(null);
  const [available, setAvailable] = useState<AvailableData | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');

  const loadAvailable = useCallback(() => {
    apiFetch('/api/agent/commission/available').then(r => r.json()).then(j => {
      if (j.success) setAvailable(j);
    });
    apiFetch('/api/agent/commission/withdrawals?page=1&pageSize=10').then(r => r.json()).then(j => {
      if (j.success) setWithdrawals(j.withdrawals ?? []);
    });
  }, []);

  const load = useCallback((p: number, status: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: '20' });
    if (status) params.set('status', status);
    apiFetch(`/api/agent/commissions?${params}`, { method: 'GET' })
      .then(r => r.json())
      .then(json => { if (json.success) setData(json.data); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(1, ''); loadAvailable(); }, [load, loadAvailable]);
  useEffect(() => { load(page, statusFilter); }, [page, statusFilter, load]);

  const submitWithdraw = async () => {
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0) { setWithdrawError('请输入有效金额'); return; }
    if (available && amt > available.available) { setWithdrawError('超过可提现金额'); return; }
    setWithdrawLoading(true);
    setWithdrawError('');
    try {
      const res = await apiFetch('/api/agent/commission/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt }),
      });
      const j = await res.json();
      if (j.success) {
        setShowWithdraw(false);
        setWithdrawAmount('');
        loadAvailable();
      } else {
        setWithdrawError(j.error ?? '提交失败');
      }
    } finally {
      setWithdrawLoading(false);
    }
  };

  return (
    <div>
      <h1 className="section-title mb-6">佣金中心</h1>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-8 border border-surface-100 p-5">
          <p className="text-xs text-surface-400 mb-1">冻结佣金</p>
          <p className="text-xl font-semibold text-semantic-warning">¥{(available?.frozen ?? data?.summary.frozen ?? 0).toFixed(2)}</p>
          <p className="text-xs text-surface-400 mt-1">解冻后可提现</p>
        </div>
        <div className="bg-white rounded-8 border border-surface-100 p-5">
          <p className="text-xs text-surface-400 mb-1">可提现金额</p>
          <p className="text-xl font-semibold text-brand-500">¥{(available?.available ?? 0).toFixed(2)}</p>
          <p className="text-xs text-surface-400 mt-1">冻结中 - 待审申请</p>
        </div>
        <div className="bg-white rounded-8 border border-surface-100 p-5">
          <p className="text-xs text-surface-400 mb-1">已结算</p>
          <p className="text-xl font-semibold text-semantic-success">¥{(available?.settled ?? data?.summary.settled ?? 0).toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-8 border border-surface-100 p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs text-surface-400 mb-1">待审提现</p>
            <p className="text-xl font-semibold text-surface-600">¥{(available?.pendingWithdraw ?? 0).toFixed(2)}</p>
          </div>
          <button
            onClick={() => setShowWithdraw(true)}
            disabled={(available?.available ?? 0) <= 0}
            className="mt-3 w-full text-xs font-medium py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            申请提现
          </button>
        </div>
      </div>

      {showWithdraw && (
        <div className="bg-white rounded-8 border border-surface-100 p-5 mb-6">
          <p className="text-sm font-semibold text-surface-600 mb-3">提现申请</p>
          <p className="text-xs text-surface-400 mb-3">可提现金额: ¥{(available?.available ?? 0).toFixed(2)}</p>
          <div className="flex gap-3 items-start">
            <input
              type="number"
              min={0}
              step={0.01}
              value={withdrawAmount}
              onChange={e => setWithdrawAmount(e.target.value)}
              placeholder="输入申请金额"
              className="flex-1 border border-surface-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={submitWithdraw}
              disabled={withdrawLoading}
              className="px-5 py-2 text-sm font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {withdrawLoading ? '提交中...' : '提交申请'}
            </button>
            <button onClick={() => { setShowWithdraw(false); setWithdrawError(''); }}
              className="px-5 py-2 text-sm rounded-lg border border-surface-200 text-surface-500 hover:bg-surface-50">
              取消
            </button>
          </div>
          {withdrawError && <p className="text-xs text-semantic-danger mt-2">{withdrawError}</p>}
        </div>
      )}

      {withdrawals.length > 0 && (
        <div className="bg-white rounded-8 border border-surface-100 mb-6">
          <div className="px-5 py-4 border-b border-surface-50">
            <p className="text-sm font-medium text-surface-500">历史结算申请</p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-xs text-surface-400 border-b border-surface-50">
                <th className="text-left px-5 py-3 font-normal">申请时间</th>
                <th className="text-right px-5 py-3 font-normal">金额</th>
                <th className="text-left px-5 py-3 font-normal">状态</th>
                <th className="text-left px-5 py-3 font-normal">备注</th>
                <th className="text-left px-5 py-3 font-normal">审核/结算时间</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map(w => (
                <tr key={w.id} className="border-b border-surface-50">
                  <td className="px-5 py-3 text-surface-400">{new Date(w.createdAt).toLocaleDateString('zh-CN')}</td>
                  <td className="px-5 py-3 text-right font-medium text-surface-600">¥{w.amount.toFixed(2)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${W_STATUS_COLORS[w.status] ?? ''}`}>
                      {W_STATUS_LABELS[w.status] ?? w.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-surface-400 text-xs">{w.adminNote ?? '-'}</td>
                  <td className="px-5 py-3 text-surface-400">{(w.settledAt ?? w.reviewedAt) ? new Date((w.settledAt ?? w.reviewedAt)!).toLocaleDateString('zh-CN') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-8 border border-surface-100">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-50">
          <span className="text-sm font-medium text-surface-500">佣金记录</span>
          <select
            className="text-sm border border-surface-200 rounded-lg px-3 py-1.5 text-surface-500 focus:outline-none"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">全部状态</option>
            <option value="FROZEN">冻结中</option>
            <option value="AVAILABLE">可提现</option>
            <option value="SETTLED">已结算</option>
            <option value="CANCELLED">已取消</option>
          </select>
        </div>

        {loading ? (
          <div className="py-20 text-center text-surface-400">加载中...</div>
        ) : !data?.commissions.length ? (
          <div className="py-20 text-center text-surface-400">暂无佣金记录</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="text-xs text-surface-400 border-b border-surface-50">
                <th className="text-left px-5 py-3 font-normal">订单号</th>
                <th className="text-left px-5 py-3 font-normal">客户</th>
                <th className="text-right px-5 py-3 font-normal">佣金金额</th>
                <th className="text-left px-5 py-3 font-normal">状态</th>
                <th className="text-left px-5 py-3 font-normal">结算日期</th>
                <th className="text-left px-5 py-3 font-normal">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {data.commissions.map(c => (
                <tr key={c.id} className="border-b border-surface-50 hover:bg-surface-50/50">
                  <td className="px-5 py-3 font-mono text-xs text-surface-400">
                    {c.order?.orderNo ?? c.orderId.slice(0, 12)}
                  </td>
                  <td className="px-5 py-3 text-surface-500">
                    {c.order?.user?.name ?? '-'}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-surface-600">
                    ¥{c.amount.toFixed(2)}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[c.status]}`}>
                      {STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-surface-400">
                    {c.settledAt ? new Date(c.settledAt).toLocaleDateString('zh-CN') : `冻结至 ${new Date(c.freezeUntil).toLocaleDateString('zh-CN')}`}
                  </td>
                  <td className="px-5 py-3 text-surface-400">
                    {new Date(c.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-surface-50">
            <span className="text-xs text-surface-400">共 {data.total} 条</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="text-xs px-3 py-1.5 rounded-lg border border-surface-200 disabled:opacity-40 hover:bg-surface-50"
              >
                上一页
              </button>
              <span className="text-xs text-surface-400">{page} / {data.totalPages}</span>
              <button
                disabled={page >= data.totalPages}
                onClick={() => setPage(p => p + 1)}
                className="text-xs px-3 py-1.5 rounded-lg border border-surface-200 disabled:opacity-40 hover:bg-surface-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
