'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

type Summary = {
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  avgLatencyMs: number;
};

type DailyTrend = { date: string; calls: number };
type EndpointStat = { method: string; path: string; calls: number; avgLatencyMs: number };
type TokenStat = {
  tokenId: string;
  name: string;
  scope: string;
  dailyLimit: number;
  lastUsedAt?: string;
  calls: number;
  tokenSuffix: string;
  expiresAt?: string;
};
type RecentLog = {
  id: string;
  tokenId: string;
  tokenName: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip: string;
  createdAt: string;
};

export default function ApiUsagePage() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary>({ totalCalls: 0, successCalls: 0, errorCalls: 0, avgLatencyMs: 0 });
  const [dailyTrend, setDailyTrend] = useState<DailyTrend[]>([]);
  const [endpointStats, setEndpointStats] = useState<EndpointStat[]>([]);
  const [tokenStats, setTokenStats] = useState<TokenStat[]>([]);
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/dashboard/api-tokens/stats');
      const json = await res.json();
      if (json.success) {
        setSummary(json.data.summary || { totalCalls: 0, successCalls: 0, errorCalls: 0, avgLatencyMs: 0 });
        setDailyTrend(json.data.dailyTrend || []);
        setEndpointStats(json.data.endpointStats || []);
        setTokenStats(json.data.tokenStats || []);
        setRecentLogs(json.data.recentLogs || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const successRate = useMemo(() => {
    if (!summary.totalCalls) return 0;
    return Math.round((summary.successCalls / summary.totalCalls) * 1000) / 10;
  }, [summary]);

  if (loading) {
    return <div className="p-6 text-sm text-surface-400">加载中...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-surface-600">API 调用统计</h1>
        <p className="text-sm text-surface-400 mt-1">近 30 天 Token 调用趋势、接口分布与最近调用日志。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card title="总调用量" value={summary.totalCalls.toLocaleString('zh-CN')} />
        <Card title="成功调用" value={summary.successCalls.toLocaleString('zh-CN')} />
        <Card title="错误调用" value={summary.errorCalls.toLocaleString('zh-CN')} />
        <Card title="平均耗时" value={`${summary.avgLatencyMs} ms`} sub={`成功率 ${successRate}%`} />
      </div>

      <section className="bg-white border border-surface-100 rounded-8 p-5">
        <h2 className="text-sm font-semibold text-surface-600 mb-3">日调用趋势（近 30 天）</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-surface-400">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">日期</th>
                <th className="px-4 py-2.5 text-left font-medium">调用量</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dailyTrend.length === 0 ? (
                <tr><td className="px-4 py-6 text-surface-400" colSpan={2}>暂无数据</td></tr>
              ) : dailyTrend.map((row) => (
                <tr key={row.date}>
                  <td className="px-4 py-2.5 text-surface-500">{row.date}</td>
                  <td className="px-4 py-2.5 text-surface-600 font-medium">{row.calls.toLocaleString('zh-CN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-surface-100 rounded-8 p-5">
          <h2 className="text-sm font-semibold text-surface-600 mb-3">接口调用排行</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-surface-400">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">方法</th>
                  <th className="px-3 py-2.5 text-left font-medium">路径</th>
                  <th className="px-3 py-2.5 text-left font-medium">次数</th>
                  <th className="px-3 py-2.5 text-left font-medium">均耗时</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {endpointStats.length === 0 ? (
                  <tr><td className="px-3 py-6 text-surface-400" colSpan={4}>暂无数据</td></tr>
                ) : endpointStats.map((row) => (
                  <tr key={`${row.method}-${row.path}`}>
                    <td className="px-3 py-2.5 text-xs font-mono text-brand-600">{row.method}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-surface-500">{row.path}</td>
                    <td className="px-3 py-2.5 text-surface-600 font-medium">{row.calls}</td>
                    <td className="px-3 py-2.5 text-surface-500">{row.avgLatencyMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-surface-100 rounded-8 p-5">
          <h2 className="text-sm font-semibold text-surface-600 mb-3">Token 使用排行</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-surface-400">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">Token</th>
                  <th className="px-3 py-2.5 text-left font-medium">权限</th>
                  <th className="px-3 py-2.5 text-left font-medium">日限额</th>
                  <th className="px-3 py-2.5 text-left font-medium">调用量</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tokenStats.length === 0 ? (
                  <tr><td className="px-3 py-6 text-surface-400" colSpan={4}>暂无 Token</td></tr>
                ) : tokenStats.map((row) => (
                  <tr key={row.tokenId}>
                    <td className="px-3 py-2.5 text-surface-500">{row.name} <span className="text-xs text-surface-400">...{row.tokenSuffix}</span></td>
                    <td className="px-3 py-2.5 text-xs text-surface-500">{row.scope}</td>
                    <td className="px-3 py-2.5 text-surface-500">{row.dailyLimit}</td>
                    <td className="px-3 py-2.5 text-surface-600 font-medium">{row.calls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bg-white border border-surface-100 rounded-8 p-5">
        <h2 className="text-sm font-semibold text-surface-600 mb-3">最近调用记录</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-surface-400">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium">时间</th>
                <th className="px-3 py-2.5 text-left font-medium">Token</th>
                <th className="px-3 py-2.5 text-left font-medium">请求</th>
                <th className="px-3 py-2.5 text-left font-medium">状态</th>
                <th className="px-3 py-2.5 text-left font-medium">耗时</th>
                <th className="px-3 py-2.5 text-left font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentLogs.length === 0 ? (
                <tr><td className="px-3 py-6 text-surface-400" colSpan={6}>暂无记录</td></tr>
              ) : recentLogs.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2.5 text-xs text-surface-400">{new Date(row.createdAt).toLocaleString('zh-CN')}</td>
                  <td className="px-3 py-2.5 text-surface-500">{row.tokenName}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-surface-500">{row.method} {row.path}</td>
                  <td className="px-3 py-2.5 text-surface-500">{row.statusCode}</td>
                  <td className="px-3 py-2.5 text-surface-500">{row.durationMs} ms</td>
                  <td className="px-3 py-2.5 text-xs text-surface-400">{row.ip || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-surface-100 rounded-8 p-4">
      <p className="text-xs text-surface-400">{title}</p>
      <p className="text-2xl font-semibold text-surface-600 mt-1">{value}</p>
      {sub ? <p className="text-xs text-surface-400 mt-1">{sub}</p> : null}
    </div>
  );
}
