'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { PageHeader, Panel, SkeletonTable } from '@/components/admin/layout';

interface TrendPoint {
  date: string;
  revenue: number;
  orders: number;
  newUsers: number;
  activeUsers: number;
}

export default function FinanceTrendsPage() {
  const [data, setData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('30d');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/finance/trends?range=${range}`);
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        const list = Array.isArray(d) ? d : (d?.points ?? d?.trends ?? d?.items ?? d?.list ?? []);
        const normalized: TrendPoint[] = (Array.isArray(list) ? list : []).map((raw: unknown) => {
          const p = (raw ?? {}) as Record<string, unknown>;
          const num = (v: unknown) => (typeof v === 'number' ? v : Number(v)) || 0;
          return {
            date: String(p.date ?? p.month ?? p.day ?? ''),
            revenue: num(p.revenue) || (num(p.purchase) + num(p.recharge)),
            orders: num(p.orders),
            newUsers: num(p.newUsers),
            activeUsers: num(p.activeUsers),
          };
        });
        setData(normalized);
      }
    } catch {}
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const totalOrders = data.reduce((s, d) => s + d.orders, 0);
  const maxRevenue = data.length > 0 ? Math.max(...data.map((d) => d.revenue), 1) : 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="财务趋势"
        subtitle="查看收入、订单及用户增长趋势。"
        actions={
          <div className="flex gap-1.5">
            {['7d', '30d', '90d'].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-6 px-3 py-1.5 text-xs font-medium transition-colors ${range === r ? 'bg-brand-500 text-white' : 'bg-surface-100 text-surface-500 hover:bg-surface-200'}`}
              >
                {r === '7d' ? '7 天' : r === '30d' ? '30 天' : '90 天'}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Panel className="flex flex-col items-center justify-center gap-1 py-5">
          <span className="text-2xl font-bold text-brand-500">¥{totalRevenue.toLocaleString()}</span>
          <span className="text-xs text-surface-400">总收入</span>
        </Panel>
        <Panel className="flex flex-col items-center justify-center gap-1 py-5">
          <span className="text-2xl font-bold text-surface-600">{totalOrders.toLocaleString()}</span>
          <span className="text-xs text-surface-400">总订单</span>
        </Panel>
        <Panel className="flex flex-col items-center justify-center gap-1 py-5">
          <span className="text-2xl font-bold text-surface-600">{data.length > 0 ? (totalRevenue / data.length).toFixed(0) : 0}</span>
          <span className="text-xs text-surface-400">日均收入</span>
        </Panel>
      </div>

      {loading ? (
        <SkeletonTable rows={6} columns={5} />
      ) : (
        <>
          <Panel>
            <h3 className="mb-3 text-sm font-semibold text-surface-600">收入走势</h3>
            <div className="flex items-end gap-[2px]" style={{ height: 160 }}>
              {data.map((d, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-brand-400 hover:bg-brand-500 transition-colors relative group"
                  style={{ height: `${(d.revenue / maxRevenue) * 100}%`, minHeight: 2 }}
                  title={`${d.date}: ¥${d.revenue.toLocaleString()}`}
                >
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[10px] text-surface-500 pointer-events-none">
                    ¥{d.revenue.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-surface-400">
              <span>{data[0]?.date ?? ''}</span>
              <span>{data[data.length - 1]?.date ?? ''}</span>
            </div>
          </Panel>

          <Panel className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-left text-xs font-medium text-surface-400 uppercase tracking-wider">
                  <th className="px-4 py-3">日期</th>
                  <th className="px-4 py-3 text-right">收入</th>
                  <th className="px-4 py-3 text-right">订单</th>
                  <th className="px-4 py-3 text-right">新增用户</th>
                  <th className="px-4 py-3 text-right">活跃用户</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d, i) => (
                  <tr key={i} className="border-b border-surface-50 hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3 text-surface-600">{d.date}</td>
                    <td className="px-4 py-3 text-right font-mono text-surface-600">¥{d.revenue.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-surface-500">{d.orders}</td>
                    <td className="px-4 py-3 text-right text-surface-500">{d.newUsers}</td>
                    <td className="px-4 py-3 text-right text-surface-500">{d.activeUsers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </div>
  );
}
