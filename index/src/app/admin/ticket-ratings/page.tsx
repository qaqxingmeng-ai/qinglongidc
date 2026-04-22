'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api-client';
import { PageHeader } from '@/components/admin/layout';

interface Rating {
  id: string;
  ticketID: string;
  ticket?: { subject: string };
  userID: string;
  user?: { name: string; email: string };
  rating: number;
  feedback?: string;
  createdAt: string;
}

interface Stats {
  avgRating: number;
  total: number;
  lowCount: number;
  score1: number;
  score2: number;
  score3: number;
  score4: number;
  score5: number;
}

interface Trend {
  date: string;
  count: number;
  avgRating: number;
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          className={`w-3.5 h-3.5 ${n <= value ? 'text-yellow-400' : 'text-surface-200'}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

function ScoreBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-6 text-right text-surface-400">{label}</span>
      <div className="flex-1 bg-surface-100 rounded h-2 overflow-hidden">
        <div className="h-full bg-yellow-400 rounded" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-surface-400">{count}</span>
    </div>
  );
}

function AdminTicketRatingsInner() {
  const { user } = useAuth();
  const router = useRouter();
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [trend, setTrend] = useState<Trend[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [minRating, setMinRating] = useState('');
  const [maxRating, setMaxRating] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'ADMIN') router.push('/');
  }, [user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (minRating) params.set('minRating', minRating);
    if (maxRating) params.set('maxRating', maxRating);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    try {
      const res = await apiFetch(`/api/admin/ticket-ratings?${params}`, { method: 'GET' });
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        setRatings(d.ratings ?? []);
        setStats(d.stats ?? null);
        setTrend(d.trend ?? []);
        setTotal(d.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, minRating, maxRating, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const pageCount = Math.ceil(total / 20);
  const maxTrend = trend.reduce((a, t) => Math.max(a, t.count), 0);

  return (
    <div className="space-y-5">
      <PageHeader title="工单评分" subtitle="用户对已关闭工单的星级评分与反馈汇总" />

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-surface-100 rounded-8 p-4">
            <div className="text-xs text-surface-400 mb-1">平均分</div>
            <div className="text-2xl font-bold text-surface-600">{stats.avgRating.toFixed(2)}</div>
            <div className="mt-1"><Stars value={Math.round(stats.avgRating)} /></div>
          </div>
          <div className="bg-white border border-surface-100 rounded-8 p-4">
            <div className="text-xs text-surface-400 mb-1">总评价数</div>
            <div className="text-2xl font-bold text-surface-600">{stats.total}</div>
          </div>
          <div className="bg-white border border-surface-100 rounded-8 p-4">
            <div className="text-xs text-surface-400 mb-1">差评 (1-2 星)</div>
            <div className="text-2xl font-bold text-semantic-danger">{stats.lowCount}</div>
          </div>
          <div className="bg-white border border-surface-100 rounded-8 p-4">
            <div className="text-xs text-surface-400 mb-2">评分分布</div>
            <div className="admin-page animate-fade-in-up">
              {[5, 4, 3, 2, 1].map((s) => (
                <ScoreBar
                  key={s}
                  label={String(s)}
                  count={stats[`score${s}` as keyof Stats] as number ?? 0}
                  max={stats.total}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {trend.length > 0 && (
        <div className="bg-white border border-surface-100 rounded-8 p-4">
          <div className="text-xs font-semibold text-surface-400 mb-3">近 30 天评价趋势</div>
          <div className="flex items-end gap-1 h-16">
            {trend.map((t) => (
              <div key={t.date} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className="w-full bg-blue-100 rounded-t"
                  style={{ height: maxTrend > 0 ? `${(t.count / maxTrend) * 52}px` : '2px' }}
                  title={`${t.date}: ${t.count} 条, 均分 ${t.avgRating.toFixed(1)}`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-surface-400 mt-1">
            <span>{trend[0]?.date}</span>
            <span>{trend[trend.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end bg-white border border-surface-100 rounded-8 px-4 py-3">
        <div>
          <label className="block text-xs text-surface-400 mb-1">最低星级</label>
          <select
            value={minRating}
            onChange={(e) => { setMinRating(e.target.value); setPage(1); }}
            className="border border-surface-200 rounded-lg text-sm px-2 py-1.5 text-surface-500"
          >
            <option value="">不限</option>
            {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v} 星</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-surface-400 mb-1">最高星级</label>
          <select
            value={maxRating}
            onChange={(e) => { setMaxRating(e.target.value); setPage(1); }}
            className="border border-surface-200 rounded-lg text-sm px-2 py-1.5 text-surface-500"
          >
            <option value="">不限</option>
            {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v} 星</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-surface-400 mb-1">开始日期</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            className="border border-surface-200 rounded-lg text-sm px-2 py-1.5 text-surface-500"
          />
        </div>
        <div>
          <label className="block text-xs text-surface-400 mb-1">结束日期</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            className="border border-surface-200 rounded-lg text-sm px-2 py-1.5 text-surface-500"
          />
        </div>
        <button
          onClick={() => { setMinRating(''); setMaxRating(''); setStartDate(''); setEndDate(''); setPage(1); }}
          className="text-xs text-surface-400 hover:text-surface-500"
        >
          重置
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-surface-100 rounded-8 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-surface-100 bg-surface-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-400">工单</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-400">用户</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-400">评分</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-400">反馈</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-400">时间</th>
            </tr>
          </thead>
          <tbody>
            {loading && ratings.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-sm text-surface-400">加载中...</td></tr>
            ) : ratings.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-sm text-surface-400">暂无评价记录</td></tr>
            ) : ratings.map((r) => (
              <tr key={r.id} className="border-b border-surface-50 hover:bg-surface-50/50">
                <td className="px-4 py-3 text-surface-500 max-w-[200px] truncate">
                  {r.ticket?.subject ?? r.ticketID}
                </td>
                <td className="px-4 py-3 text-surface-500 text-xs">
                  <div>{r.user?.name ?? '-'}</div>
                  <div className="text-surface-400">{r.user?.email}</div>
                </td>
                <td className="px-4 py-3">
                  <Stars value={r.rating} />
                </td>
                <td className="px-4 py-3 text-xs text-surface-400 max-w-[200px]">
                  {r.feedback ?? <span className="text-surface-300">-</span>}
                </td>
                <td className="px-4 py-3 text-xs text-surface-400">
                  {new Date(r.createdAt).toLocaleString('zh-CN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {pageCount > 1 && (
        <div className="flex justify-center gap-1">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-lg text-sm ${
                p === page ? 'bg-brand-500 text-white' : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminTicketRatingsPage() {
  return (
    <AuthProvider>
      <AdminTicketRatingsInner />
    </AuthProvider>
  );
}
