'use client';

import { useEffect, useState } from 'react';
import { apiFetch, extractApiError } from '@/lib/api-client';
import { PageHeader } from '@/components/admin/layout';

interface ReviewUser {
  id: string;
  name?: string;
  email: string;
}

interface ReviewOrder {
  id: string;
  orderNo: string;
}

interface Review {
  id: string;
  rating: number;
  content?: string;
  createdAt: string;
  user: ReviewUser;
  order: ReviewOrder;
}

function StarDisplay({ value }: { value: number }) {
  return (
    <span className="text-amber-400">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s}>{s <= value ? '\u2605' : '\u2606'}</span>
      ))}
    </span>
  );
}

export default function AdminReviewsPage() {
  const [loading, setLoading] = useState(true);
  const [avg, setAvg] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [distribution, setDistribution] = useState<Record<number, number>>({});
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [maxRating, setMaxRating] = useState(0);
  const [creating, setCreating] = useState<string | null>(null);
  const [createMsg, setCreateMsg] = useState<Record<string, string>>({});

  const load = (p: number, max: number) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: '20' });
    if (max > 0) params.set('maxRating', String(max));
    apiFetch(`/api/admin/reviews?${params}`, { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const d = json.data;
          setAvg(d.avg ?? 0);
          setTotalReviews(d.totalReviews ?? 0);
          setDistribution(d.distribution ?? {});
          setReviews(d.reviews ?? []);
          setTotal(d.total ?? 0);
          setTotalPages(d.totalPages ?? 1);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(page, maxRating); }, [page, maxRating]);

  const handleCreateTicket = async (reviewId: string) => {
    setCreating(reviewId);
    try {
      const r = await apiFetch(`/api/admin/reviews/${reviewId}/ticket`, { method: 'POST' });
      const json = await r.json();
      if (json.success) {
        setCreateMsg((prev) => ({ ...prev, [reviewId]: '工单已创建' }));
      } else {
        setCreateMsg((prev) => ({ ...prev, [reviewId]: extractApiError(json.error, '创建失败') }));
      }
    } catch {
      setCreateMsg((prev) => ({ ...prev, [reviewId]: '创建失败' }));
    } finally {
      setCreating(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="用户评价" subtitle="订单评价与商家回复统计" />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card text-center">
          <p className="text-xs text-surface-400 mb-1">平均评分</p>
          <p className="text-3xl font-bold text-semantic-warning">{avg.toFixed(1)}</p>
          <p className="text-xs text-surface-400 mt-1">共 {totalReviews} 条评价</p>
        </div>
        <div className="card md:col-span-2">
          <p className="text-xs text-surface-400 mb-3">评分分布</p>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((s) => {
              const cnt = distribution[s] ?? 0;
              const pct = totalReviews > 0 ? (cnt / totalReviews) * 100 : 0;
              return (
                <div key={s} className="flex items-center gap-2 text-sm">
                  <span className="w-8 text-right text-surface-400">{s}星</span>
                  <div className="flex-1 h-2 rounded-full bg-surface-100 overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-xs text-surface-400">{cnt}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-surface-600">评价列表</h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-surface-400">筛选:</label>
            <select
              className="text-xs border border-surface-200 rounded px-2 py-1 text-surface-500"
              value={maxRating}
              onChange={(e) => { setMaxRating(Number(e.target.value)); setPage(1); }}
            >
              <option value={0}>全部</option>
              <option value={2}>差评 (1-2星)</option>
              <option value={3}>中评 (1-3星)</option>
            </select>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-surface-400 text-center py-8">加载中...</p>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-surface-400 text-center py-8">暂无评价</p>
        ) : (
          <div className="admin-page animate-fade-in-up">
            {reviews.map((rv) => (
              <div key={rv.id} className="rounded-lg border border-surface-100 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="admin-page animate-fade-in-up">
                    <div className="flex items-center gap-2">
                      <StarDisplay value={rv.rating} />
                      <span className="text-xs text-surface-400">{new Date(rv.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-surface-400">
                      {rv.user.name || rv.user.email} · 订单 {rv.order.orderNo}
                    </p>
                    {rv.content && <p className="text-sm text-surface-500 mt-1">{rv.content}</p>}
                  </div>
                  {rv.rating <= 2 && (
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleCreateTicket(rv.id)}
                        disabled={creating === rv.id || !!createMsg[rv.id]}
                        className="btn-secondary btn-sm text-xs"
                      >
                        {creating === rv.id ? '创建中...' : '创建跟进工单'}
                      </button>
                      {createMsg[rv.id] && (
                        <span className="text-xs text-semantic-success">{createMsg[rv.id]}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-surface-400">
            <span>共 {total} 条</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-secondary btn-sm"
              >
                上一页
              </button>
              <span className="px-2 py-1">{page}/{totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn-secondary btn-sm"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
