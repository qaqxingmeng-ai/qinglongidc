'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '@/lib/api-client';
import { EmptyState, FilterBar, PageHeader, Panel, SkeletonTable, StickyFooter } from '@/components/admin/layout';
import { easeOut } from '@/components/admin/motion';

interface LoginRecord {
  id: string;
  userId?: string;
  email?: string;
  ip: string;
  userAgent: string;
  isSuccessful: boolean;
  failReason?: string;
  loginAt: string;
}

function parseDevice(ua: string) {
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown';
}

export default function AdminLoginHistoryPage() {
  const [records, setRecords] = useState<LoginRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ email: '', ip: '', success: '' });
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) });
    if (filters.email) params.set('email', filters.email);
    if (filters.ip) params.set('ip', filters.ip);
    if (filters.success !== '') params.set('success', filters.success);
    const r = await apiFetch(`/api/admin/login-history?${params}`);
    const j = await r.json();
    if (j.success) {
      setRecords(j.data.records ?? []);
      setTotal(j.data.total ?? 0);
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    void load(page);
  }, [page, load]);

  const totalPages = Math.ceil(total / pageSize) || 1;
  const successCount = records.filter((r) => r.isSuccessful).length;
  const failCount = records.length - successCount;

  return (
    <div className="space-y-5">
      <PageHeader title="登录日志" subtitle="查看所有用户登录记录并识别异常失败行为" />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Panel>
          <p className="text-xs text-surface-400">总记录数</p>
          <p className="mt-1 text-2xl font-semibold text-surface-600">{total}</p>
        </Panel>
        <Panel>
          <p className="text-xs text-surface-400">登录成功</p>
          <p className="mt-1 text-2xl font-semibold text-semantic-success">{successCount}</p>
        </Panel>
        <Panel>
          <p className="text-xs text-surface-400">登录失败</p>
          <p className="mt-1 text-2xl font-semibold text-semantic-danger">{failCount}</p>
        </Panel>
      </div>

      <FilterBar>
        <input
          type="text"
          placeholder="邮箱筛选"
          value={filters.email}
          onChange={(e) => setFilters({ ...filters, email: e.target.value })}
          className="input h-8 w-48 text-xs"
        />
        <input
          type="text"
          placeholder="IP 地址"
          value={filters.ip}
          onChange={(e) => setFilters({ ...filters, ip: e.target.value })}
          className="input h-8 w-32 text-xs"
        />
        <select
          value={filters.success}
          onChange={(e) => setFilters({ ...filters, success: e.target.value })}
          className="input h-8 w-28 text-xs"
        >
          <option value="">全部状态</option>
          <option value="true">登录成功</option>
          <option value="false">登录失败</option>
        </select>
      </FilterBar>

      {loading ? (
        <SkeletonTable rows={6} columns={6} />
      ) : (
        <Panel noPadding>
          {records.length === 0 ? (
            <EmptyState title="暂无登录记录" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead className="border-b border-surface-100 bg-surface-50/60">
                  <tr>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">时间</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">用户</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">IP</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">设备</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">状态</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">失败原因</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {records.map((r, i) => (
                    <motion.tr key={r.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }} className="hover:bg-surface-50/50">
                      <td className="px-4 py-2.5 text-xs text-surface-400">{new Date(r.loginAt).toLocaleString('zh-CN')}</td>
                      <td className="px-4 py-2.5 text-xs font-medium text-surface-600">{r.email ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-surface-500">{r.ip}</td>
                      <td className="px-4 py-2.5 text-xs text-surface-400">{parseDevice(r.userAgent)}</td>
                      <td className="px-4 py-2.5">
                        {r.isSuccessful ? (
                          <span className="rounded-4 bg-semantic-success-light px-2 py-0.5 text-xs font-medium text-semantic-success-dark">成功</span>
                        ) : (
                          <span className="rounded-4 bg-semantic-danger-light px-2 py-0.5 text-xs font-medium text-semantic-danger">失败</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-surface-400">{r.failReason ?? '—'}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <StickyFooter show={totalPages > 1 && !loading}>
        <span className="text-xs text-surface-400">共 {total} 条</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-8 rounded-6 border border-surface-200 px-3 text-[12px] text-surface-500 disabled:opacity-40">上一页</button>
          <span className="text-xs text-surface-400">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-8 rounded-6 border border-surface-200 px-3 text-[12px] text-surface-500 disabled:opacity-40">下一页</button>
        </div>
      </StickyFooter>
    </div>
  );
}
