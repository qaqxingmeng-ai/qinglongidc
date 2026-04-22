'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api-client';
import { ConfirmDialog, EmptyState, PageHeader, Panel, SkeletonTable, StickyFooter, useToast } from '@/components/admin/layout';
import { easeOut } from '@/components/admin/motion';

interface Withdrawal {
  id: string;
  agentId: string;
  agentName: string;
  agentEmail: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SETTLED';
  bankInfo?: string;
  createdAt: string;
  settledAt?: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: '待审批',
  APPROVED: '已批准',
  REJECTED: '已拒绝',
  SETTLED: '已打款',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-semantic-warning-light text-semantic-warning-dark',
  APPROVED: 'bg-semantic-info-light text-brand-600',
  REJECTED: 'bg-semantic-danger-light text-semantic-danger',
  SETTLED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

export default function AgentWithdrawalsPage() {
  const toast = useToast();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<{ id: string; action: 'approve' | 'reject' | 'settle' } | null>(null);
  const [acting, setActing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async (p: number) => {
    const s = ++seq.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: '20' });
      if (status) params.set('status', status);
      const res = await apiFetch(`/api/admin/agent-commission/withdrawals?${params}`);
      const json = await res.json();
      if (s !== seq.current) return;
      if (json.success) {
        setWithdrawals(json.data?.items ?? json.data?.withdrawals ?? []);
        setTotal(json.data?.total ?? 0);
      }
    } catch {}
    setLoading(false);
  }, [status]);

  useEffect(() => { load(page); }, [load, page]);

  const handleAction = async () => {
    if (!pendingAction) return;
    const { id, action } = pendingAction;
    setActing(true);
    try {
      const res = await apiFetch(`/api/admin/agent-commission/withdrawals/${id}/${action}`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        toast.success('操作成功');
        setPendingAction(null);
        load(page);
      } else {
        toast.error(json.message || '操作失败');
      }
    } catch {
      toast.error('请求失败');
    } finally {
      setActing(false);
    }
  };

  const ACTION_LABEL: Record<'approve' | 'reject' | 'settle', { title: string; desc: string; danger: boolean; confirmText: string }> = {
    approve: { title: '批准提现', desc: '确认批准此提现申请？', danger: false, confirmText: '批准' },
    reject: { title: '拒绝提现', desc: '确认拒绝此提现申请？此操作不可撤销。', danger: true, confirmText: '拒绝' },
    settle: { title: '确认打款', desc: '确认已完成打款？标记后不可变更。', danger: false, confirmText: '确认打款' },
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-5">
      <PageHeader
        title="提现审批"
        subtitle={`共 ${total} 条提现记录`}
      />

      <div className="flex flex-wrap gap-3">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="rounded-6 border border-surface-200 px-3 py-1.5 text-sm text-surface-500 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
        >
          <option value="">全部状态</option>
          <option value="PENDING">待审批</option>
          <option value="APPROVED">已批准</option>
          <option value="REJECTED">已拒绝</option>
          <option value="SETTLED">已打款</option>
        </select>
      </div>

      {loading ? (
        <SkeletonTable rows={6} columns={7} />
      ) : withdrawals.length === 0 ? (
        <EmptyState title="暂无提现记录" description="还没有代理商申请提现。" />
      ) : (
        <>
          <Panel className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-left text-xs font-medium text-surface-400 uppercase tracking-wider">
                  <th className="px-4 py-3">代理商</th>
                  <th className="px-4 py-3">邮箱</th>
                  <th className="px-4 py-3 text-right">金额</th>
                  <th className="px-4 py-3">收款信息</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">申请时间</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w, i) => (
                  <motion.tr key={w.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }} className="border-b border-surface-50 hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-surface-600">{w.agentName}</td>
                    <td className="px-4 py-3 text-surface-500">{w.agentEmail}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-surface-600">¥{w.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-surface-400 max-w-[160px] truncate">{w.bankInfo || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-4 px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[w.status]}`}>
                        {STATUS_LABEL[w.status] ?? w.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-surface-400">{new Date(w.createdAt).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {w.status === 'PENDING' && (
                        <>
                          <button onClick={() => setPendingAction({ id: w.id, action: 'approve' })} className="text-semantic-success hover:text-emerald-700 text-xs mr-2">批准</button>
                          <button onClick={() => setPendingAction({ id: w.id, action: 'reject' })} className="text-semantic-danger hover:text-red-700 text-xs">拒绝</button>
                        </>
                      )}
                      {w.status === 'APPROVED' && (
                        <button onClick={() => setPendingAction({ id: w.id, action: 'settle' })} className="text-brand-500 hover:text-brand-600 text-xs">确认打款</button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {totalPages > 1 && (
            <StickyFooter>
              <span className="text-xs text-surface-400">共 {total} 条</span>
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-8 rounded-6 border border-surface-200 px-3 text-[12px] text-surface-500 disabled:opacity-40">上一页</button>
                <span className="text-xs text-surface-400">{page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-8 rounded-6 border border-surface-200 px-3 text-[12px] text-surface-500 disabled:opacity-40">下一页</button>
              </div>
            </StickyFooter>
          )}
        </>
      )}

      <AnimatePresence>
        <ConfirmDialog
          open={!!pendingAction}
          title={pendingAction ? ACTION_LABEL[pendingAction.action].title : ''}
          description={pendingAction ? ACTION_LABEL[pendingAction.action].desc : ''}
          confirmText={pendingAction ? ACTION_LABEL[pendingAction.action].confirmText : '确认'}
          danger={pendingAction ? ACTION_LABEL[pendingAction.action].danger : false}
          loading={acting}
          onConfirm={handleAction}
          onCancel={() => setPendingAction(null)}
        />
      </AnimatePresence>
    </div>
  );
}
