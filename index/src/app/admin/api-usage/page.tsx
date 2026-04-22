'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '@/lib/api-client';
import {
  PageHeader,
  FilterBar,
  Panel,
  EmptyState,
  SkeletonTable,
  StickyFooter,
  useToast,
} from '@/components/admin/layout';
import { easeOut } from '@/components/admin/motion';

type Summary = { totalCalls: number; successCalls: number; errorCalls: number; avgLatencyMs: number };
type DailyTrend = { date: string; calls: number };
type TokenRank = { tokenId: string; name: string; userId: string; calls: number };
type EndpointRank = { method: string; path: string; calls: number };
type LogItem = {
  id: string;
  tokenId: string;
  tokenName: string;
  userId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip: string;
  createdAt: string;
};

export default function AdminApiUsagePage() {
  const toast = useToast();
  const [summary, setSummary] = useState<Summary>({ totalCalls: 0, successCalls: 0, errorCalls: 0, avgLatencyMs: 0 });
  const [dailyTrend, setDailyTrend] = useState<DailyTrend[]>([]);
  const [tokenRanking, setTokenRanking] = useState<TokenRank[]>([]);
  const [endpointRanking, setEndpointRanking] = useState<EndpointRank[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [userIdFilter, setUserIdFilter] = useState('');
  const [tokenIdFilter, setTokenIdFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const logsReqSeq = useRef(0);

  const loadStats = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/api-usage/stats');
      const json = await res.json();
      if (json.success) {
        setSummary(json.data.summary || { totalCalls: 0, successCalls: 0, errorCalls: 0, avgLatencyMs: 0 });
        setDailyTrend(json.data.dailyTrend || []);
        setTokenRanking(json.data.tokenRanking || []);
        setEndpointRanking(json.data.endpointRanking || []);
      }
    } catch {
      toast.error('统计数据加载失败');
    }
  }, [toast]);

  const loadLogs = useCallback(async (nextPage = page) => {
    const seq = ++logsReqSeq.current;
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: '20' });
      if (userIdFilter.trim()) params.set('userId', userIdFilter.trim());
      if (tokenIdFilter.trim()) params.set('tokenId', tokenIdFilter.trim());
      if (methodFilter.trim()) params.set('method', methodFilter.trim());

      const res = await apiFetch(`/api/admin/api-usage/logs?${params.toString()}`);
      const json = await res.json();
      if (seq !== logsReqSeq.current) return;
      if (json.success) {
        setLogs(json.data.items || []);
        setTotal(json.data.total || 0);
        setPage(nextPage);
      }
    } catch {
      if (seq === logsReqSeq.current) toast.error('日志加载失败');
    }
  }, [methodFilter, page, tokenIdFilter, toast, userIdFilter]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      await Promise.all([loadStats(), loadLogs(1)]);
      setLoading(false);
    };
    void run();
  }, [loadLogs, loadStats]);

  useEffect(() => {
    void loadLogs(1);
  }, [loadLogs]);

  const pageCount = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-5">
      <PageHeader title="API 用量" subtitle="全平台 Token 调用趋势、排行与详细调用日志" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Metric title="总调用量" value={summary.totalCalls} />
        <Metric title="成功调用" value={summary.successCalls} />
        <Metric title="错误调用" value={summary.errorCalls} />
        <Metric title="平均耗时(ms)" value={summary.avgLatencyMs} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="日调用趋势（30 天）" noPadding>
          <SimpleTable
            headers={['日期', '调用量']}
            rows={dailyTrend.map((r) => [r.date, String(r.calls)])}
            empty="暂无数据"
          />
        </Panel>
        <Panel title="Token 使用排行（Top20）" noPadding>
          <SimpleTable
            headers={['Token', '用户', '调用量']}
            rows={tokenRanking.map((r) => [r.name || r.tokenId, r.userId || '-', String(r.calls)])}
            empty="暂无数据"
          />
        </Panel>
        <Panel title="接口调用排行（Top20）" noPadding>
          <SimpleTable
            headers={['接口', '方法', '调用量']}
            rows={endpointRanking.map((r) => [r.path, r.method, String(r.calls)])}
            empty="暂无数据"
          />
        </Panel>
      </div>

      <FilterBar
        right={
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={userIdFilter}
              onChange={(e) => setUserIdFilter(e.target.value)}
              placeholder="按 userId 过滤"
              className="input h-8 w-44 text-[12px]"
            />
            <input
              value={tokenIdFilter}
              onChange={(e) => setTokenIdFilter(e.target.value)}
              placeholder="按 tokenId 过滤"
              className="input h-8 w-44 text-[12px]"
            />
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="input h-8 w-28 text-[12px]"
            >
              <option value="">全部方法</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
        }
      >
        <span className="text-[12px] text-surface-400">调用日志</span>
      </FilterBar>

      {loading ? (
        <SkeletonTable rows={8} columns={7} />
      ) : logs.length === 0 ? (
        <Panel>
          <EmptyState title="暂无调用记录" description="请调整筛选条件后重试" />
        </Panel>
      ) : (
        <Panel noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
                  <th className="py-2.5 pl-5 pr-4 font-medium">时间</th>
                  <th className="py-2.5 pr-4 font-medium">Token</th>
                  <th className="py-2.5 pr-4 font-medium">用户</th>
                  <th className="py-2.5 pr-4 font-medium">请求</th>
                  <th className="py-2.5 pr-4 font-medium">状态</th>
                  <th className="py-2.5 pr-4 font-medium">耗时</th>
                  <th className="py-2.5 pr-5 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <motion.tr
                    key={log.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }}
                    className="border-b border-surface-50 transition-colors last:border-b-0 hover:bg-surface-50/60"
                  >
                    <td className="py-3 pl-5 pr-4 text-xs text-surface-400">{new Date(log.createdAt).toLocaleString('zh-CN')}</td>
                    <td className="py-3 pr-4 text-surface-500">{log.tokenName || log.tokenId}</td>
                    <td className="py-3 pr-4 text-xs text-surface-500">{log.userId}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-surface-500">{log.method} {log.path}</td>
                    <td className="py-3 pr-4 text-surface-500">{log.statusCode}</td>
                    <td className="py-3 pr-4 text-surface-500">{log.durationMs} ms</td>
                    <td className="py-3 pr-5 text-xs text-surface-400">{log.ip || '-'}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <StickyFooter show={pageCount > 1}>
        <div className="flex w-full items-center justify-between text-sm text-surface-400">
          <span>共 {total} 条</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => loadLogs(page - 1)}
              className="h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              上一页
            </button>
            <span className="px-2 text-[12px]">{page} / {pageCount}</span>
            <button
              disabled={page >= pageCount}
              onClick={() => loadLogs(page + 1)}
              className="h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      </StickyFooter>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <Panel>
      <p className="text-xs text-surface-400">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-surface-600">{value.toLocaleString('zh-CN')}</p>
    </Panel>
  );
}

function SimpleTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
            {headers.map((h, i) => (
              <th key={h} className={`py-2.5 ${i === 0 ? 'pl-5' : 'pl-3'} pr-4 font-medium`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-5 py-6 text-surface-400" colSpan={headers.length}>{empty}</td>
            </tr>
          ) : (
            rows.map((r, idx) => (
              <tr key={idx} className="border-b border-surface-50 last:border-b-0">
                {r.map((cell, cidx) => (
                  <td key={`${idx}-${cidx}`} className={`${cidx === 0 ? 'pl-5' : 'pl-3'} py-2.5 pr-4 text-surface-500`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
