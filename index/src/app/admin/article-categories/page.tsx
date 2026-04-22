'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api-client';
import { ConfirmDialog, EmptyState, PageHeader, Panel, SkeletonTable, useToast } from '@/components/admin/layout';
import { easeOut } from '@/components/admin/motion';

interface ArticleCategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  articleCount: number;
  createdAt: string;
}

export default function ArticleCategoriesPage() {
  const toast = useToast();
  const [categories, setCategories] = useState<ArticleCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ArticleCategory | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', sortOrder: '0' });
  const [deleteTarget, setDeleteTarget] = useState<ArticleCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/article-categories');
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        const list = Array.isArray(d) ? d : (d?.items ?? d?.categories ?? d?.list ?? []);
        setCategories(Array.isArray(list) ? list : []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setForm({ name: '', slug: '', sortOrder: '0' });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('请输入分类名称'); return; }
    const payload = { name: form.name, slug: form.slug, sortOrder: Number(form.sortOrder) };
    try {
      const url = editing ? `/api/admin/article-categories/${editing.id}` : '/api/admin/article-categories';
      const method = editing ? 'PUT' : 'POST';
      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (json.success) {
        toast.success(editing ? '分类已更新' : '分类已创建');
        resetForm();
        load();
      } else {
        toast.error(json.message || '操作失败');
      }
    } catch {
      toast.error('请求失败');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/admin/article-categories/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { toast.success('已删除'); load(); setDeleteTarget(null); }
      else toast.error(json.message || '删除失败');
    } catch {
      toast.error('请求失败');
    } finally {
      setDeleting(false);
    }
  };

  const startEdit = (cat: ArticleCategory) => {
    setEditing(cat);
    setForm({ name: cat.name, slug: cat.slug, sortOrder: String(cat.sortOrder) });
    setShowForm(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="帮助文档分类"
        subtitle="管理帮助中心的文章分类。"
        actions={
          <button onClick={() => { resetForm(); setShowForm(true); }} className="rounded-6 bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors">
            新增分类
          </button>
        }
      />

      {showForm && (
        <Panel>
          <h3 className="mb-3 text-sm font-semibold text-surface-600">{editing ? '编辑分类' : '新增分类'}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="分类名称" className="rounded-6 border border-surface-200 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15" />
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Slug (可选)" className="rounded-6 border border-surface-200 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15" />
            <input value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} placeholder="排序" type="number" className="rounded-6 border border-surface-200 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15" />
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleSubmit} className="rounded-6 bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors">
              {editing ? '保存修改' : '创建'}
            </button>
            <button onClick={resetForm} className="rounded-6 border border-surface-200 px-4 py-2 text-sm text-surface-500 hover:bg-surface-50 transition-colors">
              取消
            </button>
          </div>
        </Panel>
      )}

      {loading ? (
        <SkeletonTable rows={4} columns={4} />
      ) : categories.length === 0 ? (
        <EmptyState title="暂无分类" description="点击上方按钮创建第一个分类。" />
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100 text-left text-xs font-medium text-surface-400 uppercase tracking-wider">
                <th className="px-4 py-3">名称</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">排序</th>
                <th className="px-4 py-3">文章数</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat, i) => (
                <motion.tr key={cat.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }} className="border-b border-surface-50 hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-surface-600">{cat.name}</td>
                  <td className="px-4 py-3 text-surface-400 font-mono text-xs">{cat.slug}</td>
                  <td className="px-4 py-3 text-surface-500">{cat.sortOrder}</td>
                  <td className="px-4 py-3 text-surface-500">{cat.articleCount}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => startEdit(cat)} className="text-brand-500 hover:text-brand-600 text-xs mr-3">编辑</button>
                    <button onClick={() => setDeleteTarget(cat)} className="text-semantic-danger hover:text-red-700 text-xs">删除</button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <AnimatePresence>
        <ConfirmDialog
          open={!!deleteTarget}
          title="确认删除分类"
          description={deleteTarget ? `分类「${deleteTarget.name}」将被删除，关联文章不会受影响。` : ''}
          confirmText="删除"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      </AnimatePresence>
    </div>
  );
}
