'use client';

import { useCallback, useState, useEffect } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';

interface AgentOrder {
  id: string;
  orderNo: string;
  status: string;
  totalPrice: number;
  createdAt: string;
  user: { id: string; name: string; email: string };
  items: { id: string; quantity: number; period: number; price: number; product: { name: string; region: string } }[];
  tickets: { id: string; ticketNo: string; status: string }[];
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  PENDING: { label: '待处理', cls: 'badge-yellow' },
  PROCESSING: { label: '处理中', cls: 'badge-blue' },
  ACTIVE: { label: '已开通', cls: 'badge-green' },
  COMPLETED: { label: '已完成', cls: 'badge-green' },
  CANCELLED: { label: '已取消', cls: 'text-surface-400 text-xs bg-surface-100 px-2 py-0.5 rounded' },
};

export default function AgentOrdersPage() {
  const [orders, setOrders] = useState<AgentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    apiFetch(`/api/agent/orders?${params}`, { method: 'GET' })
      .then((r) => r.json())
      .then((json) => { if (json.success) setOrders(json.data?.orders || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [q, status]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  if (loading) return <div className="text-surface-400 py-20 text-center">加载中...</div>;

  return (
    <div>
      <h1 className="section-title mb-5">客户订单</h1>

      {/* Filter bar */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-2 mb-5">
        <input
          className="input h-8 text-sm w-56"
          placeholder="搜索订单号 / 用户 / 产品"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="input h-8 text-sm pr-6"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">全部状态</option>
          <option value="PENDING">待处理</option>
          <option value="PROCESSING">处理中</option>
          <option value="ACTIVE">已开通</option>
          <option value="COMPLETED">已完成</option>
          <option value="CANCELLED">已取消</option>
        </select>
        <button type="submit" className="btn-primary btn-sm">搜索</button>
      </form>

      {orders.length === 0 ? (
        <div className="text-center py-20 text-surface-400">暂无订单</div>
      ) : (
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-xs text-surface-400 font-medium select-none">
            <span className="col-span-3">订单号</span>
            <span className="col-span-2">客户</span>
            <span className="col-span-3">产品</span>
            <span className="col-span-1 text-right">金额</span>
            <span className="col-span-1 text-center">状态</span>
            <span className="col-span-2 text-right">创建时间</span>
          </div>

          {orders.map((o) => {
            const s = STATUS_MAP[o.status] || { label: o.status, cls: '' };
            const firstItem = o.items[0];
            return (
              <div key={o.id} className="card py-3">
                <div className="grid grid-cols-12 gap-2 items-center text-sm">
                  <span className="col-span-3 font-mono text-xs text-surface-400">{o.orderNo}</span>
                  <span className="col-span-2 text-surface-500 truncate">{o.user.name}</span>
                  <span className="col-span-3 text-surface-500 truncate">
                    {firstItem ? `${firstItem.product.name}${o.items.length > 1 ? ` 等${o.items.length}项` : ''}` : '-'}
                  </span>
                  <span className="col-span-1 text-right font-semibold text-surface-600">¥{o.totalPrice}</span>
                  <span className="col-span-1 text-center">
                    <span className={s.cls}>{s.label}</span>
                  </span>
                  <span className="col-span-2 text-right text-xs text-surface-400">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Linked tickets */}
                {o.tickets.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-surface-100 flex flex-wrap gap-2">
                    {o.tickets.map((t) => (
                      <Link
                        key={t.id}
                        href={`/agent/tickets/${t.id}`}
                        className="text-[11px] text-brand-500 hover:underline"
                      >
                        {t.ticketNo}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
