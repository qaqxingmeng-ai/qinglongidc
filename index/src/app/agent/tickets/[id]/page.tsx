'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, isApiSuccess, pickApiData, extractApiError } from '@/lib/api-client';

interface TicketDetail {
  id: string;
  ticketNo: string;
  type: string;
  subject: string;
  status: string;
  createdAt: string;
  user?: { name?: string; email?: string } | null;
  order?: { id: string; orderNo: string; status: string; totalPrice: number } | null;
  messages: { id: string; content: string; role: string; sender: string; createdAt: string }[];
}

export default function AgentTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const ticketUserName = ticket?.user?.name || '未知用户';

  const fetchTicket = useCallback(() => {
    apiFetch(`/api/tickets/${params.id}`, { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (isApiSuccess(json)) setTicket(pickApiData<TicketDetail>(json));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  const sendReply = async (newStatus?: string) => {
    if (!reply.trim() && !newStatus) return;
    const load = { content: reply.trim() || undefined, status: newStatus };
    const res = await apiFetch(`/api/tickets/${params.id}`, {
      method: 'POST',
      body: JSON.stringify(load),
    });
    const json = await res.json();
    if (isApiSuccess(json)) {
      setReply('');
      fetchTicket();
    } else {
      alert(extractApiError(json.error, '回复失败'));
    }
  };

  if (loading) return <div className="text-surface-400 py-20 text-center">加载中...</div>;
  if (!ticket) return <div className="text-surface-400 py-20 text-center">工单不存在</div>;

  const typeMap: Record<string, string> = { PRESALE: '售前', AFTERSALE: '售后', FINANCE: '财务' };

  return (
    <div>
      <h1 className="section-title mb-1">{ticket.subject}</h1>
      <div className="flex items-center gap-3 mb-6">
        <span className="text-xs text-surface-400 font-mono">{ticket.ticketNo}</span>
        <span className="badge-blue text-[10px]">{typeMap[ticket.type] || ticket.type}</span>
        <span className="text-xs text-surface-400">用户: {ticketUserName}</span>
        <span className="text-xs text-surface-400">{new Date(ticket.createdAt).toLocaleString()}</span>
      </div>

      {ticket.order && (
        <div className="card mb-6 bg-surface-50 border border-surface-100 shadow-none">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-surface-400 mb-1">关联订单</p>
              <p className="text-sm font-medium text-surface-600">{ticket.order.orderNo}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-surface-400 mb-1">订单状态</p>
              <p className="text-sm text-surface-500">{ticket.order.status}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-surface-400 mb-1">订单金额</p>
              <p className="text-sm text-surface-500">{ticket.order.totalPrice} 元</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {ticket.messages.map((msg) => {
          const isStaff = msg.role === 'ADMIN' || msg.role === 'AGENT';

          return (
            <div key={msg.id} className={`p-4 rounded-8 ${isStaff ? 'bg-semantic-info-light ml-8' : 'bg-surface-50 mr-8'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-surface-500">
                  {msg.role === 'ADMIN' ? '销售总管' : msg.role === 'AGENT' ? '客服身份' : ticketUserName}
                </span>
                <span className="text-xs text-surface-400">{new Date(msg.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-sm text-surface-500 whitespace-pre-wrap">{msg.content}</p>
            </div>
          );
        })}
      </div>

      {ticket.status !== 'CLOSED' && (
        <div className="flex flex-col gap-2">
          <textarea
            className="input w-full min-h-[80px]"
            placeholder="输入工作交接或回复..."
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-surface-400">更新状态为:</span>
              <button onClick={() => sendReply('RESOLVED')} className="px-3 py-1 rounded bg-semantic-success-light text-semantic-success hover:bg-green-100 text-xs">已回复</button>
              <button onClick={() => sendReply('CLOSED')} className="px-3 py-1 rounded bg-surface-100 text-surface-500 hover:bg-surface-200 text-xs">关闭工单</button>
            </div>
            <button onClick={() => sendReply()} className="btn-primary btn-sm">发送回复</button>
          </div>
        </div>
      )}
    </div>
  );
}