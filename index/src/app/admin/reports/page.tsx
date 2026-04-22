'use client';

import { useState } from 'react';
import { apiFetch, extractApiError } from '@/lib/api-client';
import { PageHeader, Panel, EmptyState, SkeletonTable, useToast } from '@/components/admin/layout';

interface WeekStats {
  startDate: string;
  endDate: string;
  newUsers: number;
  revenue: number;
  orderCount: number;
  ticketCount: number;
  renewalCount: number;
}

interface Changes {
  newUsers: string;
  revenue: string;
  orderCount: string;
  ticketCount: string;
  renewalCount: string;
}

interface ReportData {
  thisWeek: WeekStats;
  lastWeek: WeekStats;
  changes: Changes;
  insights: string;
}

function ChangeBadge({ value }: { value: string }) {
  const isPositive = value.startsWith('+');
  const isNegative = value.startsWith('-');
  return (
    <span
      className={`rounded-4 px-1.5 py-0.5 text-xs font-medium ${
        isPositive
          ? 'bg-semantic-success-light text-semantic-success-dark'
          : isNegative
            ? 'bg-semantic-danger-light text-semantic-danger'
            : 'bg-surface-100 text-surface-400'
      }`}
    >
      {value}
    </span>
  );
}

function StatRow({
  label,
  thisVal,
  lastVal,
  change,
  prefix = '',
  suffix = '',
}: {
  label: string;
  thisVal: number;
  lastVal: number;
  change: string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-surface-50 py-3 last:border-0">
      <span className="text-sm text-surface-500">{label}</span>
      <div className="flex items-center gap-4">
        <span className="text-xs text-surface-400">
          上周 {prefix}
          {lastVal.toFixed(lastVal % 1 === 0 ? 0 : 2)}
          {suffix}
        </span>
        <span className="text-sm font-semibold text-surface-600">
          {prefix}
          {thisVal.toFixed(thisVal % 1 === 0 ? 0 : 2)}
          {suffix}
        </span>
        <ChangeBadge value={change} />
      </div>
    </div>
  );
}

export default function AdminReportsPage() {
  const toast = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    setLoading(true);
    setError('');
    setData(null);
    try {
      const res = await apiFetch(`/api/admin/reports/weekly?date=${date}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        toast.success('周报已生成');
      } else {
        const text = json.error?.message || extractApiError(json.error, '生成失败');
        setError(text);
        toast.error('生成失败', text);
      }
    } catch {
      setError('请求失败');
      toast.error('请求失败');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-5">
      <PageHeader title="AI 周报" subtitle="基于指定日期前 7 天数据生成 AI 运营分析报告" />

      <Panel title="报告参数">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs text-surface-400">报告截止日期</label>
            <input
              type="date"
              className="input w-44"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <button
            onClick={generate}
            disabled={loading}
            className="h-8 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'AI 生成中...' : '生成周报'}
          </button>
        </div>
      </Panel>

      {loading && <SkeletonTable rows={6} columns={3} />}

      {!loading && error && (
        <Panel>
          <EmptyState title={error} description="请调整日期后重试" />
        </Panel>
      )}

      {!loading && data && (
        <>
          <Panel title={`周期：${data.thisWeek.startDate} ~ ${data.thisWeek.endDate}`}>
            <p className="mb-4 text-xs text-surface-400">
              对比上周（{data.lastWeek.startDate} ~ {data.lastWeek.endDate}）
            </p>
            <StatRow
              label="新增用户"
              thisVal={data.thisWeek.newUsers}
              lastVal={data.lastWeek.newUsers}
              change={data.changes.newUsers}
              suffix=" 人"
            />
            <StatRow
              label="营业收入"
              thisVal={data.thisWeek.revenue}
              lastVal={data.lastWeek.revenue}
              change={data.changes.revenue}
              prefix="¥"
            />
            <StatRow
              label="有效订单"
              thisVal={data.thisWeek.orderCount}
              lastVal={data.lastWeek.orderCount}
              change={data.changes.orderCount}
              suffix=" 单"
            />
            <StatRow
              label="新增工单"
              thisVal={data.thisWeek.ticketCount}
              lastVal={data.lastWeek.ticketCount}
              change={data.changes.ticketCount}
              suffix=" 张"
            />
            <StatRow
              label="续费订单"
              thisVal={data.thisWeek.renewalCount}
              lastVal={data.lastWeek.renewalCount}
              change={data.changes.renewalCount}
              suffix=" 单"
            />
          </Panel>

          <Panel title="AI 运营洞察">
            {data.insights ? (
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-surface-500">{data.insights}</pre>
            ) : (
              <EmptyState title="AI 洞察不可用" description="请检查 AI 配置" />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
