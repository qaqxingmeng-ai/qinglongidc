'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';

interface Order {
  id: string;
  orderNo: string;
  totalPrice: number;
  status: string;
  createdAt: string;
  tickets?: { id: string; ticketNo: string; status: string }[];
  items: { id: string; product: { name: string; region: string }; quantity: number; period: number; price: number }[];
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  PENDING: { label: '待处理', cls: 'badge-yellow' },
  PAID: { label: '已支付', cls: 'badge-blue' },
  COMPLETED: { label: '已完成', cls: 'badge-green' },
  CANCELLED: { label: '已取消', cls: 'text-surface-400 bg-surface-100 px-2 py-0.5 rounded text-xs' },
  REFUNDED: { label: '已退款', cls: 'text-semantic-danger bg-semantic-danger-light px-2 py-0.5 rounded text-xs' },
};

export default function OrdersPage() {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const createdOrder = searchParams.get('created');

  useEffect(() => {
    apiFetch('/api/orders', { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const list = json.data?.orders ?? json.data ?? [];
          setOrders(Array.isArray(list) ? list : []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-surface-400 py-20 text-center">加载中...</div>;

  return (
      <div>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="section-title">我的订单</h1>
            {!loading && <p className="text-xs text-surface-400 mt-1">共 {orders.length} 条</p>}
          </div>
          <Link href="/servers" className="btn-secondary btn-sm w-full justify-center sm:w-auto">查看价格表</Link>
        </div>

        {createdOrder && (
          <div className="mb-4 rounded-8 border border-emerald-100 bg-semantic-success-light px-4 py-3 text-sm text-semantic-success-dark">
            订单已创建成功，单号 {createdOrder}。
          </div>
        )}

      {orders.length === 0 ? (
        <div className="text-center py-20 text-surface-400">
          <p className="mb-4">暂无订单</p>
          <Link href="/servers" className="btn-primary btn-sm">查看价格表</Link>
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {orders.map((o) => {
              const status = STATUS_MAP[o.status] || { label: o.status, cls: '' };
              const isExpanded = expandedId === o.id;
              return (
                <div key={o.id} className="rounded-8 border border-surface-100 bg-white p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] text-surface-400">{o.orderNo}</p>
                      <p className="mt-1 text-sm font-semibold text-surface-600">
                        {o.items.map((i) => i.product.name).join('、')}
                      </p>
                      <p className="mt-1 text-xs text-surface-400">{new Date(o.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={status.cls}>{status.label}</span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 rounded-8 bg-surface-50 px-3 py-3 text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-surface-400">金额</p>
                      <p className="mt-1 font-semibold text-surface-600">¥{o.totalPrice}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-surface-400">配置</p>
                      <p className="mt-1 text-surface-500">{o.items.map((i) => `${i.quantity}台×${i.period}月`).join(' / ')}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    <Link href={`/dashboard/orders/${o.id}`} className="text-brand-500 hover:underline">
                      详情
                    </Link>
                    <a href={`/api/dashboard/orders/${o.id}/receipt`} className="text-surface-400 hover:text-brand-500 hover:underline">
                      收据
                    </a>
                    {o.tickets && o.tickets.length > 0 && (
                      <button onClick={() => setExpandedId(isExpanded ? null : o.id)} className="text-brand-500 hover:underline">
                        工单({o.tickets.length})
                      </button>
                    )}
                    <Link href={`/dashboard/tickets?orderNo=${o.orderNo}`} className="text-surface-400 hover:text-brand-500 hover:underline">
                      提工单
                    </Link>
                  </div>

                  {isExpanded && o.tickets && o.tickets.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-surface-100 pt-3 text-[11px]">
                      {o.tickets.map((t) => {
                        const ts = STATUS_MAP[t.status];
                        return (
                          <div key={t.id} className="rounded-8 bg-surface-50 px-3 py-2 text-surface-400">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-mono">{t.ticketNo}</span>
                              <span className={ts?.cls || 'text-surface-400'}>{ts?.label || t.status}</span>
                            </div>
                            <Link href={`/dashboard/tickets/${t.id}`} className="mt-1 inline-block text-brand-500 hover:underline">
                              查看
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-hidden rounded-8 border border-surface-100 bg-white md:block">
            <div className="grid grid-cols-12 gap-2 border-b border-surface-100 bg-surface-50/50 px-4 py-1.5 text-[11px] font-medium text-surface-400">
              <div className="col-span-3">订单号</div>
              <div className="col-span-4">商品</div>
              <div className="col-span-2">状态</div>
              <div className="col-span-1 text-right">金额</div>
              <div className="col-span-2 text-right">操作</div>
            </div>

            {orders.map((o) => {
              const status = STATUS_MAP[o.status] || { label: o.status, cls: '' };
              const isExpanded = expandedId === o.id;
              return (
                <div key={o.id} className="border-b border-surface-50 last:border-b-0">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2.5 text-xs transition hover:bg-semantic-info-light/20 items-center">
                    <div className="col-span-3 min-w-0">
                      <p className="font-mono text-[11px] leading-tight text-surface-500">{o.orderNo}</p>
                      <p className="mt-0.5 text-[11px] text-surface-400">{new Date(o.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="col-span-4 min-w-0">
                      <p className="truncate leading-tight text-surface-500">{o.items.map((i) => i.product.name).join('、')}</p>
                      <p className="mt-0.5 text-[11px] text-surface-400">{o.items.map((i) => `${i.quantity}台×${i.period}月`).join(' / ')}</p>
                    </div>
                    <div className="col-span-2">
                      <span className={status.cls}>{status.label}</span>
                    </div>
                    <div className="col-span-1 text-right font-medium text-surface-500">¥{o.totalPrice}</div>
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      <Link href={`/dashboard/orders/${o.id}`} className="text-[11px] text-brand-500 hover:underline">
                        详情
                      </Link>
                      <a href={`/api/dashboard/orders/${o.id}/receipt`} className="text-[11px] text-surface-400 hover:text-brand-500 hover:underline">
                        收据
                      </a>
                      {o.tickets && o.tickets.length > 0 && (
                        <button onClick={() => setExpandedId(isExpanded ? null : o.id)} className="text-[11px] text-brand-500 hover:underline">
                          工单({o.tickets.length})
                        </button>
                      )}
                      <Link href={`/dashboard/tickets?orderNo=${o.orderNo}`} className="text-[11px] text-surface-400 hover:text-brand-500 hover:underline">
                        提工单
                      </Link>
                    </div>
                  </div>

                  {isExpanded && o.tickets && o.tickets.length > 0 && (
                    <div className="border-t border-surface-50 bg-surface-50/60 px-4 py-2 text-[11px] space-y-1">
                      {o.tickets.map((t) => {
                        const ts = STATUS_MAP[t.status];
                        return (
                          <div key={t.id} className="flex items-center gap-3 text-surface-400">
                            <span className="font-mono">{t.ticketNo}</span>
                            <span className={ts?.cls || 'text-surface-400'}>{ts?.label || t.status}</span>
                            <Link href={`/dashboard/tickets/${t.id}`} className="text-brand-500 hover:underline">查看</Link>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
