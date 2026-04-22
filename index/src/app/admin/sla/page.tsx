'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { PageHeader, Panel, useToast } from '@/components/admin/layout';

type SLAConfig = {
  id: string;
  region: string;
  supplier: string;
  availabilityTarget: number;
  firstResponseTargetMin: number;
  recoveryTargetMin: number;
  compensationMultiplier: number;
};

type SLAViolation = {
  id: string;
  type: 'FIRST_RESPONSE' | 'RECOVERY' | 'AVAILABILITY';
  source: 'MANUAL' | 'AUTO';
  status: 'OPEN' | 'CONFIRMED' | 'WAIVED';
  region: string;
  supplier: string;
  ticketId?: string;
  serverId?: string;
  orderId?: string;
  durationMinutes: number;
  targetMinutes: number;
  compensationAmount: number;
  createdAt: string;
};

type ReportItem = {
  region: string;
  supplier: string;
  totalTickets: number;
  firstResponseBreaches: number;
  recoveryBreaches: number;
  availabilityBreaches: number;
  firstResponseRate: number;
  totalCompensation: number;
};

type ReportSummary = {
  totalBreaches: number;
  totalCompensation: number;
  firstResponseRate: number;
};

const TYPE_LABEL: Record<string, string> = {
  FIRST_RESPONSE: '首响超时',
  RECOVERY: '故障恢复超时',
  AVAILABILITY: '可用性违约',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: '待处理',
  CONFIRMED: '已确认',
  WAIVED: '已豁免',
};

export default function AdminSLAPage() {
  const toast = useToast();
  const [configs, setConfigs] = useState<SLAConfig[]>([]);
  const [violations, setViolations] = useState<SLAViolation[]>([]);
  const [reportItems, setReportItems] = useState<ReportItem[]>([]);
  const [reportSummary, setReportSummary] = useState<ReportSummary>({ totalBreaches: 0, totalCompensation: 0, firstResponseRate: 100 });
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const violationsSeq = useRef(0);
  const reportSeq = useRef(0);

  const [cfgDraft, setCfgDraft] = useState({
    region: '',
    supplier: '',
    availabilityTarget: '99.9',
    firstResponseTargetMin: '30',
    recoveryTargetMin: '240',
    compensationMultiplier: '1.5',
  });

  const [manualDraft, setManualDraft] = useState({
    type: 'FIRST_RESPONSE',
    region: '',
    supplier: '',
    ticketId: '',
    serverId: '',
    orderId: '',
    durationMinutes: '60',
    targetMinutes: '',
    note: '',
  });

  const loadConfigs = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/sla/configs');
      const json = await res.json();
      if (json.success) {
        setConfigs(json.data.items || []);
      } else {
        toast.error('加载 SLA 配置失败', json.error?.message ?? '未知错误');
      }
    } catch {
      toast.error('加载 SLA 配置失败');
    }
  }, [toast]);

  const loadViolations = useCallback(async (nextPage = 1) => {
    const seq = ++violationsSeq.current;
    try {
      const res = await apiFetch(`/api/admin/sla/violations?page=${nextPage}&pageSize=20`);
      const json = await res.json();
      if (seq !== violationsSeq.current) return;
      if (json.success) {
        setViolations(json.data.items || []);
        setTotal(json.data.total || 0);
        setPage(nextPage);
      } else {
        toast.error('加载违约记录失败', json.error?.message ?? '未知错误');
      }
    } catch {
      if (seq === violationsSeq.current) toast.error('加载违约记录失败');
    }
  }, [toast]);

  const loadReport = useCallback(async (m: string) => {
    const seq = ++reportSeq.current;
    try {
      const res = await apiFetch(`/api/admin/sla/reports?month=${encodeURIComponent(m)}`);
      const json = await res.json();
      if (seq !== reportSeq.current) return;
      if (json.success) {
        setReportItems(json.data.items || []);
        setReportSummary(json.data.summary || { totalBreaches: 0, totalCompensation: 0, firstResponseRate: 100 });
      } else {
        toast.error('加载报表失败', json.error?.message ?? '未知错误');
      }
    } catch {
      if (seq === reportSeq.current) toast.error('加载报表失败');
    }
  }, [toast]);

  useEffect(() => {
    void loadConfigs();
    void loadViolations(1);
  }, [loadConfigs, loadViolations]);

  useEffect(() => {
    void loadReport(month);
  }, [loadReport, month]);

  const submitConfig = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch('/api/admin/sla/configs', {
        method: 'POST',
        body: JSON.stringify({
          region: cfgDraft.region.trim(),
          supplier: cfgDraft.supplier.trim(),
          availabilityTarget: Number(cfgDraft.availabilityTarget),
          firstResponseTargetMin: Number(cfgDraft.firstResponseTargetMin),
          recoveryTargetMin: Number(cfgDraft.recoveryTargetMin),
          compensationMultiplier: Number(cfgDraft.compensationMultiplier),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('SLA 配置已保存');
        await loadConfigs();
      } else {
        toast.error('保存 SLA 配置失败', json.error?.message ?? '未知错误');
      }
    } catch {
      toast.error('保存 SLA 配置失败');
    } finally {
      setSaving(false);
    }
  };

  const submitManualViolation = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await apiFetch('/api/admin/sla/violations', {
        method: 'POST',
        body: JSON.stringify({
          type: manualDraft.type,
          region: manualDraft.region.trim(),
          supplier: manualDraft.supplier.trim(),
          ticketId: manualDraft.ticketId.trim() || undefined,
          serverId: manualDraft.serverId.trim() || undefined,
          orderId: manualDraft.orderId.trim() || undefined,
          durationMinutes: Number(manualDraft.durationMinutes),
          targetMinutes: manualDraft.targetMinutes.trim() ? Number(manualDraft.targetMinutes) : 0,
          note: manualDraft.note.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setManualDraft((v) => ({ ...v, ticketId: '', serverId: '', orderId: '', note: '' }));
        toast.success('违约记录已创建');
        await loadViolations(1);
        await loadReport(month);
      } else {
        toast.error('创建违约记录失败', json.error?.message ?? '未知错误');
      }
    } catch {
      toast.error('创建违约记录失败');
    } finally {
      setCreating(false);
    }
  };

  const scanTimeout = async () => {
    try {
      const res = await apiFetch('/api/admin/sla/violations/scan', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        toast.success('自动识别完成', `新增 ${json.data?.newViolations ?? 0} 条违约`);
        await loadViolations(1);
        await loadReport(month);
      } else {
        toast.error('自动识别失败', json.error?.message ?? '未知错误');
      }
    } catch {
      toast.error('自动识别失败');
    }
  };

  const updateStatus = async (id: string, status: 'OPEN' | 'CONFIRMED' | 'WAIVED') => {
    try {
      const res = await apiFetch(`/api/admin/sla/violations/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('状态已更新');
        await loadViolations(page);
        await loadReport(month);
      } else {
        toast.error('更新状态失败', json.error?.message ?? '未知错误');
      }
    } catch {
      toast.error('更新状态失败');
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-5">
      <PageHeader
        title="SLA 配置"
        subtitle="按地区和供应商配置 SLA，跟踪违约并输出月度达标率与补偿金额"
        actions={<button onClick={scanTimeout} className="h-8 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600">自动识别首响超时</button>}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="SLA 配置" description="地区和供应商都留空时表示全局默认配置。">
          <form onSubmit={submitConfig} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input value={cfgDraft.region} onChange={(e) => setCfgDraft({ ...cfgDraft, region: e.target.value })} placeholder="地区（可空）" className="input" />
              <input value={cfgDraft.supplier} onChange={(e) => setCfgDraft({ ...cfgDraft, supplier: e.target.value })} placeholder="供应商（可空）" className="input" />
              <input value={cfgDraft.availabilityTarget} onChange={(e) => setCfgDraft({ ...cfgDraft, availabilityTarget: e.target.value })} placeholder="可用性目标%" className="input" />
              <input value={cfgDraft.firstResponseTargetMin} onChange={(e) => setCfgDraft({ ...cfgDraft, firstResponseTargetMin: e.target.value })} placeholder="首响分钟" className="input" />
              <input value={cfgDraft.recoveryTargetMin} onChange={(e) => setCfgDraft({ ...cfgDraft, recoveryTargetMin: e.target.value })} placeholder="恢复分钟" className="input" />
              <input value={cfgDraft.compensationMultiplier} onChange={(e) => setCfgDraft({ ...cfgDraft, compensationMultiplier: e.target.value })} placeholder="赔偿倍率" className="input" />
            </div>
            <button disabled={saving} className="h-8 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white disabled:opacity-50">{saving ? '保存中...' : '保存配置'}</button>
          </form>

          <div className="mt-3 overflow-x-auto rounded-8 border border-surface-100">
            <table className="w-full">
              <thead className="border-b border-surface-100 bg-surface-50/60">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">地区</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">供应商</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">可用性</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">首响</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">恢复</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">倍率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {configs.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-sm text-surface-400">暂无配置</td></tr>
                ) : configs.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2.5 text-sm text-surface-500">{c.region || '全局'}</td>
                    <td className="px-3 py-2.5 text-sm text-surface-500">{c.supplier || '全供应商'}</td>
                    <td className="px-3 py-2.5 text-sm text-surface-500">{c.availabilityTarget}%</td>
                    <td className="px-3 py-2.5 text-sm text-surface-500">{c.firstResponseTargetMin}m</td>
                    <td className="px-3 py-2.5 text-sm text-surface-500">{c.recoveryTargetMin}m</td>
                    <td className="px-3 py-2.5 text-sm text-surface-500">x{c.compensationMultiplier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="手动记录违约">
          <form onSubmit={submitManualViolation} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select value={manualDraft.type} onChange={(e) => setManualDraft({ ...manualDraft, type: e.target.value })} className="input">
                <option value="FIRST_RESPONSE">首响超时</option>
                <option value="RECOVERY">恢复超时</option>
                <option value="AVAILABILITY">可用性违约</option>
              </select>
              <input value={manualDraft.durationMinutes} onChange={(e) => setManualDraft({ ...manualDraft, durationMinutes: e.target.value })} placeholder="实际耗时(分钟)" className="input" />
              <input value={manualDraft.region} onChange={(e) => setManualDraft({ ...manualDraft, region: e.target.value })} placeholder="地区(可空)" className="input" />
              <input value={manualDraft.supplier} onChange={(e) => setManualDraft({ ...manualDraft, supplier: e.target.value })} placeholder="供应商(可空)" className="input" />
              <input value={manualDraft.ticketId} onChange={(e) => setManualDraft({ ...manualDraft, ticketId: e.target.value })} placeholder="工单 ID(可空)" className="input" />
              <input value={manualDraft.serverId} onChange={(e) => setManualDraft({ ...manualDraft, serverId: e.target.value })} placeholder="服务器 ID(可空)" className="input" />
              <input value={manualDraft.orderId} onChange={(e) => setManualDraft({ ...manualDraft, orderId: e.target.value })} placeholder="订单 ID(可空)" className="input" />
              <input value={manualDraft.targetMinutes} onChange={(e) => setManualDraft({ ...manualDraft, targetMinutes: e.target.value })} placeholder="目标分钟(可空)" className="input" />
            </div>
            <textarea value={manualDraft.note} onChange={(e) => setManualDraft({ ...manualDraft, note: e.target.value })} placeholder="备注（可选）" className="input h-20 resize-none" />
            <button disabled={creating} className="h-8 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white disabled:opacity-50">{creating ? '提交中...' : '记录违约'}</button>
          </form>
        </Panel>
      </div>

      <Panel title="月度达标率报表" description="首响达标率 = 1 - 首响违约数 / 月工单总数">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Metric title="违约总数" value={String(reportSummary.totalBreaches)} />
            <Metric title="首响达标率" value={`${reportSummary.firstResponseRate.toFixed(2)}%`} />
            <Metric title="补偿金额" value={`¥${reportSummary.totalCompensation.toFixed(2)}`} />
          </div>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input h-8 w-44" />
        </div>

        <div className="overflow-x-auto rounded-8 border border-surface-100">
          <table className="w-full min-w-[860px]">
            <thead className="border-b border-surface-100 bg-surface-50/60">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">地区</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">供应商</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">工单数</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">首响违约</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">恢复违约</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">可用性违约</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">首响达标率</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">补偿金额</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-50">
              {reportItems.length === 0 ? (
                <tr><td className="px-3 py-6 text-sm text-surface-400" colSpan={8}>暂无报表数据</td></tr>
              ) : reportItems.map((it, idx) => (
                <tr key={`${it.region}-${it.supplier}-${idx}`}>
                  <td className="px-3 py-2.5 text-sm text-surface-500">{it.region || '未归属'}</td>
                  <td className="px-3 py-2.5 text-sm text-surface-500">{it.supplier || '未归属'}</td>
                  <td className="px-3 py-2.5 text-sm text-surface-500">{it.totalTickets}</td>
                  <td className="px-3 py-2.5 text-sm text-surface-500">{it.firstResponseBreaches}</td>
                  <td className="px-3 py-2.5 text-sm text-surface-500">{it.recoveryBreaches}</td>
                  <td className="px-3 py-2.5 text-sm text-surface-500">{it.availabilityBreaches}</td>
                  <td className="px-3 py-2.5 text-sm text-surface-500">{it.firstResponseRate.toFixed(2)}%</td>
                  <td className="px-3 py-2.5 text-sm text-surface-500">¥{it.totalCompensation.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="违约记录">
        <div className="overflow-x-auto rounded-8 border border-surface-100">
          <table className="w-full min-w-[980px]">
            <thead className="border-b border-surface-100 bg-surface-50/60">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">时间</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">类型</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">范围</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">耗时/目标</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">补偿</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">来源</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">状态</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-surface-400">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-50">
              {violations.length === 0 ? (
                <tr><td className="px-3 py-6 text-sm text-surface-400" colSpan={8}>暂无违约记录</td></tr>
              ) : violations.map((v) => (
                <tr key={v.id}>
                  <td className="px-3 py-2.5 text-sm text-surface-500">{new Date(v.createdAt).toLocaleString('zh-CN')}</td>
                  <td className="px-3 py-2.5 text-sm text-surface-500">{TYPE_LABEL[v.type] || v.type}</td>
                  <td className="px-3 py-2.5 text-sm text-surface-500">{`${v.region || '未归属'} / ${v.supplier || '未归属'}`}</td>
                  <td className="px-3 py-2.5 text-sm text-surface-500">{v.durationMinutes} / {v.targetMinutes} min</td>
                  <td className="px-3 py-2.5 text-sm text-surface-500">¥{v.compensationAmount.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-sm text-surface-500">{v.source}</td>
                  <td className="px-3 py-2.5 text-sm text-surface-500">{STATUS_LABEL[v.status] || v.status}</td>
                  <td className="px-3 py-2.5">
                    {v.status !== 'CONFIRMED' && <button onClick={() => updateStatus(v.id, 'CONFIRMED')} className="mr-3 text-xs text-semantic-success hover:underline">确认</button>}
                    {v.status !== 'WAIVED' && <button onClick={() => updateStatus(v.id, 'WAIVED')} className="text-xs text-semantic-warning hover:underline">豁免</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-surface-400">共 {total} 条</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => void loadViolations(page - 1)} className="h-8 rounded-6 border border-surface-200 px-3 text-[12px] text-surface-500 disabled:opacity-40">上一页</button>
            <span className="text-xs text-surface-400">{page} / {pageCount}</span>
            <button disabled={page >= pageCount} onClick={() => void loadViolations(page + 1)} className="h-8 rounded-6 border border-surface-200 px-3 text-[12px] text-surface-500 disabled:opacity-40">下一页</button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-8 border border-surface-100 bg-surface-50 px-4 py-3">
      <p className="text-xs text-surface-400">{title}</p>
      <p className="mt-1 text-xl font-semibold text-surface-600">{value}</p>
    </div>
  );
}
