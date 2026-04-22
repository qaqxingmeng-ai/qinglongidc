'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api-client';
import {
  ConfirmDialog,
  PageHeader,
  FilterBar,
  Panel,
  EmptyState,
  SkeletonTable,
  StickyFooter,
  useToast,
} from '@/components/admin/layout';
import { easeOut } from '@/components/admin/motion';

const inputCls = 'w-full h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] text-surface-600 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';
const textareaCls = 'w-full resize-none rounded-6 border border-surface-200 bg-white px-3 py-2 text-[12px] text-surface-600 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';
const modalTransition = { type: 'spring' as const, stiffness: 420, damping: 32 };

interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  website?: string;
  notes?: string;
  isActive: boolean;
  productCount: number;
  totalRevenue: number;
  createdAt: string;
  updatedAt: string;
}

const empty = (): Partial<Supplier> => ({ name: '', isActive: true });

export default function SuppliersPage() {
  const toast = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; editing: Supplier | null }>({ open: false, editing: null });
  const [form, setForm] = useState<Partial<Supplier>>(empty());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search.trim()) params.set('search', search.trim());
      const res = await apiFetch(`/api/admin/suppliers?${params}`);
      const json = await res.json();
      if (json.success) {
        setSuppliers(json.data.suppliers ?? []);
        setTotal(json.data.total ?? 0);
      }
    } catch {
      toast.error('供应商数据加载失败');
    }
    setLoading(false);
  }, [page, search, toast]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm(empty());
    setErr('');
    setModal({ open: true, editing: null });
  };
  const openEdit = (s: Supplier) => {
    setForm({ ...s });
    setErr('');
    setModal({ open: true, editing: s });
  };

  const save = async () => {
    if (!form.name?.trim()) { setErr('供应商名称不能为空'); return; }
    setSaving(true); setErr('');
    const editing = modal.editing;
    const method = editing ? 'PUT' : 'POST';
    const url = editing ? `/api/admin/suppliers/${editing.id}` : '/api/admin/suppliers';
    let json: { success?: boolean; error?: string } = {};
    try {
      const res = await apiFetch(url, { method, body: JSON.stringify(form) });
      json = await res.json();
    } catch {
      setSaving(false);
      setErr('网络错误，请稍后重试');
      toast.error('网络错误');
      return;
    }
    setSaving(false);
    if (!json.success) { setErr(json.error ?? '操作失败'); return; }
    setModal({ open: false, editing: null });
    toast.success(editing ? '供应商已更新' : '供应商已创建');
    load();
  };

  const del = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/admin/suppliers/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) { toast.error('删除失败', json.error ?? '操作失败'); return; }
      toast.success('供应商已删除');
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  const toggleActive = async (s: Supplier) => {
    try {
      await apiFetch(`/api/admin/suppliers/${s.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !s.isActive }),
      });
      toast.success(s.isActive ? '已停用供应商' : '已启用供应商');
    } catch {
      toast.error('状态更新失败');
    }
    load();
  };

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-5">
      <PageHeader
        title="供应商管理"
        subtitle={`共 ${total} 家供应商`}
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="h-8 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600"
          >
            新建供应商
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
              type="text"
              placeholder="搜索名称、联系人、邮箱..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-6 border border-surface-200 bg-white pl-8 pr-3 text-[12px] text-surface-600 placeholder:text-surface-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/15 md:w-72"
            />
          </div>
        }
      >
        <span className="text-[12px] text-surface-400">供应商列表</span>
      </FilterBar>

      {loading ? (
        <SkeletonTable rows={8} columns={6} />
      ) : suppliers.length === 0 ? (
        <Panel>
          <EmptyState title="暂无供应商" description="请点击右上角按钮创建首个供应商" />
        </Panel>
      ) : (
        <Panel noPadding>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
                  <th className="py-2.5 pl-5 pr-4 font-medium">供应商</th>
                  <th className="py-2.5 pr-4 font-medium">联系人</th>
                  <th className="py-2.5 pr-4 text-right font-medium">关联产品</th>
                  <th className="py-2.5 pr-4 text-right font-medium">累计营收</th>
                  <th className="py-2.5 pr-4 text-center font-medium">状态</th>
                  <th className="py-2.5 pr-5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s, i) => (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }}
                    className="border-b border-surface-50 transition-colors last:border-b-0 hover:bg-surface-50/60"
                  >
                    <td className="py-3 pl-5 pr-4">
                      <div className="font-medium text-surface-600">{s.name}</div>
                      {s.website && (
                        <a href={s.website} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand-500 hover:underline">
                          {s.website}
                        </a>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-surface-500">
                      {s.contactName && <div>{s.contactName}</div>}
                      {s.contactEmail && <div className="text-[11px] text-surface-400">{s.contactEmail}</div>}
                      {s.contactPhone && <div className="text-[11px] text-surface-400">{s.contactPhone}</div>}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium tabular-nums text-surface-600">{s.productCount}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-surface-600">
                      {s.totalRevenue > 0 ? `¥${s.totalRevenue.toFixed(2)}` : '-'}
                    </td>
                    <td className="py-3 pr-4 text-center">
                      <button
                        onClick={() => toggleActive(s)}
                        className={`inline-flex items-center rounded-4 px-2 py-0.5 text-[11px] font-medium ${
                          s.isActive ? 'bg-semantic-success-light text-semantic-success-dark' : 'bg-surface-100 text-surface-400'
                        }`}
                      >
                        {s.isActive ? '启用' : '停用'}
                      </button>
                    </td>
                    <td className="py-3 pr-5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => openEdit(s)}
                          className="text-[12px] text-brand-500 transition-colors hover:text-brand-600"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => setDeleteTarget(s)}
                          className="text-[12px] text-semantic-danger transition-colors hover:opacity-85"
                        >
                          删除
                        </button>
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
        <div className="flex w-full items-center justify-center gap-2 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            上一页
          </button>
          <span className="px-3 py-1 text-surface-400">第 {page} 页 / 共 {totalPages} 页</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      </StickyFooter>

      <AnimatePresence>
        {modal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setModal({ open: false, editing: null })}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/30 backdrop-blur-[2px] modal-panel" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -8 }} transition={modalTransition} className="relative w-full max-w-md space-y-4 rounded-8 border border-surface-100 bg-white p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-surface-600">
              {modal.editing ? '编辑供应商' : '新建供应商'}
            </h2>

            <div className="space-y-3.5">
              <div>
                <label className="text-xs text-surface-400 block mb-1">供应商名称 *</label>
                <input
                  value={form.name ?? ''}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                  placeholder="如：阿里云、腾讯云..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-surface-400 block mb-1">联系人</label>
                  <input
                    value={form.contactName ?? ''}
                    onChange={(e) => setForm(f => ({ ...f, contactName: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-surface-400 block mb-1">联系电话</label>
                  <input
                    value={form.contactPhone ?? ''}
                    onChange={(e) => setForm(f => ({ ...f, contactPhone: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-surface-400 block mb-1">联系邮箱</label>
                <input
                  type="email"
                  value={form.contactEmail ?? ''}
                  onChange={(e) => setForm(f => ({ ...f, contactEmail: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs text-surface-400 block mb-1">官网 URL</label>
                <input
                  value={form.website ?? ''}
                  onChange={(e) => setForm(f => ({ ...f, website: e.target.value }))}
                  className={inputCls}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="text-xs text-surface-400 block mb-1">备注</label>
                <textarea
                  rows={3}
                  value={form.notes ?? ''}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                  className={textareaCls}
                />
              </div>
              {modal.editing && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isActive ?? true}
                    onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  />
                  <span className="text-surface-500">启用</span>
                </label>
              )}
            </div>

            {err && <p className="text-sm text-semantic-danger">{err}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setModal({ open: false, editing: null })}
                className="h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500"
              >
                取消
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="h-8 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        <ConfirmDialog
          open={!!deleteTarget}
          title="确认删除供应商"
          description={deleteTarget ? `供应商「${deleteTarget.name}」将被删除，此操作不可撤销。` : ''}
          confirmText="删除"
          danger
          loading={deleting}
          onConfirm={del}
          onCancel={() => setDeleteTarget(null)}
        />
      </AnimatePresence>
    </div>
  );
}
