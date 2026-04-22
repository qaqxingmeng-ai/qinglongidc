'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '@/lib/api-client';
import { EmptyState, PageHeader, Panel, SkeletonTable, StickyFooter, useToast } from '@/components/admin/layout';
import { easeOut } from '@/components/admin/motion';

interface SLAViolation {
  id: string;
  type: 'FIRST_RESPONSE' | 'RECOVERY' | 'AVAILABILITY';
  source: 'MANUAL' | 'AUTO';
  status: 'OPEN' | 'CONFIRMED' | 'WAIVED';
  region: string;
  supplier: string;
  ticketId?: string;
  serverId?: string;
  durationMinutes: number;
  targetMinutes: number;
  compensationAmount: number;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  FIRST_RESPONSE: '首次响应超时',
  RECOVERY: '故障恢复超时',
  AVAILABILITY: '可用性不达标',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: '待处理',
  CONFIRMED: '已确认',
  WAIVED: '已豁免',
};

const STATUS_COLOR: Record<string, string> = {
  OPEN: 'bg-semantic-warning-light text-semantic-warning-dark',
  CONFIRMED: 'bg-semantic-danger-light text-semantic-danger',
  WAIVED: 'bg-surface-100 text-surface-400',
};

export default function SLAViolationsPage() {
  const toast = useToast();
  const [violations, setViolations] = useState<SLAViolation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async (p: number) => {
    const s = ++seq.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: '20' });
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      const res = await apiFetch(`/api/admin/sla/violations?${params}`);
      const json = await res.json();
      if (s !== seq.current) return;
      if (json.success) {
        setViolations(json.data?.items ?? []);
        setTotal(json.data?.total ?? 0);
      }
    } catch {}
    setLoading(false);
  }, [status, type]);

  useEffect(() => { load(page); }, [load, page]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await apiFetch('/api/admin/sla/violations/scan', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        toast.success(`扫描完成，发现 ${json.data?.created ?? 0} 条新违约`);
        load(1);
        setPage(1);
      } else {
        toast.error(json.message || '扫描失败');
      }
    } catch {
      toast.error('请求失败');
    }
    setScanning(false);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await apiFetch(`/api/admin/sla/violations/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.success) { toast.success('状态已更新'); load(page); }
      else toast.error(json.message || '更新失败');
    } catch {
      toast.error('请求失败');
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-5">
      <PageHeader
        title="SLA 监控"
        subtitle={`共 ${total} 条违约记录`}
        actions={
          <button onClick={handleScan} disabled={scanning} className="rounded-6 bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors">
            {scanning ? '扫描中...' : '扫描工单超时'}
          </button>
        }
      />

      <div className="flex flex-wrap gap-3">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="rounded-6 border border-surface-200 px-3 py-1.5 text-sm text-surface-500 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
        >
          <option value="">全部状态</option>
          <option value="OPEN">待处理</option>
          <option value="CONFIRMED">已确认</option>
          <option value="WAIVED">已豁免</option>
        </select>
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="rounded-6 border border-surface-200 px-3 py-1.5 text-sm text-surface-500 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
        >
          <option value="">全部类型</option>
          <option value="FIRST_RESPONSE">首次响应</option>
          <option value="RECOVERY">故障恢复</option>
          <option value="AVAILABILITY">可用性</option>
        </select>
      </div>

      {loading ? (
        <SkeletonTable rows={6} columns={7} />
      ) : violations.length === 0 ? (
        <EmptyState title="暂无违约记录" description="系统暂未检测到 SLA 违约。" />
      ) : (
        <>
          <Panel className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-left text-xs font-medium text-surface-400 uppercase tracking-wider">
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">来源</th>
                  <th className="px-4 py-3">地区</th>
                  <th className="px-4 py-3">供应商</th>
                  <th className="px-4 py-3">超时</th>
                  <th className="px-4 py-3 text-right">赔偿</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">时间</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {violations.map((v, i) => (
                  <motion.tr key={v.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }} className="border-b border-surface-50 hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3 text-surface-600 text-xs">{TYPE_LABEL[v.type] ?? v.type}</td>
                    <td className="px-4 py-3 text-surface-400 text-xs">{v.source === 'AUTO' ? '自动' : '手动'}</td>
                    <td className="px-4 py-3 text-surface-500">{v.region}</td>
                    <td className="px-4 py-3 text-surface-500">{v.supplier}</td>
                    <td className="px-4 py-3 text-surface-500 font-mono text-xs">{v.durationMinutes}m / {v.targetMinutes}m</td>
                    <td className="px-4 py-3 text-right font-mono text-surface-600">¥{v.compensationAmount.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-4 px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[v.status]}`}>
                        {STATUS_LABEL[v.status] ?? v.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-surface-400">{new Date(v.createdAt).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {v.status === 'OPEN' && (
                        <>
                          <button onClick={() => updateStatus(v.id, 'CONFIRMED')} className="text-brand-500 hover:text-brand-600 text-xs mr-2">确认</button>
                          <button onClick={() => updateStatus(v.id, 'WAIVED')} className="text-surface-400 hover:text-surface-600 text-xs">豁免</button>
                        </>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {totalPages > 1 && (
            <StickyFooter>
              <span className="text-xs text-surface-400">共 {total} 条</span>
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-8 rounded-6 border border-surface-200 px-3 text-[12px] text-surface-500 disabled:opacity-40">上一页</button>
                <span className="text-xs text-surface-400">{page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-8 rounded-6 border border-surface-200 px-3 text-[12px] text-surface-500 disabled:opacity-40">下一页</button>
              </div>
            </StickyFooter>
          )}
        </>
      )}
    </div>
  );
}
