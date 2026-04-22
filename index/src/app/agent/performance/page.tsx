'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

interface DailyCount {
  day: string;
  count: number;
}

interface MonthlyAmount {
  month: string;
  amount: number;
}

interface FunnelStep {
  label: string;
  count: number;
}

interface PerformanceData {
  userGrowth: DailyCount[];
  commissionTrend: MonthlyAmount[];
  funnel: FunnelStep[];
  rankPercentile: number;
  myTotalCommission: number;
}

export default function AgentPerformancePage() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/agent/performance')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-surface-400 py-20 text-center">加载中...</div>;
  if (!data) return <div className="text-surface-400 py-20 text-center">加载失败</div>;

  const maxUserGrowth = Math.max(...(data.userGrowth.map((d) => d.count)), 1);
  const maxCommission = Math.max(...(data.commissionTrend.map((d) => d.amount)), 1);
  const maxFunnel = data.funnel[0]?.count || 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title">业绩看板</h1>
        <p className="text-sm text-surface-400 mt-1">推广数据、佣金趋势与业绩排名</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-xs text-surface-400 mb-1">累计结算佣金</p>
          <p className="text-2xl font-bold text-brand-500">¥{data.myTotalCommission.toFixed(2)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-surface-400 mb-1">业绩排名</p>
          <p className="text-2xl font-bold text-semantic-success">{data.rankPercentile}%</p>
          <p className="text-xs text-surface-400 mt-1">超越了该比例的渠道商</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-surface-400 mb-1">注册用户数</p>
          <p className="text-2xl font-bold text-surface-500">{data.funnel.find((f) => f.label === '注册用户')?.count ?? 0}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-surface-400 mb-1">首次下单用户</p>
          <p className="text-2xl font-bold text-surface-500">{data.funnel.find((f) => f.label === '首次下单')?.count ?? 0}</p>
        </div>
      </div>

      {/* User growth chart - last 30 days */}
      <div className="card">
        <h2 className="text-sm font-semibold text-surface-500 mb-4">下级用户增长（近 30 天）</h2>
        {data.userGrowth.length === 0 ? (
          <p className="text-sm text-surface-400 text-center py-8">暂无数据</p>
        ) : (
          <div className="flex items-end gap-1 h-32 overflow-x-auto pb-1">
            {data.userGrowth.map((d) => (
              <div key={d.day} className="flex flex-col items-center gap-1 min-w-[20px]">
                <div
                  className="w-4 bg-blue-400 rounded-t"
                  style={{ height: `${Math.max((d.count / maxUserGrowth) * 100, 4)}px` }}
                  title={`${d.day}: ${d.count} 人`}
                />
                <span className="text-[11px] text-surface-400 rotate-[-45deg] origin-top-left w-7 overflow-hidden">{d.day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Commission trend - last 6 months */}
      <div className="card">
        <h2 className="text-sm font-semibold text-surface-500 mb-4">佣金收入趋势（近 6 个月）</h2>
        {data.commissionTrend.length === 0 ? (
          <p className="text-sm text-surface-400 text-center py-8">暂无数据</p>
        ) : (
          <div className="flex items-end gap-3 h-40">
            {data.commissionTrend.map((d) => (
              <div key={d.month} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                <span className="text-xs text-surface-500 font-medium">¥{d.amount.toFixed(0)}</span>
                <div
                  className="w-full bg-emerald-400 rounded-t"
                  style={{ height: `${Math.max((d.amount / maxCommission) * 100, 4)}px` }}
                  title={`${d.month}: ¥${d.amount.toFixed(2)}`}
                />
                <span className="text-xs text-surface-400">{d.month.slice(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Funnel */}
      <div className="card">
        <h2 className="text-sm font-semibold text-surface-500 mb-4">推广转化漏斗</h2>
        <div className="space-y-3">
          {data.funnel.map((step, idx) => {
            const width = maxFunnel > 0 ? Math.max((step.count / maxFunnel) * 100, 2) : 2;
            const conversionRate = idx > 0 && data.funnel[idx - 1].count > 0
              ? ((step.count / data.funnel[idx - 1].count) * 100).toFixed(1)
              : null;
            return (
              <div key={step.label} className="flex items-center gap-3">
                <span className="text-xs text-surface-400 w-16 text-right shrink-0">{step.label}</span>
                <div className="flex-1 bg-surface-100 rounded-full h-6 relative overflow-hidden">
                  <div
                    className="h-full bg-semantic-info-light rounded-full transition-all"
                    style={{ width: `${width}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-start pl-2 text-xs font-medium text-white mix-blend-difference">
                    {step.count}
                  </span>
                </div>
                {conversionRate !== null && (
                  <span className="text-xs text-surface-400 shrink-0 w-12">{conversionRate}%</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Rank percentile explanation */}
      <div className="card border border-blue-100 bg-semantic-info-light/30">
        <p className="text-sm text-surface-500">
          您的业绩（累计结算佣金 <strong>¥{data.myTotalCommission.toFixed(2)}</strong>）超越了
          <strong className="text-brand-500 mx-1">{data.rankPercentile}%</strong>
          的渠道商。
        </p>
        <p className="text-xs text-surface-400 mt-1">排名基于各渠道商累计已结算佣金金额，不展示其他渠道商具体数据。</p>
      </div>
    </div>
  );
}
