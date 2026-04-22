'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch, isApiSuccess, pickApiData, extractApiError } from '@/lib/api-client';
import { useToast } from '@/components/admin/layout';

interface Server {
  id: string;
  ip: string | null;
  status: string;
  startDate: string | null;
  expireDate: string | null;
  daysUntilExpire: number | null;
  user: { name: string; email: string };
  agent: { name: string } | null;
  product: { name: string; region: string; cpuModel: string | null } | null;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  PENDING: { label: '待开通', cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  ACTIVE: { label: '运行中', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  SUSPENDED: { label: '已暂停', cls: 'bg-red-50 text-red-700 border border-red-200' },
  EXPIRED: { label: '已过期', cls: 'bg-surface-50 text-surface-400 border border-surface-200' },
};

function urgencyBadge(days: number | null) {
  if (days === null) return { text: '-', cls: 'text-surface-300' };
  if (days < 0) return { text: `过期${Math.abs(days)}天`, cls: 'bg-red-50 text-red-700 border border-red-200' };
  if (days <= 3) return { text: `${days}天`, cls: 'bg-red-50 text-red-700 border border-red-200 font-semibold' };
  if (days <= 7) return { text: `${days}天`, cls: 'bg-amber-50 text-amber-700 border border-amber-200' };
  return { text: `${days}天`, cls: 'bg-surface-50 text-surface-500 border border-surface-200' };
}

const EXPIRE_WINDOWS = [
  { value: '0', label: '全部' },
  { value: '3', label: '3天内' },
  { value: '7', label: '7天内' },
  { value: '30', label: '30天内' },
  { value: '60', label: '60天内' },
];

export default function ServersRenewalPage() {
  const toast = useToast();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [expireIn, setExpireIn] = useState('30');
  const [renewModal, setRenewModal] = useState<Server | null>(null);
  const [months, setMonths] = useState(1);
  const [renewing, setRenewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (Number(expireIn) > 0) params.set('expireIn', expireIn);
      const res = await apiFetch(`/api/admin/servers?${params.toString()}`, { method: 'GET' });
      const json = await res.json();
      if (isApiSuccess(json)) {
        const data = pickApiData<Server[] | { servers?: Server[] }>(json, ['servers']);
        const list = Array.isArray(data) ? data : (Array.isArray(data?.servers) ? data.servers : []);
        setServers(list);
      }
    } finally {
      setLoading(false);
    }
  }, [expireIn]);

  useEffect(() => { load(); }, [load]);

  const openRenew = (s: Server) => {
    setMonths(1);
    setRenewModal(s);
  };

  const submitRenew = async () => {
    if (!renewModal || months < 1) return;
    setRenewing(true);
    try {
      const res = await apiFetch(`/api/admin/servers/${renewModal.id}/renew`, {
        method: 'POST',
        body: JSON.stringify({ months }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(extractApiError(json.error, '续费失败'));
      setRenewModal(null);
      toast.success(`已续费 ${months} 个月，订单已计入财务`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '续费失败');
    } finally {
      setRenewing(false);
    }
  };

  const expiredCount = servers.filter((s) => s.daysUntilExpire !== null && s.daysUntilExpire < 0).length;
  const urgentCount = servers.filter((s) => s.daysUntilExpire !== null && s.daysUntilExpire >= 0 && s.daysUntilExpire <= 7).length;

  const sortedServers = servers.slice().sort((a, b) => {
    const da = a.daysUntilExpire ?? 9999;
    const db = b.daysUntilExpire ?? 9999;
    return da - db;
  });

  return (
    <div className="admin-page">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="page-title">续费管理</h1>
          <p className="text-xs text-surface-400 mt-1">管理即将到期和已过期的服务器实例，支持批量续费操作。</p>
        </div>
      </div>

      {/* 统计概览 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="admin-panel">
          <div className="admin-panel-body py-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center">
              <svg className="h-4.5 w-4.5 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" /></svg>
            </div>
            <div>
              <p className="text-[11px] text-surface-400">总实例数</p>
              <p className="text-lg font-bold text-surface-700">{servers.length}</p>
            </div>
          </div>
        </div>
        <div className="admin-panel">
          <div className="admin-panel-body py-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center">
              <svg className="h-4.5 w-4.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <p className="text-[11px] text-surface-400">已过期</p>
              <p className="text-lg font-bold text-red-600">{expiredCount}</p>
            </div>
          </div>
        </div>
        <div className="admin-panel">
          <div className="admin-panel-body py-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center">
              <svg className="h-4.5 w-4.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            </div>
            <div>
              <p className="text-[11px] text-surface-400">7天内到期</p>
              <p className="text-lg font-bold text-amber-600">{urgentCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 到期窗口筛选 */}
      <div className="admin-panel mb-4">
        <div className="admin-panel-body py-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-surface-400 mr-1">到期窗口</span>
            {EXPIRE_WINDOWS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setExpireIn(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  expireIn === opt.value
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'bg-surface-50 text-surface-500 hover:bg-surface-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 服务器列表 */}
      {loading ? (
        <div className="admin-panel">
          <div className="admin-panel-body space-y-3 py-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-12 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ) : servers.length === 0 ? (
        <div className="admin-panel">
          <div className="empty-state py-20">
            <svg className="h-10 w-10 text-surface-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
            <p className="text-surface-400 text-sm">该窗口内无到期实例</p>
          </div>
        </div>
      ) : (
        <div className="admin-panel overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-surface-100 bg-surface-50/60 text-[11px] text-surface-400 font-medium">
            <div className="col-span-3">商品 / 地区</div>
            <div className="col-span-2">用户 / 代理</div>
            <div className="col-span-2">IP</div>
            <div className="col-span-1">状态</div>
            <div className="col-span-2">到期时间</div>
            <div className="col-span-1">剩余</div>
            <div className="col-span-1 text-right">操作</div>
          </div>
          {sortedServers.map((s) => {
            const status = STATUS_MAP[s.status] || { label: s.status, cls: '' };
            const urgency = urgencyBadge(s.daysUntilExpire);
            return (
              <div key={s.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-surface-50 last:border-b-0 hover:bg-surface-50/60 transition text-xs items-center">
                <div className="col-span-3 min-w-0">
                  <p className="font-medium text-surface-600 truncate leading-tight">{s.product?.name || '-'}</p>
                  <p className="text-[11px] text-surface-400 mt-0.5">{s.product?.region || '-'}</p>
                </div>
                <div className="col-span-2 min-w-0">
                  <p className="text-surface-500 truncate leading-tight">{s.user?.name || '-'}</p>
                  <p className="text-[11px] text-surface-400 mt-0.5 truncate">{s.agent?.name || '直客'}</p>
                </div>
                <div className="col-span-2 min-w-0">
                  <p className="font-mono text-[11px] text-surface-500">{s.ip || '-'}</p>
                  <p className="text-[11px] text-surface-400 mt-0.5 truncate">{s.product?.cpuModel || '-'}</p>
                </div>
                <div className="col-span-1">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${status.cls}`}>{status.label}</span>
                </div>
                <div className="col-span-2 text-[11px] text-surface-400">
                  {s.expireDate ? new Date(s.expireDate).toLocaleDateString() : '-'}
                </div>
                <div className="col-span-1">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${urgency.cls}`}>{urgency.text}</span>
                </div>
                <div className="col-span-1 text-right">
                  <button
                    onClick={() => openRenew(s)}
                    className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-brand-50 text-brand-600 hover:bg-brand-100 transition-colors"
                  >
                    续费
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 续费弹窗 */}
      {renewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setRenewModal(null); }}>
          <div className="-xl w-full max-w-md modal-panel">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
              <div>
                <p className="font-semibold text-surface-700">确认续费</p>
                <p className="text-xs text-surface-400 mt-0.5">{renewModal.product?.name || '-'} · {renewModal.user?.name || '-'}</p>
              </div>
              <button onClick={() => setRenewModal(null)} className="text-surface-400 hover:text-surface-600 text-xl leading-none transition-colors">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="label">续费月数</label>
                <div className="flex gap-2 flex-wrap">
                  {[1, 3, 6, 12].map((m) => (
                    <button
                      key={m}
                      onClick={() => setMonths(m)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        months === m ? 'bg-brand-500 text-white shadow-sm' : 'bg-surface-50 text-surface-500 hover:bg-surface-100'
                      }`}
                    >
                      {m} 个月
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={months}
                    onChange={(e) => setMonths(Math.max(1, Math.min(60, Number(e.target.value))))}
                    className="input w-24 text-center"
                    placeholder="自定义"
                  />
                </div>
              </div>
              <div className="bg-surface-50 rounded-lg px-4 py-3 text-xs text-surface-400 space-y-1">
                <p>当前到期：{renewModal.expireDate ? new Date(renewModal.expireDate).toLocaleDateString() : '无'}</p>
                <p>续费后自动延长 {months} 个月，系统将生成对应续费订单并计入财务。</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-surface-100">
              <button onClick={() => setRenewModal(null)} className="btn-secondary btn-sm">取消</button>
              <button onClick={submitRenew} disabled={renewing} className="btn-primary btn-sm min-w-[80px] disabled:opacity-50">
                {renewing ? '续费中...' : `确认续费 ${months} 个月`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
