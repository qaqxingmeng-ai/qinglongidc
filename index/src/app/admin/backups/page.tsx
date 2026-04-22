'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api-client';
import { EmptyState, PageHeader, Panel, SkeletonTable, StickyFooter, useToast, StatusBadge } from '@/components/admin/layout';

interface BackupRecord {
  id: string;
  filename: string;
  sizeBytes: number;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  trigger: 'MANUAL' | 'AUTO';
  createdBy: string | null;
  createdAt: string;
  errorMsg?: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function AdminBackupsInner() {
  const toast = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const [records, setRecords] = useState<BackupRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== 'ADMIN') router.push('/');
  }, [user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/backups?page=${page}&pageSize=20`, { method: 'GET' });
      const json = await res.json();
      if (json.success) {
        const d = json.data as { records: BackupRecord[]; total: number };
        setRecords(d.records ?? []);
        setTotal(d.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const hasRunning = records.some((r) => r.status === 'RUNNING');
    if (!hasRunning) return;
    const t = setInterval(() => {
      void load();
    }, 4000);
    return () => clearInterval(t);
  }, [records, load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await apiFetch('/api/admin/backups', { method: 'POST', body: JSON.stringify({}) });
      const json = await res.json();
      if (json.success) {
        toast.success('备份任务已创建');
        await load();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = (id: string, filename: string) => {
    const a = document.createElement('a');
    a.href = `/api/admin/backups/${id}/download`;
    a.download = filename;
    a.click();
  };

  const handleDelete = async (id: string) => {
    setDeleteId(id);
    try {
      const res = await apiFetch(`/api/admin/backups/${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (res.ok && (json?.success ?? true)) {
        toast.success('备份已删除');
        await load();
      } else {
        toast.error('删除失败', json?.error?.message ?? '未知错误');
      }
    } catch {
      toast.error('删除失败');
    } finally {
      setDeleteId(null);
    }
  };

  const pageCount = Math.ceil(total / 20) || 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="数据库备份"
        subtitle="手动触发 pg_dump 备份，自动备份每日 03:00 执行，保留最新 30 份"
        actions={
          <button disabled={creating} onClick={handleCreate} className="h-8 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
            {creating ? '备份中...' : '立即备份'}
          </button>
        }
      />

      {loading && records.length === 0 ? (
        <SkeletonTable rows={6} columns={6} />
      ) : (
        <Panel noPadding>
          {records.length === 0 ? (
            <EmptyState title="暂无备份记录" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead className="border-b border-surface-100 bg-surface-50/60">
                  <tr>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">文件名</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">大小</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">状态</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">触发方式</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">创建时间</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-50/50">
                      <td className="px-4 py-2.5 font-mono text-xs text-surface-500">{r.filename}</td>
                      <td className="px-4 py-2.5 text-sm text-surface-500">{r.status === 'SUCCESS' ? formatBytes(r.sizeBytes) : '-'}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={r.status} />
                        {r.status === 'FAILED' && r.errorMsg && <p className="mt-0.5 max-w-xs truncate text-xs text-semantic-danger">{r.errorMsg}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-surface-400">{r.trigger === 'MANUAL' ? '手动' : '自动'}</td>
                      <td className="px-4 py-2.5 text-xs text-surface-400">{new Date(r.createdAt).toLocaleString('zh-CN')}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          {r.status === 'SUCCESS' && <button onClick={() => handleDownload(r.id, r.filename)} className="text-xs text-brand-500 hover:underline">下载</button>}
                          <button disabled={deleteId === r.id} onClick={() => handleDelete(r.id)} className="text-xs text-semantic-danger hover:underline disabled:opacity-40">
                            {deleteId === r.id ? '删除中...' : '删除'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <StickyFooter show={pageCount > 1}>
        <span className="text-xs text-surface-400">共 {total} 条</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-8 rounded-6 border border-surface-200 px-3 text-[12px] text-surface-500 disabled:opacity-40">上一页</button>
          <span className="text-xs text-surface-400">{page} / {pageCount}</span>
          <button disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="h-8 rounded-6 border border-surface-200 px-3 text-[12px] text-surface-500 disabled:opacity-40">下一页</button>
        </div>
      </StickyFooter>
    </div>
  );
}

export default function AdminBackupsPage() {
  return (
    <AuthProvider>
      <AdminBackupsInner />
    </AuthProvider>
  );
}
