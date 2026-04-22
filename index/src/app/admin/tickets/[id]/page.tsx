'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useFrameParams } from '@/components/admin/PageKeepAlive';
import { apiFetch, isApiSuccess, pickApiData } from '@/lib/api-client';

interface TicketDetail {
  id: string;
  ticketNo: string;
  type: string;
  subject: string;
  status: string;
  createdAt: string;
  user?: { name?: string; email?: string } | null;
  agent?: { name: string } | null;
  order?: { id: string; orderNo: string; status: string; totalPrice: number } | null;
  messages: { id: string; content: string; role: string; sender: string; createdAt: string }[];
}

interface AIClassification {
  id: string;
  ticketId: string;
  suggestedType: string;
  suggestedCategory: string;
  suggestedPriority: string;
  reason: string;
  accepted?: boolean | null;
  finalType?: string | null;
  finalCategory?: string | null;
  finalPriority?: string | null;
}

const STATUS_FLOW = [
  { value: 'OPEN', label: '待回复' },
  { value: 'PROCESSING', label: '处理中' },
  { value: 'RESOLVED', label: '已解决' },
  { value: 'CLOSED', label: '已关闭' },
] as const;

const STATUS_BADGE: Record<string, string> = {
  OPEN: 'bg-amber-50 text-amber-700 border-amber-200',
  PROCESSING: 'bg-blue-50 text-blue-700 border-blue-200',
  RESOLVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CLOSED: 'bg-surface-50 text-surface-500 border-surface-200',
};

const PRIORITY_STYLE: Record<string, string> = {
  URGENT: 'bg-red-50 text-red-700 border-red-200',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
  MEDIUM: 'bg-blue-50 text-blue-700 border-blue-200',
  LOW: 'bg-surface-50 text-surface-500 border-surface-200',
};

const ROLE_LABEL: Record<string, { label: string; color: string }> = {
  ADMIN: { label: '管理员', color: 'bg-brand-50 text-brand-600' },
  AGENT: { label: '客服', color: 'bg-purple-50 text-purple-600' },
  USER: { label: '用户', color: 'bg-surface-100 text-surface-600' },
};

export default function AdminTicketDetailPage() {
  const params = useFrameParams<{ id: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState('OPEN');
  const [submitting, setSubmitting] = useState(false);

  const [aiSuggestion, setAiSuggestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestionSent, setAiSuggestionSent] = useState('');
  const [classification, setClassification] = useState<AIClassification | null>(null);
  const [clsAccepting, setClsAccepting] = useState(false);

  const ticketUserName = ticket?.user?.name || '未知用户';

  const fetchTicket = useCallback(() => {
    apiFetch(`/api/tickets/${params.id}`, { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (isApiSuccess(json)) {
          const data = pickApiData<TicketDetail>(json);
          setTicket(data);
          setStatus(data.status);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  const fetchClassification = useCallback(() => {
    apiFetch(`/api/admin/tickets/${params.id}/classification`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.classification) {
          setClassification(json.classification);
        } else {
          setClassification(null);
        }
      })
      .catch(() => {});
  }, [params.id]);

  useEffect(() => {
    fetchTicket();
    fetchClassification();
  }, [fetchClassification, fetchTicket]);

  const acceptClassification = async () => {
    if (!classification) return;
    setClsAccepting(true);
    try {
      const res = await apiFetch(`/api/admin/tickets/${params.id}/classification/accept`, {
        method: 'POST',
        body: JSON.stringify({ acceptAll: true }),
      });
      const json = await res.json();
      if (json.success) {
        fetchClassification();
        fetchTicket();
      }
    } finally {
      setClsAccepting(false);
    }
  };

  const getAiSuggestion = async () => {
    if (!ticket) return;
    setAiLoading(true);
    setAiSuggestion('');
    try {
      const res = await apiFetch('/api/admin/ai/ticket-suggest', {
        method: 'POST',
        body: JSON.stringify({ ticketId: ticket.id }),
      });
      const json = await res.json();
      if (json.success) {
        setAiSuggestion(json.suggestion || '');
        setAiSuggestionSent(json.suggestion || '');
      }
    } finally {
      setAiLoading(false);
    }
  };

  const sendAiFeedback = async (action: 'adopted' | 'modified' | 'ignored') => {
    if (!ticket || !aiSuggestionSent) return;
    apiFetch('/api/admin/ai/ticket-feedback', {
      method: 'POST',
      body: JSON.stringify({ ticketId: ticket.id, suggestion: aiSuggestionSent, action }),
    }).catch(() => {});
  };

  const adoptSuggestion = () => {
    setReply(aiSuggestion);
    setAiSuggestion('');
    sendAiFeedback('adopted');
  };

  const dismissSuggestion = () => {
    setAiSuggestion('');
    sendAiFeedback('ignored');
  };

  const submit = async () => {
    const payload: { content?: string; status?: string } = {};
    if (reply.trim()) payload.content = reply.trim();
    if (status !== ticket?.status) payload.status = status;
    if (!payload.content && !payload.status) return;

    if (reply.trim() && aiSuggestionSent && reply.trim() !== aiSuggestionSent) {
      sendAiFeedback('modified');
    }

    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/tickets/${params.id}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setReply('');
        setAiSuggestionSent('');
        const data = pickApiData<TicketDetail>(json);
        setTicket(data);
        setStatus(data.status);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const currentStatusIdx = STATUS_FLOW.findIndex((s) => s.value === ticket?.status);

  if (loading) {
    return (
      <div className="admin-page">
        <div className="space-y-4">
          <div className="skeleton h-8 w-64" />
          <div className="skeleton h-4 w-48" />
          <div className="admin-panel">
            <div className="admin-panel-body space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="skeleton h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-24" />
                    <div className="skeleton h-16 w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="admin-page">
        <div className="empty-state py-32">
          <svg className="h-12 w-12 text-surface-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <p className="text-surface-400 text-sm">工单不存在或已被删除</p>
          <Link href="/admin/tickets" className="mt-3 inline-block text-brand-500 text-sm hover:underline">返回工单列表</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      {/* 顶部面包屑 + 操作 */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-surface-400 mb-1.5">
            <Link href="/admin/tickets" className="hover:text-brand-500 transition-colors">工单列表</Link>
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <span className="font-mono">{ticket.ticketNo}</span>
          </div>
          <h1 className="page-title truncate">{ticket.subject}</h1>
        </div>
        <Link href="/admin/tickets" className="btn-secondary btn-sm shrink-0">
          <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          返回列表
        </Link>
      </div>

      {/* 状态流转条 */}
      <div className="admin-panel mb-4">
        <div className="admin-panel-body py-3">
          <div className="flex items-center gap-1">
            {STATUS_FLOW.map((s, idx) => {
              const isCurrent = s.value === ticket.status;
              const isPast = idx < currentStatusIdx;
              return (
                <div key={s.value} className="flex items-center">
                  {idx > 0 && (
                    <div className={`h-0.5 w-8 mx-0.5 rounded-full transition-colors ${isPast ? 'bg-brand-500' : 'bg-surface-200'}`} />
                  )}
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isCurrent
                      ? 'bg-brand-500 text-white shadow-sm'
                      : isPast
                        ? 'bg-brand-50 text-brand-600'
                        : 'bg-surface-50 text-surface-400'
                  }`}>
                    <span>{s.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 元信息卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="admin-panel">
          <div className="admin-panel-body py-3">
            <p className="text-[11px] text-surface-400 mb-0.5">工单编号</p>
            <p className="text-sm font-mono font-medium text-surface-600">{ticket.ticketNo}</p>
          </div>
        </div>
        <div className="admin-panel">
          <div className="admin-panel-body py-3">
            <p className="text-[11px] text-surface-400 mb-0.5">提交用户</p>
            <p className="text-sm font-medium text-surface-600">{ticketUserName}</p>
          </div>
        </div>
        <div className="admin-panel">
          <div className="admin-panel-body py-3">
            <p className="text-[11px] text-surface-400 mb-0.5">工单类型</p>
            <p className="text-sm font-medium text-surface-600">{ticket.type}</p>
          </div>
        </div>
        <div className="admin-panel">
          <div className="admin-panel-body py-3">
            <p className="text-[11px] text-surface-400 mb-0.5">创建时间</p>
            <p className="text-sm text-surface-600">{new Date(ticket.createdAt).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* AI 分类建议 */}
      {classification && !classification.accepted && (
        <div className="admin-panel mb-4 border-amber-200 bg-amber-50/40">
          <div className="admin-panel-header border-amber-100">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
              <span className="admin-panel-title text-amber-700">AI 自动分类建议</span>
            </div>
            <button
              onClick={acceptClassification}
              disabled={clsAccepting}
              className="px-3 py-1 rounded-md text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              {clsAccepting ? '应用中...' : '一键采用'}
            </button>
          </div>
          <div className="admin-panel-body">
            <div className="flex flex-wrap gap-2">
              {[
                { label: '类型', value: classification.suggestedType },
                { label: '分类', value: classification.suggestedCategory },
                { label: '优先级', value: classification.suggestedPriority, priority: true },
              ].map((item) => (
                <span key={item.label} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border ${item.priority ? (PRIORITY_STYLE[item.value] || PRIORITY_STYLE.MEDIUM) : 'bg-white border-surface-200 text-surface-600'}`}>
                  <span className="text-surface-400">{item.label}</span>
                  <span className="font-medium">{item.value}</span>
                </span>
              ))}
            </div>
            {classification.reason && (
              <p className="mt-2 text-xs text-surface-400">理由：{classification.reason}</p>
            )}
          </div>
        </div>
      )}
      {classification?.accepted && (
        <div className="admin-panel mb-4 border-emerald-200 bg-emerald-50/30">
          <div className="admin-panel-body py-2.5 flex items-center gap-2 text-xs">
            <svg className="h-4 w-4 text-semantic-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span className="text-semantic-success font-medium">AI 分类已采用</span>
            <span className="text-surface-400">
              类型 {classification.finalType} / 分类 {classification.finalCategory} / 优先级 {classification.finalPriority}
            </span>
          </div>
        </div>
      )}

      {/* 关联订单 */}
      {ticket.order && (
        <div className="admin-panel mb-4">
          <div className="admin-panel-header">
            <span className="admin-panel-title">关联订单</span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_BADGE[ticket.order.status] || 'bg-surface-50 text-surface-500 border-surface-200'}`}>
              {ticket.order.status}
            </span>
          </div>
          <div className="admin-panel-body">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[11px] text-surface-400 mb-0.5">订单号</p>
                <p className="text-sm font-mono font-medium text-surface-600">{ticket.order.orderNo}</p>
              </div>
              <div>
                <p className="text-[11px] text-surface-400 mb-0.5">订单状态</p>
                <p className="text-sm text-surface-600">{ticket.order.status}</p>
              </div>
              <div>
                <p className="text-[11px] text-surface-400 mb-0.5">订单金额</p>
                <p className="text-sm font-medium text-surface-600">¥{ticket.order.totalPrice}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 对话流 */}
      <div className="admin-panel mb-4">
        <div className="admin-panel-header">
          <span className="admin-panel-title">对话记录</span>
          <span className="text-xs text-surface-400">{ticket.messages.length} 条消息</span>
        </div>
        <div className="admin-panel-body">
          <div className="space-y-4">
            {ticket.messages.map((message) => {
              const roleInfo = ROLE_LABEL[message.role] || ROLE_LABEL.USER;
              const isAdmin = message.role === 'ADMIN';
              return (
                <div key={message.id} className={`flex gap-3 ${isAdmin ? 'flex-row-reverse' : ''}`}>
                  <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium ${roleInfo.color}`}>
                    {roleInfo.label[0]}
                  </div>
                  <div className={`flex-1 max-w-[80%] ${isAdmin ? 'text-right' : ''}`}>
                    <div className={`flex items-center gap-2 mb-1 ${isAdmin ? 'justify-end' : ''}`}>
                      <span className="text-xs font-medium text-surface-600">{roleInfo.label}</span>
                      <span className="text-[11px] text-surface-400">{new Date(message.createdAt).toLocaleString()}</span>
                    </div>
                    <div className={`inline-block rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      isAdmin
                        ? 'bg-brand-500 text-white rounded-tr-sm'
                        : 'bg-surface-50 text-surface-600 rounded-tl-sm'
                    }`}>
                      {message.content}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI 建议回复 */}
      {aiSuggestion && (
        <div className="admin-panel mb-4 border-purple-200 bg-purple-50/30">
          <div className="admin-panel-header border-purple-100">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              <span className="admin-panel-title text-purple-700">AI 建议回复</span>
            </div>
            <div className="flex gap-2">
              <button onClick={adoptSuggestion} className="px-3 py-1 rounded-md text-xs font-medium bg-purple-500 text-white hover:bg-purple-600 transition-colors">
                采用
              </button>
              <button onClick={dismissSuggestion} className="px-3 py-1 rounded-md text-xs font-medium bg-white border border-purple-200 text-purple-600 hover:bg-purple-50 transition-colors">
                忽略
              </button>
            </div>
          </div>
          <div className="admin-panel-body">
            <p className="text-sm text-surface-600 whitespace-pre-wrap leading-relaxed">{aiSuggestion}</p>
          </div>
        </div>
      )}

      {/* 处理工单 */}
      <div className="admin-panel">
        <div className="admin-panel-header">
          <span className="admin-panel-title">处理工单</span>
          <button
            onClick={getAiSuggestion}
            disabled={aiLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-100 disabled:opacity-50 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            {aiLoading ? 'AI 生成中...' : 'AI 建议回复'}
          </button>
        </div>
        <div className="admin-panel-body">
          <div className="grid md:grid-cols-[180px_1fr] gap-4 mb-4">
            <div>
              <label className="label">工单状态</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_FLOW.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">回复内容</label>
              <textarea
                className="input min-h-[120px] resize-y"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="可只更新状态，也可附带回复内容。"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={submit}
              disabled={submitting || (!reply.trim() && status === ticket.status)}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '提交中...' : '保存处理结果'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
