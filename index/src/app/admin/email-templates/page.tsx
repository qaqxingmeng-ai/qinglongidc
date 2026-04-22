'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { ConfirmDialog, EmptyState, PageHeader, Panel, SkeletonTable, useToast } from '@/components/admin/layout';
import { motion, AnimatePresence } from 'framer-motion';
import { easeOut } from '@/components/admin/motion';

interface EmailTemplate {
  id: string;
  key: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  isCustomized: boolean;
  updatedAt: string;
}

export default function EmailTemplatesPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [form, setForm] = useState({ subject: '', body: '' });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<EmailTemplate | null>(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/email-templates');
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        const list = Array.isArray(d) ? d : (d?.items ?? d?.templates ?? d?.list ?? []);
        setTemplates(Array.isArray(list) ? list : []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (tpl: EmailTemplate) => {
    setEditing(tpl);
    setForm({ subject: tpl.subject, body: tpl.body });
    setPreview(null);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/admin/email-templates/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: form.subject, body: form.body }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('模板已更新');
        setEditing(null);
        load();
      } else {
        toast.error(json.message || '保存失败');
      }
    } catch {
      toast.error('请求失败');
    }
    setSaving(false);
  };

  const handlePreview = async () => {
    if (!editing) return;
    try {
      const res = await apiFetch(`/api/admin/email-templates/${editing.id}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: form.subject, body: form.body }),
      });
      const json = await res.json();
      if (json.success) {
        setPreview(json.data?.html ?? json.data?.preview ?? '');
      } else {
        toast.error(json.message || '预览失败');
      }
    } catch {
      toast.error('请求失败');
    }
  };

  const handleReset = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      const res = await apiFetch(`/api/admin/email-templates/${resetTarget.id}/reset`, { method: 'POST' });
      const json = await res.json();
      if (json.success) { toast.success('已恢复默认'); load(); setResetTarget(null); }
      else toast.error(json.message || '重置失败');
    } catch {
      toast.error('请求失败');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="邮件模板"
        subtitle="自定义系统发送的各类邮件模板。"
      />

      {editing && (
        <Panel>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-surface-600">编辑: {editing.name}</h3>
            <button onClick={() => setEditing(null)} className="text-xs text-surface-400 hover:text-surface-600">关闭</button>
          </div>
          {editing.variables.length > 0 && (
            <p className="mb-3 text-xs text-surface-400">
              可用变量: {editing.variables.map((v) => `{{${v}}}`).join(', ')}
            </p>
          )}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-surface-500">邮件主题</label>
              <input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="w-full rounded-6 border border-surface-200 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-surface-500">邮件内容 (HTML)</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={12}
                className="w-full rounded-6 border border-surface-200 px-3 py-2 text-sm font-mono outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 resize-y"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleSave} disabled={saving} className="rounded-6 bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors">
              {saving ? '保存中...' : '保存'}
            </button>
            <button onClick={handlePreview} className="rounded-6 border border-surface-200 px-4 py-2 text-sm text-surface-500 hover:bg-surface-50 transition-colors">
              预览
            </button>
          </div>
          {preview !== null && (
            <div className="mt-4 rounded-6 border border-surface-200 bg-white p-4">
              <p className="mb-2 text-xs font-medium text-surface-400">预览</p>
              <iframe
                title="邮件模板预览"
                sandbox=""
                srcDoc={preview}
                className="h-96 w-full rounded-6 border border-surface-100 bg-white"
              />
            </div>
          )}
        </Panel>
      )}

      {loading ? (
        <SkeletonTable rows={5} columns={4} />
      ) : templates.length === 0 ? (
        <EmptyState title="暂无邮件模板" description="系统邮件模板将自动创建。" />
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100 text-left text-xs font-medium text-surface-400 uppercase tracking-wider">
                <th className="px-4 py-3">模板名称</th>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">主题</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">更新时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl, i) => (
                <motion.tr key={tpl.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }} className="border-b border-surface-50 hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-surface-600">{tpl.name}</td>
                  <td className="px-4 py-3 text-surface-400 font-mono text-xs">{tpl.key}</td>
                  <td className="px-4 py-3 text-surface-500 max-w-[200px] truncate">{tpl.subject}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-4 px-2 py-0.5 text-xs font-medium ${tpl.isCustomized ? 'bg-brand-50 text-brand-600 border border-brand-200' : 'bg-surface-100 text-surface-400'}`}>
                      {tpl.isCustomized ? '已自定义' : '默认'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-surface-400">{new Date(tpl.updatedAt).toLocaleString('zh-CN')}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => startEdit(tpl)} className="text-brand-500 hover:text-brand-600 text-xs mr-3">编辑</button>
                    {tpl.isCustomized && <button onClick={() => setResetTarget(tpl)} className="text-surface-400 hover:text-surface-600 text-xs">恢复默认</button>}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <AnimatePresence>
        <ConfirmDialog
          open={!!resetTarget}
          title="恢复默认模板"
          description={resetTarget ? `模板「${resetTarget.name}」将恢复为默认内容，当前自定义将丢失。` : ''}
          confirmText="恢复默认"
          danger
          loading={resetting}
          onConfirm={handleReset}
          onCancel={() => setResetTarget(null)}
        />
      </AnimatePresence>
    </div>
  );
}
