'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch, isApiSuccess, pickApiData } from '@/lib/api-client';
import { PageHeader, SkeletonTable } from '@/components/admin/layout';

interface NpsStats {
  total: number;
  avgScore: number;
  npsScore: number;
  detractors: number;
  passives: number;
  promoters: number;
  distribution: { score: number; count: number }[];
  monthly: { month: string; count: number; avg: number }[];
  recent: Array<{
    id: string;
    userId: string;
    score: number;
    reason?: string;
    createdAt: string;
    user?: { name: string; email: string };
  }>;
}

const scoreBadge = (s: number) => {
  if (s >= 9) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (s >= 7) return 'bg-amber-50 text-amber-700 border border-amber-200';
  return 'bg-red-50 text-red-700 border border-red-200';
};

export default function NpsPage() {
  const [stats, setStats] = useState<NpsStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch('/api/admin/nps/stats');
    const json = await res.json();
    if (isApiSuccess(json)) {
      setStats(pickApiData<NpsStats>(json));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !stats) {
    return (
      <div className="space-y-5">
        <PageHeader title="NPS 满意度" subtitle="净推荐值分析 — 了解用户对产品的满意度与忠诚度。" />
        <SkeletonTable rows={6} columns={4} />
      </div>
    );
  }

  const distribution = stats.distribution ?? [];
  const recent = stats.recent ?? [];
  const maxDist = distribution.length > 0 ? Math.max(...distribution.map(d => Number(d.count)), 1) : 1;

  return (
    <div className="space-y-5">
      <PageHeader title="NPS 满意度" subtitle="净推荐值分析 — 了解用户对产品的满意度与忠诚度。" />

      {/* KPI 卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="admin-panel">
          <div className="admin-panel-body py-4">
            <p className="text-[11px] text-surface-400 mb-1">NPS 分数</p>
            <p className={`text-3xl font-bold ${stats.npsScore >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {stats.npsScore.toFixed(1)}
            </p>
            <p className="text-[11px] text-surface-400 mt-1">-100 ~ 100</p>
          </div>
        </div>
        <div className="admin-panel">
          <div className="admin-panel-body py-4">
            <p className="text-[11px] text-surface-400 mb-1">平均分</p>
            <p className="text-3xl font-bold text-surface-700">{(stats.avgScore ?? 0).toFixed(1)}</p>
            <p className="text-[11px] text-surface-400 mt-1">共 {stats.total ?? 0} 份</p>
          </div>
        </div>
        <div className="admin-panel">
          <div className="admin-panel-body py-4">
            <p className="text-[11px] text-surface-400 mb-1">推荐者 9-10</p>
            <p className="text-3xl font-bold text-emerald-600">{stats.promoters ?? 0}</p>
            <p className="text-[11px] text-surface-400 mt-1">
              {(stats.total ?? 0) > 0 ? (((stats.promoters ?? 0) / stats.total) * 100).toFixed(1) : 0}%
            </p>
          </div>
        </div>
        <div className="admin-panel">
          <div className="admin-panel-body py-4">
            <p className="text-[11px] text-surface-400 mb-1">贬损者 0-6</p>
            <p className="text-3xl font-bold text-red-600">{stats.detractors ?? 0}</p>
            <p className="text-[11px] text-surface-400 mt-1">
              {(stats.total ?? 0) > 0 ? (((stats.detractors ?? 0) / stats.total) * 100).toFixed(1) : 0}%
            </p>
          </div>
        </div>
      </div>

      {/* 评分分布 */}
      <div className="admin-panel mb-4">
        <div className="admin-panel-header">
          <span className="admin-panel-title">评分分布</span>
        </div>
        <div className="admin-panel-body">
          <div className="flex items-end gap-1 h-28">
            {Array.from({ length: 11 }, (_, i) => {
              const d = distribution.find(x => x.score === i);
              const count = d ? Number(d.count) : 0;
              const height = maxDist > 0 ? (count / maxDist) * 100 : 0;
              const color = i >= 9 ? 'bg-emerald-400' : i >= 7 ? 'bg-amber-400' : 'bg-red-400';
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-surface-400">{count}</span>
                  <div className={`w-full rounded-sm ${color}`} style={{ height: `${height}%`, minHeight: count > 0 ? '4px' : 0 }} />
                  <span className="text-[10px] text-surface-400">{i}</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-3 text-xs text-surface-400 justify-center">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" />贬损者 0-6</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />中立者 7-8</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />推荐者 9-10</span>
          </div>
        </div>
      </div>

      {/* 近期反馈 */}
      <div className="admin-panel">
        <div className="admin-panel-header">
          <span className="admin-panel-title">近期反馈</span>
          <span className="text-xs text-surface-400">{recent.length} 条</span>
        </div>
        <div className="admin-panel-body">
          {recent.length === 0 ? (
            <div className="empty-state py-16">
              <svg className="h-10 w-10 text-surface-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              <p className="text-surface-400 text-sm">暂无反馈数据</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-50">
              {recent.map((r) => (
                <div key={r.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className={`shrink-0 text-sm font-bold px-2.5 py-1 rounded-lg ${scoreBadge(r.score)}`}>
                    {r.score}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-surface-600">{r.user?.name ?? r.userId}</span>
                      <span className="text-xs text-surface-400">{r.user?.email}</span>
                    </div>
                    {r.reason && (
                      <p className="text-xs text-surface-500 mt-0.5 truncate">{r.reason}</p>
                    )}
                  </div>
                  <span className="text-xs text-surface-400 shrink-0">
                    {new Date(r.createdAt).toLocaleDateString('zh-CN')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
