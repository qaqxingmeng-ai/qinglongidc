'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, isApiSuccess, pickApiData, extractApiError } from '@/lib/api-client';
import {
  PageHeader,
  FilterBar,
  TabChip,
  EmptyState,
  SkeletonTable,
  useToast,
  ConfirmDialog,
} from '@/components/admin/layout';

const modalTransition = { type: 'spring' as const, stiffness: 420, damping: 32 };
const inputCls = 'w-full h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] text-surface-600 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';
const selectCls = inputCls;

interface UserOption {
  id: string;
  numericId: number;
  name: string;
  email: string;
}

interface ProductOption {
  id: string;
  name: string;
  category: string;
  region: string;
  costPrice: number;
  cpu?: { model: string } | null;
  memory: string;
  storage: string;
  bandwidth: string;
  isDualCPU: boolean;
  cpuCount: number;
}

interface Server {
  id: string;
  ip: string | null;
  status: string;
  config: Record<string, unknown>;
  configSummary: string;
  startDate: string | null;
  expireDate: string | null;
  daysUntilExpire: number | null;
  user: { name: string; email: string };
  agent: { name: string } | null;
  product: { name: string; region: string; cpuModel: string | null } | null;
}

function toDateInput(value: string | null) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function buildConfigPreset(product: ProductOption | undefined) {
  if (!product) return '{}';
  return JSON.stringify({
    productName: product.name,
    region: product.region,
    cpuModel: product.cpu?.model || null,
    memory: product.memory,
    storage: product.storage,
    bandwidth: product.bandwidth,
    isDualCPU: product.isDualCPU,
    cpuCount: product.cpuCount,
  }, null, 2);
}

export default function AdminServersPage() {
  const toast = useToast();
  const [servers, setServers] = useState<Server[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selected, setSelected] = useState<Server | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ip: '', status: 'PENDING', startDate: '', expireDate: '', configText: '{}' });
  const [createForm, setCreateForm] = useState({ userId: '', productId: '', ip: '', status: 'ACTIVE', startDate: new Date().toISOString().slice(0, 10), expireDate: '', configText: '{}' });
  const [userSearch, setUserSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Server | null>(null);
  const [transferUserId, setTransferUserId] = useState('');
  const [transferSearch, setTransferSearch] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [transferMsg, setTransferMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Server | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadServers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('search', query.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const res = await apiFetch(`/api/admin/servers${params.toString() ? `?${params.toString()}` : ''}`, { method: 'GET' });
      const json = await res.json();
      if (!isApiSuccess(json)) throw new Error(extractApiError(json.error, '加载失败'));
      const data = pickApiData<Server[] | { servers?: Server[] }>(json, ['servers']);
      const list = Array.isArray(data) ? data : (Array.isArray(data?.servers) ? data.servers : []);
      setServers(list);
    } catch (e) {
      const text = e instanceof Error ? e.message : '加载失败';
      toast.error(text);
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter, toast]);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  useEffect(() => {
    const loadOptions = async () => {
      setOptionsLoading(true);
      try {
        const [usersRes, productsRes] = await Promise.all([
          apiFetch('/api/admin/users?role=USER', { method: 'GET' }),
          apiFetch('/api/admin/products?status=ACTIVE', { method: 'GET' }),
        ]);
        const [usersJson, productsJson] = await Promise.all([usersRes.json(), productsRes.json()]);
        if (isApiSuccess(usersJson)) {
          const usersData = pickApiData<UserOption[] | { users?: UserOption[] }>(usersJson, ['users']);
          const usersList = Array.isArray(usersData) ? usersData : (Array.isArray(usersData?.users) ? usersData.users : []);
          setUsers(usersList.map((user) => ({
            ...user,
            id: String(user.id ?? ''),
            numericId: Number(user.numericId) || 0,
            name: String(user.name ?? ''),
            email: String(user.email ?? ''),
          })));
        }
        if (isApiSuccess(productsJson)) {
          const productsData = pickApiData<ProductOption[] | { products?: ProductOption[] }>(productsJson, ['products']);
          const productsList = Array.isArray(productsData) ? productsData : (Array.isArray(productsData?.products) ? productsData.products : []);
          setProducts(productsList.map((product) => ({
            ...product,
            id: String(product.id ?? ''),
            name: String(product.name ?? ''),
            category: String(product.category ?? ''),
            region: String(product.region ?? ''),
            memory: String(product.memory ?? ''),
            storage: String(product.storage ?? ''),
            bandwidth: String(product.bandwidth ?? ''),
          })));
        }
      } finally {
        setOptionsLoading(false);
      }
    };

    loadOptions();
  }, []);

  const filteredUsers = useMemo(() => {
    const keyword = userSearch.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter((user) => {
      const text = `${user.numericId} ${user.name || ''} ${user.email || ''}`.toLowerCase();
      return text.includes(keyword);
    });
  }, [userSearch, users]);

  const filteredProducts = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((product) => {
      const text = [product.name, product.category, product.region, product.cpu?.model, product.memory, product.storage, product.bandwidth]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return text.includes(keyword);
    });
  }, [productSearch, products]);

  const selectedUserOption = useMemo(
    () => users.find((user) => user.id === createForm.userId) || null,
    [createForm.userId, users],
  );

  const selectedProductOption = useMemo(
    () => products.find((product) => product.id === createForm.productId) || null,
    [createForm.productId, products],
  );

  const openEditor = (server: Server) => {
    setSelected(server);
    setForm({
      ip: server.ip || '',
      status: server.status,
      startDate: toDateInput(server.startDate),
      expireDate: toDateInput(server.expireDate),
      configText: JSON.stringify(server.config, null, 2),
    });
  };

  const openCreate = () => {
    setUserSearch('');
    setProductSearch('');
    setCreateForm({
      userId: users[0]?.id || '',
      productId: products[0]?.id || '',
      ip: '',
      status: 'ACTIVE',
      startDate: new Date().toISOString().slice(0, 10),
      expireDate: '',
      configText: buildConfigPreset(products[0]),
    });
    setShowConfigEditor(false);
    setShowCreate(true);
  };

  const createServer = async () => {
    setCreating(true);

    try {
      const config = JSON.parse(createForm.configText || '{}');
      const res = await apiFetch('/api/admin/servers', {
        method: 'POST',
        body: JSON.stringify({
          userId: createForm.userId,
          productId: createForm.productId,
          ip: createForm.ip.trim() || null,
          status: createForm.status,
          startDate: createForm.startDate || null,
          expireDate: createForm.expireDate || null,
          config,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || extractApiError(json.error, '开通失败'));

      setServers((prev) => [json.data, ...prev]);
      setShowCreate(false);
      toast.success('服务器实例已开通到用户账号');
    } catch (e) {
      const text = e instanceof Error ? e.message : '开通失败';
      toast.error(text);
    } finally {
      setCreating(false);
    }
  };

  const saveServer = async () => {
    if (!selected) return;

    setSaving(true);

    try {
      const config = JSON.parse(form.configText || '{}');
      const res = await apiFetch(`/api/admin/servers/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ip: form.ip.trim() || null,
          status: form.status,
          startDate: form.startDate || null,
          expireDate: form.expireDate || null,
          config,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || extractApiError(json.error, '保存失败'));

      // Reload the updated server from backend since PUT returns {success:true}
      await loadServers();
      setSelected(null);
      toast.success('服务器实例已更新');
    } catch (e) {
      const text = e instanceof Error ? e.message : '保存失败';
      toast.error(text);
    } finally {
      setSaving(false);
    }
  };

  const statusMap: Record<string, { label: string; cls: string }> = {
    PENDING: { label: '待开通', cls: 'badge-yellow' },
    ACTIVE: { label: '运行中', cls: 'badge-green' },
    SUSPENDED: { label: '已暂停', cls: 'badge-red' },
    EXPIRED: { label: '已过期', cls: 'badge-gray' },
  };

  const statusCounts = useMemo(() => ({
    ALL: servers.length,
    PENDING: servers.filter((s) => s.status === 'PENDING').length,
    ACTIVE: servers.filter((s) => s.status === 'ACTIVE').length,
    SUSPENDED: servers.filter((s) => s.status === 'SUSPENDED').length,
    EXPIRED: servers.filter((s) => s.status === 'EXPIRED').length,
  }), [servers]);

  const toggleStatus = async (server: Server) => {
    const next = server.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      const res = await apiFetch(`/api/admin/servers/${server.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (json.success) {
        setServers((prev) => prev.map((s) => s.id === server.id ? { ...s, status: next } : s));
      } else {
        toast.error(extractApiError(json.error, '状态切换失败'));
      }
    } catch {
      toast.error('状态切换失败');
    }
  };

  const deleteServer = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/admin/servers/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setServers((prev) => prev.filter((s) => s.id !== deleteTarget.id));
        toast.success('服务器已删除');
      } else {
        toast.error(extractApiError(json.error, '删除失败'));
      }
      setDeleteTarget(null);
    } catch {
      toast.error('删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const openTransfer = (server: Server) => {
    setTransferTarget(server);
    setTransferUserId('');
    setTransferSearch('');
    setTransferMsg(null);
  };

  const handleTransfer = async () => {
    if (!transferTarget || !transferUserId) return;
    setTransferring(true);
    setTransferMsg(null);
    try {
      const res = await apiFetch(`/api/admin/servers/${transferTarget.id}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ newUserId: transferUserId }),
      });
      const json = await res.json();
      if (json.success) {
        setTransferMsg({ type: 'ok', text: json.message || '过户成功' });
        await loadServers();
      } else {
        setTransferMsg({ type: 'err', text: extractApiError(json.error, '过户失败') });
      }
    } catch {
      setTransferMsg({ type: 'err', text: '网络错误，请重试' });
    } finally {
      setTransferring(false);
    }
  };

  if (loading && servers.length === 0) return (
    <div className="flex min-h-[320px] items-center justify-center text-sm text-surface-400">加载中...</div>
  );

  const STATUS_TABS = [
    { value: 'ALL', label: '全部' },
    { value: 'PENDING', label: '待开通' },
    { value: 'ACTIVE', label: '运行中' },
    { value: 'SUSPENDED', label: '已暂停' },
    { value: 'EXPIRED', label: '已过期' },
  ] as const;

  const subtitleParts: string[] = [];
  if (!loading) {
    subtitleParts.push(`共 ${servers.length} 台`);
    if (statusCounts.ACTIVE > 0) subtitleParts.push(`${statusCounts.ACTIVE} 台运行中`);
    if (statusCounts.PENDING > 0) subtitleParts.push(`${statusCounts.PENDING} 台待处理`);
    if (statusCounts.EXPIRED > 0) subtitleParts.push(`${statusCounts.EXPIRED} 台已过期`);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="实例管理"
        subtitle={subtitleParts.join(' · ')}
        actions={
          <>
            <Link
              href="/admin/servers/renewal"
              className="text-[12px] text-surface-400 transition-colors hover:text-brand-500"
            >
              续费管理
            </Link>
            <Link
              href="/admin/servers/calendar"
              className="text-[12px] text-surface-400 transition-colors hover:text-brand-500"
            >
              到期日历
            </Link>
            <button
              type="button"
              onClick={() => loadServers()}
              className="flex h-8 items-center gap-1.5 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              刷新
            </button>
            <button
              type="button"
              onClick={openCreate}
              disabled={optionsLoading || users.length === 0 || products.length === 0}
              className="flex h-8 items-center gap-1.5 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              新开实例
            </button>
          </>
        }
      />

      <FilterBar
        right={
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="h-8 w-full rounded-6 border border-surface-200 bg-white pl-8 pr-3 text-[12px] text-surface-600 placeholder:text-surface-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/15 md:w-72"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索商品、用户、代理、IP、配置…"
            />
          </div>
        }
      >
        {STATUS_TABS.map((tab) => (
          <TabChip
            key={tab.value}
            active={statusFilter === tab.value}
            onClick={() => setStatusFilter(tab.value)}
            count={statusCounts[tab.value] || undefined}
          >
            {tab.label}
          </TabChip>
        ))}
      </FilterBar>

      {loading ? (
        <SkeletonTable rows={8} columns={7} />
      ) : servers.length === 0 ? (
        <div className="rounded-8 border border-surface-200 bg-white p-5 shadow-card">
          <EmptyState
            title={`暂无${statusFilter !== 'ALL' ? statusMap[statusFilter]?.label || '' : ''}实例数据`}
            description={query || statusFilter !== 'ALL' ? '尝试调整搜索或筛选条件' : undefined}
            action={
              query || statusFilter !== 'ALL' ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setStatusFilter('ALL');
                  }}
                  className="text-[12px] text-brand-500 hover:underline"
                >
                  清除筛选
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-8 border border-surface-200 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-surface-100 px-4 py-2.5">
            <span className="text-[12px] text-surface-400">
              {servers.length} 条结果{query ? ` · 已搜索"${query}"` : ''}
              {statusFilter !== 'ALL' ? ` · 状态筛选已生效` : ''}
            </span>
            {(query || statusFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setStatusFilter('ALL');
                }}
                className="text-[12px] text-brand-500 hover:underline"
              >
                清除筛选
              </button>
            )}
          </div>

          <>
            {/* Mobile cards */}
            <div className="divide-y divide-surface-100 md:hidden">
              {servers.map((s) => {
                const status = statusMap[s.status] || { label: s.status, cls: '' };
                const daysClass =
                  s.daysUntilExpire === null ? 'text-surface-300' :
                  s.daysUntilExpire < 0 ? 'text-semantic-danger' :
                  s.daysUntilExpire <= 3 ? 'text-semantic-danger' :
                  s.daysUntilExpire <= 7 ? 'text-semantic-warning' : 'text-surface-400';
                return (
                  <div key={s.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-surface-600">{s.product?.name || '-'}</p>
                        <p className="mt-0.5 text-xs text-surface-400">{s.product?.region || '-'}</p>
                      </div>
                      <button onClick={() => toggleStatus(s)} className={`${status.cls} shrink-0 transition hover:opacity-70`} title={`切换为${s.status === 'ACTIVE' ? '暂停' : '运行中'}`}>
                        {status.label}
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-8 bg-surface-50 px-3 py-2.5 text-xs">
                      <div><p className="text-surface-400">用户</p><p className="mt-0.5 font-medium text-surface-500">{s.user?.name || '-'}</p></div>
                      <div><p className="text-surface-400">IP</p><p className="mt-0.5 font-mono text-surface-500">{s.ip || '-'}</p></div>
                      <div><p className="text-surface-400">到期</p><p className="mt-0.5 text-surface-500">{s.expireDate ? new Date(s.expireDate).toLocaleDateString() : '-'}</p></div>
                      <div><p className="text-surface-400">剩余</p><p className={`mt-0.5 font-medium ${daysClass}`}>{s.daysUntilExpire === null ? '-' : s.daysUntilExpire >= 0 ? `${s.daysUntilExpire}天` : '已过期'}</p></div>
                    </div>
                    <div className="mt-3 flex gap-4 text-xs">
                      <button onClick={() => openEditor(s)} className="text-brand-500 hover:underline">编辑</button>
                      <button onClick={() => openTransfer(s)} className="text-brand-500 hover:underline">过户</button>
                      <button onClick={() => setDeleteTarget(s)} className="text-semantic-danger hover:underline">删除</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <div className="grid grid-cols-12 gap-2 border-b border-surface-100 bg-surface-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-surface-400">
                <div className="col-span-3">名称 / 地区</div>
                <div className="col-span-2">用户 / 代理</div>
                <div className="col-span-2">IP / CPU</div>
                <div className="col-span-1">状态</div>
                <div className="col-span-2">开通 / 到期</div>
                <div className="col-span-1">剩余天数</div>
                <div className="col-span-1 text-right">操作</div>
              </div>
              <div className="divide-y divide-surface-50">
                {servers.map((s) => {
                  const status = statusMap[s.status] || { label: s.status, cls: '' };
                  const daysClass =
                    s.daysUntilExpire === null ? 'text-surface-300' :
                    s.daysUntilExpire < 0 ? 'text-semantic-danger' :
                    s.daysUntilExpire <= 3 ? 'text-semantic-danger' :
                    s.daysUntilExpire <= 7 ? 'text-semantic-warning' : 'text-surface-400';
                  return (
                    <div key={s.id} className="grid grid-cols-12 items-center gap-2 px-4 py-2.5 text-xs transition-colors hover:bg-brand-50">
                      <div className="col-span-3 min-w-0">
                        <p className="truncate font-medium text-surface-600">{s.product?.name || '-'}</p>
                        <p className="mt-0.5 text-[11px] text-surface-400">{s.product?.region || '-'}</p>
                      </div>
                      <div className="col-span-2 min-w-0">
                        <p className="truncate text-surface-500">{s.user?.name || '-'}</p>
                        <p className="mt-0.5 truncate text-[11px] text-surface-400">{s.agent?.name || '直客'}</p>
                      </div>
                      <div className="col-span-2 min-w-0">
                        <p className="font-mono text-[11px] text-surface-500">{s.ip || '-'}</p>
                        <p className="mt-0.5 truncate text-[11px] text-surface-400">{s.product?.cpuModel || '-'}</p>
                      </div>
                      <div className="col-span-1">
                        <button
                          type="button"
                          onClick={() => toggleStatus(s)}
                          className={`${status.cls} cursor-pointer transition hover:opacity-70`}
                          title={`切换为${s.status === 'ACTIVE' ? '暂停' : '运行中'}`}
                        >
                          {status.label}
                        </button>
                      </div>
                      <div className="col-span-2 text-[11px] text-surface-400">
                        <div>{s.startDate ? new Date(s.startDate).toLocaleDateString() : '-'}</div>
                        <div className="mt-0.5">{s.expireDate ? new Date(s.expireDate).toLocaleDateString() : '-'}</div>
                      </div>
                      <div className={`col-span-1 text-[11px] font-medium ${daysClass}`}>
                        {s.daysUntilExpire === null ? '-' : s.daysUntilExpire >= 0 ? `${s.daysUntilExpire}天` : '已过期'}
                      </div>
                      <div className="col-span-1 flex justify-end gap-2">
                        <button type="button" onClick={() => openEditor(s)} className="text-[11px] text-brand-500 hover:underline">编辑</button>
                        <button type="button" onClick={() => openTransfer(s)} className="text-[11px] text-brand-500 hover:underline">过户</button>
                        <button type="button" onClick={() => setDeleteTarget(s)} className="text-[11px] text-surface-400 hover:underline">删除</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        </div>
      )}

      {/* Create Modal */}
      <AnimatePresence>
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center px-0 sm:items-center sm:px-4 modal-overlay"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] modal-panel" />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={modalTransition}
            className="relative flex max-h-[94vh] w-full max-w-[96vw] flex-col overflow-hidden rounded-t-8 border border-surface-200 bg-white shadow-modal sm:rounded-8 md:max-w-6xl"
          >
            <div className="flex items-start justify-between px-5 py-4 border-b border-surface-100 shrink-0">
              <div>
                <p className="font-semibold text-surface-600 mt-1">开通新实例</p>
                <p className="text-sm text-surface-400 mt-1">先锁定用户与商品，再确认开通时间和配置快照。</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-surface-400 hover:text-surface-500 text-xl leading-none">×</button>
            </div>
            <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
              <section className="rounded-8 border border-surface-200 bg-surface-50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-5 w-5 rounded-full bg-brand-500 text-white text-[11px] leading-5 text-center">1</span>
                  <p className="text-sm font-semibold text-surface-600">选择用户和商品</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-surface-500">用户</label>
                    <input
                      className={`${inputCls} mb-2 bg-white`}
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="搜索用户ID / 用户名 / 邮箱"
                    />
                    <select className={`${selectCls} bg-white`} value={createForm.userId} onChange={(e) => setCreateForm((prev) => ({ ...prev, userId: e.target.value }))}>
                      <option value="">选择用户</option>
                      {filteredUsers.map((user) => (
                        <option key={user.id} value={user.id}>ID:{user.numericId} · {user.name} · {user.email}</option>
                      ))}
                    </select>
                    <p className="text-xs text-surface-400 mt-1">匹配 {filteredUsers.length} 个用户</p>
                    {selectedUserOption && (
                      <p className="text-xs text-surface-500 mt-2">已选: ID {selectedUserOption.numericId} · {selectedUserOption.name}</p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-surface-500">商品</label>
                    <input
                      className={`${inputCls} mb-2 bg-white`}
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="搜索商品名 / 地区 / CPU / 配置"
                    />
                    <select
                      className={`${selectCls} bg-white`}
                      value={createForm.productId}
                      onChange={(e) => {
                        const nextProductId = e.target.value;
                        const product = products.find((item) => item.id === nextProductId);
                        setCreateForm((prev) => ({ ...prev, productId: nextProductId, configText: buildConfigPreset(product) }));
                      }}
                    >
                      <option value="">选择商品</option>
                      {filteredProducts.map((product) => (
                        <option key={product.id} value={product.id}>{product.name} · {product.category} · {product.region} · {product.cpu?.model || '-'} · 成本¥{product.costPrice ?? 0}</option>
                      ))}
                    </select>
                    <p className="text-xs text-surface-400 mt-1">匹配 {filteredProducts.length} 个商品</p>
                    {selectedProductOption && (
                      <p className="text-xs text-surface-500 mt-2">已选: {selectedProductOption.category} · {selectedProductOption.region} · {selectedProductOption.cpu?.model || '-'} · 成本¥{selectedProductOption.costPrice ?? 0}</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-8 border border-surface-200 bg-surface-50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-5 w-5 rounded-full bg-brand-500 text-white text-[11px] leading-5 text-center">2</span>
                  <p className="text-sm font-semibold text-surface-600">填写实例信息</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-surface-500">IP 地址</label>
                    <input className={`${inputCls} bg-surface-50`} value={createForm.ip} onChange={(e) => setCreateForm((prev) => ({ ...prev, ip: e.target.value }))} placeholder="可后补" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-surface-500">状态</label>
                    <select className={`${selectCls} bg-surface-50`} value={createForm.status} onChange={(e) => setCreateForm((prev) => ({ ...prev, status: e.target.value }))}>
                      <option value="ACTIVE">运行中</option>
                      <option value="PENDING">待开通</option>
                      <option value="SUSPENDED">已暂停</option>
                      <option value="EXPIRED">已过期</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-surface-500">开通时间</label>
                    <input className={`${inputCls} bg-surface-50`} type="date" value={createForm.startDate} onChange={(e) => setCreateForm((prev) => ({ ...prev, startDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-surface-500">到期时间</label>
                    <input className={`${inputCls} bg-surface-50`} type="date" value={createForm.expireDate} onChange={(e) => setCreateForm((prev) => ({ ...prev, expireDate: e.target.value }))} />
                  </div>
                </div>
              </section>

              <section className="rounded-8 border border-surface-200 bg-surface-50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-5 rounded-full bg-brand-500 text-white text-[11px] leading-5 text-center">3</span>
                    <p className="text-sm font-semibold text-surface-600">确认配置快照</p>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-brand-600 hover:text-brand-700"
                    onClick={() => setShowConfigEditor((prev) => !prev)}
                  >
                    {showConfigEditor ? '收起编辑器' : '展开编辑器'}
                  </button>
                </div>
                {showConfigEditor ? (
                  <>
                    <textarea className="w-full min-h-[180px] md:min-h-[220px] resize-none rounded-6 border border-surface-700 bg-surface-800 px-3 py-2 font-mono text-xs leading-6 text-surface-100 placeholder:text-surface-400 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15" value={createForm.configText} onChange={(e) => setCreateForm((prev) => ({ ...prev, configText: e.target.value }))} spellCheck={false} />
                    <p className="text-xs text-surface-400 mt-2">建议保留商品基础配置，仅对交付差异做补充。</p>
                  </>
                ) : (
                  <p className="text-xs text-surface-400">默认已按当前商品自动填充配置，若需手动改动可点击&ldquo;展开编辑器&rdquo;。</p>
                )}
              </section>
            </div>
            <div className="flex shrink-0 flex-col gap-3 border-t border-surface-100 px-6 py-4 pb-safe md:flex-row md:items-center md:justify-between">
              <div className="text-xs text-surface-400">
                {`用户 ${selectedUserOption ? `ID ${selectedUserOption.numericId}` : '未选择'} · 商品 ${selectedProductOption ? selectedProductOption.region : '未选择'} · 状态 ${createForm.status}`}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCreate(false)} className="h-8 rounded-6 border border-surface-200 bg-white px-4 text-[12px] font-medium text-surface-500 transition-colors hover:bg-surface-50">取消</button>
                <button onClick={createServer} disabled={creating || !createForm.userId || !createForm.productId} className="h-8 rounded-6 bg-brand-500 px-4 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50 min-w-[96px]">
                {creating ? '开通中...' : '确认开通'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center px-0 sm:items-center sm:px-4 modal-overlay"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] modal-panel" />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={modalTransition}
            className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-8 border border-surface-200 bg-white shadow-modal sm:rounded-8"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 shrink-0">
              <div>
                <p className="font-semibold text-surface-600">编辑实例</p>
                <p className="text-xs text-surface-400 mt-0.5">{selected.product?.name || '-'} · {selected.user?.name || '-'}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-surface-400 hover:text-surface-500 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="mb-1 block text-[11px] font-medium text-surface-500">IP 地址</label>
                  <input className={inputCls} value={form.ip} onChange={(e) => setForm((prev) => ({ ...prev, ip: e.target.value }))} placeholder="192.168.x.x" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="mb-1 block text-[11px] font-medium text-surface-500">状态</label>
                  <select className={selectCls} value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
                    <option value="PENDING">待开通</option>
                    <option value="ACTIVE">运行中</option>
                    <option value="SUSPENDED">已暂停</option>
                    <option value="EXPIRED">已过期</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-surface-500">开通时间</label>
                  <input className={inputCls} type="date" value={form.startDate} onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-surface-500">到期时间</label>
                  <input className={inputCls} type="date" value={form.expireDate} onChange={(e) => setForm((prev) => ({ ...prev, expireDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-surface-500">配置快照 JSON</label>
                <textarea
                  className="w-full min-h-[200px] resize-none rounded-6 border border-surface-200 bg-white px-3 py-2 font-mono text-xs text-surface-600 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                  value={form.configText}
                  onChange={(e) => setForm((prev) => ({ ...prev, configText: e.target.value }))}
                  spellCheck={false}
                />
                <p className="text-xs text-surface-400 mt-1">直接编辑 JSON；保存时会解析校验格式。</p>
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-surface-100 px-6 py-4 pb-safe">
              <button onClick={() => setSelected(null)} className="h-8 rounded-6 border border-surface-200 bg-white px-4 text-[12px] font-medium text-surface-500 transition-colors hover:bg-surface-50">取消</button>
              <button onClick={saveServer} disabled={saving} className="h-8 rounded-6 bg-brand-500 px-4 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
                {saving ? '保存中...' : '保存实例'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>

      {/* Transfer Modal */}
      <AnimatePresence>
      {transferTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center px-0 sm:items-center sm:px-4 modal-overlay"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setTransferTarget(null); }}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] modal-panel" />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={modalTransition}
            className="relative w-full max-w-md rounded-t-8 border border-surface-200 bg-white shadow-modal sm:rounded-8"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
              <div>
                <p className="font-semibold text-surface-600">服务器过户</p>
                <p className="text-xs text-surface-400 mt-0.5">{transferTarget.product?.name || '-'} · {transferTarget.ip || '待分配'}</p>
              </div>
              <button onClick={() => setTransferTarget(null)} className="text-surface-400 hover:text-surface-500 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {transferMsg ? (
                <div className={`rounded-8 border p-4 text-sm ${transferMsg.type === 'ok' ? 'border-semantic-success-light bg-semantic-success-light text-semantic-success-dark' : 'border-semantic-danger-light bg-semantic-danger-light text-semantic-danger'}`}>
                  {transferMsg.text}
                </div>
              ) : (
                <>
                  <div className="rounded-8 border border-surface-200 bg-surface-50 p-3 text-xs text-surface-500 flex items-center gap-3">
                    <span className="text-surface-400">当前归属</span>
                    <span className="font-medium">{transferTarget.user?.name || '-'} ({transferTarget.user?.email || '-'})</span>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-surface-500">搜索目标用户</label>
                    <input
                      type="text"
                      placeholder="输入姓名 / 邮箱 / ID"
                      value={transferSearch}
                      onChange={(e) => { setTransferSearch(e.target.value); setTransferUserId(''); }}
                      className={inputCls}
                    />
                  </div>
                  {transferSearch.trim() && (
                    <div className="border border-surface-200 rounded-8 overflow-hidden max-h-48 overflow-y-auto">
                      {users
                        .filter(u => {
                          const q = transferSearch.trim().toLowerCase();
                          return `${u.numericId} ${u.name || ''} ${u.email || ''}`.toLowerCase().includes(q) && u.email !== transferTarget.user?.email;
                        })
                        .slice(0, 10)
                        .map(u => (
                          <button
                            key={u.id}
                            onClick={() => { setTransferUserId(u.id); setTransferSearch(`${u.name} (${u.email})`); }}
                            className={`w-full text-left px-4 py-2.5 text-xs hover:bg-semantic-info-light transition border-b border-surface-50 last:border-b-0 ${transferUserId === u.id ? 'bg-semantic-info-light text-brand-600' : 'text-surface-500'}`}
                          >
                            <span className="font-medium">{u.name}</span>
                            <span className="text-surface-400 ml-2">{u.email}</span>
                            <span className="text-surface-300 ml-1">#{u.numericId}</span>
                          </button>
                        ))
                      }
                      {users.filter(u => {
                        const q = transferSearch.trim().toLowerCase();
                        return `${u.numericId} ${u.name || ''} ${u.email || ''}`.toLowerCase().includes(q) && u.email !== transferTarget.user?.email;
                      }).length === 0 && (
                        <p className="text-xs text-surface-400 px-4 py-3">无匹配用户</p>
                      )}
                    </div>
                  )}
                  {transferUserId && (
                    <div className="rounded-8 border border-semantic-info-light bg-semantic-info-light p-3 text-xs text-brand-600">
                      已选择：{users.find(u => u.id === transferUserId)?.name} ({users.find(u => u.id === transferUserId)?.email})
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-surface-100 px-6 py-4 pb-safe">
              {transferMsg ? (
                <button onClick={() => setTransferTarget(null)} className="h-8 rounded-6 bg-brand-500 px-4 text-[12px] font-medium text-white transition-colors hover:bg-brand-600">关闭</button>
              ) : (
                <>
                  <button onClick={() => setTransferTarget(null)} className="h-8 rounded-6 border border-surface-200 bg-white px-4 text-[12px] font-medium text-surface-500 transition-colors hover:bg-surface-50">取消</button>
                  <button
                    onClick={handleTransfer}
                    disabled={!transferUserId || transferring}
                    className="h-8 rounded-6 bg-brand-500 px-4 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
                  >
                    {transferring ? '过户中...' : '确认过户'}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>

      <AnimatePresence>
        <ConfirmDialog
          open={!!deleteTarget}
          title="确认删除服务器"
          description={`确定删除服务器 ${deleteTarget?.product?.name || deleteTarget?.id}？此操作将级联删除关联账单且不可恢复。`}
          confirmText="删除"
          danger
          loading={deleting}
          onConfirm={deleteServer}
          onCancel={() => setDeleteTarget(null)}
        />
      </AnimatePresence>
    </div>
  );
}
