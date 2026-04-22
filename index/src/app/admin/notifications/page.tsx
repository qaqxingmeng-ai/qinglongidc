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

type Tab = 'broadcast' | 'history';
type TargetMode = 'all' | 'role' | 'users';
type Channel = 'site' | 'email' | 'sms';

interface UserLite {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
}

interface HistoryItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  userName?: string;
  userEmail?: string;
  isRead?: boolean;
}

const inputCls = 'w-full h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] text-surface-600 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';
const selectCls = inputCls;
const textareaCls = 'w-full resize-none rounded-6 border border-surface-200 bg-white px-3 py-2 text-[12px] text-surface-600 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-surface-500">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-surface-400">{hint}</p>}
    </div>
  );
}

export default function NotificationsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('broadcast');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetMode, setTargetMode] = useState<TargetMode>('all');
  const [targetRole, setTargetRole] = useState<'USER' | 'AGENT' | 'ADMIN'>('USER');
  const [selectedUsers, setSelectedUsers] = useState<UserLite[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<UserLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [channels, setChannels] = useState<Record<Channel, boolean>>({ site: true, email: false, sms: false });
  const [smsTemplateId, setSmsTemplateId] = useState('');
  const [smsContent, setSmsContent] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const pageSize = 20;

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await apiFetch(`/api/admin/notifications/history?page=${historyPage}&pageSize=${pageSize}`);
      const json = await res.json();
      if (json.success) {
        setHistory(json.data.items ?? []);
        setHistoryTotal(json.data.total ?? 0);
      }
    } catch {
      toast.error('加载历史失败');
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage, toast]);

  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab, loadHistory]);

  useEffect(() => {
    if (targetMode !== 'users' || userSearch.trim().length < 1) {
      setUserResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiFetch(`/api/admin/notifications/user-search?q=${encodeURIComponent(userSearch.trim())}`);
        const json = await res.json();
        if (json.success) setUserResults(json.data.users ?? []);
      } catch {
        // silent
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [userSearch, targetMode]);

  const addUser = (u: UserLite) => {
    if (selectedUsers.find((x) => x.id === u.id)) return;
    setSelectedUsers((prev) => [...prev, u]);
    setUserSearch('');
    setUserResults([]);
  };
  const removeUser = (id: string) => setSelectedUsers((prev) => prev.filter((x) => x.id !== id));

  const toggleChannel = (ch: Channel) => setChannels((prev) => ({ ...prev, [ch]: !prev[ch] }));

  const channelSummary = () => {
    const names: string[] = [];
    if (channels.site) names.push('站内信');
    if (channels.email) names.push('邮件');
    if (channels.sms) names.push('短信');
    return names.join(' + ') || '（未选）';
  };

  const targetSummary = () => {
    if (targetMode === 'all') return '全部用户';
    if (targetMode === 'role') return `角色：${targetRole === 'USER' ? '普通用户' : targetRole === 'AGENT' ? '代理' : '管理员'}`;
    return `指定 ${selectedUsers.length} 位用户`;
  };

  const canSubmit = title.trim().length > 0
    && (channels.site || channels.email || channels.sms)
    && (targetMode !== 'users' || selectedUsers.length > 0)
    && (!channels.sms || (smsTemplateId.trim().length > 0 || smsContent.trim().length > 0));

  const doSend = async () => {
    setSending(true);
    const body: Record<string, unknown> = {
      title: title.trim(),
      content: content.trim(),
      channels: (Object.keys(channels) as Channel[]).filter((c) => channels[c]),
    };
    if (targetMode === 'all') body.target = 'all';
    else if (targetMode === 'role') body.target = `role:${targetRole}`;
    else body.userIds = selectedUsers.map((u) => u.id);
    if (channels.sms) {
      if (smsTemplateId.trim()) body.smsTemplateId = smsTemplateId.trim();
      if (smsContent.trim()) body.smsContent = smsContent.trim();
    }
    try {
      const res = await apiFetch('/api/admin/notifications/announce', { method: 'POST', body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.success) { toast.error(json.error ?? '发送失败'); return; }
      const d = json.data || {};
      const parts: string[] = [];
      if (typeof d.siteSent === 'number') parts.push(`站内信 ${d.siteSent}`);
      if (typeof d.emailSent === 'number') parts.push(`邮件 ${d.emailSent}${d.emailFailed ? `（失败 ${d.emailFailed}）` : ''}`);
      if (typeof d.smsSent === 'number') parts.push(`短信 ${d.smsSent}${d.smsFailed ? `（失败 ${d.smsFailed}）` : ''}`);
      toast.success(`发送完成：${parts.join('，') || '无'}`);
      setConfirmOpen(false);
      setTitle('');
      setContent('');
    } catch {
      toast.error('网络错误');
    } finally {
      setSending(false);
    }
  };

  const totalPages = Math.ceil(historyTotal / pageSize) || 1;

  return (
    <div className="space-y-5">
      <PageHeader title="通知中心" subtitle="向用户发送系统公告、邮件或短信" />

      <FilterBar>
        <TabChip active={tab === 'broadcast'} onClick={() => setTab('broadcast')}>发送广播</TabChip>
        <TabChip active={tab === 'history'} onClick={() => setTab('history')}>发送历史</TabChip>
      </FilterBar>

      {tab === 'broadcast' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <div className="space-y-4">
              <FormField label="标题 *">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="公告标题（站内信 / 邮件主题）" className={inputCls} maxLength={120} />
              </FormField>
              <FormField label="正文" hint="Markdown / 纯文本。短信若未指定模板，将使用此正文作为短信内容。">
                <textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="公告内容..." className={textareaCls} />
              </FormField>

              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-surface-500">发送目标</label>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { v: 'all' as TargetMode, l: '全部用户' },
                    { v: 'role' as TargetMode, l: '按角色' },
                    { v: 'users' as TargetMode, l: '指定用户' },
                  ]).map((opt) => (
                    <button key={opt.v} type="button" onClick={() => setTargetMode(opt.v)} className={`h-7 rounded-6 border px-3 text-[12px] font-medium transition-colors ${targetMode === opt.v ? 'border-brand-500 bg-brand-500 text-white' : 'border-surface-200 bg-white text-surface-500 hover:border-brand-300'}`}>
                      {opt.l}
                    </button>
                  ))}
                </div>

                {targetMode === 'role' && (
                  <select value={targetRole} onChange={(e) => setTargetRole(e.target.value as typeof targetRole)} className={`${selectCls} mt-2`}>
                    <option value="USER">普通用户</option>
                    <option value="AGENT">代理</option>
                    <option value="ADMIN">管理员</option>
                  </select>
                )}

                {targetMode === 'users' && (
                  <div className="mt-2 space-y-2">
                    <div className="relative">
                      <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="搜索姓名 / 邮箱 / 手机号..." className={inputCls} />
                      {userSearch.trim() && (userResults.length > 0 || searching) && (
                        <div className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-8 border border-surface-200 bg-white shadow-card z-10">
                          {searching && <p className="px-3 py-2 text-[11px] text-surface-400">搜索中...</p>}
                          {userResults.map((u) => (
                            <button key={u.id} type="button" onClick={() => addUser(u)} className="block w-full text-left px-3 py-2 text-[12px] text-surface-600 transition-colors hover:bg-surface-50">
                              <span className="font-medium">{u.name}</span>
                              <span className="ml-2 text-surface-400">{u.email}</span>
                              {u.phone && <span className="ml-2 text-surface-300">{u.phone}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedUsers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedUsers.map((u) => (
                          <span key={u.id} className="inline-flex items-center gap-1.5 rounded-4 bg-brand-50 px-2 py-0.5 text-[11px] text-brand-600">
                            {u.name}
                            <button type="button" onClick={() => removeUser(u.id)} className="text-brand-400 hover:text-brand-600">
                              <svg className="h-3 w-3" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M2 2l6 6M8 2l-6 6" /></svg>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-surface-500">发送渠道</label>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { k: 'site' as Channel, l: '站内信' },
                    { k: 'email' as Channel, l: '邮件' },
                    { k: 'sms' as Channel, l: '短信' },
                  ]).map((opt) => (
                    <button key={opt.k} type="button" onClick={() => toggleChannel(opt.k)} className={`h-7 rounded-6 border px-3 text-[12px] font-medium transition-colors ${channels[opt.k] ? 'border-brand-500 bg-brand-500 text-white' : 'border-surface-200 bg-white text-surface-500 hover:border-brand-300'}`}>
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>

              {channels.sms && (
                <div className="rounded-8 border border-surface-200 bg-surface-50 p-3 space-y-3">
                  <p className="text-[11px] font-medium text-surface-500">短信配置（二选一）</p>
                  <FormField label="Submail 模板项目 ID" hint="留空则使用下方内容直发">
                    <input value={smsTemplateId} onChange={(e) => setSmsTemplateId(e.target.value)} placeholder="如：abcdef" className={inputCls} />
                  </FormField>
                  <FormField label="直发短信内容" hint="签名将自动附加到内容前（若已配置）">
                    <textarea rows={3} value={smsContent} onChange={(e) => setSmsContent(e.target.value)} placeholder="短信正文..." className={textareaCls} />
                  </FormField>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="发送预览">
            <div className="space-y-3 text-[12px]">
              <div>
                <p className="text-[11px] text-surface-400">目标</p>
                <p className="mt-0.5 font-medium text-surface-600">{targetSummary()}</p>
              </div>
              <div>
                <p className="text-[11px] text-surface-400">渠道</p>
                <p className="mt-0.5 font-medium text-surface-600">{channelSummary()}</p>
              </div>
              <div>
                <p className="text-[11px] text-surface-400">标题</p>
                <p className="mt-0.5 truncate font-medium text-surface-600">{title || '（未填写）'}</p>
              </div>
              <div className="pt-2 border-t border-surface-100">
                <button type="button" onClick={() => setConfirmOpen(true)} disabled={!canSubmit} className="w-full h-9 rounded-6 bg-brand-500 text-[13px] font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">
                  发送
                </button>
                {!canSubmit && (
                  <p className="mt-2 text-[11px] text-surface-400">
                    {!title.trim() ? '请填写标题' : !(channels.site || channels.email || channels.sms) ? '请至少选择一个渠道' : targetMode === 'users' && selectedUsers.length === 0 ? '请选择目标用户' : channels.sms && !smsTemplateId.trim() && !smsContent.trim() ? '短信需填写模板 ID 或内容' : ''}
                  </p>
                )}
              </div>
            </div>
          </Panel>
        </div>
      )}

      {tab === 'history' && (
        <>
          {historyLoading ? (
            <SkeletonTable rows={6} columns={4} />
          ) : !history.length ? (
            <Panel><EmptyState title="暂无发送记录" description="发送广播后将显示在此处" /></Panel>
          ) : (
            <Panel noPadding>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
                      <th className="py-2.5 pl-5 pr-4 font-medium">标题</th>
                      <th className="py-2.5 pr-4 font-medium">接收人</th>
                      <th className="py-2.5 pr-4 font-medium">时间</th>
                      <th className="py-2.5 pr-5 font-medium">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => (
                      <motion.tr key={h.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }} className="border-b border-surface-50 transition-colors last:border-b-0 hover:bg-surface-50/60">
                        <td className="py-3 pl-5 pr-4">
                          <p className="truncate max-w-[260px] font-medium text-surface-600">{h.title}</p>
                          <p className="mt-0.5 truncate max-w-[260px] text-[11px] text-surface-400">{h.content}</p>
                        </td>
                        <td className="py-3 pr-4 text-surface-500">
                          {h.userName || '-'}
                          {h.userEmail && <span className="ml-2 text-[11px] text-surface-400">{h.userEmail}</span>}
                        </td>
                        <td className="py-3 pr-4 text-[11px] text-surface-400">{new Date(h.createdAt).toLocaleString()}</td>
                        <td className="py-3 pr-5">
                          <span className={`inline-flex items-center rounded-4 px-2 py-0.5 text-[11px] font-medium ${h.isRead ? 'bg-semantic-success-light text-semantic-success-dark' : 'bg-surface-100 text-surface-400'}`}>
                            {h.isRead ? '已读' : '未读'}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          <StickyFooter show={!historyLoading && history.length > 0 && totalPages > 1}>
            <p className="text-[12px] text-surface-400">
              共 <span className="font-medium tabular-nums text-surface-600">{historyTotal}</span> 条 · 第 <span className="tabular-nums">{historyPage}</span> / <span className="tabular-nums">{totalPages}</span> 页
            </p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setHistoryPage(Math.max(1, historyPage - 1))} disabled={historyPage <= 1} className="flex h-7 w-7 items-center justify-center rounded-6 text-surface-400 transition-colors hover:bg-surface-50 hover:text-surface-600 disabled:cursor-not-allowed disabled:opacity-30">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button type="button" onClick={() => setHistoryPage(Math.min(totalPages, historyPage + 1))} disabled={historyPage >= totalPages} className="flex h-7 w-7 items-center justify-center rounded-6 text-surface-400 transition-colors hover:bg-surface-50 hover:text-surface-600 disabled:cursor-not-allowed disabled:opacity-30">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </StickyFooter>
        </>
      )}

      <AnimatePresence>
        <ConfirmDialog
          open={confirmOpen}
          title="确认发送通知"
          description={`目标：${targetSummary()}\n渠道：${channelSummary()}\n标题：${title}`}
          confirmText="立即发送"
          loading={sending}
          onConfirm={doSend}
          onCancel={() => setConfirmOpen(false)}
        />
      </AnimatePresence>
    </div>
  );
}
