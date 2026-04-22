'use client';

import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

interface Stats {
  activeServers: number;
  expiringSoon: { id: string; productName: string; region: string; ip: string | null; expireDate: string | null; daysLeft: number | null }[];
  openTickets: number;
  pendingOrders: number;
  totalSpend: number;
}

interface ExpiringSoonItem {
  id: string;
  ip: string | null;
  userNote: string | null;
  expireDate: string | null;
  daysLeft: number;
  productName: string;
  region: string;
  monthlyPrice: number;
}

interface BatchRenewResult {
  id: string;
  productName: string;
  success: boolean;
  reason?: string;
  cost: number;
}

const levelLabels: Record<string, string> = {
  PARTNER: '合作商',
  VIP_TOP: '高级会员',
  VIP: '会员',
  GUEST: '普通用户',
};

const PERIOD_OPTIONS = [1, 3, 6, 12];

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  // Expiring-soon card state
  const [expiring, setExpiring] = useState<ExpiringSoonItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [renewResults, setRenewResults] = useState<BatchRenewResult[] | null>(null);
  const [renewBalance, setRenewBalance] = useState<number | null>(null);

  const loadExpiring = useCallback(() => {
    apiFetch('/api/dashboard/servers/expiring-soon?days=7', { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (!json?.success) {
          setExpiring([]);
          return;
        }
        const payload = json.data ?? {};
        const list = Array.isArray(payload?.data) ? payload.data : [];
        setExpiring(list);
      })
      .catch(() => setExpiring([]));
  }, []);

  useEffect(() => {
    apiFetch('/api/dashboard/stats', { method: 'GET' })
      .then((r) => r.json())
      .then((json) => { if (json.success) setStats(json.data); });
    loadExpiring();
  }, [loadExpiring]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === expiring.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(expiring.map((s) => s.id)));
    }
  };

  const selectedItems = expiring.filter((s) => selected.has(s.id));
  const totalCost = selectedItems.reduce((sum, s) => sum + s.monthlyPrice * period, 0);

  const handleBatchRenew = async () => {
    if (selected.size === 0) return;
    setRenewing(true);
    setRenewResults(null);
    try {
      const r = await apiFetch('/api/dashboard/servers/batch-renew', {
        method: 'POST',
        body: JSON.stringify({ serverIds: Array.from(selected), period }),
      });
      const json = await r.json();
      if (!json.success) {
        return;
      }
      const payload = json.data ?? {};
      const results: BatchRenewResult[] = Array.isArray(payload.results) ? payload.results : [];
      setRenewResults(results);
      setRenewBalance(typeof payload.balance === 'number' ? payload.balance : null);
      // Refresh expiring list
      loadExpiring();
      setSelected(new Set());
    } catch {
      // keep modal open to show error
    } finally {
      setRenewing(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setRenewResults(null);
    setRenewBalance(null);
  };

  const quickLinks = [
    { title: '我的服务器', desc: '查看状态 / 申请续费', href: '/dashboard/servers', badge: stats?.activeServers ?? null, badgeCls: 'bg-green-100 text-semantic-success-dark' },
    { title: '我的订单', desc: '查看订单进度', href: '/dashboard/orders', badge: stats?.pendingOrders ?? null, badgeCls: 'bg-yellow-100 text-yellow-700' },
    { title: '工单中心', desc: '提交 / 跟踪工单', href: '/dashboard/tickets', badge: stats?.openTickets ?? null, badgeCls: 'bg-blue-100 text-brand-500' },
    { title: '数据看板', desc: '消费统计 / 分布图表 / 续费倒计时', href: '/dashboard/analytics', badge: null, badgeCls: '' },
    { title: '价格表', desc: '查看全部可开通服务器与参考价格', href: '/servers', badge: null, badgeCls: '' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="section-title">欢迎回来，{user?.name}</h1>
          <p className="text-xs text-surface-400 mt-1">
            <span className="bg-surface-100 text-surface-500 px-2 py-0.5 rounded text-[11px]">{levelLabels[user?.level ?? ''] || user?.level}</span>
            {stats && (
              <span className="ml-3 text-surface-400">累计消费 <span className="text-surface-500 font-medium">¥{stats.totalSpend.toLocaleString()}</span></span>
            )}
          </p>
        </div>
        <Link href="/dashboard/profile" className="text-xs text-surface-400 hover:text-surface-500 hover:underline">账号设置</Link>
      </div>

      {/* Expiring Soon Card */}
      {expiring.length > 0 && (
        <div className="mb-5 rounded-8 border border-red-100 bg-semantic-danger-light">
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-red-100">
            <p className="text-sm font-medium text-red-700">即将到期的服务器（7天内）</p>
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <span className="text-xs text-surface-400">
                  已选 {selected.size} 台，预计费用
                  <span className="font-semibold text-surface-500 ml-1">¥{totalCost.toFixed(2)}</span>
                </span>
              )}
              <button
                onClick={() => { if (selected.size > 0) setShowModal(true); }}
                disabled={selected.size === 0}
                className="text-xs px-3 py-1 rounded-lg bg-red-600 text-white disabled:opacity-40 hover:bg-red-700 transition-colors"
              >
                批量续费
              </button>
            </div>
          </div>
          <div className="px-4 py-2">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-xs">
              <thead>
                <tr className="text-surface-400">
                  <th className="text-left py-1 pr-3 w-6">
                    <input
                      type="checkbox"
                      checked={expiring.length > 0 && selected.size === expiring.length}
                      onChange={toggleAll}
                      className="accent-red-600"
                    />
                  </th>
                  <th className="text-left py-1 pr-3">产品</th>
                  <th className="text-left py-1 pr-3">IP</th>
                  <th className="text-left py-1 pr-3">到期日</th>
                  <th className="text-left py-1 pr-3">剩余</th>
                  <th className="text-left py-1">月单价</th>
                </tr>
              </thead>
              <tbody>
                {expiring.map((s) => (
                  <tr key={s.id} className="border-t border-red-100">
                    <td className="py-1.5 pr-3">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleSelect(s.id)}
                        className="accent-red-600"
                      />
                    </td>
                    <td className="py-1.5 pr-3 text-surface-500 font-medium">{s.productName}</td>
                    <td className="py-1.5 pr-3 font-mono text-surface-400">{s.ip ?? '-'}</td>
                    <td className="py-1.5 pr-3 text-surface-400">
                      {s.expireDate ? new Date(s.expireDate).toLocaleDateString() : '-'}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className={`font-semibold ${s.daysLeft <= 3 ? 'text-semantic-danger' : 'text-semantic-warning'}`}>
                        {s.daysLeft >= 0 ? `${s.daysLeft} 天` : '已过期'}
                      </span>
                    </td>
                    <td className="py-1.5 text-surface-500">¥{s.monthlyPrice.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: '运行服务器', value: stats?.activeServers ?? '—', color: 'text-semantic-success', bg: 'bg-semantic-success-light' },
          { label: '即将到期', value: expiring.length > 0 ? expiring.length : (stats?.expiringSoon.length ?? '—'), color: expiring.length > 0 ? 'text-semantic-danger' : 'text-surface-400', bg: expiring.length > 0 ? 'bg-semantic-danger-light' : 'bg-surface-50' },
          { label: '待处理订单', value: stats?.pendingOrders ?? '—', color: 'text-yellow-700', bg: 'bg-yellow-50' },
          { label: '未结工单', value: stats?.openTickets ?? '—', color: 'text-brand-500', bg: 'bg-semantic-info-light' },
        ].map((item) => (
          <div key={item.label} className={`rounded-8 ${item.bg} px-4 py-3`}>
            <p className="text-[11px] text-surface-400 mb-1">{item.label}</p>
            <p className={`text-2xl font-semibold ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {quickLinks.map((card) => (
          <Link key={card.href} href={card.href} className="card-hover group relative">
            {card.badge !== null && card.badge > 0 && (
              <span className={`absolute top-3 right-3 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${card.badgeCls}`}>
                {card.badge}
              </span>
            )}
            <h3 className="font-medium text-surface-600 mb-1">{card.title}</h3>
            <p className="text-xs text-surface-400">{card.desc}</p>
          </Link>
        ))}
      </div>

      {/* Batch Renew Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-8 shadow-xl w-full max-w-md mx-4 p-6">
            {renewResults ? (
              <>
                <h2 className="text-base font-semibold text-surface-600 mb-4">续费结果</h2>
                <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                  {renewResults.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-sm">
                      <span className="text-surface-500">{r.productName || r.id}</span>
                      {r.success ? (
                        <span className="text-semantic-success font-medium">成功 -¥{r.cost.toFixed(2)}</span>
                      ) : (
                        <span className="text-semantic-danger">{r.reason ?? '失败'}</span>
                      )}
                    </div>
                  ))}
                </div>
                {renewBalance !== null && (
                  <p className="text-xs text-surface-400 mb-4">
                    当前余额：<span className="text-surface-500 font-medium">¥{renewBalance.toFixed(2)}</span>
                  </p>
                )}
                <div className="flex justify-between text-sm text-surface-400 mb-5">
                  <span>成功 <span className="text-semantic-success font-semibold">{renewResults.filter((r) => r.success).length}</span> 台</span>
                  <span>失败 <span className="text-semantic-danger font-semibold">{renewResults.filter((r) => !r.success).length}</span> 台</span>
                </div>
                <button
                  onClick={closeModal}
                  className="w-full py-2 rounded-8 bg-surface-100 text-surface-500 text-sm hover:bg-surface-200 transition-colors"
                >
                  关闭
                </button>
              </>
            ) : (
              <>
                <h2 className="text-base font-semibold text-surface-600 mb-1">批量续费</h2>
                <p className="text-xs text-surface-400 mb-4">已选 {selectedItems.length} 台服务器</p>

                {/* Period picker */}
                <div className="mb-4">
                  <p className="text-xs text-surface-400 mb-2">续费时长</p>
                  <div className="flex gap-2">
                    {PERIOD_OPTIONS.map((p) => (
                      <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors ${
                          period === p
                            ? 'border-blue-500 bg-semantic-info-light text-brand-500 font-medium'
                            : 'border-surface-200 text-surface-500 hover:border-surface-300'
                        }`}
                      >
                        {p >= 12 ? `${p / 12} 年` : `${p} 月`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cost breakdown */}
                <div className="bg-surface-50 rounded-8 p-3 mb-5 space-y-1.5">
                  {selectedItems.map((s) => (
                    <div key={s.id} className="flex justify-between text-xs text-surface-500">
                      <span>{s.productName}</span>
                      <span>¥{(s.monthlyPrice * period).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t border-surface-200 pt-1.5 flex justify-between text-sm font-medium text-surface-600">
                    <span>合计</span>
                    <span>¥{totalCost.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={closeModal}
                    className="flex-1 py-2 rounded-8 border border-surface-200 text-surface-500 text-sm hover:bg-surface-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleBatchRenew}
                    disabled={renewing}
                    className="flex-1 py-2 rounded-8 bg-brand-500 text-white text-sm hover:bg-brand-600 transition-colors disabled:opacity-60"
                  >
                    {renewing ? '处理中...' : `确认续费 ¥${totalCost.toFixed(2)}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
