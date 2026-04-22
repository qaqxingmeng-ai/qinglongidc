'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api-client';
import { ConfirmDialog, PageHeader, Panel, EmptyState, SkeletonTable, useToast } from '@/components/admin/layout';
import { easeOut } from '@/components/admin/motion';

const modalTransition = { type: 'spring' as const, stiffness: 420, damping: 32 };

interface EmailTemplate {
  id: string;
  type: string;
  name: string;
  subject: string;
  bodyMarkdown: string;
  variables: string;
  updatedBy?: string;
  updatedAt: string;
}

const typeLabels: Record<string, { label: string; icon: string }> = {
  REGISTER_VERIFY: { label: '注册验证码', icon: 'RV' },
  PASSWORD_RESET: { label: '密码重置', icon: 'PR' },
  TICKET_NOTIFY: { label: '工单通知', icon: 'TN' },
  SERVER_EXPIRY: { label: '服务器到期提醒', icon: 'SE' },
  BALANCE_CHANGE: { label: '余额变动通知', icon: 'BC' },
  ORDER_CONFIRM: { label: '订单确认', icon: 'OC' },
  SECURITY_ALERT: { label: '安全告警', icon: 'SA' },
};

export default function EmailTemplatesPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [form, setForm] = useState({ subject: '', bodyMarkdown: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<EmailTemplate | null>(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/email-templates');
      const json = await res.json();
      if (json.success) setTemplates(json.data.templates ?? []);
    } catch {
      toast.error('模板加载失败');
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (t: EmailTemplate) => {
    setEditing(t);
    setForm({ subject: t.subject, bodyMarkdown: t.bodyMarkdown });
    setErr('');
    setPreview(null);
  };

  const save = async () => {
    if (!editing) return;
    if (!form.subject.trim() || !form.bodyMarkdown.trim()) {
      setErr('主题和正文不能为空');
      return;
    }

    setSaving(true);
    setErr('');
    try {
      const res = await apiFetch(`/api/admin/email-templates/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) {
        setErr(json.error ?? '保存失败');
      } else {
        toast.success('模板已保存');
        setEditing(null);
        load();
      }
    } catch {
      setErr('网络错误，请稍后重试');
      toast.error('保存失败');
    }
    setSaving(false);
  };

  const reset = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      await apiFetch(`/api/admin/email-templates/${resetTarget.id}/reset`, { method: 'POST' });
      toast.success('模板已恢复默认');
      setResetTarget(null);
      load();
    } catch {
      toast.error('恢复失败');
    } finally {
      setResetting(false);
    }
  };

  const showPreview = async () => {
    if (!editing) return;

    const vars: Record<string, string> = {};
    try {
      const varNames: string[] = JSON.parse(editing.variables);
      varNames.forEach((v) => {
        vars[v] = `[${v}]`;
      });
    } catch {
      /* ignore */
    }

    try {
      const res = await apiFetch(`/api/admin/email-templates/${editing.id}/preview`, {
        method: 'POST',
        body: JSON.stringify({ variables: vars }),
      });
      const json = await res.json();
      if (json.success) {
        setPreview(json.data);
      } else {
        toast.error('预览失败');
      }
    } catch {
      toast.error('预览失败');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="邮件模板管理" subtitle="自定义系统邮件模板，支持 Markdown 与变量替换" />

      {loading ? (
        <SkeletonTable rows={7} columns={3} />
      ) : templates.length === 0 ? (
        <Panel>
          <EmptyState title="暂无邮件模板" />
        </Panel>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
          {templates.map((t, i) => {
            const typeInfo = typeLabels[t.type] || { label: t.name, icon: 'EM' };
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...easeOut, delay: Math.min(i * 0.03, 0.2) }}
              >
                <Panel>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-4 bg-surface-100 px-1 text-[10px] font-semibold text-surface-500">
                          {typeInfo.icon}
                        </span>
                        <span className="text-sm font-medium text-surface-600">{typeInfo.label}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setResetTarget(t)}
                          className="rounded-6 px-2 py-1 text-[11px] font-medium text-surface-400 transition-colors hover:bg-surface-50"
                        >
                          恢复默认
                        </button>
                        <button
                          onClick={() => startEdit(t)}
                          className="rounded-6 px-2 py-1 text-[11px] font-medium text-brand-600 transition-colors hover:bg-semantic-info-light"
                        >
                          编辑
                        </button>
                      </div>
                    </div>

                    <div className="text-sm text-surface-500">
                      <span className="text-[11px] text-surface-400">主题：</span>
                      {t.subject}
                    </div>

                    <div className="text-[11px] text-surface-400">
                      可用变量：
                      {(() => {
                        try {
                          return (JSON.parse(t.variables) as string[]).map((v) => (
                            <code key={v} className="mx-0.5 rounded bg-surface-50 px-1 py-0.5 font-mono text-brand-600">
                              {'{{'}
                              {v}
                              {'}}'}
                            </code>
                          ));
                        } catch {
                          return '-';
                        }
                      })()}
                    </div>

                    {t.updatedBy && (
                      <div className="text-[11px] text-surface-400">最后修改：{new Date(t.updatedAt).toLocaleString('zh-CN')}</div>
                    )}
                  </div>
                </Panel>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setEditing(null);
            }}
          >
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/30 backdrop-blur-[2px] modal-panel" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -8 }} transition={modalTransition} className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-8 border border-surface-100 bg-white shadow-modal">
            <div className="flex items-center justify-between border-b border-surface-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-surface-700">编辑邮件模板</h2>
                <span className="rounded-4 bg-surface-50 px-2 py-0.5 font-mono text-[11px] text-surface-400">{editing.type}</span>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="text-xl leading-none text-surface-400 transition-colors hover:text-surface-600"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="rounded-8 border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-brand-600">
                可用变量：
                {(() => {
                  try {
                    return (JSON.parse(editing.variables) as string[]).map((v) => (
                      <code key={v} className="mx-0.5 font-mono">
                        {'{{'}
                        {v}
                        {'}}'}
                      </code>
                    ));
                  } catch {
                    return '-';
                  }
                })()}
              </div>

              <div>
                <label className="label">邮件主题</label>
                <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} className="input w-full" />
              </div>

              <div>
                <label className="label">邮件正文（支持 Markdown）</label>
                <textarea
                  rows={12}
                  value={form.bodyMarkdown}
                  onChange={(e) => setForm((f) => ({ ...f, bodyMarkdown: e.target.value }))}
                  className="input w-full resize-none font-mono"
                />
              </div>

              {err && <p className="text-sm text-semantic-danger">{err}</p>}

              {preview && (
                <div className="rounded-8 border border-surface-100 bg-surface-50 p-4">
                  <p className="mb-1 text-[11px] text-surface-400">预览主题：</p>
                  <p className="mb-3 font-medium text-surface-600">{preview.subject}</p>
                  <p className="mb-1 text-[11px] text-surface-400">预览正文：</p>
                  <pre className="whitespace-pre-wrap text-xs text-surface-500">{preview.body}</pre>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-surface-100 px-6 py-4">
              <button
                onClick={showPreview}
                className="h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500"
              >
                预览效果
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(null)}
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
            </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        <ConfirmDialog
          open={!!resetTarget}
          title="恢复默认模板"
          description={resetTarget ? `「${resetTarget.name}」将恢复为默认内容，当前自定义将丢失。` : ''}
          confirmText="恢复默认"
          danger
          loading={resetting}
          onConfirm={reset}
          onCancel={() => setResetTarget(null)}
        />
      </AnimatePresence>
    </div>
  );
}
