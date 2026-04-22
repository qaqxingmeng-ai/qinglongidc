'use client';

import { useCallback, useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

interface TicketDetail {
  id: string;
  ticketNo: string;
  type: string;
  subject: string;
  status: string;
  createdAt: string;
  user: { name: string; email: string };
  order?: { id: string; orderNo: string; status: string; totalPrice: number } | null;
  messages: { id: string; content: string; role: string; sender: string; createdAt: string }[];
}

interface TicketRating {
  rating: number;
  feedback?: string;
  createdAt: string;
}

const MESSAGE_ROLE_META: Record<string, { label: string; cardClassName: string }> = {
  ADMIN: { label: '管理员', cardClassName: 'bg-semantic-info-light ml-8' },
  AGENT: { label: '合作商', cardClassName: 'bg-semantic-warning-light ml-8' },
  USER: { label: '我', cardClassName: 'bg-surface-50 mr-8' },
};

function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="focus:outline-none"
        >
          <svg
            className={`w-7 h-7 transition-colors ${n <= (hover || value) ? 'text-yellow-400' : 'text-surface-200'}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </span>
  );
}

function StarDisplay({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          className={`w-5 h-5 ${n <= value ? 'text-yellow-400' : 'text-surface-200'}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');

  const [existingRating, setExistingRating] = useState<TicketRating | null>(null);
  const [ratingForm, setRatingForm] = useState({ rating: 0, feedback: '' });
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingError, setRatingError] = useState('');
  const [ratingDone, setRatingDone] = useState(false);

  const fetchTicket = useCallback(() => {
    apiFetch(`/api/tickets/${params.id}`, { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setTicket(json.data);
          const t = json.data;
          if (t && (t.status === 'CLOSED' || t.status === 'RESOLVED')) {
            apiFetch(`/api/tickets/${params.id}/rating`, { method: 'GET' })
              .then((r2) => r2.json())
              .then((rj) => { if (rj.success && rj.data) setExistingRating(rj.data); })
              .catch(() => {});
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  const sendReply = async () => {
    if (!reply.trim()) return;
    const res = await apiFetch(`/api/tickets/${params.id}`, {
      method: 'POST',
      body: JSON.stringify({ content: reply }),
    });
    const json = await res.json();
    if (json.success) {
      setReply('');
      fetchTicket();
    }
  };

  const reopenTicket = async () => {
    const res = await apiFetch(`/api/tickets/${params.id}`, {
      method: 'POST',
      body: JSON.stringify({ status: 'OPEN' }),
    });
    const json = await res.json();
    if (json.success) fetchTicket();
  };

  const submitRating = async () => {
    if (ratingForm.rating === 0) { setRatingError('请选择星级'); return; }
    setRatingSubmitting(true);
    setRatingError('');
    try {
      const res = await apiFetch(`/api/tickets/${params.id}/rating`, {
        method: 'POST',
        body: JSON.stringify({ rating: ratingForm.rating, feedback: ratingForm.feedback || undefined }),
      });
      const json = await res.json();
      if (json.success) {
        setRatingDone(true);
        setExistingRating({ rating: ratingForm.rating, feedback: ratingForm.feedback, createdAt: new Date().toISOString() });
      } else {
        setRatingError(json.error ?? '提交失败');
      }
    } finally {
      setRatingSubmitting(false);
    }
  };

  if (loading) return <div className="text-surface-400 py-20 text-center">加载中...</div>;
  if (!ticket) return <div className="text-surface-400 py-20 text-center">工单不存在</div>;

  const typeMap: Record<string, string> = { PRESALE: '售前', AFTERSALE: '售后', FINANCE: '财务' };
  const isClosed = ticket.status === 'CLOSED' || ticket.status === 'RESOLVED';

  return (
    <div>
      <h1 className="section-title mb-1">{ticket.subject}</h1>
      <div className="flex items-center gap-3 mb-6">
        <span className="text-xs text-surface-400 font-mono">{ticket.ticketNo}</span>
        <span className="badge-blue text-[10px]">{typeMap[ticket.type] || ticket.type}</span>
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
          const roleMeta = MESSAGE_ROLE_META[msg.role] || {
            label: msg.role,
            cardClassName: 'bg-surface-50 mr-8',
          };

          return (
            <div key={msg.id} className={`p-4 rounded-8 ${roleMeta.cardClassName}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-surface-500">
                  {roleMeta.label}
                </span>
                <span className="text-xs text-surface-400">{new Date(msg.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-sm text-surface-500 whitespace-pre-wrap">{msg.content}</p>
            </div>
          );
        })}
      </div>

      {ticket.status === 'CLOSED' ? (
        <div className="flex justify-center">
          <button onClick={reopenTicket} className="btn-secondary btn-sm">重新开启工单</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <textarea
            className="input flex-1 min-h-[80px]"
            placeholder="输入回复..."
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <button onClick={sendReply} className="btn-primary btn-sm self-end">回复</button>
        </div>
      )}

      {isClosed && (
        <div className="card mt-6">
          <h3 className="text-sm font-semibold text-surface-500 mb-3">服务评价</h3>
          {existingRating ? (
            <div className="space-y-2">
              <StarDisplay value={existingRating.rating} />
              {existingRating.feedback && (
                <p className="text-sm text-surface-500 bg-surface-50 rounded-lg px-3 py-2">{existingRating.feedback}</p>
              )}
              <p className="text-xs text-surface-400">
                已于 {new Date(existingRating.createdAt).toLocaleDateString('zh-CN')} 提交评价
              </p>
            </div>
          ) : ratingDone ? (
            <div className="text-sm text-semantic-success">感谢您的评价！</div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-surface-400">本次服务是否令您满意？</p>
              <StarInput value={ratingForm.rating} onChange={(v) => setRatingForm({ ...ratingForm, rating: v })} />
              <textarea
                className="input min-h-[72px]"
                placeholder="选填：留下您的具体反馈（最多 200 字）"
                maxLength={200}
                value={ratingForm.feedback}
                onChange={(e) => setRatingForm({ ...ratingForm, feedback: e.target.value })}
              />
              {ratingError && <p className="text-xs text-semantic-danger">{ratingError}</p>}
              <div className="flex justify-end">
                <button
                  disabled={ratingSubmitting || ratingForm.rating === 0}
                  onClick={submitRating}
                  className="btn-primary btn-sm disabled:opacity-50"
                >
                  {ratingSubmitting ? '提交中...' : '提交评价'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
