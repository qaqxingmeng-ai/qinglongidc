'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

interface FinanceData {
  balance: number;
  totalSpend: number;
  totalRecharge: number;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
}

const TYPE_MAP: Record<string, { label: string; cls: string }> = {
  RECHARGE: { label: '充值', cls: 'bg-semantic-success-light text-semantic-success-dark' },
  PURCHASE: { label: '购买', cls: 'bg-semantic-info-light text-brand-600' },
  RENEW: { label: '续费', cls: 'bg-cyan-50 text-cyan-700' },
  REFUND: { label: '退款', cls: 'bg-orange-50 text-orange-700' },
  ADMIN_ADJUST: { label: '调整', cls: 'bg-purple-50 text-purple-700' },
  COMMISSION: { label: '佣金', cls: 'bg-semantic-warning-light text-semantic-warning-dark' },
};

export default function FinancePage() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'transactions'>('overview');

  useEffect(() => {
    Promise.all([
      apiFetch('/api/dashboard/finance', { method: 'GET' }).then(r => r.json()),
      apiFetch('/api/dashboard/finance/transactions', { method: 'GET' }).then(r => r.json()),
    ]).then(([finJson, txJson]) => {
      if (finJson.success) setData(finJson.data);
      if (txJson.success) setTransactions(txJson.data?.transactions || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-surface-400 py-20 text-center">加载中...</div>;
  if (!data) return <div className="text-surface-400 py-20 text-center">加载失败</div>;

  return (
    <div>
      <h1 className="section-title mb-6">财务中心</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-8 p-5 text-white">
          <p className="text-xs text-blue-100 mb-1">账户余额</p>
          <p className="text-2xl font-bold">{data.balance.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-8 border border-surface-100 p-5">
          <p className="text-xs text-surface-400 mb-1">累计充值</p>
          <p className="text-2xl font-semibold text-surface-600">{data.totalRecharge.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-8 border border-surface-100 p-5">
          <p className="text-xs text-surface-400 mb-1">历史总消费</p>
          <p className="text-2xl font-semibold text-brand-500">{data.totalSpend.toLocaleString()}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-surface-100">
        <button
          onClick={() => setTab('overview')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            tab === 'overview' ? 'border-blue-600 text-brand-500' : 'border-transparent text-surface-400 hover:text-surface-500'
          }`}
        >
          账单明细
        </button>
        <button
          onClick={() => setTab('transactions')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            tab === 'transactions' ? 'border-blue-600 text-brand-500' : 'border-transparent text-surface-400 hover:text-surface-500'
          }`}
        >
          资金流水
        </button>
      </div>

      {tab === 'overview' ? (
        <div className="rounded-8 border border-surface-100 bg-white p-5">
          <h2 className="text-sm font-semibold text-surface-500 mb-3">财务概览</h2>
          <div className="space-y-2 text-sm text-surface-500">
            <div className="flex items-center justify-between">
              <span>账户余额</span>
              <span className="font-semibold text-surface-600">¥{data.balance.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>累计充值</span>
              <span className="font-semibold text-surface-600">¥{data.totalRecharge.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>历史总消费</span>
              <span className="font-semibold text-surface-600">¥{data.totalSpend.toFixed(2)}</span>
            </div>
            <div className="pt-2 text-xs text-surface-400 border-t border-surface-100">
              账单明细请在订单中心查看，资金变动请切换到“资金流水”。
            </div>
          </div>
        </div>
      ) : (
        <>
          {transactions.length === 0 ? (
            <div className="text-center py-12 text-surface-400 text-sm">暂无流水记录</div>
          ) : (
            <div className="space-y-2">
              {transactions.map(t => {
                const typeInfo = TYPE_MAP[t.type] || { label: t.type, cls: 'bg-surface-50 text-surface-500' };
                return (
                  <div key={t.id} className="flex items-center justify-between px-4 py-3 bg-white rounded-8 border border-surface-100">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${typeInfo.cls}`}>{typeInfo.label}</span>
                      <span className="text-sm text-surface-500">{t.note || '-'}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`font-semibold text-sm ${t.amount > 0 ? 'text-semantic-success' : 'text-semantic-danger'}`}>
                        {t.amount > 0 ? '+' : ''}{t.amount.toFixed(2)}
                      </span>
                      <span className="text-xs text-surface-400 w-24 text-right">余额 {t.balanceAfter.toFixed(2)}</span>
                      <span className="text-xs text-surface-400 w-20 text-right">{new Date(t.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
