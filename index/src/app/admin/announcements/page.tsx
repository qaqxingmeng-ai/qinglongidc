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
  ConfirmDialog,
} from '@/components/admin/layout';
import { easeOut, staggerContainer, kpiItem, CountUp } from '@/components/admin/motion';

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  priority: string;
  startAt: string | null;
  endAt: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  BANNER: '首页横幅',
  POPUP: '登录弹窗',
  MAINTENANCE: '维护通知',
  CHANGELOG: '更新日志',
};

const PRIORITY_MAP: Record<string, { label: string; style: string }> = {
  LOW: { label: '低', style: 'bg-surface-100 text-surface-400' },
  NORMAL: { label: '普通', style: 'bg-semantic-info-light text-brand-600' },
  HIGH: { label: '高', style: 'bg-semantic-warning-light text-semantic-warning-dark' },
  URGENT: { label: '紧急', style: 'bg-semantic-danger-light text-semantic-danger' },
};

const TYPE_FILTERS = ['ALL', 'BANNER', 'POPUP', 'MAINTENANCE', 'CHANGELOG'] as const;
const STATUS_FILTERS = ['ALL', 'ACTIVE', 'INACTIVE'] as const;
const STATUS_LABEL: Record<string, string> = { ALL: '全部', ACTIVE: '已发布', INACTIVE: '未发布' };

const inputCls = 'w-full h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] text-surface-600 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';
const selectCls = inputCls;
const modalTransition = { type: 'spring' as const, stiffness: 420, damping: 32 };

const empty = { title: '', content: '', type: 'BANNER', priority: 'NORMAL', startAt: '', endAt: '', isActive: false };

/* ── FormField ── */
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-surface-500">{label}</label>
      {children}
    </div>
  );
}

export default function AdminAnnouncementsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Announcement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) });
    if (typeFilter !== 'ALL') params.set('type', typeFilter);
    if (statusFilter !== 'ALL') params.set('isActive', statusFilter === 'ACTIVE' ? 'true' : 'false');
    try {
      const res = await apiFetch(`/api/admin/announcements?${params}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data.items || []);
        setTotal(json.data.total || 0);
      }
    } catch {
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, typeFilter, statusFilter, toast]);

  useEffect(() => { setPage(1); }, [typeFilter, statusFilter]);
  useEffect(() => { void load(page); }, [page, load]);

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setShowModal(true);
  };

  const openEdit = (a: Announcement) => {
    setEditing(a);
    setForm({
      title: a.title,
      content: a.content,
      type: a.type,
      priority: a.priority,
      startAt: a.startAt ? a.startAt.slice(0, 16) : '',
      endAt: a.endAt ? a.endAt.slice(0, 16) : '',
      isActive: a.isActive,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const body = {
      ...form,
      startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
      endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
    };
    try {
      const url = editing ? `/api/admin/announcements/${editing.id}` : '/api/admin/announcements';
      const method = editing ? 'PUT' : 'POST';
      const res = await apiFetch(url, { method, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) {
        toast.success(editing ? '公告已更新' : '公告已创建');
        setShowModal(false);
        load(page);
      } else {
        toast.error('保存失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (a: Announcement) => {
    try {
      await apiFetch(`/api/admin/announcements/${a.id}/toggle`, { method: 'PATCH' });
      toast.success(a.isActive ? '已撤回' : '已发布');
      setItems((prev) => prev.map((x) => x.id === a.id ? { ...x, isActive: !x.isActive } : x));
    } catch {
      toast.error('操作失败');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/announcements/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success('公告已删除');
      setDeleteTarget(null);
      load(page);
    } catch {
      toast.error('删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;
  const activeCount = items.filter((a) => a.isActive).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="公告管理"
        subtitle="管理站点公告、维护通知和更新日志，控制发布状态和展示优先级"
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="flex h-8 items-center gap-1.5 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            新建公告
          </button>
        }
      />

      {/* KPI */}
      <motion.div variants={staggerContainer(0.04)} initial="initial" animate="animate" className="grid grid-cols-3 gap-4">
        {[
          { label: '公告总数', value: total, tone: 'default' as const },
          { label: '已发布', value: activeCount, tone: 'success' as const },
          { label: '未发布', value: items.length - activeCount, tone: 'default' as const },
        ].map((item) => (
          <motion.div
            key={item.label}
            variants={kpiItem}
            className="rounded-8 border border-surface-200 bg-white px-4 py-3 text-center shadow-card"
          >
            <p className={`text-xl font-semibold tabular-nums ${item.tone === 'success' ? 'text-semantic-success' : 'text-surface-600'}`}>
              <CountUp value={item.value} />
            </p>
            <p className="mt-0.5 text-[11px] text-surface-400">{item.label}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Filter */}
      <FilterBar>
        {TYPE_FILTERS.map((t) => (
          <TabChip key={t} active={typeFilter === t} onClick={() => { setTypeFilter(t); setPage(1); }}>
            {t === 'ALL' ? '全部' : TYPE_LABELS[t] || t}
          </TabChip>
        ))}
        <span className="mx-1 h-4 w-px bg-surface-200" />
        {STATUS_FILTERS.map((s) => (
          <TabChip key={s} active={statusFilter === s} onClick={() => { setStatusFilter(s); setPage(1); }}>
            {STATUS_LABEL[s]}
          </TabChip>
        ))}
      </FilterBar>

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={6} columns={6} />
      ) : !items.length ? (
        <Panel><EmptyState title="暂无公告" description="当前筛选条件下没有匹配的公告" /></Panel>
      ) : (
        <Panel noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
                  <th className="py-2.5 pl-5 pr-4 font-medium">标题</th>
                  <th className="py-2.5 pr-4 font-medium">类型</th>
                  <th className="py-2.5 pr-4 font-medium">优先级</th>
                  <th className="py-2.5 pr-4 font-medium">有效期</th>
                  <th className="py-2.5 pr-4 font-medium">状态</th>
                  <th className="py-2.5 pr-5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a, i) => {
                  const pr = PRIORITY_MAP[a.priority] || PRIORITY_MAP.NORMAL;
                  return (
                    <motion.tr
                      key={a.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }}
                      className="border-b border-surface-50 transition-colors last:border-b-0 hover:bg-surface-50/60"
                    >
                      <td className="py-3 pl-5 pr-4">
                        <p className="font-medium text-surface-600 truncate max-w-[200px]">{a.title}</p>
                        <p className="mt-0.5 text-[11px] text-surface-400 truncate max-w-[200px]">{a.content?.slice(0, 50)}</p>
                      </td>
                      <td className="py-3 pr-4 text-[12px] text-surface-500">{TYPE_LABELS[a.type] || a.type}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center rounded-4 px-2 py-0.5 text-[11px] font-medium ${pr.style}`}>
                          {pr.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-xs text-surface-400">
                        <div>{a.startAt ? new Date(a.startAt).toLocaleDateString('zh-CN') : '即时'}</div>
                        <div>~ {a.endAt ? new Date(a.endAt).toLocaleDateString('zh-CN') : '永久'}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center gap-1 rounded-4 px-2 py-0.5 text-[11px] font-medium ${a.isActive ? 'bg-semantic-success-light text-semantic-success-dark' : 'bg-surface-100 text-surface-400'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${a.isActive ? 'bg-semantic-success' : 'bg-surface-300'}`} />
                          {a.isActive ? '已发布' : '未发布'}
                        </span>
                      </td>
                      <td className="py-3 pr-5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => toggleActive(a)} className="h-7 rounded-6 border border-surface-200 bg-white px-2.5 text-[11px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500">
                            {a.isActive ? '撤回' : '发布'}
                          </button>
                          <button type="button" onClick={() => openEdit(a)} className="h-7 rounded-6 border border-surface-200 bg-white px-2.5 text-[11px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500">
                            编辑
                          </button>
                          <button type="button" onClick={() => setDeleteTarget(a)} className="h-7 rounded-6 border border-semantic-danger-light bg-white px-2.5 text-[11px] font-medium text-semantic-danger transition-colors hover:bg-semantic-danger-light">
                            删除
                          </button>
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

      {/* Pagination */}
      <StickyFooter show={!loading && items.length > 0 && totalPages > 1}>
        <p className="text-[12px] text-surface-400">
          共 <span className="font-medium tabular-nums text-surface-600">{total}</span> 条 · 第{' '}
          <span className="tabular-nums">{page}</span> / <span className="tabular-nums">{totalPages}</span> 页
        </p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="flex h-7 w-7 items-center justify-center rounded-6 text-surface-400 transition-colors hover:bg-surface-50 hover:text-surface-600 disabled:cursor-not-allowed disabled:opacity-30">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button type="button" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="flex h-7 w-7 items-center justify-center rounded-6 text-surface-400 transition-colors hover:bg-surface-50 hover:text-surface-600 disabled:cursor-not-allowed disabled:opacity-30">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </StickyFooter>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay" onClick={() => setShowModal(false)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] modal-panel" />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -8 }}
              transition={modalTransition}
              className="relative mx-4 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-12 border border-surface-200 bg-white shadow-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-surface-100 px-5 py-3.5">
                <h3 className="text-[13px] font-semibold text-surface-600">{editing ? '编辑公告' : '新建公告'}</h3>
                <button type="button" onClick={() => setShowModal(false)} className="flex h-6 w-6 items-center justify-center rounded-full text-surface-300 transition-colors hover:bg-surface-100 hover:text-surface-500">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M2 2l6 6M8 2l-6 6" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
                <FormField label="标题 *">
                  <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="公告标题" maxLength={255} className={inputCls} />
                </FormField>
                <FormField label="内容">
                  <textarea
                    value={form.content}
                    onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                    placeholder="公告内容（支持 Markdown）"
                    className="w-full h-28 resize-none rounded-6 border border-surface-200 bg-white px-3 py-2 text-[12px] text-surface-600 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                  />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="类型">
                    <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className={selectCls}>
                      {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </FormField>
                  <FormField label="优先级">
                    <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className={selectCls}>
                      <option value="LOW">低</option>
                      <option value="NORMAL">普通</option>
                      <option value="HIGH">高</option>
                      <option value="URGENT">紧急</option>
                    </select>
                  </FormField>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="生效时间（可选）">
                    <input type="datetime-local" value={form.startAt} onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))} className={inputCls} />
                  </FormField>
                  <FormField label="失效时间（可选）">
                    <input type="datetime-local" value={form.endAt} onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))} className={inputCls} />
                  </FormField>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive as boolean}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="h-3.5 w-3.5 rounded border-surface-300 text-brand-500 focus:ring-brand-500/15"
                  />
                  <span className="text-[12px] text-surface-500">立即发布</span>
                </label>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-surface-100 px-5 py-3">
                <button type="button" onClick={() => setShowModal(false)} className="h-8 rounded-6 border border-surface-200 bg-white px-4 text-[12px] font-medium text-surface-500 transition-colors hover:bg-surface-50">
                  取消
                </button>
                <button type="button" onClick={save} disabled={saving || !form.title.trim()} className="h-8 rounded-6 bg-brand-500 px-4 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        <ConfirmDialog
          open={!!deleteTarget}
          title="确认删除公告"
          description={`将永久删除「${deleteTarget?.title}」，此操作不可撤销。`}
          confirmText="删除"
          danger
          loading={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      </AnimatePresence>
    </div>
  );
}
