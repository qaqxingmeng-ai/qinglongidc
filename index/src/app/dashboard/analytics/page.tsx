'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';
import Link from 'next/link';

interface MonthlyRow {
  month: string;
  amount: number;
}

interface RegionRow {
  region: string;
  amount: number;
}

interface CategoryRow {
  category: string;
  amount: number;
}

interface NextExpiry {
  id: string;
  productName: string;
  region: string;
  ip: string | null;
  expireDate: string | null;
  daysLeft: number;
}

interface Analytics {
  totalSpend: number;
  monthlyAvg: number;
  monthlyTrend: MonthlyRow[];
  byRegion: RegionRow[];
  byCategory: CategoryRow[];
  nextExpiry: NextExpiry | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  dedicated: '独立服务器',
  vps: 'VPS',
  cloud: '云服务器',
  colocation: '托管',
};

// ── Inline SVG bar chart ─────────────────────────────────────────────────────

function BarChart({ rows }: { rows: MonthlyRow[] }) {
  const max = Math.max(...rows.map((r) => r.amount), 1);
  const W = 480;
  const H = 120;
  const PAD = { top: 8, right: 8, bottom: 28, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const barW = Math.floor(innerW / rows.length) - 6;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 140 }}>
      {/* Y-axis gridlines */}
      {[0, 0.5, 1].map((t) => {
        const y = PAD.top + innerH * (1 - t);
        return (
          <g key={t}>
            <line x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} />
            <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize={9} fill="#94a3b8">
              ¥{Math.round(max * t).toLocaleString()}
            </text>
          </g>
        );
      })}
      {rows.map((r, i) => {
        const barH = Math.max(r.amount > 0 ? (r.amount / max) * innerH : 0, r.amount > 0 ? 2 : 0);
        const x = PAD.left + i * (innerW / rows.length) + 3;
        const y = PAD.top + innerH - barH;
        const label = r.month.slice(5); // MM
        return (
          <g key={r.month}>
            <rect x={x} y={y} width={barW} height={barH} rx={2} fill="#3b82f6" opacity={0.8} />
            <text x={x + barW / 2} y={H - PAD.bottom + 12} textAnchor="middle" fontSize={9} fill="#64748b">
              {label}
            </text>
            {r.amount > 0 && (
              <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize={8} fill="#3b82f6">
                {r.amount.toFixed(0)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Inline SVG donut chart ───────────────────────────────────────────────────

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function DonutChart({ slices }: { slices: { label: string; amount: number }[] }) {
  const total = slices.reduce((s, r) => s + r.amount, 0);
  if (total === 0) {
    return <p className="text-xs text-surface-400 py-6 text-center">暂无数据</p>;
  }

  const R = 50;
  const cx = 60;
  const cy = 60;
  const innerR = 28;
  const SIZE = 120;

  let cumAngle = -Math.PI / 2;
  const arcs = slices.map((s, i) => {
    const frac = s.amount / total;
    const startAngle = cumAngle;
    const endAngle = cumAngle + frac * 2 * Math.PI;
    cumAngle = endAngle;
    const x1 = cx + R * Math.cos(startAngle);
    const y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(endAngle);
    const y2 = cy + R * Math.sin(endAngle);
    const xi1 = cx + innerR * Math.cos(endAngle);
    const yi1 = cy + innerR * Math.sin(endAngle);
    const xi2 = cx + innerR * Math.cos(startAngle);
    const yi2 = cy + innerR * Math.sin(startAngle);
    const largeArc = frac > 0.5 ? 1 : 0;
    const d = `M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${xi2} ${yi2} Z`;
    return { d, color: COLORS[i % COLORS.length], ...s, pct: (frac * 100).toFixed(1) };
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: SIZE, height: SIZE, flexShrink: 0 }}>
        {arcs.map((arc, i) => (
          <path key={i} d={arc.d} fill={arc.color} />
        ))}
      </svg>
      <div className="space-y-1.5">
        {arcs.map((arc, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-surface-500">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: arc.color }} />
            <span className="truncate max-w-[80px]">{arc.label}</span>
            <span className="text-surface-400 ml-auto pl-2">{arc.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/dashboard/analytics/personal', { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        setData(json.data ?? json);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-xs text-surface-400 py-10 text-center">加载中...</p>;
  }

  if (!data) {
    return <p className="text-xs text-surface-400 py-10 text-center">数据加载失败</p>;
  }

  const regionSlices = (data.byRegion ?? [])
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((r) => ({ label: r.region, amount: r.amount }));

  const categorySlices = (data.byCategory ?? [])
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((r) => ({ label: CATEGORY_LABELS[r.category] ?? r.category, amount: r.amount }));

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="section-title">个人数据看板</h1>
        <Link href="/dashboard" className="text-xs text-surface-400 hover:text-surface-500 hover:underline">返回控制台</Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="rounded-8 bg-semantic-info-light px-4 py-3">
          <p className="text-[11px] text-surface-400 mb-1">累计消费</p>
          <p className="text-xl font-semibold text-brand-600">¥{data.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="rounded-8 bg-surface-50 px-4 py-3">
          <p className="text-[11px] text-surface-400 mb-1">月均消费</p>
          <p className="text-xl font-semibold text-surface-500">
            {data.monthlyAvg > 0 ? `¥${data.monthlyAvg.toFixed(2)}` : '—'}
          </p>
        </div>
        <div className={`rounded-8 px-4 py-3 col-span-2 sm:col-span-1 ${data.nextExpiry && data.nextExpiry.daysLeft <= 7 ? 'bg-semantic-danger-light' : 'bg-semantic-success-light'}`}>
          <p className="text-[11px] text-surface-400 mb-1">最近到期</p>
          {data.nextExpiry ? (
            <div>
              <p className={`text-lg font-semibold ${data.nextExpiry.daysLeft <= 7 ? 'text-semantic-danger' : 'text-semantic-success'}`}>
                {data.nextExpiry.daysLeft} 天后
              </p>
              <p className="text-[11px] text-surface-400 mt-0.5 truncate">{data.nextExpiry.productName}</p>
            </div>
          ) : (
            <p className="text-xl font-semibold text-surface-400">无到期</p>
          )}
        </div>
      </div>

      {/* Monthly Trend */}
      <div className="rounded-8 border border-surface-100 bg-white p-4 mb-4">
        <h2 className="text-sm font-medium text-surface-500 mb-3">近 6 个月消费趋势</h2>
        {data.monthlyTrend && data.monthlyTrend.some((r) => r.amount > 0) ? (
          <BarChart rows={data.monthlyTrend} />
        ) : (
          <p className="text-xs text-surface-400 py-8 text-center">暂无消费记录</p>
        )}
      </div>

      {/* Distribution Charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="rounded-8 border border-surface-100 bg-white p-4">
          <h2 className="text-sm font-medium text-surface-500 mb-3">按地区分布</h2>
          <DonutChart slices={regionSlices} />
        </div>
        <div className="rounded-8 border border-surface-100 bg-white p-4">
          <h2 className="text-sm font-medium text-surface-500 mb-3">按产品类型</h2>
          <DonutChart slices={categorySlices} />
        </div>
      </div>

      {/* Next Expiry Detail */}
      {data.nextExpiry && (
        <div className="rounded-8 border border-surface-100 bg-white p-4">
          <h2 className="text-sm font-medium text-surface-500 mb-3">续费提醒</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-surface-600">{data.nextExpiry.productName}</p>
              <p className="text-xs text-surface-400 mt-0.5">
                {data.nextExpiry.region}
                {data.nextExpiry.ip && <span className="font-mono ml-2">{data.nextExpiry.ip}</span>}
              </p>
              {data.nextExpiry.expireDate && (
                <p className="text-xs text-surface-400 mt-0.5">
                  到期：{new Date(data.nextExpiry.expireDate).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold ${data.nextExpiry.daysLeft <= 7 ? 'text-semantic-danger' : data.nextExpiry.daysLeft <= 30 ? 'text-semantic-warning' : 'text-semantic-success'}`}>
                {data.nextExpiry.daysLeft}
              </p>
              <p className="text-[11px] text-surface-400">天后到期</p>
            </div>
          </div>
          <div className="mt-3">
            <Link
              href="/dashboard/servers"
              className="inline-block text-xs px-4 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
            >
              前往续费
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
