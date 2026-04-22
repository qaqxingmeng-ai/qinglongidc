'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api-client';
import { PageHeader, FilterBar, TabChip, Panel, EmptyState, SkeletonTable, useToast } from '@/components/admin/layout';

// ---- Types ----
interface GrowthPoint { date: string; count: number }
interface RevPoint { date: string; revenue: number; orders: number }
interface ProductSaleRow { productId: string; productName: string; region: string; orderCount: number; revenue: number }
interface RegionRevRow { region: string; revenue: number; orderCount: number }
interface AgentRow { agentId: string; agentName: string; userCount: number; revenue: number }
interface Realtime { todayUsers: number; todayOrders: number; todayRevenue: number; openTickets: number }

interface AnalyticsData {
  userGrowth: GrowthPoint[];
  revenueTrend: RevPoint[];
  productSales: ProductSaleRow[];
  regionRevenue: RegionRevRow[];
  agentContrib: AgentRow[];
  realtime: Realtime;
}

// ---- Tiny SVG line chart ----
type ChartRow = Record<string, string | number>;
function LineChart({ data, color, yKey, dateKey = 'date' }: { data: ChartRow[]; color: string; yKey: string; dateKey?: string }) {
  const W = 480, H = 120, padL = 40, padB = 24, padT = 8, padR = 8;
  const values = data.map((d) => Number(d[yKey]));
  const maxV = Math.max(...values, 1);
  const minV = Math.min(...values, 0);
  const range = maxV - minV || 1;
  const iW = W - padL - padR;
  const iH = H - padT - padB;
  const pts = data.map((d, i) => {
    const x = padL + (i / Math.max(data.length - 1, 1)) * iW;
    const y = padT + (1 - (Number(d[yKey]) - minV) / range) * iH;
    return `${x},${y}`;
  });
  const fillPath = pts.length > 1
    ? `M${pts.join('L')}L${padL + iW},${padT + iH}L${padL},${padT + iH}Z`
    : '';
  const linePath = pts.length > 1 ? `M${pts.join('L')}` : '';

  // x-axis labels: show every nth
  const labelStep = Math.ceil(data.length / 6);
  const labels = data
    .map((d, i) => ({ label: String(d[dateKey] ?? ''), i }))
    .filter((_, i) => i % labelStep === 0 || i === data.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {/* grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line
          key={t}
          x1={padL} y1={padT + t * iH}
          x2={padL + iW} y2={padT + t * iH}
          stroke="#f0f0f0" strokeWidth="1"
        />
      ))}
      {/* fill */}
      {fillPath && <path d={fillPath} fill={`url(#grad-${color})`} />}
      {/* line */}
      {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />}
      {/* dots */}
      {pts.map((pt, i) => {
        const [x, y] = pt.split(',').map(Number);
        return <circle key={i} cx={x} cy={y} r="2" fill={color} />;
      })}
      {/* x labels */}
      {labels.map(({ label, i }) => {
        const x = padL + (i / Math.max(data.length - 1, 1)) * iW;
        return (
          <text key={i} x={x} y={H - 4} textAnchor="middle" fontSize="8" fill="#999">
            {label.slice(5)}
          </text>
        );
      })}
      {/* y max label */}
      <text x={padL - 2} y={padT + 6} textAnchor="end" fontSize="8" fill="#bbb">
        {maxV >= 1000 ? `${(maxV / 1000).toFixed(1)}k` : Math.round(maxV)}
      </text>
    </svg>
  );
}

// ---- Horizontal bar chart ----
function BarChart({ rows, labelKey, valueKey, color }: {
  rows: Record<string, number | string>[];
  labelKey: string;
  valueKey: string;
  color: string;
}) {
  const maxV = Math.max(...rows.map((r) => r[valueKey] as number), 1);
  return (
    <div className="admin-page animate-fade-in-up">
      {rows.map((row, i) => {
        const pct = ((row[valueKey] as number) / maxV) * 100;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-32 truncate text-surface-500 shrink-0" title={row[labelKey] as string}>
              {i + 1}. {row[labelKey]}
            </span>
            <div className="flex-1 bg-surface-100 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
            <span className="w-20 text-right text-surface-400 shrink-0">
              {(row[valueKey] as number) >= 1000
                ? `¥${((row[valueKey] as number) / 1000).toFixed(1)}k`
                : `¥${(row[valueKey] as number).toFixed(0)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---- Donut chart (SVG) ----
function DonutChart({ items, total }: { items: { label: string; value: number; color: string }[]; total: number }) {
  const R = 40, CX = 50, CY = 50, stroke = 18;
  let cumAngle = -Math.PI / 2;
  const slices = items.map((item) => {
    const angle = (item.value / (total || 1)) * 2 * Math.PI;
    const x1 = CX + R * Math.cos(cumAngle);
    const y1 = CY + R * Math.sin(cumAngle);
    cumAngle += angle;
    const x2 = CX + R * Math.cos(cumAngle);
    const y2 = CY + R * Math.sin(cumAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const d = `M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}`;
    return { ...item, d, angle };
  });
  return (
    <svg viewBox="0 0 100 100" className="w-28 h-28">
      {slices.map((s, i) => (
        <path
          key={i}
          d={s.d}
          fill="none"
          stroke={s.color}
          strokeWidth={stroke}
          strokeLinecap="butt"
        />
      ))}
      <text x={CX} y={CY - 3} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#333">
        {items.length}
      </text>
      <text x={CX} y={CY + 8} textAnchor="middle" fontSize="6" fill="#999">地区</text>
    </svg>
  );
}

const REGION_COLORS = [
  '#165dff','#10b981','#ff7d00','#f53f3f','#165dff',
  '#06b6d4','#84cc16','#ff7d00','#f53f3f','#165dff',
];

function AdminAnalyticsInner() {
  const toast = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (user && user.role !== 'ADMIN') router.push('/');
  }, [user, router]);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/admin/analytics?period=${period}&days=${days}`, { method: 'GET' });
      const json = await res.json();
      if (json.success) setData(json.data as AnalyticsData);
      else toast.error('统计数据加载失败');
    } catch {
      toast.error('统计数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [period, days, toast]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Auto-refresh realtime stats every 60s
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchData(), 60000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  if (loading) return <SkeletonTable rows={8} columns={4} />;
  if (!data) {
    return (
      <Panel>
        <EmptyState title="加载失败" description="请稍后刷新重试" />
      </Panel>
    );
  }

  const { realtime, userGrowth, revenueTrend, productSales, regionRevenue, agentContrib } = data;

  const regionTotal = regionRevenue.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const regionWithColor = regionRevenue.map((r, i) => ({
    ...r,
    color: REGION_COLORS[i % REGION_COLORS.length],
  }));

  const userGrowthWithDate = userGrowth.map((p) => ({ date: p.date, count: p.count }));
  const revTrendWithDate = revenueTrend.map((p) => ({ date: p.date, revenue: p.revenue }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="数据分析"
        subtitle="实时数据每 60 秒刷新"
        actions={
          <button
            onClick={() => fetchData()}
            className="h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500"
          >
            立即刷新
          </button>
        }
      />

      {/* Realtime stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          { label: '今日新增用户', value: realtime.todayUsers, color: 'text-brand-500' },
          { label: '今日订单数', value: realtime.todayOrders, color: 'text-semantic-success' },
          { label: '今日收入', value: `¥${realtime.todayRevenue.toFixed(2)}`, color: 'text-semantic-warning' },
          { label: '处理中工单', value: realtime.openTickets, color: 'text-semantic-danger' },
        ].map((item) => (
          <Panel key={item.label}>
            <p className="text-xs text-surface-400 mb-1">{item.label}</p>
            <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
          </Panel>
        ))}
      </div>

      <FilterBar>
        <span className="text-[12px] text-surface-400">统计周期</span>
        <div className="flex gap-1">
          {(['daily', 'weekly', 'monthly'] as const).map((p) => (
            <TabChip
              key={p}
              active={period === p}
              onClick={() => setPeriod(p)}
            >
              {p === 'daily' ? '日' : p === 'weekly' ? '周' : '月'}
            </TabChip>
          ))}
        </div>

        <span className="text-[12px] text-surface-400">时间范围</span>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <TabChip
              key={d}
              active={days === d}
              onClick={() => setDays(d)}
            >
              {d === 7 ? '7天' : d === 30 ? '30天' : '90天'}
            </TabChip>
          ))}
        </div>
      </FilterBar>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4">
        <Panel>
          <p className="text-xs font-semibold text-surface-500 mb-3">用户增长趋势</p>
          <div className="h-32">
            <LineChart data={userGrowthWithDate as ChartRow[]} color="#165dff" yKey="count" />
          </div>
        </Panel>
        <Panel>
          <p className="text-xs font-semibold text-surface-500 mb-3">收入趋势</p>
          <div className="h-32">
            <LineChart data={revTrendWithDate as ChartRow[]} color="#10b981" yKey="revenue" />
          </div>
        </Panel>
      </div>

      {/* Product sales + Region revenue */}
      <div className="grid grid-cols-2 gap-4">
        <Panel>
          <p className="text-xs font-semibold text-surface-500 mb-3">产品销售 TOP10（按收入）</p>
          {productSales.length === 0 ? (
            <p className="text-xs text-surface-400">暂无数据</p>
          ) : (
            <BarChart
              rows={productSales.map((r) => ({ label: r.productName, value: r.revenue }))}
              labelKey="label"
              valueKey="value"
              color="#165dff"
            />
          )}
        </Panel>
        <Panel>
          <p className="text-xs font-semibold text-surface-500 mb-3">地区收入分布</p>
          {regionRevenue.length === 0 ? (
            <p className="text-xs text-surface-400">暂无数据</p>
          ) : (
            <div className="flex items-center gap-4">
              <DonutChart
                items={regionWithColor.map((r) => ({ label: r.region, value: r.revenue, color: r.color }))}
                total={regionTotal}
              />
              <div className="flex-1 space-y-1.5 overflow-y-auto max-h-36">
                {regionWithColor.slice(0, 8).map((r) => (
                  <div key={r.region} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                      <span className="text-surface-500 truncate max-w-[80px]">{r.region}</span>
                    </div>
                    <span className="text-surface-400 ml-2">
                      {regionTotal > 0 ? `${((r.revenue / regionTotal) * 100).toFixed(1)}%` : '0%'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Agent contribution */}
      <Panel>
        <p className="text-xs font-semibold text-surface-500 mb-3">渠道商贡献排行</p>
        {agentContrib.length === 0 ? (
          <p className="text-xs text-surface-400">暂无渠道商数据</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="text-left py-2 text-surface-400 font-normal">排名</th>
                  <th className="text-left py-2 text-surface-400 font-normal">渠道商</th>
                  <th className="text-right py-2 text-surface-400 font-normal">下级用户</th>
                  <th className="text-right py-2 text-surface-400 font-normal">带来收入</th>
                </tr>
              </thead>
              <tbody>
                {agentContrib.map((row, i) => (
                  <tr key={row.agentId} className="border-b border-surface-50">
                    <td className="py-2 text-surface-400">{i + 1}</td>
                    <td className="py-2 text-surface-600 font-medium">{row.agentName}</td>
                    <td className="py-2 text-right text-surface-500">{row.userCount}</td>
                    <td className="py-2 text-right text-semantic-success font-medium">¥{row.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  return (
    <AuthProvider>
      <AdminAnalyticsInner />
    </AuthProvider>
  );
}
