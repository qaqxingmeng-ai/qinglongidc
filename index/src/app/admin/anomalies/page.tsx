'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { EmptyState, FilterBar, PageHeader, Panel, SkeletonTable, StickyFooter, useToast } from '@/components/admin/layout';

interface AnomalyAlert {
  id: string;
  type: string;
  title: string;
  detail?: string;
  status: 'OPEN' | 'RESOLVED';
  relatedId?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

interface AlertsResponse {
  alerts: AnomalyAlert[];
  total: number;
  totalPages: number;
  page: number;
}

const TYPE_LABELS: Record<string, string> = {
  REVENUE_ANOMALY: '收入异常',
  TICKET_SPIKE: '工单暴增',
  USER_CHURN_RISK: '流失预警',
  SUSPICIOUS_RECHARGE: '异常充值',
};

const TYPE_COLORS: Record<string, string> = {
  REVENUE_ANOMALY: 'bg-semantic-warning-light text-semantic-warning-dark',
  TICKET_SPIKE: 'bg-semantic-warning-light text-semantic-warning-dark',
  USER_CHURN_RISK: 'bg-semantic-info-light text-brand-600',
  SUSPICIOUS_RECHARGE: 'bg-semantic-danger-light text-semantic-danger',
};

export default function AnomaliesPage() {
  const toast = useToast();
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [alertType, setAlertType] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const requestSeq = useRef(0);

  const load = useCallback(async (p: number, s: string, t: string) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: '20' });
      if (s) params.set('status', s);
      if (t) params.set('type', t);
      const res = await apiFetch(`/api/admin/anomalies?${params.toString()}`);
      const json = await res.json();
      if (seq !== requestSeq.current) return;
      if (json.success) {
        setData(json.data);
        return;
      }
      toast.error('加载告警失败', json.error?.message ?? '未知错误');
    } catch {
      if (seq === requestSeq.current) toast.error('加载告警失败');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load(page, status, alertType);
  }, [load, page, status, alertType]);

  const resolve = async (id: string) => {
    try {
      const res = await apiFetch(`/api/admin/anomalies/${id}/resolve`, { method: 'PATCH' });
      const json = await res.json();
      if (json.success) {
        toast.success('告警已标记处理');
        void load(page, status, alertType);
      } else {
        toast.error('处理失败', json.error?.message ?? '未知错误');
      }
    } catch {
      toast.error('处理失败');
    }
  };

  const scan = async () => {
    setScanning(true);
    try {
      const res = await apiFetch('/api/admin/anomalies/scan', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        toast.success('检测完成', `新增 ${json.data?.newAlerts ?? 0} 条告警`);
        setPage(1);
        void load(1, status, alertType);
      } else {
        toast.error('检测失败', json.error?.message ?? '未知错误');
      }
    } catch {
      toast.error('检测失败');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="异常检测"
        subtitle="收入波动、工单暴增、用户流失、异常充值实时检测"
        actions={
          <button
            onClick={scan}
            disabled={scanning}
            className="h-8 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {scanning ? '检测中...' : '立即检测'}
          </button>
        }
      />

      <FilterBar>
        <select
          className="input h-8 w-32 text-xs"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">全部状态</option>
          <option value="OPEN">待处理</option>
          <option value="RESOLVED">已处理</option>
        </select>
        <select
          className="input h-8 w-36 text-xs"
          value={alertType}
          onChange={(e) => {
            setPage(1);
            setAlertType(e.target.value);
          }}
        >
          <option value="">全部类型</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </FilterBar>

      {loading ? (
        <SkeletonTable rows={6} columns={5} />
      ) : (
        <Panel noPadding>
          {data && data.alerts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full">
                <thead className="border-b border-surface-100 bg-surface-50/60">
                  <tr>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">类型</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">告警内容</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">状态</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">检测时间</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-surface-400">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {data.alerts.map((a) => (
                    <tr key={a.id} className="hover:bg-surface-50/50">
                      <td className="px-4 py-2.5">
                        <span className={`rounded-4 px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[a.type] ?? 'bg-surface-100 text-surface-500'}`}>
                          {TYPE_LABELS[a.type] ?? a.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-sm text-surface-500">{a.title}</p>
                        {a.detail && <p className="mt-0.5 text-xs text-surface-400">{a.detail}</p>}
                      </td>
                      <td className="px-4 py-2.5">
                        {a.status === 'OPEN' ? (
                          <span className="rounded-4 bg-semantic-warning-light px-2 py-0.5 text-xs font-medium text-semantic-warning-dark">待处理</span>
                        ) : (
                          <span className="rounded-4 bg-semantic-success-light px-2 py-0.5 text-xs font-medium text-semantic-success-dark">已处理</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-surface-400">{new Date(a.createdAt).toLocaleString('zh-CN')}</td>
                      <td className="px-4 py-2.5">
                        {a.status === 'OPEN' && (
                          <button onClick={() => resolve(a.id)} className="text-xs text-brand-500 hover:underline">
                            标记已处理
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="暂无告警记录" description="可点击右上角立即检测" />
          )}
        </Panel>
      )}

      <StickyFooter show={!!data && data.totalPages > 1 && !loading}>
        <span className="text-xs text-surface-400">共 {data?.total ?? 0} 条</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1}
            className="h-8 rounded-6 border border-surface-200 px-3 text-[12px] text-surface-500 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-xs text-surface-400">{page} / {data?.totalPages ?? 1}</span>
          <button
            onClick={() => setPage((prev) => Math.min(data?.totalPages ?? 1, prev + 1))}
            disabled={page >= (data?.totalPages ?? 1)}
            className="h-8 rounded-6 border border-surface-200 px-3 text-[12px] text-surface-500 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </StickyFooter>
    </div>
  );
}
