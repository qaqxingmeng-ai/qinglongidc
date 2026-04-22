'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
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
import { CountUp, easeOut, staggerContainer, kpiItem } from '@/components/admin/motion';

interface Ticket {
  id: string;
  ticketNo: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  user: { id: string; name: string; email: string };
  assignedAdmin?: { id: string; name: string } | null;
  aiClassification?: { suggestedType: string; suggestedPriority: string; accepted: boolean } | null;
  createdAt: string;
  updatedAt: string;
}

interface AITicketClassification {
  ticketId: string;
  suggestedType: string;
  suggestedPriority: string;
  accepted: boolean;
}

interface ClassificationStats {
  total: number;
  classified: number;
  accepted: number;
  rejected: number;
  pending: number;
}

const STATUS_MAP: Record<string, { label: string; style: string }> = {
  OPEN:       { label: '待回复', style: 'bg-semantic-warning-light text-semantic-warning-dark' },
  PROCESSING: { label: '处理中', style: 'bg-semantic-info-light text-brand-600' },
  RESOLVED:   { label: '已解决', style: 'bg-semantic-success-light text-semantic-success-dark' },
  CLOSED:     { label: '已关闭', style: 'bg-surface-100 text-surface-400' },
};

const PRIORITY_MAP: Record<string, { label: string; style: string }> = {
  URGENT: { label: '紧急', style: 'bg-semantic-danger-light text-semantic-danger' },
  HIGH:   { label: '高',   style: 'bg-semantic-warning-light text-semantic-warning-dark' },
  MEDIUM: { label: '中',   style: 'bg-semantic-info-light text-brand-600' },
  LOW:    { label: '低',   style: 'bg-surface-100 text-surface-400' },
};

const STATUS_FILTERS = ['ALL', 'OPEN', 'PROCESSING', 'RESOLVED', 'CLOSED'] as const;

export default function AdminTicketsPage() {
  const toast = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [classStats, setClassStats] = useState<ClassificationStats | null>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      const res = await apiFetch(`/api/admin/tickets?${params}`);
      const json = await res.json();
      if (json.success) {
        const payload = json.data || {};
        const ticketList: Ticket[] = Array.isArray(payload.tickets)
          ? payload.tickets
          : (Array.isArray(payload) ? payload : []);
        const classifications: Record<string, AITicketClassification> = payload.classifications || {};
        const merged = ticketList.map((ticket) => ({
          ...ticket,
          aiClassification: classifications[ticket.id] || ticket.aiClassification || null,
        }));
        setTickets(merged);
        setTotal(payload.total || 0);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [page, statusFilter, search]);

  const fetchClassStats = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/tickets/classification-stats');
      const json = await res.json();
      if (json.success) {
        const payload = json.data || json;
        const total = Number(payload.total || 0);
        const accepted = Number(payload.accepted || 0);
        const rejected = Number(payload.rejected || 0);
        const classified = Number(payload.classified || total);
        const pending = Number(payload.pending || Math.max(total - accepted - rejected, 0));
        setClassStats({ total, classified, accepted, rejected, pending });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);
  useEffect(() => {
    fetchClassStats();
  }, [fetchClassStats]);

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    try {
      const res = await apiFetch(`/api/admin/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('状态更新成功');
        fetchTickets();
      } else {
        toast.error('操作失败', json.error?.message);
      }
    } catch {
      toast.error('网络错误');
    }
  };

  const totalPages = Math.ceil(total / 20) || 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="工单管理"
        subtitle="处理用户工单，跟踪问题解决进度"
        actions={
          <button
            type="button"
            onClick={() => fetchTickets()}
            className="flex h-8 items-center gap-1.5 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            刷新
          </button>
        }
      />

      {classStats && (
        <motion.div
          variants={staggerContainer(0.04)}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-3 sm:grid-cols-5"
        >
          {[
            { label: '工单总量', value: classStats.total, tone: 'default' as const },
            { label: '已分类', value: classStats.classified, tone: 'brand' as const },
            { label: '已采纳', value: classStats.accepted, tone: 'success' as const },
            { label: '已驳回', value: classStats.rejected, tone: 'danger' as const },
            { label: '待确认', value: classStats.pending, tone: 'warning' as const },
          ].map((item) => (
            <motion.div
              key={item.label}
              variants={kpiItem}
              className="rounded-8 border border-surface-200 bg-white px-4 py-3 text-center shadow-card"
            >
              <p
                className={`text-xl font-semibold tabular-nums ${
                  item.tone === 'brand'
                    ? 'text-brand-500'
                    : item.tone === 'success'
                      ? 'text-semantic-success'
                      : item.tone === 'danger'
                        ? 'text-semantic-danger'
                        : item.tone === 'warning'
                          ? 'text-semantic-warning'
                          : 'text-surface-600'
                }`}
              >
                <CountUp value={item.value} />
              </p>
              <p className="mt-0.5 text-[11px] text-surface-400">{item.label}</p>
            </motion.div>
          ))}
        </motion.div>
      )}

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
              placeholder="搜索工单号、主题..."
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
        <SkeletonTable rows={8} columns={8} />
      ) : !tickets.length ? (
        <Panel>
          <EmptyState title="暂无工单" description="当前筛选条件下没有匹配的工单" />
        </Panel>
      ) : (
        <Panel noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
                  <th className="py-2.5 pl-5 pr-4 font-medium">工单号</th>
                  <th className="py-2.5 pr-4 font-medium">主题</th>
                  <th className="py-2.5 pr-4 font-medium">用户</th>
                  <th className="py-2.5 pr-4 font-medium">优先级</th>
                  <th className="py-2.5 pr-4 font-medium">状态</th>
                  <th className="py-2.5 pr-4 font-medium">AI 分类</th>
                  <th className="py-2.5 pr-4 font-medium">时间</th>
                  <th className="py-2.5 pr-5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket, i) => {
                  const st = STATUS_MAP[ticket.status] || { label: ticket.status, style: 'bg-surface-100 text-surface-400' };
                  const pr = PRIORITY_MAP[ticket.priority] || { label: ticket.priority, style: 'bg-surface-100 text-surface-400' };
                  return (
                    <motion.tr
                      key={ticket.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }}
                      className="border-b border-surface-50 transition-colors last:border-b-0 hover:bg-surface-50/60"
                    >
                      <td className="py-3 pl-5 pr-4">
                        <span className="font-mono text-xs text-surface-500">{ticket.ticketNo}</span>
                      </td>
                      <td className="max-w-[200px] truncate py-3 pr-4 font-medium text-surface-600">
                        {ticket.subject}
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-surface-600">{ticket.user.name}</p>
                        <p className="text-[11px] text-surface-400">{ticket.user.email}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center rounded-4 px-2 py-0.5 text-[11px] font-medium ${pr.style}`}>
                          {pr.label}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center rounded-4 px-2 py-0.5 text-[11px] font-medium ${st.style}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {ticket.aiClassification ? (
                          <span
                            className={`inline-flex items-center rounded-4 px-2 py-0.5 text-[11px] font-medium ${
                              ticket.aiClassification.accepted
                                ? 'bg-semantic-success-light text-semantic-success-dark'
                                : 'bg-semantic-warning-light text-semantic-warning-dark'
                            }`}
                          >
                            {ticket.aiClassification.accepted ? '已采纳' : '待确认'}
                          </span>
                        ) : (
                          <span className="text-[11px] text-surface-300">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-xs text-surface-400">
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {ticket.status === 'OPEN' && (
                            <TicketActionButton variant="primary" onClick={() => handleStatusChange(ticket.id, 'PROCESSING')}>
                              处理
                            </TicketActionButton>
                          )}
                          {ticket.status === 'PROCESSING' && (
                            <TicketActionButton variant="secondary" onClick={() => handleStatusChange(ticket.id, 'RESOLVED')}>
                              解决
                            </TicketActionButton>
                          )}
                          {ticket.status === 'RESOLVED' && (
                            <TicketActionButton variant="secondary" onClick={() => handleStatusChange(ticket.id, 'CLOSED')}>
                              关闭
                            </TicketActionButton>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <StickyFooter show={!loading && tickets.length > 0 && totalPages > 1}>
        <p className="text-[12px] text-surface-400">
          共 <span className="font-medium tabular-nums text-surface-600">{total}</span> 条 · 第{' '}
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

function TicketActionButton({
  variant,
  onClick,
  children,
}: {
  variant: 'primary' | 'secondary';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const cls =
    variant === 'primary'
      ? 'bg-brand-500 text-white hover:bg-brand-600'
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
