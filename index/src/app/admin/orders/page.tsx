'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api-client';
import {
  PageHeader,
  FilterBar,
  TabChip,
  Panel,
  EmptyState,
  SkeletonTable,
  StickyFooter,
  useToast,
} from '@/components/admin/layout';
import { easeOut } from '@/components/admin/motion';

interface Order {
  id: string;
  orderNo: string;
  user: { id: string; name: string; email: string };
  product: { id: string; name: string };
  totalPrice: number;
  status: string;
  paymentMethod: string | null;
  createdAt: string;
  tickets?: Array<{ id: string; ticketNo: string; subject: string; status: string }>;
}

interface PageData {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
}

const STATUS_MAP: Record<string, { label: string; style: string }> = {
  PENDING: { label: '待处理', style: 'bg-semantic-warning-light text-semantic-warning-dark' },
  PAID: { label: '已支付', style: 'bg-semantic-info-light text-brand-600' },
  PROCESSING: { label: '处理中', style: 'bg-semantic-info-light text-brand-600' },
  ACTIVE: { label: '服务中', style: 'bg-semantic-success-light text-semantic-success-dark' },
  COMPLETED: { label: '已完成', style: 'bg-semantic-success-light text-semantic-success-dark' },
  CANCELLED: { label: '已取消', style: 'bg-surface-100 text-surface-400' },
  REFUNDED: { label: '已退款', style: 'bg-semantic-danger-light text-semantic-danger' },
};

const STATUS_FILTERS = ['ALL', 'PENDING', 'PAID', 'COMPLETED', 'CANCELLED', 'REFUNDED'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

export default function AdminOrdersPage() {
  const toast = useToast();
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      const res = await apiFetch(`/api/admin/orders?${params}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [page, statusFilter, search]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const res = await apiFetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('状态更新成功');
        fetchOrders();
      } else {
        toast.error('操作失败', json.error?.message);
      }
    } catch {
      toast.error('网络错误');
    }
  };

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="订单管理"
        subtitle="查看和管理所有订单，处理退款和状态变更"
        actions={
          <button
            type="button"
            onClick={() => fetchOrders()}
            className="flex h-8 items-center gap-1.5 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            刷新
          </button>
        }
      />

      <FilterBar
        right={
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="h-8 w-full rounded-6 border border-surface-200 bg-white pl-8 pr-3 text-[12px] text-surface-600 placeholder:text-surface-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/15 md:w-64"
              placeholder="搜索订单号、用户名..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        }
      >
        {STATUS_FILTERS.map((s) => (
          <TabChip
            key={s}
            active={statusFilter === s}
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
          >
            {s === 'ALL' ? '全部' : STATUS_MAP[s]?.label || s}
          </TabChip>
        ))}
      </FilterBar>

      {loading ? (
        <SkeletonTable rows={8} columns={7} />
      ) : !data?.orders.length ? (
        <Panel>
          <EmptyState title="暂无订单" description="当前筛选条件下没有匹配的订单" />
        </Panel>
      ) : (
        <Panel noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
                  <th className="py-2.5 pl-5 pr-4 font-medium">订单号</th>
                  <th className="py-2.5 pr-4 font-medium">用户</th>
                  <th className="py-2.5 pr-4 font-medium">商品</th>
                  <th className="py-2.5 pr-4 text-right font-medium">金额</th>
                  <th className="py-2.5 pr-4 font-medium">状态</th>
                  <th className="py-2.5 pr-4 font-medium">时间</th>
                  <th className="py-2.5 pr-5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((order, i) => {
                  const st = STATUS_MAP[order.status] || { label: order.status, style: 'bg-surface-100 text-surface-400' };
                  const isExpanded = expandedId === order.id;
                  return (
                    <motion.tr
                      key={order.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }}
                      className="border-b border-surface-50 transition-colors last:border-b-0 hover:bg-surface-50/60"
                    >
                      <td className="py-3 pl-5 pr-4">
                        <span className="font-mono text-xs text-surface-500">{order.orderNo}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-surface-600">{order.user.name}</p>
                        <p className="text-[11px] text-surface-400">{order.user.email}</p>
                      </td>
                      <td className="max-w-[200px] truncate py-3 pr-4 text-surface-500">
                        {order.product.name}
                      </td>
                      <td className="py-3 pr-4 text-right font-medium tabular-nums text-surface-600">
                        ¥{order.totalPrice.toFixed(0)}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center rounded-4 px-2 py-0.5 text-[11px] font-medium ${st.style}`}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-xs text-surface-400">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {order.status === 'PENDING' && (
                            <ActionButton variant="primary" onClick={() => handleStatusChange(order.id, 'PAID')}>
                              标记已支付
                            </ActionButton>
                          )}
                          {order.status === 'PENDING' && (
                            <ActionButton variant="danger" onClick={() => handleStatusChange(order.id, 'CANCELLED')}>
                              取消
                            </ActionButton>
                          )}
                          {order.status === 'PAID' && (
                            <ActionButton variant="secondary" onClick={() => handleStatusChange(order.id, 'COMPLETED')}>
                              完成
                            </ActionButton>
                          )}
                          {(order.status === 'PAID' || order.status === 'COMPLETED') && (
                            <ActionButton variant="danger" onClick={() => handleStatusChange(order.id, 'REFUNDED')}>
                              退款
                            </ActionButton>
                          )}
                          {order.tickets && order.tickets.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : order.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-6 text-surface-400 transition-colors hover:bg-surface-50 hover:text-surface-600"
                              title={`${order.tickets.length} 条关联工单`}
                            >
                              <motion.svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                                animate={{ rotate: isExpanded ? 180 : 0 }}
                                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </motion.svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
                <AnimatePresence initial={false}>
                  {data.orders.map((order) =>
                    expandedId === order.id && order.tickets && order.tickets.length > 0 ? (
                      <motion.tr
                        key={`expand-${order.id}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                        className="bg-surface-50/60"
                      >
                        <td colSpan={7} className="px-5 py-3">
                          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-surface-400">
                            关联工单（{order.tickets.length}）
                          </p>
                          <div className="space-y-1">
                            {order.tickets.map((t) => (
                              <div
                                key={t.id}
                                className="flex items-center justify-between rounded-6 bg-white px-3 py-2 text-[12px]"
                              >
                                <span className="font-mono text-surface-500">{t.ticketNo}</span>
                                <span className="flex-1 truncate px-3 text-surface-600">{t.subject}</span>
                                <span className="rounded-4 bg-surface-100 px-2 py-0.5 text-[11px] text-surface-500">
                                  {t.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </motion.tr>
                    ) : null,
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <StickyFooter show={!loading && !!data && totalPages > 1}>
        <p className="text-[12px] text-surface-400">
          共 <span className="font-medium tabular-nums text-surface-600">{data?.total ?? 0}</span> 条 · 第{' '}
          <span className="tabular-nums">{page}</span> / <span className="tabular-nums">{totalPages}</span> 页
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="flex h-7 w-7 items-center justify-center rounded-6 text-surface-400 transition-colors hover:bg-surface-50 hover:text-surface-600 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="flex h-7 w-7 items-center justify-center rounded-6 text-surface-400 transition-colors hover:bg-surface-50 hover:text-surface-600 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </StickyFooter>
    </div>
  );
}

function ActionButton({
  variant,
  onClick,
  children,
}: {
  variant: 'primary' | 'secondary' | 'danger';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const cls =
    variant === 'primary'
      ? 'bg-brand-500 text-white hover:bg-brand-600'
      : variant === 'danger'
        ? 'border border-semantic-danger-light bg-white text-semantic-danger hover:bg-semantic-danger-light'
        : 'border border-surface-200 bg-white text-surface-500 hover:border-brand-500 hover:text-brand-500';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 rounded-6 px-2.5 text-[11px] font-medium transition-colors ${cls}`}
    >
      {children}
    </button>
  );
}
