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
  StatusBadge,
} from '@/components/admin/layout';
import { easeOut } from '@/components/admin/motion';

interface AgentSummary {
  agentId: string;
  agentName: string;
  agentEmail: string;
  totalAmount: number;
  frozenAmount: number;
  availableAmount: number;
  settledAmount: number;
  pendingWithdraw: number;
  orderCount: number;
}

interface CommissionItem {
  id: string;
  amount: number;
  status: string;
  freezeUntil: string;
  createdAt: string;
  order?: {
    orderNo: string;
    user?: { name: string; email: string };
    items?: { product?: { name: string } }[];
  };
}

interface Withdrawal {
  id: string;
  amount: number;
  status: string;
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  agent?: { name: string; email: string };
}

const STATUS_LABELS: Record<string, string> = {
  FROZEN: '冻结中',
  AVAILABLE: '可提现',
  SETTLED: '已结算',
  CANCELLED: '已取消',
  PENDING: '待审核',
  APPROVED: '已批准',
  REJECTED: '已拒绝',
};

function fmt(n: number) {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ActionButton({
  variant,
  children,
  disabled,
  onClick,
}: {
  variant: 'primary' | 'secondary' | 'danger';
  children: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const base = 'h-7 rounded-6 px-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const cls =
    variant === 'primary'
      ? 'bg-brand-500 text-white hover:bg-brand-600'
      : variant === 'danger'
        ? 'bg-semantic-danger text-white hover:opacity-90'
        : 'border border-surface-200 bg-white text-surface-500 hover:border-brand-500 hover:text-brand-500';

  return (
    <button type="button" className={`${base} ${cls}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function AgentsTab() {
  const toast = useToast();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [selectedAgent, setSelectedAgent] = useState<AgentSummary | null>(null);
  const [details, setDetails] = useState<CommissionItem[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailPage, setDetailPage] = useState(1);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/agent-commission?page=${page}&pageSize=20`);
      const json = await res.json();
      if (json.success) {
        setAgents(json.data?.agents ?? []);
        setTotal(json.data?.total ?? 0);
      }
    } catch {
      toast.error('代理商数据加载失败');
    }
    setLoading(false);
  }, [page, toast]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const loadDetails = useCallback(
    async (agentId: string, p: number) => {
      setLoadingDetail(true);
      try {
        const res = await apiFetch(`/api/admin/agent-commission/${agentId}/details?page=${p}&pageSize=20`);
        const json = await res.json();
        if (json.success) {
          setDetails(json.data?.commissions ?? []);
          setDetailTotal(json.data?.total ?? 0);
        }
      } catch {
        toast.error('佣金明细加载失败');
      }
      setLoadingDetail(false);
    },
    [toast],
  );

  const openAgent = (agent: AgentSummary) => {
    setSelectedAgent(agent);
    setDetailPage(1);
    loadDetails(agent.agentId, 1);
  };

  if (selectedAgent) {
    const detailTotalPages = Math.max(1, Math.ceil(detailTotal / 20));

    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelectedAgent(null)}
          className="text-[12px] font-medium text-brand-500 transition-colors hover:text-brand-600"
        >
          返回代理列表
        </button>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: '累计佣金', value: fmt(selectedAgent.totalAmount), tone: 'text-surface-600' },
            { label: '冻结中', value: fmt(selectedAgent.frozenAmount), tone: 'text-semantic-warning-dark' },
            { label: '可提现', value: fmt(selectedAgent.availableAmount), tone: 'text-brand-600' },
            { label: '已结算', value: fmt(selectedAgent.settledAmount), tone: 'text-semantic-success-dark' },
            { label: '待结算申请', value: fmt(selectedAgent.pendingWithdraw), tone: 'text-brand-600' },
          ].map((k, i) => (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...easeOut, delay: Math.min(i * 0.03, 0.2) }}
              className="rounded-8 border border-surface-100 bg-white px-4 py-3 shadow-card"
            >
              <p className="mb-1 text-[11px] text-surface-400">{k.label}</p>
              <p className={`text-[18px] font-semibold ${k.tone}`}>¥{k.value}</p>
            </motion.div>
          ))}
        </div>

        <Panel noPadding>
          {loadingDetail ? (
            <SkeletonTable rows={6} columns={7} />
          ) : details.length === 0 ? (
            <div className="p-5">
              <EmptyState title="暂无佣金明细" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
                    <th className="py-2.5 pl-5 pr-4 font-medium">订单号</th>
                    <th className="py-2.5 pr-4 font-medium">下级用户</th>
                    <th className="py-2.5 pr-4 font-medium">商品</th>
                    <th className="py-2.5 pr-4 text-right font-medium">佣金金额</th>
                    <th className="py-2.5 pr-4 font-medium">状态</th>
                    <th className="py-2.5 pr-4 font-medium">冻结/解冻</th>
                    <th className="py-2.5 pr-5 font-medium">创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {details.map((d, i) => (
                    <motion.tr
                      key={d.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }}
                      className="border-b border-surface-50 transition-colors last:border-b-0 hover:bg-surface-50/60"
                    >
                      <td className="py-3 pl-5 pr-4 font-mono text-xs text-surface-500">{d.order?.orderNo ?? '-'}</td>
                      <td className="py-3 pr-4 text-surface-600">{d.order?.user?.name ?? d.order?.user?.email ?? '-'}</td>
                      <td className="max-w-[180px] truncate py-3 pr-4 text-surface-500">
                        {d.order?.items?.map((x) => x.product?.name).filter(Boolean).join('、') ?? '-'}
                      </td>
                      <td className="py-3 pr-4 text-right font-medium tabular-nums text-semantic-success-dark">¥{fmt(d.amount)}</td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={d.status} label={STATUS_LABELS[d.status]} />
                      </td>
                      <td className="py-3 pr-4 text-xs text-surface-400">
                        {d.status === 'AVAILABLE' ? '已解冻' : new Date(d.freezeUntil).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="py-3 pr-5 text-xs text-surface-400">{new Date(d.createdAt).toLocaleDateString('zh-CN')}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <StickyFooter show={detailTotal > 20}>
          <div className="flex w-full items-center justify-center gap-2">
            <ActionButton variant="secondary" disabled={detailPage <= 1} onClick={() => {
              const next = detailPage - 1;
              setDetailPage(next);
              loadDetails(selectedAgent.agentId, next);
            }}>
              上一页
            </ActionButton>
            <span className="text-[12px] text-surface-400">第 {detailPage} 页 / 共 {detailTotalPages} 页</span>
            <ActionButton variant="secondary" disabled={detailPage >= detailTotalPages} onClick={() => {
              const next = detailPage + 1;
              setDetailPage(next);
              loadDetails(selectedAgent.agentId, next);
            }}>
              下一页
            </ActionButton>
          </div>
        </StickyFooter>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <SkeletonTable rows={8} columns={8} />
      ) : agents.length === 0 ? (
        <Panel>
          <EmptyState title="暂无代理数据" />
        </Panel>
      ) : (
        <Panel noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
                  <th className="py-2.5 pl-5 pr-4 font-medium">代理商</th>
                  <th className="py-2.5 pr-4 font-medium">订单数</th>
                  <th className="py-2.5 pr-4 text-right font-medium">累计佣金</th>
                  <th className="py-2.5 pr-4 text-right font-medium">冻结中</th>
                  <th className="py-2.5 pr-4 text-right font-medium">可提现</th>
                  <th className="py-2.5 pr-4 text-right font-medium">已结算</th>
                  <th className="py-2.5 pr-4 text-right font-medium">待结算申请</th>
                  <th className="py-2.5 pr-5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a, i) => (
                  <motion.tr
                    key={a.agentId}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }}
                    className="border-b border-surface-50 transition-colors last:border-b-0 hover:bg-surface-50/60"
                  >
                    <td className="py-3 pl-5 pr-4">
                      <p className="font-medium text-surface-600">{a.agentName}</p>
                      <p className="text-[11px] text-surface-400">{a.agentEmail}</p>
                    </td>
                    <td className="py-3 pr-4 text-surface-500">{a.orderCount}</td>
                    <td className="py-3 pr-4 text-right font-medium tabular-nums text-surface-600">¥{fmt(a.totalAmount)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-semantic-warning-dark">¥{fmt(a.frozenAmount)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-brand-600">¥{fmt(a.availableAmount)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-semantic-success-dark">¥{fmt(a.settledAmount)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-brand-600">¥{fmt(a.pendingWithdraw)}</td>
                    <td className="py-3 pr-5 text-right">
                      <button
                        type="button"
                        onClick={() => openAgent(a)}
                        className="text-[12px] text-brand-500 transition-colors hover:text-brand-600"
                      >
                        查看明细
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <StickyFooter show={total > 20}>
        <div className="flex w-full items-center justify-center gap-2">
          <ActionButton variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </ActionButton>
          <span className="text-[12px] text-surface-400">第 {page} 页 / 共 {Math.max(1, Math.ceil(total / 20))} 页</span>
          <ActionButton
            variant="secondary"
            disabled={page >= Math.max(1, Math.ceil(total / 20))}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </ActionButton>
        </div>
      </StickyFooter>
    </div>
  );
}

function WithdrawalsTab() {
  const toast = useToast();
  const [items, setItems] = useState<Withdrawal[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [rejectTarget, setRejectTarget] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiFetch(`/api/admin/agent-commission/withdrawals?${params}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data?.withdrawals ?? []);
        setTotal(json.data?.total ?? 0);
      }
    } catch {
      toast.error('结算申请加载失败');
    }
    setLoading(false);
  }, [page, statusFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const action = async (id: string, op: 'approve' | 'reject' | 'settle', note?: string) => {
    setActionLoading(id + op);
    const body = op === 'reject' && note ? { note } : undefined;

    try {
      const res = await apiFetch(`/api/admin/agent-commission/withdrawals/${id}/${op}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!json.success) {
        toast.error('操作失败', json.error?.message ?? '请稍后重试');
      } else {
        toast.success(op === 'approve' ? '已批准申请' : op === 'reject' ? '已拒绝申请' : '已标记结算');
      }
    } catch {
      toast.error('网络错误');
    }

    setActionLoading('');
    setRejectTarget('');
    setRejectNote('');
    load();
  };

  return (
    <div className="space-y-4">
      <FilterBar>
        {['', 'PENDING', 'APPROVED', 'REJECTED', 'SETTLED'].map((s) => (
          <TabChip
            key={s || 'ALL'}
            active={statusFilter === s}
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
          >
            {s ? STATUS_LABELS[s] : '全部'}
          </TabChip>
        ))}
      </FilterBar>

      {rejectTarget && (
        <Panel title="拒绝原因">
          <div className="space-y-2.5">
            <input
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="请填写拒绝原因（可选）"
              className="input"
            />
            <div className="flex items-center gap-2">
              <ActionButton variant="danger" onClick={() => action(rejectTarget, 'reject', rejectNote)}>确认拒绝</ActionButton>
              <ActionButton variant="secondary" onClick={() => setRejectTarget('')}>取消</ActionButton>
            </div>
          </div>
        </Panel>
      )}

      {loading ? (
        <SkeletonTable rows={8} columns={7} />
      ) : items.length === 0 ? (
        <Panel>
          <EmptyState title="暂无结算申请" description="当前筛选条件下没有匹配结果" />
        </Panel>
      ) : (
        <Panel noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
                  <th className="py-2.5 pl-5 pr-4 font-medium">代理商</th>
                  <th className="py-2.5 pr-4 text-right font-medium">申请金额</th>
                  <th className="py-2.5 pr-4 font-medium">状态</th>
                  <th className="py-2.5 pr-4 font-medium">备注</th>
                  <th className="py-2.5 pr-4 font-medium">申请时间</th>
                  <th className="py-2.5 pr-4 font-medium">审核时间</th>
                  <th className="py-2.5 pr-5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((w, i) => (
                  <motion.tr
                    key={w.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }}
                    className="border-b border-surface-50 transition-colors last:border-b-0 hover:bg-surface-50/60"
                  >
                    <td className="py-3 pl-5 pr-4">
                      <p className="font-medium text-surface-600">{w.agent?.name}</p>
                      <p className="text-[11px] text-surface-400">{w.agent?.email}</p>
                    </td>
                    <td className="py-3 pr-4 text-right font-medium tabular-nums text-surface-600">¥{fmt(w.amount)}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={w.status} label={STATUS_LABELS[w.status]} />
                    </td>
                    <td className="max-w-[180px] truncate py-3 pr-4 text-xs text-surface-500">{w.adminNote ?? '-'}</td>
                    <td className="py-3 pr-4 text-xs text-surface-400">{new Date(w.createdAt).toLocaleDateString('zh-CN')}</td>
                    <td className="py-3 pr-4 text-xs text-surface-400">
                      {w.reviewedAt ? new Date(w.reviewedAt).toLocaleDateString('zh-CN') : '-'}
                    </td>
                    <td className="py-3 pr-5 text-right">
                      <div className="flex justify-end gap-1.5">
                        {w.status === 'PENDING' && (
                          <>
                            <ActionButton
                              variant="primary"
                              disabled={actionLoading === w.id + 'approve'}
                              onClick={() => action(w.id, 'approve')}
                            >
                              批准
                            </ActionButton>
                            <ActionButton variant="danger" onClick={() => setRejectTarget(w.id)}>
                              拒绝
                            </ActionButton>
                          </>
                        )}
                        {w.status === 'APPROVED' && (
                          <ActionButton
                            variant="primary"
                            disabled={actionLoading === w.id + 'settle'}
                            onClick={() => action(w.id, 'settle')}
                          >
                            {actionLoading === w.id + 'settle' ? '处理中...' : '标记已结算'}
                          </ActionButton>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <StickyFooter show={total > 20}>
        <div className="flex w-full items-center justify-center gap-2">
          <ActionButton variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </ActionButton>
          <span className="text-[12px] text-surface-400">第 {page} 页 / 共 {Math.max(1, Math.ceil(total / 20))} 页</span>
          <ActionButton
            variant="secondary"
            disabled={page >= Math.max(1, Math.ceil(total / 20))}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </ActionButton>
        </div>
      </StickyFooter>
    </div>
  );
}

export default function AdminAgentCommissionPage() {
  const [tab, setTab] = useState<'agents' | 'withdrawals'>('withdrawals');

  return (
    <div className="space-y-5">
      <PageHeader title="代理商管理" subtitle="结算申请审批与代理商数据总览" />

      <FilterBar>
        {([
          ['withdrawals', '结算申请'],
          ['agents', '代理商总览'],
        ] as const).map(([key, label]) => (
          <TabChip key={key} active={tab === key} onClick={() => setTab(key)}>
            {label}
          </TabChip>
        ))}
      </FilterBar>

      {tab === 'agents' ? <AgentsTab /> : <WithdrawalsTab />}
    </div>
  );
}
