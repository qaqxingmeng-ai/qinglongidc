'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api-client';
import { ConfirmDialog, EmptyState, PageHeader, Panel, SkeletonTable, useToast } from '@/components/admin/layout';
import { easeOut } from '@/components/admin/motion';

interface CPU {
  id: string;
  brand: string;
  model: string;
  cores: number;
  threads: number;
  frequency: string;
  benchmark: number;
  createdAt: string;
}

export default function CPUPage() {
  const toast = useToast();
  const [cpus, setCpus] = useState<CPU[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CPU | null>(null);
  const [form, setForm] = useState({ brand: '', model: '', cores: '', threads: '', frequency: '', benchmark: '' });
  const [deleteTarget, setDeleteTarget] = useState<CPU | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/cpus');
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        const list = Array.isArray(d) ? d : (d?.items ?? d?.cpus ?? d?.list ?? []);
        setCpus(Array.isArray(list) ? list : []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setForm({ brand: '', model: '', cores: '', threads: '', frequency: '', benchmark: '' });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    const payload = {
      brand: form.brand,
      model: form.model,
      cores: Number(form.cores),
      threads: Number(form.threads),
      frequency: form.frequency,
      benchmark: Number(form.benchmark),
    };
    try {
      const url = editing ? `/api/admin/cpus/${editing.id}` : '/api/admin/cpus';
      const method = editing ? 'PUT' : 'POST';
      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (json.success) {
        toast.success(editing ? 'CPU 已更新' : 'CPU 已创建');
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
      const res = await apiFetch(`/api/admin/cpus/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { toast.success('已删除'); load(); setDeleteTarget(null); }
      else toast.error(json.message || '删除失败');
    } catch {
      toast.error('请求失败');
    } finally {
      setDeleting(false);
    }
  };

  const startEdit = (cpu: CPU) => {
    setEditing(cpu);
    setForm({
      brand: cpu.brand,
      model: cpu.model,
      cores: String(cpu.cores),
      threads: String(cpu.threads),
      frequency: cpu.frequency,
      benchmark: String(cpu.benchmark),
    });
    setShowForm(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="CPU 型号"
        subtitle="管理可用的 CPU 型号及基准跑分数据。"
        actions={
          <button onClick={() => { resetForm(); setShowForm(true); }} className="rounded-6 bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors">
            添加 CPU
          </button>
        }
      />

      {showForm && (
        <Panel>
          <h3 className="mb-3 text-sm font-semibold text-surface-600">{editing ? '编辑 CPU' : '新增 CPU'}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="品牌 (Intel/AMD)" className="rounded-6 border border-surface-200 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15" />
            <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="型号" className="rounded-6 border border-surface-200 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15" />
            <input value={form.cores} onChange={(e) => setForm({ ...form, cores: e.target.value })} placeholder="核心数" type="number" className="rounded-6 border border-surface-200 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15" />
            <input value={form.threads} onChange={(e) => setForm({ ...form, threads: e.target.value })} placeholder="线程数" type="number" className="rounded-6 border border-surface-200 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15" />
            <input value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} placeholder="频率 (3.5GHz)" className="rounded-6 border border-surface-200 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15" />
            <input value={form.benchmark} onChange={(e) => setForm({ ...form, benchmark: e.target.value })} placeholder="跑分" type="number" className="rounded-6 border border-surface-200 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15" />
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
        <SkeletonTable rows={5} columns={6} />
      ) : cpus.length === 0 ? (
        <EmptyState title="暂无 CPU 型号" description="点击上方按钮添加第一个 CPU 型号。" />
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100 text-left text-xs font-medium text-surface-400 uppercase tracking-wider">
                <th className="px-4 py-3">品牌</th>
                <th className="px-4 py-3">型号</th>
                <th className="px-4 py-3">核心/线程</th>
                <th className="px-4 py-3">频率</th>
                <th className="px-4 py-3">跑分</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {cpus.map((cpu, i) => (
                <motion.tr key={cpu.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }} className="border-b border-surface-50 hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-surface-600">{cpu.brand}</td>
                  <td className="px-4 py-3 text-surface-600">{cpu.model}</td>
                  <td className="px-4 py-3 text-surface-500">{cpu.cores}C / {cpu.threads}T</td>
                  <td className="px-4 py-3 text-surface-500">{cpu.frequency}</td>
                  <td className="px-4 py-3 text-surface-500 font-mono">{cpu.benchmark.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => startEdit(cpu)} className="text-brand-500 hover:text-brand-600 text-xs mr-3">编辑</button>
                    <button onClick={() => setDeleteTarget(cpu)} className="text-semantic-danger hover:text-red-700 text-xs">删除</button>
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
          title="确认删除 CPU"
          description={deleteTarget ? `型号「${deleteTarget.brand} ${deleteTarget.model}」将被删除。` : ''}
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
