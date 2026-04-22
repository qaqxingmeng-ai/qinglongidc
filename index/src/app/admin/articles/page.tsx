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
import { easeOut } from '@/components/admin/motion';

interface Category {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  articleCount?: number;
}

interface Article {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  category?: Category;
  tags: string;
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  isPublished: boolean;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

type Tab = 'articles' | 'categories';

const inputCls = 'w-full h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] text-surface-600 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';
const selectCls = inputCls;
const modalTransition = { type: 'spring' as const, stiffness: 420, damping: 32 };

const emptyForm = () => ({ title: '', slug: '', content: '', categoryId: '', tags: '[]', isPublished: false, sortOrder: 0 });

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-surface-500">{label}</label>
      {children}
    </div>
  );
}

export default function ArticlesPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('articles');
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; editing: Article | null }>({ open: false, editing: null });
  const [catModal, setCatModal] = useState<{ open: boolean; editing: Category | null }>({ open: false, editing: null });
  const [form, setForm] = useState(emptyForm());
  const [catForm, setCatForm] = useState({ name: '', slug: '', sortOrder: 0 });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'article' | 'category'; item: Article | Category } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.set('search', search);
    try {
      const res = await apiFetch(`/api/admin/articles?${params}`);
      const json = await res.json();
      if (json.success) {
        setArticles(json.data.articles ?? []);
        setTotal(json.data.total ?? 0);
      }
    } catch {
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, search, pageSize, toast]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/article-categories');
      const json = await res.json();
      if (json.success) setCategories(json.data.categories ?? []);
    } catch {
      toast.error('分类加载失败');
    }
  }, [toast]);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { if (tab === 'articles') loadArticles(); }, [tab, loadArticles]);

  const openCreate = () => { setForm(emptyForm()); setModal({ open: true, editing: null }); };
  const openEdit = (a: Article) => {
    setForm({ title: a.title, slug: a.slug, content: '', categoryId: a.categoryId, tags: a.tags, isPublished: a.isPublished, sortOrder: a.sortOrder });
    setModal({ open: true, editing: a });
  };

  const save = async () => {
    if (!form.title.trim() || !form.categoryId) { toast.error('标题和分类不能为空'); return; }
    if (!modal.editing && !form.content.trim()) { toast.error('内容不能为空'); return; }
    setSaving(true);
    const editing = modal.editing;
    const method = editing ? 'PUT' : 'POST';
    const url = editing ? `/api/admin/articles/${editing.id}` : '/api/admin/articles';
    const body: Record<string, unknown> = { ...form };
    if (editing && !form.content) delete body.content;
    try {
      const res = await apiFetch(url, { method, body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.success) { toast.error(json.error ?? '保存失败'); return; }
      toast.success(editing ? '文章已更新' : '文章已创建');
      setModal({ open: false, editing: null });
      loadArticles();
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === 'article') {
        await apiFetch(`/api/admin/articles/${deleteTarget.item.id}`, { method: 'DELETE' });
        toast.success('文章已删除');
        loadArticles();
      } else {
        const res = await apiFetch(`/api/admin/article-categories/${deleteTarget.item.id}`, { method: 'DELETE' });
        const json = await res.json();
        if (!json.success) { toast.error(json.error ?? '删除失败'); return; }
        toast.success('分类已删除');
        loadCategories();
      }
      setDeleteTarget(null);
    } catch {
      toast.error('删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const togglePublish = async (a: Article) => {
    try {
      await apiFetch(`/api/admin/articles/${a.id}/publish`, { method: 'PATCH' });
      toast.success(a.isPublished ? '已取消发布' : '已发布');
      setArticles((prev) => prev.map((x) => x.id === a.id ? { ...x, isPublished: !x.isPublished } : x));
    } catch {
      toast.error('操作失败');
    }
  };

  const saveCategory = async () => {
    if (!catForm.name.trim()) { toast.error('分类名称不能为空'); return; }
    setSaving(true);
    const editing = catModal.editing;
    const method = editing ? 'PUT' : 'POST';
    const url = editing ? `/api/admin/article-categories/${editing.id}` : '/api/admin/article-categories';
    try {
      const res = await apiFetch(url, { method, body: JSON.stringify(catForm) });
      const json = await res.json();
      if (!json.success) { toast.error(json.error ?? '保存失败'); return; }
      toast.success(editing ? '分类已更新' : '分类已创建');
      setCatModal({ open: false, editing: null });
      loadCategories();
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="帮助文章"
        subtitle="管理帮助文档和知识库文章"
        actions={
          <button
            type="button"
            onClick={tab === 'articles' ? openCreate : () => { setCatForm({ name: '', slug: '', sortOrder: 0 }); setCatModal({ open: true, editing: null }); }}
            className="flex h-8 items-center gap-1.5 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {tab === 'articles' ? '新建文章' : '新建分类'}
          </button>
        }
      />

      <FilterBar
        right={
          tab === 'articles' ? (
            <div className="relative">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                className="h-8 w-full rounded-6 border border-surface-200 bg-white pl-8 pr-3 text-[12px] text-surface-600 placeholder:text-surface-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/15 md:w-64"
                placeholder="搜索文章标题..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
          ) : undefined
        }
      >
        <TabChip active={tab === 'articles'} onClick={() => setTab('articles')}>文章列表</TabChip>
        <TabChip active={tab === 'categories'} onClick={() => setTab('categories')}>分类管理</TabChip>
      </FilterBar>

      {tab === 'articles' && (
        <>
          {loading ? (
            <SkeletonTable rows={6} columns={6} />
          ) : !articles.length ? (
            <Panel><EmptyState title="暂无文章" description="当前筛选条件下没有匹配的文章" /></Panel>
          ) : (
            <Panel noPadding>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
                      <th className="py-2.5 pl-5 pr-4 font-medium">标题</th>
                      <th className="py-2.5 pr-4 font-medium">分类</th>
                      <th className="py-2.5 pr-4 text-right font-medium">浏览</th>
                      <th className="py-2.5 pr-4 text-right font-medium">有帮助</th>
                      <th className="py-2.5 pr-4 font-medium">状态</th>
                      <th className="py-2.5 pr-5 text-right font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {articles.map((a, i) => (
                      <motion.tr
                        key={a.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }}
                        className="border-b border-surface-50 transition-colors last:border-b-0 hover:bg-surface-50/60"
                      >
                        <td className="py-3 pl-5 pr-4">
                          <p className="truncate max-w-[200px] font-medium text-surface-600">{a.title}</p>
                          <p className="mt-0.5 truncate max-w-[200px] font-mono text-[11px] text-surface-400">{a.slug}</p>
                        </td>
                        <td className="py-3 pr-4 text-surface-500">{a.category?.name ?? '-'}</td>
                        <td className="py-3 pr-4 text-right tabular-nums text-surface-500">{a.viewCount}</td>
                        <td className="py-3 pr-4 text-right tabular-nums text-surface-500">{a.helpfulCount}</td>
                        <td className="py-3 pr-4">
                          <button
                            type="button"
                            onClick={() => togglePublish(a)}
                            className={`inline-flex items-center rounded-4 px-2 py-0.5 text-[11px] font-medium transition-colors ${a.isPublished ? 'bg-semantic-success-light text-semantic-success-dark' : 'bg-surface-100 text-surface-400'}`}
                          >
                            {a.isPublished ? '已发布' : '草稿'}
                          </button>
                        </td>
                        <td className="py-3 pr-5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" onClick={() => openEdit(a)} className="h-7 rounded-6 border border-surface-200 bg-white px-2.5 text-[11px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500">
                              编辑
                            </button>
                            <button type="button" onClick={() => setDeleteTarget({ type: 'article', item: a })} className="h-7 rounded-6 border border-semantic-danger-light bg-white px-2.5 text-[11px] font-medium text-semantic-danger transition-colors hover:bg-semantic-danger-light">
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

          <StickyFooter show={!loading && articles.length > 0 && totalPages > 1}>
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
        </>
      )}

      {tab === 'categories' && (
        <>
          {categories.length === 0 ? (
            <Panel><EmptyState title="暂无分类" description="创建分类来组织文章" /></Panel>
          ) : (
            <Panel noPadding>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
                      <th className="py-2.5 pl-5 pr-4 font-medium">分类名称</th>
                      <th className="py-2.5 pr-4 font-medium">Slug</th>
                      <th className="py-2.5 pr-4 text-right font-medium">文章数</th>
                      <th className="py-2.5 pr-4 text-right font-medium">排序</th>
                      <th className="py-2.5 pr-5 text-right font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c, i) => (
                      <motion.tr
                        key={c.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }}
                        className="border-b border-surface-50 transition-colors last:border-b-0 hover:bg-surface-50/60"
                      >
                        <td className="py-3 pl-5 pr-4 font-medium text-surface-600">{c.name}</td>
                        <td className="py-3 pr-4 font-mono text-[11px] text-surface-400">{c.slug}</td>
                        <td className="py-3 pr-4 text-right tabular-nums text-surface-500">{c.articleCount ?? 0}</td>
                        <td className="py-3 pr-4 text-right tabular-nums text-surface-400">{c.sortOrder}</td>
                        <td className="py-3 pr-5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => { setCatForm({ name: c.name, slug: c.slug, sortOrder: c.sortOrder }); setCatModal({ open: true, editing: c }); }}
                              className="h-7 rounded-6 border border-surface-200 bg-white px-2.5 text-[11px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500"
                            >
                              编辑
                            </button>
                            <button type="button" onClick={() => setDeleteTarget({ type: 'category', item: c })} className="h-7 rounded-6 border border-semantic-danger-light bg-white px-2.5 text-[11px] font-medium text-semantic-danger transition-colors hover:bg-semantic-danger-light">
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
        </>
      )}

      <AnimatePresence>
        {modal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay" onClick={() => setModal({ open: false, editing: null })}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] modal-panel" />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -8 }}
              transition={modalTransition}
              className="relative mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-12 border border-surface-200 bg-white shadow-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-surface-100 px-5 py-3.5">
                <h3 className="text-[13px] font-semibold text-surface-600">{modal.editing ? '编辑文章' : '新建文章'}</h3>
                <button type="button" onClick={() => setModal({ open: false, editing: null })} className="flex h-6 w-6 items-center justify-center rounded-full text-surface-300 transition-colors hover:bg-surface-100 hover:text-surface-500">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M2 2l6 6M8 2l-6 6" /></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
                <FormField label="标题 *">
                  <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="文章标题" className={inputCls} />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Slug（留空自动生成）">
                    <input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} className={`${inputCls} font-mono`} />
                  </FormField>
                  <FormField label="分类 *">
                    <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} className={selectCls}>
                      <option value="">选择分类</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </FormField>
                </div>
                <FormField label={modal.editing ? '内容（Markdown）-- 留空保持原内容不变' : '内容（Markdown） *'}>
                  <textarea
                    rows={14}
                    value={form.content}
                    onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                    className="w-full resize-none rounded-6 border border-surface-200 bg-white px-3 py-2 font-mono text-[12px] text-surface-600 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                  />
                </FormField>
                <div className="flex items-center gap-4">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.isPublished}
                      onChange={(e) => setForm((f) => ({ ...f, isPublished: e.target.checked }))}
                      className="h-3.5 w-3.5 rounded border-surface-300 text-brand-500 focus:ring-brand-500/15"
                    />
                    <span className="text-[12px] text-surface-500">立即发布</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-surface-400">排序值</span>
                    <input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))} className="w-20 h-8 rounded-6 border border-surface-200 bg-white px-2 text-[12px] text-surface-600 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15" />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-surface-100 px-5 py-3">
                <button type="button" onClick={() => setModal({ open: false, editing: null })} className="h-8 rounded-6 border border-surface-200 bg-white px-4 text-[12px] font-medium text-surface-500 transition-colors hover:bg-surface-50">取消</button>
                <button type="button" onClick={save} disabled={saving} className="h-8 rounded-6 bg-brand-500 px-4 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {catModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay" onClick={() => setCatModal({ open: false, editing: null })}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] modal-panel" />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -8 }}
              transition={modalTransition}
              className="relative mx-4 w-full max-w-sm rounded-12 border border-surface-200 bg-white shadow-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-surface-100 px-5 py-3.5">
                <h3 className="text-[13px] font-semibold text-surface-600">{catModal.editing ? '编辑分类' : '新建分类'}</h3>
                <button type="button" onClick={() => setCatModal({ open: false, editing: null })} className="flex h-6 w-6 items-center justify-center rounded-full text-surface-300 transition-colors hover:bg-surface-100 hover:text-surface-500">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M2 2l6 6M8 2l-6 6" /></svg>
                </button>
              </div>
              <div className="px-5 py-4 space-y-3.5">
                <FormField label="分类名称 *">
                  <input value={catForm.name} onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))} placeholder="分类名称" className={inputCls} />
                </FormField>
                <FormField label="Slug（留空自动生成）">
                  <input value={catForm.slug} onChange={(e) => setCatForm((f) => ({ ...f, slug: e.target.value }))} className={`${inputCls} font-mono`} />
                </FormField>
                <FormField label="排序值">
                  <input type="number" value={catForm.sortOrder} onChange={(e) => setCatForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))} className={inputCls} />
                </FormField>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-surface-100 px-5 py-3">
                <button type="button" onClick={() => setCatModal({ open: false, editing: null })} className="h-8 rounded-6 border border-surface-200 bg-white px-4 text-[12px] font-medium text-surface-500 transition-colors hover:bg-surface-50">取消</button>
                <button type="button" onClick={saveCategory} disabled={saving} className="h-8 rounded-6 bg-brand-500 px-4 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
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
          title={deleteTarget?.type === 'article' ? '确认删除文章' : '确认删除分类'}
          description={`将永久删除「${deleteTarget?.type === 'article' ? (deleteTarget.item as Article).title : (deleteTarget?.item as Category)?.name}」，此操作不可撤销。`}
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
