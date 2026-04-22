'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { apiFetch, extractApiError } from '@/lib/api-client';

interface TimelineNode {
  key: string;
  label: string;
  done: boolean;
  time?: string | null;
}

interface DetailServer {
  id: string;
  ip?: string;
  status: string;
  userNote?: string;
  startDate?: string;
  expireDate?: string;
  createdAt: string;
  product: { name: string; region: string };
}

interface DetailOrder {
  id: string;
  orderNo: string;
  status: string;
  totalPrice: number;
  createdAt: string;
  updatedAt: string;
  items: { id: string; quantity: number; period: number; price: number; product: { name: string; region: string } }[];
}

interface OrderReview {
  id: string;
  rating: number;
  content?: string;
  createdAt: string;
}

const STATUS_TEXT: Record<string, string> = {
  PENDING: '待处理',
  PAID: '已支付',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  REFUNDED: '已退款',
};

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange?.(s)}
          className={`text-2xl leading-none transition-colors ${s <= value ? 'text-amber-400' : 'text-surface-300'} ${onChange ? 'cursor-pointer hover:text-amber-300' : 'cursor-default'}`}
        >
          {'\u2605'}
        </button>
      ))}
    </div>
  );
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<DetailOrder | null>(null);
  const [timeline, setTimeline] = useState<TimelineNode[]>([]);
  const [servers, setServers] = useState<DetailServer[]>([]);
  const [error, setError] = useState('');

  const [review, setReview] = useState<OrderReview | null | undefined>(undefined);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/dashboard/orders/${id}`, { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) {
          setError(extractApiError(json.error, '订单加载失败'));
          setLoading(false);
          return;
        }
        const data = json.data || {};
        setOrder(data.order || null);
        setTimeline(Array.isArray(data.timeline) ? data.timeline : []);
        setServers(Array.isArray(data.servers) ? data.servers : []);
        setLoading(false);
      })
      .catch(() => {
        setError('订单加载失败');
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!order || order.status !== 'COMPLETED') return;
    setReviewLoading(true);
    apiFetch(`/api/dashboard/orders/${id}/review`, { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setReview(json.data?.review ?? null);
        }
        setReviewLoading(false);
      })
      .catch(() => setReviewLoading(false));
  }, [order, id]);

  const canReview = order?.status === 'COMPLETED' &&
    order.updatedAt &&
    Date.now() - new Date(order.updatedAt).getTime() < 30 * 24 * 60 * 60 * 1000;

  const handleSubmitReview = async () => {
    if (rating < 1 || rating > 5) return;
    if (Array.from(content).length > 200) {
      setSubmitError('评价内容不超过 200 字');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const r = await apiFetch(`/api/dashboard/orders/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, content }),
      });
      const json = await r.json();
      if (!json.success) {
        setSubmitError(extractApiError(json.error, '提交失败'));
      } else {
        setReview(json.data?.review ?? null);
      }
    } catch {
      setSubmitError('提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center py-20 text-surface-400">加载中...</div>;
  if (error || !order) return <div className="text-center py-20 text-semantic-danger">{error || '订单不存在'}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">订单详情</h1>
          <p className="text-xs text-surface-400 mt-1">{order.orderNo}</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/api/dashboard/orders/${order.id}/receipt`} className="btn-secondary btn-sm">下载收据</a>
          <Link href="/dashboard/orders" className="btn-secondary btn-sm">返回列表</Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card md:col-span-2">
          <h2 className="font-semibold text-surface-600 mb-3">订单商品</h2>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="rounded-lg border border-surface-100 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-surface-500">{item.product.name}</p>
                    <p className="text-xs text-surface-400 mt-0.5">{item.product.region} · {item.quantity} 台 · {item.period} 月</p>
                  </div>
                  <p className="font-semibold text-surface-500">¥{item.price}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-surface-600 mb-3">订单信息</h2>
          <div className="space-y-2 text-sm text-surface-500">
            <p>状态: {STATUS_TEXT[order.status] || order.status}</p>
            <p>创建时间: {new Date(order.createdAt).toLocaleString()}</p>
            <p className="font-semibold text-surface-600">总金额: ¥{order.totalPrice}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-surface-600 mb-3">订单时间线</h2>
        <div className="grid gap-2 md:grid-cols-4">
          {timeline.map((node) => (
            <div key={node.key} className={`rounded-lg border px-3 py-2 ${node.done ? 'border-emerald-200 bg-semantic-success-light/40' : 'border-surface-100 bg-surface-50/40'}`}>
              <p className="text-sm font-medium text-surface-500">{node.label}</p>
              <p className={`text-xs mt-1 ${node.done ? 'text-semantic-success-dark' : 'text-surface-400'}`}>
                {node.time ? new Date(node.time).toLocaleString() : '待完成'}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-surface-600 mb-3">关联实例</h2>
        {servers.length === 0 ? (
          <p className="text-sm text-surface-400">暂无关联实例</p>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => (
              <div key={server.id} className="rounded-lg border border-surface-100 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-surface-500">{server.product.name} · {server.product.region}</p>
                    <Link href={`/dashboard/servers/${server.id}`} className="text-xs text-brand-500 hover:underline mt-0.5 inline-block">实例ID: {server.id}</Link>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-surface-400">状态: {server.status}</p>
                    <p className="text-xs text-surface-400">IP: {server.ip || '-'}</p>
                  </div>
                </div>
                {(server.startDate || server.expireDate || server.userNote) && (
                  <div className="mt-2 pt-2 border-t border-surface-100 text-xs text-surface-400 space-y-1">
                    {server.startDate && <p>开通时间: {new Date(server.startDate).toLocaleString()}</p>}
                    {server.expireDate && <p>到期时间: {new Date(server.expireDate).toLocaleString()}</p>}
                    {server.userNote && <p>备注: {server.userNote}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {order.status === 'COMPLETED' && (
        <div className="card">
          <h2 className="font-semibold text-surface-600 mb-3">订单评价</h2>
          {reviewLoading ? (
            <p className="text-sm text-surface-400">加载中...</p>
          ) : review ? (
            <div className="space-y-2">
              <StarRating value={review.rating} />
              {review.content && <p className="text-sm text-surface-500">{review.content}</p>}
              <p className="text-xs text-surface-400">评价于 {new Date(review.createdAt).toLocaleString()}</p>
            </div>
          ) : canReview ? (
            <div className="space-y-3">
              <StarRating value={rating} onChange={setRating} />
              <textarea
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-surface-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
                rows={3}
                maxLength={200}
                placeholder="可选：写下您的评价（最多 200 字）"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-surface-400">{Array.from(content).length}/200</span>
                <button
                  type="button"
                  onClick={handleSubmitReview}
                  disabled={submitting}
                  className="btn-primary btn-sm"
                >
                  {submitting ? '提交中...' : '提交评价'}
                </button>
              </div>
              {submitError && <p className="text-xs text-semantic-danger">{submitError}</p>}
            </div>
          ) : (
            <p className="text-sm text-surface-400">订单完成后 30 天内可评价，已超出评价期限。</p>
          )}
        </div>
      )}
    </div>
  );
}
