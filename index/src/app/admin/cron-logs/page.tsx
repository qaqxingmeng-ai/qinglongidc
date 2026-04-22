'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '@/lib/api-client';
import { EmptyState, PageHeader, Panel, SkeletonTable, StickyFooter } from '@/components/admin/layout';
import { easeOut } from '@/components/admin/motion';

interface CronLog {
  id: string;
  jobName: string;
  status: 'SUCCESS' | 'FAILED' | 'RUNNING';
  startedAt: string;
  finishedAt?: string;
  durationMs: number;
  message?: string;
  error?: string;
}

const JOB_LABELS: Record<string, string> = {
  SyncExpiredOrders: '过期订单同步',
  SyncExpiredServers: '到期服务器同步',
  CleanupSessions: '清理过期会话',
  CleanupTokens: '清理过期令牌',
  DailyReport: '每日报表生成',
  WeeklyReport: '每周 AI 报告',
  PruneOldLogs: '清理旧日志',
  InviteRewardCheck: '邀请奖励检查',
  MembershipExpiry: '会员到期检查',
  SLATicketTimeout: 'SLA 工单超时扫描',
  AnomalyScan: '异常检测扫描',
};

const STATUS_LABEL: Record<string, string> = {
  SUCCESS: '成功',
  FAILED: '失败',
  RUNNING: '运行中',
};

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  FAILED: 'bg-semantic-danger-light text-semantic-danger',
  RUNNING: 'bg-semantic-info-light text-brand-600',
};

export default function CronLogsPage() {
  const [logs, setLogs] = useState<CronLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [jobFilter, setJobFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const load = useCallback(async (p: number) => {
    const s = ++seq.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: '25' });
      if (jobFilter) params.set('job', jobFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiFetch(`/api/admin/cron-logs?${params}`);
      const json = await res.json();
      if (s !== seq.current) return;
      if (json.success) {
        setLogs(json.data?.items ?? json.data?.logs ?? []);
        setTotal(json.data?.total ?? 0);
      }
    } catch {}
    setLoading(false);
  }, [jobFilter, statusFilter]);

  useEffect(() => { load(page); }, [load, page]);

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="space-y-5">
      <PageHeader
        title="定时任务日志"
        subtitle={`共 ${total} 条记录 — 查看 Cron 任务的执行历史和状态。`}
      />

      <div className="flex flex-wrap gap-3">
        <select
          value={jobFilter}
          onChange={(e) => { setJobFilter(e.target.value); setPage(1); }}
          className="rounded-6 border border-surface-200 px-3 py-1.5 text-sm text-surface-500 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
        >
          <option value="">所有任务</option>
          {Object.entries(JOB_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-6 border border-surface-200 px-3 py-1.5 text-sm text-surface-500 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
        >
          <option value="">所有状态</option>
          <option value="SUCCESS">成功</option>
          <option value="FAILED">失败</option>
          <option value="RUNNING">运行中</option>
        </select>
      </div>

      {loading ? (
        <SkeletonTable rows={8} columns={6} />
      ) : logs.length === 0 ? (
        <EmptyState title="暂无日志" description="还没有定时任务执行记录。" />
      ) : (
        <>
          <Panel className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-left text-xs font-medium text-surface-400 uppercase tracking-wider">
                  <th className="px-4 py-3">任务名称</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">开始时间</th>
                  <th className="px-4 py-3">耗时</th>
                  <th className="px-4 py-3">信息</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <motion.tr key={log.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }} className="border-b border-surface-50 hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-surface-600">{JOB_LABELS[log.jobName] ?? log.jobName}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-4 px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[log.status]}`}>
                        {STATUS_LABEL[log.status] ?? log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-surface-400">{new Date(log.startedAt).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-3 text-xs text-surface-500 font-mono">
                      {log.durationMs >= 1000 ? `${(log.durationMs / 1000).toFixed(1)}s` : `${log.durationMs}ms`}
                    </td>
                    <td className="px-4 py-3 text-xs text-surface-400 max-w-[300px] truncate">
                      {log.error ? (
                        <span className="text-semantic-danger">{log.error}</span>
                      ) : (
                        log.message || '-'
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
    </div>
  );
}
