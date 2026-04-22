'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiFetch, isApiSuccess, pickApiData } from '@/lib/api-client';
import { PageHeader, FilterBar, TabChip } from '@/components/admin/layout';

// ---------- Types ----------

interface DashboardData {
  totalRevenue: number;
  monthRevenue: number;
  lastMonthRevenue: number;
  yearRevenue: number;
  lastYearRevenue: number;
  totalRecharge: number;
  monthRecharge: number;
  totalOrders: number;
  monthOrders: number;
  totalProfit: number;
  monthProfit: number;
  grossRevenue: number;
  totalCost: number;
  momGrowth: number;
  yoyGrowth: number;
  newPurchaseRevenue: number;
  renewalRevenue: number;
  rechargeRevenue: number;
  agentSales: AgentStat[];
  recentOrders: RecentOrder[];
}

interface AgentStat {
  agentId: string;
  agentName: string;
  totalRevenue: number;
  monthRevenue: number;
  orderCount: number;
  userCount: number;
}

interface RecentOrder {
  id: string;
  orderNo: string;
  totalPrice: number;
  status: string;
  createdAt: string;
  userName: string;
  userEmail: string;
  isRenewal: boolean;
}

interface TrendStat {
  month: string;
  recharge: number;
  purchase: number;
}

interface MonthProfit {
  month: string;
  revenue: number;
  cost: number;
  profit: number;
}

interface RegionProfit {
  region: string;
  revenue: number;
  cost: number;
  profit: number;
}

interface SupplierProfit {
  supplier: string;
  revenue: number;
  cost: number;
  profit: number;
}

interface TopUser {
  userId: string;
  email: string;
  name: string;
  level: string;
  amount: number;
  txCount: number;
}

// ---------- Helpers ----------

function fmt(n: number) {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function GrowthBadge({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-4 px-1.5 py-0.5 text-xs font-semibold ${up ? 'bg-semantic-success-light text-semantic-success' : 'bg-semantic-danger-light text-semantic-danger'}`}
    >
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-100">
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
    </div>
  );
}

// ---------- Sub-components ----------

function StatCard({ label, value, sub, growth, color }: {
  label: string; value: string; sub?: string; growth?: number; color?: string;
}) {
  return (
    <div className="rounded-8 border border-surface-200 bg-white p-5 shadow-card">
      <p className="text-xs text-surface-400 mb-1.5">{label}</p>
      <p className={`text-[22px] font-bold ${color === "#165dff" ? "text-brand-500" : color === "#00b42a" ? "text-semantic-success" : color === "#f53f3f" ? "text-semantic-danger" : "text-surface-600"}`}>{value}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        {sub && <span className="text-xs text-surface-400">{sub}</span>}
        {growth !== undefined && <GrowthBadge value={growth} />}
      </div>
    </div>
  );
}

function TrendsChart({ data }: { data: TrendStat[] }) {
  const maxVal = Math.max(...data.map(d => Math.max(d.recharge, d.purchase)), 1);
  return (
    <div>
      <div className="flex gap-4 mb-3 text-xs text-surface-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-2.5 bg-brand-500 rounded-sm" />充值
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-2.5 bg-semantic-success rounded-sm" />消费
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {data.map((d) => (
          <div key={d.month} className="flex items-center gap-2.5 text-xs">
            <span className="text-surface-400 w-14 shrink-0">{d.month.slice(5)}</span>
            <div className="flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-surface-100">
                  <div style={{ width: `${(d.recharge / maxVal) * 100}%`, height: '100%', background: '#165dff', }} />
                </div>
                <span className="text-surface-500 w-16 text-right shrink-0">{d.recharge.toFixed(0)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-surface-100">
                  <div style={{ width: `${(d.purchase / maxVal) * 100}%`, height: '100%', background: '#00b42a', }} />
                </div>
                <span className="text-surface-500 w-16 text-right shrink-0">{d.purchase.toFixed(0)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfitByMonth({ data }: { data: MonthProfit[] }) {
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-3.5 mb-2 text-xs text-surface-500">
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-2.5 bg-brand-500 rounded-sm" />营收</span>
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-2.5 bg-semantic-warning rounded-sm" />成本</span>
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-2.5 bg-semantic-success rounded-sm" />毛利</span>
      </div>
      {data.map((d) => (
        <div key={d.month} className="flex items-center gap-2 text-xs">
          <span className="text-surface-400 w-14 shrink-0">{d.month.slice(5)}</span>
          <div className="flex-1 flex flex-col gap-0.5">
            <MiniBar value={d.revenue} max={maxRevenue} color="#165dff" />
            <MiniBar value={d.cost} max={maxRevenue} color="#ff7d00" />
            <MiniBar value={d.profit} max={maxRevenue} color="#00b42a" />
          </div>
          <span className={`w-16 text-right shrink-0 font-semibold ${d.profit >= 0 ? "text-semantic-success" : "text-semantic-danger"}`}>
            {d.profit.toFixed(0)}
          </span>
        </div>
      ))}
    </div>
  );
}

function TopTable({ title, rows, color }: { title: string; rows: { label: string; value: number; sub?: string }[]; color: string }) {
  const max = Math.max(...rows.map(r => r.value), 1);
  return (
    <div className="admin-panel overflow-hidden">
      <div className="admin-panel-header bg-surface-50">
        <p className="text-[13px] font-semibold text-surface-600">{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="py-5 text-center text-[13px] text-surface-400">暂无数据</p>
      ) : (
        <div className="divide-y divide-surface-100">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface-50/60 transition-colors">
              <span className="text-xs text-surface-400 w-[18px] shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-surface-600 font-medium truncate">{row.label}</p>
                {row.sub && <p className="text-[11px] text-surface-400">{row.sub}</p>}
                <MiniBar value={row.value} max={max} color={color} />
              </div>
              <span className="text-[13px] font-bold text-surface-600 shrink-0 min-w-[64px] text-right">
                {fmt(row.value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompositionBar({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return <p className="text-[13px] text-surface-400">暂无数据</p>;
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full mb-2.5">
        {items.map((item) => (
          <div
            key={item.label}
            style={{ width: `${(item.value / total) * 100}%`, background: item.color }}
            title={`${item.label}: ${fmt(item.value)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" />
            <span className="text-surface-500">{item.label}</span>
            <span className="font-bold text-surface-600">{fmt(item.value)}</span>
            <span className="text-surface-400">({((item.value / total) * 100).toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const STATUS_BADGE_STYLE: Record<string, string> = {
  PAID: 'bg-semantic-success-light text-semantic-success-dark',
  COMPLETED: 'bg-semantic-success-light text-semantic-success-dark',
  PENDING: 'bg-semantic-warning-light text-semantic-warning-dark',
  CANCELLED: 'bg-surface-100 text-surface-400',
  REFUNDED: 'bg-semantic-danger-light text-semantic-danger',
};

const STATUS_COLOR: Record<string, string> = {
  PAID: '#00b42a',
  COMPLETED: '#00b42a',
  PENDING: '#ff7d00',
  CANCELLED: '#86909c',
  REFUNDED: '#f53f3f',
};
void STATUS_COLOR;

// ---------- Page ----------

export default function AdminFinancePage() {
  const [tab, setTab] = useState<'overview' | 'profit' | 'users'>('overview');
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [trends, setTrends] = useState<TrendStat[]>([]);
  const [profit, setProfit] = useState<{ byMonth: MonthProfit[]; byRegion: RegionProfit[]; bySupplier: SupplierProfit[] } | null>(null);
  const [topRecharge, setTopRecharge] = useState<TopUser[]>([]);
  const [topPurchase, setTopPurchase] = useState<TopUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [trendMonths, setTrendMonths] = useState(12);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/admin/finance/dashboard').then(r => r.json()),
      apiFetch(`/api/admin/finance/trends?months=${trendMonths}`).then(r => r.json()),
    ]).then(([d, t]) => {
      if (isApiSuccess(d)) {
        const raw = pickApiData<DashboardData>(d);
        // Backend may return null for empty slices; normalize to []
        const normalized: DashboardData | null = raw
          ? {
              ...raw,
              agentSales: Array.isArray(raw.agentSales) ? raw.agentSales : [],
              recentOrders: Array.isArray(raw.recentOrders) ? raw.recentOrders : [],
            }
          : null;
        setDash(normalized);
      }
      if (isApiSuccess(t)) {
        const trendData = pickApiData<{ trends?: TrendStat[] } | TrendStat[]>(t, ['trends']);
        const list = Array.isArray(trendData) ? trendData : (trendData?.trends ?? []);
        setTrends(list);
      }
    }).finally(() => setLoading(false));
  }, [trendMonths]);

  useEffect(() => {
    apiFetch('/api/admin/finance/profit?months=12').then(r => r.json()).then(j => {
      if (isApiSuccess(j)) {
        setProfit(pickApiData<{ byMonth: MonthProfit[]; byRegion: RegionProfit[]; bySupplier: SupplierProfit[] }>(j));
      }
    });
    apiFetch('/api/admin/finance/top-users?type=recharge&limit=10').then(r => r.json()).then(j => {
      if (isApiSuccess(j)) {
        const topData = pickApiData<{ users?: TopUser[] } | TopUser[]>(j, ['users']);
        const users = Array.isArray(topData) ? topData : (topData?.users ?? []);
        setTopRecharge(users);
      }
    });
    apiFetch('/api/admin/finance/top-users?type=purchase&limit=10').then(r => r.json()).then(j => {
      if (isApiSuccess(j)) {
        const topData = pickApiData<{ users?: TopUser[] } | TopUser[]>(j, ['users']);
        const users = Array.isArray(topData) ? topData : (topData?.users ?? []);
        setTopPurchase(users);
      }
    });
  }, []);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-surface-400">加载中...</div>;
  if (!dash) return <div className="flex min-h-[60vh] items-center justify-center text-surface-400">加载失败</div>;

  const compositionItems = [
    { label: '新购', value: dash.newPurchaseRevenue, color: '#165dff' },
    { label: '续费', value: dash.renewalRevenue, color: '#00b42a' },
    { label: '充值', value: dash.rechargeRevenue, color: '#165dff' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="财务概览"
        subtitle="营收、毛利、用户排行与流水总览"
        actions={
          <Link
            href="/admin/finance/transactions"
            className="flex h-8 items-center rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500"
          >
            查看全部流水
          </Link>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="累计营收" value={`¥${fmt(dash.totalRevenue)}`} sub={`年度 ¥${fmt(dash.yearRevenue)}`} growth={dash.yoyGrowth} color="#1d2129" />
        <StatCard label="本月营收" value={`¥${fmt(dash.monthRevenue)}`} sub={`上月 ¥${fmt(dash.lastMonthRevenue)}`} growth={dash.momGrowth} color="#165dff" />
        <StatCard label="累计毛利" value={`¥${fmt(dash.totalProfit)}`} sub={`本月毛利 ¥${fmt(dash.monthProfit)}`} color={dash.totalProfit >= 0 ? '#00b42a' : '#f53f3f'} />
        <StatCard label="总订单数" value={String(dash.totalOrders)} sub={`本月 ${dash.monthOrders} 单`} />
      </div>

      {/* Tab bar */}
      <FilterBar>
        {([['overview', '总览'], ['profit', '利润分析'], ['users', '用户排行']] as const).map(([key, label]) => (
          <TabChip key={key} active={tab === key} onClick={() => setTab(key)}>
            {label}
          </TabChip>
        ))}
      </FilterBar>

      {/* Tab: Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Revenue composition */}
          <div className="admin-panel" style={{ padding: 20 }}>
            <p className="text-sm font-semibold mb-3.5">收入构成</p>
            <CompositionBar items={compositionItems} />
          </div>

          {/* Trends */}
          <div className="admin-panel" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p className="text-sm font-semibold">收支趋势</p>
              <select
                value={trendMonths}
                onChange={(e) => setTrendMonths(Number(e.target.value))}
                className="input py-1 text-xs w-auto"
              >
                <option value={6}>近6个月</option>
                <option value={12}>近12个月</option>
                <option value={24}>近24个月</option>
              </select>
            </div>
            <TrendsChart data={trends} />
          </div>

          {/* Agent sales */}
          <div style={{ background: '#fff', border: '1px solid #e5e6eb', padding: 20, gridColumn: '1 / -1' }}>
            <p className="text-sm font-semibold mb-3.5">代理销售统计</p>
            {dash.agentSales.length === 0 ? (
              <p className="text-[13px] text-surface-400 text-center py-5">暂无代理数据</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr className="bg-surface-50">
                    {['代理商', '客户数', '订单数', '累计营收', '本月营收', '占比'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === '代理商' ? 'left' : 'right', color: '#4e5969', fontWeight: 600, borderBottom: '1px solid #e5e6eb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dash.agentSales.map(a => (
                    <tr key={a.agentId} className="border-b border-surface-100 hover:bg-surface-50/60 transition-colors">
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1d2129' }}>{a.agentName}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: '#4e5969' }}>{a.userCount}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: '#4e5969' }}>{a.orderCount}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600 }}>¥{fmt(a.totalRevenue)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-brand-500">¥{fmt(a.monthRevenue)}</td>
                      <td className="px-3 py-3 text-right text-surface-400">
                        {dash.totalRevenue > 0 ? ((a.totalRevenue / dash.totalRevenue) * 100).toFixed(1) + '%' : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>

          {/* Recent orders */}
          <div style={{ background: '#fff', border: '1px solid #e5e6eb', padding: 20, gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p className="text-sm font-semibold">最近订单</p>
              <Link href="/admin/orders" className="text-xs text-brand-500 hover:underline">全部 &rarr;</Link>
            </div>
            {dash.recentOrders.length === 0 ? (
              <p className="text-[13px] text-surface-400 text-center py-5">暂无订单</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr className="bg-surface-50">
                    {['订单号', '用户', '类型', '金额', '状态', '时间'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === '金额' ? 'right' : 'left', color: '#4e5969', fontWeight: 600, borderBottom: '1px solid #e5e6eb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dash.recentOrders.map(o => (
                    <tr key={o.id} className="border-b border-surface-100 hover:bg-surface-50/60 transition-colors">
                      <td className="px-3 py-3 font-mono text-xs text-surface-500">{o.orderNo}</td>
                      <td className="px-3 py-3 text-surface-600">{o.userName || o.userEmail}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-4 px-2 py-0.5 text-[11px] font-semibold ${o.isRenewal ? 'bg-semantic-success-light text-semantic-success-dark' : 'bg-semantic-info-light text-brand-600'}`}>
                          {o.isRenewal ? '续费' : '新购'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-surface-600">¥{fmt(o.totalPrice)}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-4 px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE_STYLE[o.status] || "bg-surface-100 text-surface-400"}`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-surface-400">
                        {new Date(o.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Profit */}
      {tab === 'profit' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Profit summary */}
          <div className="admin-panel" style={{ padding: 20 }}>
            <p className="text-sm font-semibold mb-3.5">毛利汇总</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: '累计营收（售价合计）', value: dash.grossRevenue, color: '#165dff' },
                { label: '累计成本（进价合计）', value: dash.totalCost, color: '#ff7d00' },
                { label: '累计毛利', value: dash.totalProfit, color: '#00b42a', bold: true },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between py-2 border-b border-surface-100">
                  <span className="text-[13px] text-surface-500">{r.label}</span>
                  <span className={`text-[15px] ${r.bold ? "font-extrabold" : "font-semibold"} ${r.color === "#165dff" ? "text-brand-500" : r.color === "#ff7d00" ? "text-semantic-warning" : r.color === "#00b42a" ? "text-semantic-success" : "text-surface-600"}`}>¥{fmt(r.value)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between py-1">
                <span className="text-[13px] text-surface-500">毛利率</span>
                <span className="text-[15px] font-bold text-surface-600">
                  {dash.grossRevenue > 0 ? ((dash.totalProfit / dash.grossRevenue) * 100).toFixed(1) + '%' : '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Monthly profit chart */}
          <div className="admin-panel" style={{ padding: 20 }}>
            <p className="text-sm font-semibold mb-3.5">近12个月利润趋势</p>
            {profit?.byMonth ? <ProfitByMonth data={profit.byMonth} /> : <p className="text-[13px] text-surface-400">加载中...</p>}
          </div>

          {/* By region */}
          <TopTable
            title="按地区利润排行"
            rows={(profit?.byRegion ?? []).map(r => ({ label: r.region, value: r.profit, sub: `营收 ¥${fmt(r.revenue)}` }))}
            color="#165dff"
          />

          {/* By supplier */}
          <TopTable
            title="按供应商利润排行"
            rows={(profit?.bySupplier ?? []).map(r => ({ label: r.supplier, value: r.profit, sub: `营收 ¥${fmt(r.revenue)}` }))}
            color="#00b42a"
          />
        </div>
      )}

      {/* Tab: Users */}
      {tab === 'users' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <TopTable
            title="充值 TOP 10"
            rows={topRecharge.map(u => ({ label: u.name || u.email, value: u.amount, sub: `${u.txCount} 次充值` }))}
            color="#165dff"
          />
          <TopTable
            title="消费 TOP 10"
            rows={topPurchase.map(u => ({ label: u.name || u.email, value: u.amount, sub: `${u.txCount} 笔订单` }))}
            color="#00b42a"
          />
        </div>
      )}
    </div>
  );
}
