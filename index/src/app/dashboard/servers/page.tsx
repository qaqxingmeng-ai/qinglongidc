'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiFetch, extractApiError } from '@/lib/api-client';

interface ServerTag {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

interface Server {
  id: string;
  ip: string | null;
  status: string;
  config: string;
  startDate: string | null;
  expireDate: string | null;
  autoRenew: boolean;
  monthlyPrice: number;
  tags: ServerTag[];
  product: { name: string; region: string; memory?: string; storage?: string; bandwidth?: string } | null;
}

interface ViewerProfile {
  agentName?: string | null;
  agentEmail?: string | null;
  agentPhone?: string | null;
  isDirectSale?: boolean;
  balance?: number;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  PENDING: { label: '待开通', cls: 'badge-yellow' },
  ACTIVE: { label: '运行中', cls: 'badge-green' },
  SUSPENDED: { label: '已暂停', cls: 'badge-red' },
  EXPIRED: { label: '已过期', cls: 'text-surface-400 bg-surface-100 px-2 py-0.5 rounded text-xs' },
};

const TAG_COLOR_CLS: Record<string, string> = {
  blue: 'bg-semantic-info-light text-brand-600 border-blue-100',
  green: 'bg-semantic-success-light text-semantic-success-dark border-emerald-100',
  red: 'bg-semantic-danger-light text-red-700 border-red-100',
  orange: 'bg-orange-50 text-orange-700 border-orange-100',
  purple: 'bg-violet-50 text-violet-700 border-violet-100',
  cyan: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  gray: 'bg-surface-50 text-surface-500 border-surface-100',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-100',
};

export default function ServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [tags, setTags] = useState<ServerTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<'AND' | 'OR'>('OR');
  const [profile, setProfile] = useState<ViewerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [renewTarget, setRenewTarget] = useState<Server | null>(null);
  const [renewPeriod, setRenewPeriod] = useState<1 | 3 | 6 | 12>(1);
  const [renewMode, setRenewMode] = useState<'balance' | 'invoice'>('balance');
  const [renewLoading, setRenewLoading] = useState(false);
  const [renewMsg, setRenewMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [tagTarget, setTagTarget] = useState<Server | null>(null);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);
  const [togglingAutoRenew, setTogglingAutoRenew] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | 'active' | 'expired'>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'expireDate' | 'name'>('expireDate');

  const loadServers = async (opts?: { tagIds?: string[]; mode?: 'AND' | 'OR' }) => {
    const qs = new URLSearchParams();
    const ids = opts?.tagIds || [];
    if (ids.length > 0) {
      qs.set('tagIds', ids.join(','));
      qs.set('tagMode', opts?.mode || 'OR');
    }
    const url = qs.toString() ? `/api/servers?${qs.toString()}` : '/api/servers';

    const r = await apiFetch(url, { method: 'GET' });
    const json = await r.json();
    if (json.success) {
      setServers(json.data.servers || []);
    }
  };

  const loadTags = async () => {
    const r = await apiFetch('/api/dashboard/server-tags', { method: 'GET' });
    const json = await r.json();
    if (json.success) {
      setTags(json.data.tags || []);
    }
  };

  useEffect(() => {
    Promise.all([
      loadServers(),
      loadTags(),
      apiFetch('/api/auth/me', { method: 'GET' }).then((r) => r.json()),
    ]).then(([, , json]) => {
      if (json.success) setProfile(json.data);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    loadServers({ tagIds: selectedTagIds, mode: tagMode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTagIds, tagMode]);

  const daysLeft = (d: string | null) => {
    if (!d) return null;
    return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  };

  const filteredServers = servers
    .filter(s => {
      if (tab === 'active') return s.status === 'ACTIVE';
      if (tab === 'expired') return s.status === 'EXPIRED' || (s.expireDate && daysLeft(s.expireDate)! < 0);
      return true;
    })
    .filter(s => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (s.ip?.toLowerCase().includes(q)) || (s.product?.name?.toLowerCase().includes(q));
    })
    .sort((a, b) => {
      if (sortBy === 'expireDate') {
        const da = a.expireDate ? new Date(a.expireDate).getTime() : Infinity;
        const db = b.expireDate ? new Date(b.expireDate).getTime() : Infinity;
        return da - db;
      }
      return (a.product?.name || '').localeCompare(b.product?.name || '');
    });

  const tabCounts = {
    all: servers.length,
    active: servers.filter(s => s.status === 'ACTIVE').length,
    expired: servers.filter(s => s.status === 'EXPIRED' || (s.expireDate && daysLeft(s.expireDate)! < 0)).length,
  };

  const toggleAutoRenew = async (server: Server) => {
    setTogglingAutoRenew(server.id);
    try {
      const res = await apiFetch(`/api/dashboard/servers/${server.id}/auto-renew`, {
        method: 'PATCH',
        body: JSON.stringify({ autoRenew: !server.autoRenew }),
      });
      const json = await res.json();
      if (json.success) {
        setServers(prev => prev.map(s => s.id === server.id ? { ...s, autoRenew: !server.autoRenew } : s));
      }
    } finally {
      setTogglingAutoRenew(null);
    }
  };

  const discountRates: Record<number, number> = { 1: 1.0, 3: 0.95, 6: 0.90, 12: 0.85 };
  const discountLabels: Record<number, string> = { 1: '月付', 3: '季付 95折', 6: '半年 9折', 12: '年付 85折' };

  const openRenew = (server: Server) => {
    setRenewTarget(server);
    setRenewPeriod(1);
    setRenewMode('balance');
    setRenewMsg(null);
  };

  const handleRenew = async () => {
    if (!renewTarget) return;
    setRenewLoading(true);
    setRenewMsg(null);
    try {
      const res = await apiFetch(`/api/dashboard/servers/${renewTarget.id}/renew`, {
        method: 'POST',
        body: JSON.stringify({ period: renewPeriod, mode: renewMode }),
      });
      const json = await res.json();
      const payload = json.data ?? json;
      if (json.success || payload.success) {
        if (renewMode === 'invoice') {
          setRenewMsg({ type: 'ok', text: `已生成账单（单号 ${payload.orderNo || ''}），请等待管理员确认付款。` });
        } else {
          setRenewMsg({ type: 'ok', text: `续费成功！新到期时间：${payload.newExpire ? new Date(payload.newExpire).toLocaleDateString() : '—'}` });
          loadServers({ tagIds: selectedTagIds, mode: tagMode });
        }
      } else {
        setRenewMsg({ type: 'err', text: extractApiError(json.error, '续费失败') });
      }
    } catch {
      setRenewMsg({ type: 'err', text: '网络错误，请重试' });
    } finally {
      setRenewLoading(false);
    }
  };

  const openTagEditor = (server: Server) => {    setTagTarget(server);
    setTagDraft((server.tags || []).map((t) => t.id));
  };

  const toggleDraftTag = (tagId: string) => {
    setTagDraft((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId);
      }
      if (prev.length >= 5) {
        return prev;
      }
      return prev.concat(tagId);
    });
  };

  const saveServerTags = async () => {
    if (!tagTarget) return;
    setSavingTags(true);
    try {
      const res = await apiFetch(`/api/dashboard/servers/${tagTarget.id}/tags`, {
        method: 'PUT',
        body: JSON.stringify({ tagIds: tagDraft }),
      });
      const json = await res.json();
      if (json.success) {
        const nextTags: ServerTag[] = json.data.tags || [];
        setServers((prev) => prev.map((s) => (s.id === tagTarget.id ? { ...s, tags: nextTags } : s)));
        setTagTarget(null);
      }
    } finally {
      setSavingTags(false);
    }
  };

  if (loading) return <div className="text-surface-400 py-20 text-center">加载中...</div>;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="section-title">我的产品</h1>
          {!loading && <p className="text-xs text-surface-400 mt-1">共 {servers.length} 台</p>}
        </div>
        <Link href="/servers" className="btn-secondary btn-sm w-full justify-center sm:w-auto">查看价格表</Link>
      </div>

      {/* Tabs + Search */}
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          {([['all', '全部'], ['active', '运行中'], ['expired', '已过期']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === key ? 'bg-blue-100 text-brand-600' : 'bg-surface-50 text-surface-400 hover:bg-surface-100'
              }`}
            >
              {label} ({tabCounts[key]})
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <input
            type="text"
            placeholder="搜索 IP 或产品名"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input w-full text-xs sm:w-48"
          />
          <select value={sortBy} onChange={e => setSortBy(e.target.value as 'expireDate' | 'name')} className="input w-28 text-xs">
            <option value="expireDate">到期排序</option>
            <option value="name">名称排序</option>
          </select>
          <Link href="/dashboard/servers/calendar" className="btn-secondary btn-sm">日历视图</Link>
          <Link href="/dashboard/server-tags" className="btn-secondary btn-sm">标签管理</Link>
        </div>
      </div>

      <div className="rounded-8 border border-surface-100 bg-white p-3 mb-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-xs text-surface-400">标签筛选</p>
          <div className="inline-flex rounded-lg border border-surface-200 p-0.5 text-xs">
            <button
              onClick={() => setTagMode('OR')}
              className={`px-2 py-1 rounded ${tagMode === 'OR' ? 'bg-semantic-info-light text-brand-600' : 'text-surface-400'}`}
            >
              OR
            </button>
            <button
              onClick={() => setTagMode('AND')}
              className={`px-2 py-1 rounded ${tagMode === 'AND' ? 'bg-semantic-info-light text-brand-600' : 'text-surface-400'}`}
            >
              AND
            </button>
          </div>
        </div>
        {tags.length === 0 ? (
          <p className="text-xs text-surface-400">还没有标签，先到标签管理页创建。</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const active = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => {
                    setSelectedTagIds((prev) => prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : prev.concat(tag.id));
                  }}
                  className={`px-2 py-1 rounded-full border text-xs transition ${
                    active
                      ? TAG_COLOR_CLS[tag.color] || TAG_COLOR_CLS.blue
                      : 'bg-white text-surface-400 border-surface-200 hover:bg-surface-50'
                  }`}
                >
                  {tag.name}
                </button>
              );
            })}
            {selectedTagIds.length > 0 && (
              <button
                onClick={() => setSelectedTagIds([])}
                className="px-2 py-1 rounded-full border border-surface-200 text-xs text-surface-400 hover:bg-surface-50"
              >
                清空
              </button>
            )}
          </div>
        )}
      </div>

      {filteredServers.length === 0 ? (
        <div className="text-center py-20 text-surface-400">
          {servers.length === 0 ? (
            <>
              <p className="mb-4">暂无服务器</p>
              <Link href="/servers" className="btn-primary btn-sm">查看价格表</Link>
            </>
          ) : (
            <p>没有匹配的服务器</p>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {filteredServers.map((s) => {
              const days = daysLeft(s.expireDate);
              const status = STATUS_MAP[s.status] || { label: s.status, cls: '' };
              const expireSoon = days !== null && days <= 7 && s.status === 'ACTIVE';
              const canRenew = s.status === 'ACTIVE' || s.status === 'EXPIRED';
              return (
                <div key={s.id} className="rounded-8 border border-surface-100 bg-white p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-surface-600">{s.product?.name || '-'}</p>
                      <p className="mt-1 text-xs text-surface-400">
                        {s.ip ? <span className="font-mono">{s.ip}</span> : <span className="text-surface-300">IP 待分配</span>}
                        {s.product?.region && <span className="ml-1">· {s.product.region}</span>}
                      </p>
                    </div>
                    <span className={status.cls}>{status.label}</span>
                  </div>

                  {s.tags?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {s.tags.map((tag) => (
                        <span key={tag.id} className={`rounded border px-1.5 py-0.5 text-[10px] ${TAG_COLOR_CLS[tag.color] || TAG_COLOR_CLS.blue}`}>
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-3 rounded-8 bg-surface-50 px-3 py-3 text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-surface-400">到期</p>
                      {s.expireDate ? (
                        <>
                          <p className={`mt-1 ${expireSoon ? 'font-medium text-semantic-danger' : 'text-surface-500'}`}>
                            {new Date(s.expireDate).toLocaleDateString()}
                          </p>
                          {days !== null && <p className={`mt-1 ${expireSoon ? 'text-semantic-danger' : 'text-surface-400'}`}>{days >= 0 ? `${days} 天后` : '已过期'}</p>}
                        </>
                      ) : (
                        <p className="mt-1 text-surface-300">—</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-surface-400">自动续费</p>
                      <div className="mt-2">
                        <button
                          onClick={() => toggleAutoRenew(s)}
                          disabled={togglingAutoRenew === s.id}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                            s.autoRenew ? 'bg-semantic-info-light' : 'bg-surface-200'
                          } ${togglingAutoRenew === s.id ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${s.autoRenew ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    <button onClick={() => openTagEditor(s)} className="text-surface-400 hover:underline">标签</button>
                    {canRenew && (
                      <button onClick={() => openRenew(s)} className={`font-medium hover:underline ${expireSoon ? 'text-semantic-danger' : 'text-brand-500'}`}>
                        续费
                      </button>
                    )}
                    <Link href="/dashboard/tickets" className="text-surface-400 hover:underline">提交工单</Link>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-hidden rounded-8 border border-surface-100 bg-white md:block">
            <div className="grid grid-cols-12 gap-2 border-b border-surface-100 bg-surface-50/50 px-4 py-1.5 text-[11px] font-medium text-surface-400">
              <div className="col-span-4">产品 / IP</div>
              <div className="col-span-2">状态</div>
              <div className="col-span-2">到期时间</div>
              <div className="col-span-2">自动续费</div>
              <div className="col-span-2 text-right">操作</div>
            </div>
            {filteredServers.map((s) => {
              const days = daysLeft(s.expireDate);
              const status = STATUS_MAP[s.status] || { label: s.status, cls: '' };
              const expireSoon = days !== null && days <= 7 && s.status === 'ACTIVE';
              const canRenew = s.status === 'ACTIVE' || s.status === 'EXPIRED';
              return (
                <div key={s.id} className="grid grid-cols-12 gap-2 border-b border-surface-50 px-4 py-2.5 text-xs transition last:border-b-0 hover:bg-semantic-info-light/20 items-center">
                  <div className="col-span-4 min-w-0">
                    <p className="truncate font-medium leading-tight text-surface-600">{s.product?.name || '-'}</p>
                    <p className="mt-0.5 text-[11px] text-surface-400">
                      {s.ip ? <span className="font-mono">{s.ip}</span> : <span className="text-surface-300">IP 待分配</span>}
                      {s.product?.region && <span className="ml-1">· {s.product.region}</span>}
                    </p>
                    {s.tags?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {s.tags.map((tag) => (
                          <span key={tag.id} className={`rounded border px-1.5 py-0.5 text-[10px] ${TAG_COLOR_CLS[tag.color] || TAG_COLOR_CLS.blue}`}>
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <span className={status.cls}>{status.label}</span>
                  </div>
                  <div className="col-span-2 text-[11px]">
                    {s.expireDate ? (
                      <>
                        <div className={expireSoon ? 'font-medium text-semantic-danger' : 'text-surface-400'}>
                          {new Date(s.expireDate).toLocaleDateString()}
                        </div>
                        {days !== null && (
                          <div className={expireSoon ? 'text-semantic-danger' : 'text-surface-400'}>
                            {days >= 0 ? `${days} 天后` : '已过期'}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-surface-300">—</span>
                    )}
                  </div>
                  <div className="col-span-2">
                    <button
                      onClick={() => toggleAutoRenew(s)}
                      disabled={togglingAutoRenew === s.id}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                        s.autoRenew ? 'bg-semantic-info-light' : 'bg-surface-200'
                      } ${togglingAutoRenew === s.id ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                      title={s.autoRenew ? '自动续费已开启' : '开启自动续费'}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        s.autoRenew ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-3">
                    <button onClick={() => openTagEditor(s)} className="text-[11px] text-surface-400 hover:underline">标签</button>
                    {canRenew && (
                      <button
                        onClick={() => openRenew(s)}
                        className={`text-[11px] font-medium hover:underline ${expireSoon ? 'text-semantic-danger' : 'text-brand-500'}`}
                      >
                        续费
                      </button>
                    )}
                    <Link href="/dashboard/tickets" className="text-[11px] text-surface-400 hover:underline">提交工单</Link>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tagTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center px-0 sm:items-center sm:px-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setTagTarget(null); }}
        >
          <div className="w-full max-w-md rounded-t-[28px] bg-white shadow-modal sm:rounded-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
              <div>
                <p className="font-semibold text-surface-600">设置服务器标签</p>
                <p className="text-xs text-surface-400 mt-0.5">{tagTarget.product?.name || '-'} · {tagTarget.ip || '待分配'}</p>
              </div>
              <button onClick={() => setTagTarget(null)} className="text-surface-400 hover:text-surface-500 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5">
              {tags.length === 0 ? (
                <p className="text-sm text-surface-400">暂无标签，请先去标签管理页创建。</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {tags.map((tag) => {
                    const active = tagDraft.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        onClick={() => toggleDraftTag(tag.id)}
                        className={`text-left px-2 py-1.5 rounded-lg border text-xs ${
                          active
                            ? TAG_COLOR_CLS[tag.color] || TAG_COLOR_CLS.blue
                            : 'bg-white border-surface-200 text-surface-500 hover:bg-surface-50'
                        }`}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-surface-400 mt-3">已选择 {tagDraft.length}/5</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-surface-100 px-6 py-4 pb-safe">
              <button onClick={() => setTagTarget(null)} className="btn-secondary btn-sm">取消</button>
              <button onClick={saveServerTags} disabled={savingTags} className="btn-primary btn-sm disabled:opacity-60">
                {savingTags ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Renew Modal */}
      {renewTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center px-0 sm:items-center sm:px-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setRenewTarget(null); } }}
        >
          <div className="w-full max-w-md rounded-t-[28px] bg-white shadow-modal sm:rounded-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
              <div>
                <p className="font-semibold text-surface-600">服务器续费</p>
                <p className="text-xs text-surface-400 mt-0.5">{renewTarget.product?.name || '-'} · {renewTarget.ip || '待分配'}</p>
              </div>
              <button onClick={() => setRenewTarget(null)} className="text-surface-400 hover:text-surface-500 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {renewMsg ? (
                <div className={`rounded-8 border p-4 text-sm ${renewMsg.type === 'ok' ? 'border-emerald-100 bg-semantic-success-light text-semantic-success-dark' : 'border-red-100 bg-semantic-danger-light text-red-700'}`}>
                  {renewMsg.text}
                </div>
              ) : (
                <>
                  <div>
                    <label className="label mb-2">当前到期</label>
                    <p className="text-sm text-surface-500">
                      {renewTarget.expireDate ? new Date(renewTarget.expireDate).toLocaleDateString() : '未知'}
                    </p>
                  </div>
                  <div>
                    <label className="label mb-2">续费周期</label>
                    <div className="grid grid-cols-4 gap-2">
                      {([1, 3, 6, 12] as const).map((p) => {
                        const mp = renewTarget.monthlyPrice || 0;
                        const total = Math.round(mp * p * discountRates[p] * 100) / 100;
                        return (
                          <button
                            key={p}
                            onClick={() => setRenewPeriod(p)}
                            className={`flex flex-col items-center py-2 px-1 rounded-8 border text-xs transition ${
                              renewPeriod === p ? 'border-blue-500 bg-semantic-info-light text-brand-600' : 'border-surface-200 text-surface-500 hover:border-blue-300'
                            }`}
                          >
                            <span className="font-semibold">{p === 12 ? '1年' : `${p}个月`}</span>
                            <span className="text-[10px] mt-0.5 text-surface-400">{discountLabels[p].split(' ')[1] || ''}</span>
                            <span className="mt-1 font-medium">¥{total.toFixed(2)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="label mb-2">支付方式</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['balance', 'invoice'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setRenewMode(m)}
                          className={`py-2.5 px-3 rounded-8 border text-sm transition ${
                            renewMode === m ? 'border-blue-500 bg-semantic-info-light text-brand-600' : 'border-surface-200 text-surface-500 hover:border-blue-300'
                          }`}
                        >
                          {m === 'balance' ? '余额支付' : '生成账单'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(() => {
                    const mp = renewTarget.monthlyPrice || 0;
                    const total = Math.round(mp * renewPeriod * discountRates[renewPeriod] * 100) / 100;
                    const bal = profile?.balance ?? 0;
                    const insufficient = renewMode === 'balance' && bal < total;
                    return (
                      <div className="rounded-8 border border-surface-100 bg-surface-50 p-4 text-sm space-y-2">
                        <div className="flex justify-between text-surface-400">
                          <span>月单价</span><span>¥{mp.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-surface-400">
                          <span>周期</span><span>{renewPeriod} 个月 × {(discountRates[renewPeriod] * 10).toFixed(0)}折</span>
                        </div>
                        <div className="flex justify-between font-semibold text-surface-600 border-t border-surface-200 pt-2">
                          <span>合计</span><span>¥{total.toFixed(2)}</span>
                        </div>
                        {renewMode === 'balance' && (
                          <>
                            <div className={`flex justify-between text-xs ${insufficient ? 'text-semantic-danger' : 'text-surface-400'}`}>
                              <span>当前余额</span><span>¥{bal.toFixed(2)}</span>
                            </div>
                            {!insufficient && (
                              <div className="flex justify-between text-xs text-surface-400">
                                <span>续费后余额</span><span>¥{(bal - total).toFixed(2)}</span>
                              </div>
                            )}
                            {insufficient && (
                              <p className="text-xs text-semantic-danger">余额不足，请充值或选择账单支付</p>
                            )}
                          </>
                        )}
                        {renewMode === 'invoice' && (
                          <p className="text-xs text-surface-400">将生成待支付账单，管理员确认后自动续期</p>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-surface-100 px-6 py-4 pb-safe">
              {renewMsg ? (
                <button onClick={() => setRenewTarget(null)} className="btn-primary btn-sm">关闭</button>
              ) : (
                <>
                  <button onClick={() => setRenewTarget(null)} className="btn-secondary btn-sm">取消</button>
                  <button
                    onClick={handleRenew}
                    disabled={renewLoading || (renewMode === 'balance' && (profile?.balance ?? 0) < Math.round((renewTarget.monthlyPrice || 0) * renewPeriod * discountRates[renewPeriod] * 100) / 100)}
                    className="btn-primary btn-sm disabled:opacity-50"
                  >
                    {renewLoading ? '处理中...' : renewMode === 'balance' ? '立即续费' : '生成账单'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
