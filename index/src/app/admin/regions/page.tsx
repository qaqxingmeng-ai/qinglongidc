'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, extractApiError } from '@/lib/api-client';
import { ConfirmDialog, EmptyState, PageHeader, Panel, SkeletonTable, useToast } from '@/components/admin/layout';
import { easeOut } from '@/components/admin/motion';

const inputCls = 'w-full h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] text-surface-600 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';
const modalTransition = { type: 'spring' as const, stiffness: 420, damping: 32 };

interface Region {
  region: string;
  description: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export default function AdminRegionsPage() {
  const toast = useToast();
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Region | null>(null);
  const [error, setError] = useState('');

  const [formRegion, setFormRegion] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formSort, setFormSort] = useState('0');
  const [saving, setSaving] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Region | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch('/api/admin/regions')
      .then((r) => r.json())
      .then((json) => {
        const rows: Region[] = Array.isArray(json) ? json : (json.data || []);
        setRegions(rows);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditTarget(null);
    setFormRegion('');
    setFormDesc('');
    setFormSort('0');
    setError('');
    setShowForm(true);
  }

  function openEdit(r: Region) {
    setEditTarget(r);
    setFormRegion(r.region);
    setFormDesc(r.description);
    setFormSort(String(r.sortOrder));
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const url = editTarget
        ? `/api/admin/regions/${encodeURIComponent(editTarget.region)}`
        : '/api/admin/regions';
      const method = editTarget ? 'PUT' : 'POST';
      const body: Record<string, string | number> = {
        description: formDesc,
        sortOrder: Number(formSort),
      };
      if (!editTarget) body.region = formRegion;

      const res = await apiFetch(url, { method, body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || extractApiError(json.error, '操作失败'));
        return;
      }
      setShowForm(false);
      toast.success(editTarget ? '区域已更新' : '区域已创建');
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const regionKey = deleteTarget.region;
    setDeletingKey(regionKey);
    try {
      const res = await apiFetch(`/api/admin/regions/${encodeURIComponent(regionKey)}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) {
        toast.error('删除失败', json.error?.message || extractApiError(json.error, '删除失败'));
        return;
      }
      toast.success('区域已删除');
      setDeleteTarget(null);
      load();
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="地区管理"
        subtitle="管理地区标识、显示文案和排序权重"
        actions={
          <button onClick={openCreate} className="h-8 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600">
            新增区域
          </button>
        }
      />

      {loading ? (
        <SkeletonTable rows={5} columns={4} />
      ) : (
        <Panel noPadding>
          {regions.length === 0 ? (
            <EmptyState title="暂无区域数据" action={<button onClick={openCreate} className="h-8 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white">新增区域</button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead className="border-b border-surface-100 bg-surface-50/60">
                  <tr>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">区域标识</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">描述</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">排序</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {regions.map((r, i) => (
                    <motion.tr key={r.region} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }} className="hover:bg-surface-50/50">
                      <td className="px-4 py-2.5 font-mono text-xs text-surface-500">{r.region}</td>
                      <td className="px-4 py-2.5 text-sm text-surface-500">{r.description || '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-surface-400">{r.sortOrder}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-3">
                          <button onClick={() => openEdit(r)} className="text-xs text-brand-500 hover:underline">编辑</button>
                          <button
                            onClick={() => setDeleteTarget(r)}
                            disabled={deletingKey === r.region}
                            className="text-xs text-semantic-danger hover:underline disabled:opacity-50"
                          >
                            {deletingKey === r.region ? '删除中...' : '删除'}
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/30 backdrop-blur-[2px] modal-panel" onClick={() => setShowForm(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -8 }} transition={modalTransition} className="relative mx-4 w-full max-w-md rounded-8 bg-white p-6 shadow-modal">
              <h2 className="mb-4 text-lg font-semibold text-surface-600">{editTarget ? '编辑区域' : '新增区域'}</h2>
              {error && <div className="mb-4 rounded-8 bg-semantic-danger-light p-3 text-sm text-semantic-danger">{error}</div>}
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-surface-400">区域标识</label>
                  <input
                    className={inputCls}
                    value={formRegion}
                    onChange={(e) => setFormRegion(e.target.value)}
                    disabled={!!editTarget}
                    required={!editTarget}
                    placeholder="例如: cn-hangzhou"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-surface-400">描述</label>
                  <input className={inputCls} value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="例如: 中国杭州" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-surface-400">排序</label>
                  <input className={inputCls} type="number" value={formSort} onChange={(e) => setFormSort(e.target.value)} />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={saving} className="h-8 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white disabled:opacity-50">
                    {saving ? '保存中...' : '保存'}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} className="h-8 rounded-6 border border-surface-200 px-3 text-[12px] text-surface-500">
                    取消
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        <ConfirmDialog
          open={!!deleteTarget}
          title="确认删除区域"
          description={deleteTarget ? `区域「${deleteTarget.region}」将被删除。` : ''}
          confirmText="删除"
          danger
          loading={!!deletingKey}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      </AnimatePresence>
    </div>
  );
}
