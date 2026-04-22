'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, extractApiError } from '@/lib/api-client';
import {
  PageHeader,
  FilterBar,
  TabChip,
  Panel,
  EmptyState,
  SkeletonTable,
  StickyFooter,
  useToast,
  ConfirmDialog,
  ModalBody,
  ModalFooter,
  ModalFrame,
  ModalHeader,
} from '@/components/admin/layout';
import { easeOut, staggerContainer, kpiItem, CountUp } from '@/components/admin/motion';

interface Coupon {
  id: string;
  code: string;
  name: string;
  type: string;
  value: number;
  minOrderAmount: number;
  maxDiscount: number;
  startAt: string;
  endAt: string;
  totalCount: number;
  usedCount: number;
  perUserLimit: number;
  isActive: boolean;
  scope: string;
  scopeIds: string;
  createdAt: string;
}

interface UsageRecord {
  id: string;
  userId: string;
  user: { email: string; name: string };
  status: string;
  usedAt?: string;
  orderId?: string;
  createdAt: string;
}

function formatDate(s: string) {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('zh-CN');
}

function formatDateFull(s: string) {
  if (!s) return '-';
  return new Date(s).toLocaleString('zh-CN', { hour12: false }).slice(0, 16);
}

function typeLabel(type: string, value: number) {
  if (type === 'PERCENTAGE') return `折扣 ${(value * 100).toFixed(0)}%`;
  if (type === 'FIXED') return `立减 ¥${value}`;
  if (type === 'RENEWAL') return `续费减 ¥${value}`;
  return type;
}

function scopeLabel(scope: string) {
  switch (scope) {
    case 'ALL': return '全场通用';
    case 'REGION': return '指定地区';
    case 'PRODUCT': return '指定商品';
    case 'FIRST_ORDER': return '首单专享';
    default: return scope;
  }
}

/* ── 通用 Modal 壳 ── */
function ModalShell({
  open,
  onClose,
  title,
  wide = false,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <ModalFrame open={open} onClose={onClose} size={wide ? 'xl' : 'md'}>
      <ModalHeader title={title} onClose={onClose} />
      <ModalBody>{children}</ModalBody>
      {footer ? <ModalFooter>{footer}</ModalFooter> : null}
    </ModalFrame>
  );
}

/* ── 表单输入组件 ── */
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-surface-500">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] text-surface-600 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';
const selectCls = inputCls;

/* ── 操作按钮 ── */
function ActionButton({
  variant = 'secondary',
  onClick,
  disabled,
  children,
}: {
  variant?: 'primary' | 'secondary' | 'danger';
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const cls =
    variant === 'primary'
      ? 'bg-brand-500 text-white hover:bg-brand-600'
      : variant === 'danger'
        ? 'border border-semantic-danger-light bg-white text-semantic-danger hover:bg-semantic-danger-light'
        : 'border border-surface-200 bg-white text-surface-500 hover:border-brand-500 hover:text-brand-500';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-7 rounded-6 px-2.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}

/* ── 可搜索多选 ── */
function ScopeMultiSelect({
  kind,
  value,
  onChange,
}: {
  kind: 'REGION' | 'PRODUCT';
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    const url = kind === 'REGION' ? '/api/admin/regions' : '/api/admin/products?pageSize=200';
    apiFetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        if (kind === 'REGION') {
          const rows = Array.isArray(json) ? json : (json.data || json.regions || []);
          setOptions(rows.map((r: { region: string; description?: string }) => ({
            id: r.region,
            label: r.description ? `${r.region} · ${r.description}` : r.region,
          })));
        } else {
          const rows = json?.data?.items ?? json?.data?.products ?? json?.products ?? [];
          setOptions(rows.map((p: { id: string; name: string }) => ({ id: p.id, label: p.name })));
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind]);

  const labelFor = (id: string) => options.find((o) => o.id === id)?.label ?? id;
  const filtered = options.filter((o) => !value.includes(o.id) && (q.trim() === '' || o.label.toLowerCase().includes(q.toLowerCase()) || o.id.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="relative">
      <div
        className="flex min-h-8 flex-wrap items-center gap-1 rounded-6 border border-surface-200 bg-white px-2 py-1 text-[12px] transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15"
        onClick={() => setOpen(true)}
      >
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-4 bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-600">
            {labelFor(id)}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(value.filter((v) => v !== id)); }}
              className="text-brand-500 hover:text-brand-600"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={value.length === 0 ? (kind === 'REGION' ? '搜索地区...' : '搜索商品...') : ''}
          className="min-w-[100px] flex-1 border-0 bg-transparent px-1 py-0.5 text-[12px] text-surface-600 outline-none placeholder:text-surface-300"
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-52 overflow-y-auto rounded-6 border border-surface-200 bg-white py-1 shadow-card">
          {loading ? (
            <div className="px-3 py-2 text-[11px] text-surface-400">加载中...</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-surface-400">{q.trim() ? '无匹配项' : '暂无可选项'}</div>
          ) : (
            filtered.slice(0, 50).map((o) => (
              <button
                key={o.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange([...value, o.id]); setQ(''); }}
                className="block w-full px-3 py-1.5 text-left text-[12px] text-surface-600 transition-colors hover:bg-surface-50"
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ── 创建/编辑 Modal ── */
function CouponFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Coupon;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isEdit = !!initial;
  const [form, setForm] = useState({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    type: initial?.type ?? 'FIXED',
    value: initial?.value?.toString() ?? '',
    minOrderAmount: initial?.minOrderAmount?.toString() ?? '0',
    maxDiscount: initial?.maxDiscount?.toString() ?? '0',
    startAt: initial?.startAt ? new Date(initial.startAt).toISOString().slice(0, 16) : '',
    endAt: initial?.endAt ? new Date(initial.endAt).toISOString().slice(0, 16) : '',
    totalCount: initial?.totalCount?.toString() ?? '-1',
    perUserLimit: initial?.perUserLimit?.toString() ?? '1',
    scope: initial?.scope ?? 'ALL',
    scopeIds: initial ? (() => { try { return JSON.parse(initial.scopeIds) as string[]; } catch { return []; } })() : [] as string[],
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const scopeIds = form.scopeIds;
    const body = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      type: form.type,
      value: parseFloat(form.value),
      minOrderAmount: parseFloat(form.minOrderAmount) || 0,
      maxDiscount: parseFloat(form.maxDiscount) || 0,
      startAt: new Date(form.startAt).toISOString(),
      endAt: new Date(form.endAt).toISOString(),
      totalCount: parseInt(form.totalCount, 10) || -1,
      perUserLimit: parseInt(form.perUserLimit, 10) || 1,
      scope: form.scope,
      scopeIds,
    };
    try {
      const res = await apiFetch(isEdit ? `/api/admin/coupons/${initial!.id}` : '/api/admin/coupons', {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(isEdit ? '优惠券已更新' : '优惠券已创建');
        onSaved();
      } else {
        toast.error('保存失败', extractApiError(json.error, '保存失败'));
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      title={isEdit ? '编辑优惠券' : '新建优惠券'}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="h-8 rounded-6 border border-surface-200 bg-white px-4 text-[12px] font-medium text-surface-500 transition-colors hover:bg-surface-50">
            取消
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="h-8 rounded-6 bg-brand-500 px-4 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        {!isEdit && (
          <FormField label="优惠码 *">
            <input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="如 SUMMER2024" className={`${inputCls} font-mono`} />
          </FormField>
        )}
        <FormField label="名称 *">
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="活动名称" className={inputCls} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="优惠类型 *">
            <select value={form.type} onChange={(e) => set('type', e.target.value)} className={selectCls}>
              <option value="FIXED">立减金额</option>
              <option value="PERCENTAGE">折扣比例</option>
              <option value="RENEWAL">续费减额</option>
            </select>
          </FormField>
          <FormField label={form.type === 'PERCENTAGE' ? '折扣率 (0.01~0.99)' : '减免金额 (¥)'}>
            <input value={form.value} onChange={(e) => set('value', e.target.value)} type="number" step="0.01" placeholder={form.type === 'PERCENTAGE' ? '0.10' : '50'} className={inputCls} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="最低订单金额 (¥)">
            <input value={form.minOrderAmount} onChange={(e) => set('minOrderAmount', e.target.value)} type="number" className={inputCls} />
          </FormField>
          <FormField label="最大折扣上限 (¥, 0=不限)">
            <input value={form.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} type="number" className={inputCls} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="开始时间">
            <input value={form.startAt} onChange={(e) => set('startAt', e.target.value)} type="datetime-local" className={inputCls} />
          </FormField>
          <FormField label="结束时间">
            <input value={form.endAt} onChange={(e) => set('endAt', e.target.value)} type="datetime-local" className={inputCls} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="总量 (-1=不限)">
            <input value={form.totalCount} onChange={(e) => set('totalCount', e.target.value)} type="number" className={inputCls} />
          </FormField>
          <FormField label="每人限领次数">
            <input value={form.perUserLimit} onChange={(e) => set('perUserLimit', e.target.value)} type="number" className={inputCls} />
          </FormField>
        </div>
        <FormField label="适用范围">
          <select value={form.scope} onChange={(e) => set('scope', e.target.value)} className={selectCls}>
            <option value="ALL">全场通用</option>
            <option value="REGION">指定地区</option>
            <option value="PRODUCT">指定商品</option>
            <option value="FIRST_ORDER">首单专享</option>
          </select>
        </FormField>
        {(form.scope === 'REGION' || form.scope === 'PRODUCT') && (
          <FormField label={form.scope === 'REGION' ? '限定地区' : '限定商品'}>
            <ScopeMultiSelect
              kind={form.scope}
              value={form.scopeIds}
              onChange={(next) => set('scopeIds', next)}
            />
          </FormField>
        )}
      </div>
    </ModalShell>
  );
}

/* ── 批量生成 Modal ── */
function GenerateCodesModal({ coupon, onClose, onDone }: { coupon: Coupon; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [count, setCount] = useState('10');
  const [prefix, setPrefix] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ code: string }[] | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/coupons/${coupon.id}/generate-codes`, {
        method: 'POST',
        body: JSON.stringify({ count: parseInt(count, 10), prefix: prefix.toUpperCase() }),
      });
      const json = await res.json();
      if (json.success) {
        setResult(json.data.codes ?? []);
        toast.success(`成功生成 ${(json.data.codes ?? []).length} 个兑换码`);
        onDone();
      } else {
        toast.error('生成失败', extractApiError(json.error, '生成失败'));
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      title="批量生成兑换码"
      footer={
        <>
          <button type="button" onClick={onClose} className="h-8 rounded-6 border border-surface-200 bg-white px-4 text-[12px] font-medium text-surface-500 transition-colors hover:bg-surface-50">
            关闭
          </button>
          {!result && (
            <button type="button" onClick={handleGenerate} disabled={loading} className="h-8 rounded-6 bg-brand-500 px-4 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
              {loading ? '生成中...' : '开始生成'}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-3.5">
        <p className="text-[12px] text-surface-400">基于「{coupon.name}」批量生成独立兑换码，每个码限用 1 次</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="数量 (1~500)">
            <input value={count} onChange={(e) => setCount(e.target.value)} type="number" min={1} max={500} className={inputCls} />
          </FormField>
          <FormField label="前缀 (选填)">
            <input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} maxLength={6} placeholder="如 VIP-" className={`${inputCls} font-mono`} />
          </FormField>
        </div>
        {result && (
          <div className="rounded-6 bg-semantic-success-light border border-semantic-success/20 px-3 py-2 text-[12px] text-semantic-success-dark">
            成功生成 {result.length} 个兑换码
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/* ── 使用记录抽屉 ── */
function UsageDrawer({ coupon, onClose }: { coupon: Coupon; onClose: () => void }) {
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    apiFetch(`/api/admin/coupons/${coupon.id}/usage?pageSize=50`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setRecords(json.data.records ?? []);
          setTotal(json.data.total ?? 0);
        }
      })
      .finally(() => setLoading(false));
  }, [coupon.id]);

  const statusText = (s: string) =>
    s === 'USED' ? '已使用' : s === 'EXPIRED' ? '已过期' : '未使用';
  const statusStyle = (s: string) =>
    s === 'USED'
      ? 'bg-semantic-success-light text-semantic-success-dark'
      : s === 'EXPIRED'
        ? 'bg-surface-100 text-surface-400'
        : 'bg-semantic-info-light text-brand-600';

  return (
    <div className="fixed inset-0 z-50 flex modal-overlay">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px] modal-panel"
        onClick={onClose}
      />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 400, damping: 36 }}
        className="absolute right-0 top-0 bottom-0 w-full max-w-lg border-l border-surface-200 bg-white shadow-modal flex flex-col"
      >
        <div className="flex items-center justify-between border-b border-surface-100 px-5 py-3.5">
          <div>
            <h3 className="text-[13px] font-semibold text-surface-600">使用记录</h3>
            <p className="mt-0.5 text-[11px] text-surface-400">{coupon.name} · 共 {total} 条</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded-full text-surface-300 transition-colors hover:bg-surface-100 hover:text-surface-500">
            <svg className="h-3.5 w-3.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M2 2l6 6M8 2l-6 6" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-5"><SkeletonTable rows={5} columns={4} /></div>
          ) : records.length === 0 ? (
            <div className="p-5"><EmptyState compact title="暂无记录" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
                  <th className="py-2.5 pl-5 pr-4 font-medium">用户</th>
                  <th className="py-2.5 pr-4 font-medium">状态</th>
                  <th className="py-2.5 pr-4 font-medium">领取时间</th>
                  <th className="py-2.5 pr-5 font-medium">使用时间</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <motion.tr
                    key={r.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }}
                    className="border-b border-surface-50 transition-colors last:border-b-0 hover:bg-surface-50/60"
                  >
                    <td className="py-3 pl-5 pr-4">
                      <p className="font-medium text-surface-600">{r.user?.name ?? '-'}</p>
                      <p className="text-[11px] text-surface-400">{r.user?.email ?? '-'}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex items-center rounded-4 px-2 py-0.5 text-[11px] font-medium ${statusStyle(r.status)}`}>
                        {statusText(r.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-xs text-surface-400">{formatDateFull(r.createdAt)}</td>
                    <td className="whitespace-nowrap py-3 pr-5 text-xs text-surface-400">{r.usedAt ? formatDateFull(r.usedAt) : '-'}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ── 主页面 ── */
const TYPE_FILTERS = ['ALL', 'FIXED', 'PERCENTAGE', 'RENEWAL'] as const;
const TYPE_LABEL: Record<string, string> = { ALL: '全部', FIXED: '立减', PERCENTAGE: '折扣', RENEWAL: '续费' };
const STATUS_FILTERS = ['ALL', 'ACTIVE', 'INACTIVE'] as const;
const STATUS_LABEL: Record<string, string> = { ALL: '全部', ACTIVE: '启用', INACTIVE: '停用' };

export default function AdminCouponsPage() {
  const toast = useToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editCoupon, setEditCoupon] = useState<Coupon | null>(null);
  const [generateCoupon, setGenerateCoupon] = useState<Coupon | null>(null);
  const [usageCoupon, setUsageCoupon] = useState<Coupon | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (statusFilter !== 'ALL') params.set('isActive', statusFilter === 'ACTIVE' ? 'true' : 'false');
    if (typeFilter !== 'ALL') params.set('type', typeFilter);
    if (search.trim()) params.set('search', search.trim());
    try {
      const res = await apiFetch(`/api/admin/coupons?${params}`);
      const json = await res.json();
      if (json.success) {
        setCoupons(json.data.coupons ?? []);
        setTotal(json.data.total ?? 0);
      }
    } catch {
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, typeFilter, search, toast]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (c: Coupon) => {
    try {
      await apiFetch(`/api/admin/coupons/${c.id}/toggle`, { method: 'PATCH' });
      toast.success(c.isActive ? '已停用' : '已启用');
      load();
    } catch {
      toast.error('操作失败');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/coupons/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success('优惠券已删除');
      setDeleteTarget(null);
      load();
    } catch {
      toast.error('删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;
  const activeCount = coupons.filter((c) => c.isActive).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="优惠券管理"
        subtitle="创建和管理优惠券活动，追踪使用情况"
        actions={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex h-8 items-center gap-1.5 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            新建优惠券
          </button>
        }
      />

      {/* KPI */}
      <motion.div variants={staggerContainer(0.04)} initial="initial" animate="animate" className="grid grid-cols-3 gap-4">
        {[
          { label: '优惠券总数', value: total, tone: 'default' as const },
          { label: '启用中', value: activeCount, tone: 'success' as const },
          { label: '已停用', value: coupons.length - activeCount, tone: 'default' as const },
        ].map((item) => (
          <motion.div
            key={item.label}
            variants={kpiItem}
            className="rounded-8 border border-surface-200 bg-white px-4 py-3 text-center shadow-card"
          >
            <p className={`text-xl font-semibold tabular-nums ${item.tone === 'success' ? 'text-semantic-success' : 'text-surface-600'}`}>
              <CountUp value={item.value} />
            </p>
            <p className="mt-0.5 text-[11px] text-surface-400">{item.label}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Filter */}
      <FilterBar
        right={
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="h-8 w-full rounded-6 border border-surface-200 bg-white pl-8 pr-3 text-[12px] text-surface-600 placeholder:text-surface-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/15 md:w-64"
              placeholder="搜索优惠码或名称..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        }
      >
        {TYPE_FILTERS.map((t) => (
          <TabChip key={t} active={typeFilter === t} onClick={() => { setTypeFilter(t); setPage(1); }}>
            {TYPE_LABEL[t]}
          </TabChip>
        ))}
        <span className="mx-1 h-4 w-px bg-surface-200" />
        {STATUS_FILTERS.map((s) => (
          <TabChip key={s} active={statusFilter === s} onClick={() => { setStatusFilter(s); setPage(1); }}>
            {STATUS_LABEL[s]}
          </TabChip>
        ))}
      </FilterBar>

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={8} columns={8} />
      ) : !coupons.length ? (
        <Panel><EmptyState title="暂无优惠券" description="当前筛选条件下没有匹配的优惠券" /></Panel>
      ) : (
        <Panel noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
                  <th className="py-2.5 pl-5 pr-4 font-medium">优惠码</th>
                  <th className="py-2.5 pr-4 font-medium">名称</th>
                  <th className="py-2.5 pr-4 font-medium">优惠内容</th>
                  <th className="py-2.5 pr-4 font-medium">范围</th>
                  <th className="py-2.5 pr-4 font-medium">使用量</th>
                  <th className="py-2.5 pr-4 font-medium">有效期</th>
                  <th className="py-2.5 pr-4 font-medium">状态</th>
                  <th className="py-2.5 pr-5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c, i) => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }}
                    className="border-b border-surface-50 transition-colors last:border-b-0 hover:bg-surface-50/60"
                  >
                    <td className="py-3 pl-5 pr-4">
                      <span className="font-mono text-xs font-medium text-surface-500">{c.code}</span>
                    </td>
                    <td className="max-w-[120px] truncate py-3 pr-4 font-medium text-surface-600">{c.name}</td>
                    <td className="py-3 pr-4 text-surface-500">{typeLabel(c.type, c.value)}</td>
                    <td className="py-3 pr-4 text-[11px] text-surface-400">{scopeLabel(c.scope)}</td>
                    <td className="py-3 pr-4 text-surface-400 tabular-nums">
                      <span className="font-medium text-surface-600">{c.usedCount}</span>
                      <span> / {c.totalCount === -1 ? '不限' : c.totalCount}</span>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-xs text-surface-400">
                      <div>{formatDate(c.startAt)}</div>
                      <div>~ {formatDate(c.endAt)}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex items-center rounded-4 px-2 py-0.5 text-[11px] font-medium ${c.isActive ? 'bg-semantic-success-light text-semantic-success-dark' : 'bg-surface-100 text-surface-400'}`}>
                        {c.isActive ? '启用' : '停用'}
                      </span>
                    </td>
                    <td className="py-3 pr-5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ActionButton onClick={() => setEditCoupon(c)}>编辑</ActionButton>
                        <ActionButton onClick={() => handleToggle(c)}>{c.isActive ? '停用' : '启用'}</ActionButton>
                        <ActionButton variant="primary" onClick={() => setGenerateCoupon(c)}>生成码</ActionButton>
                        <ActionButton onClick={() => setUsageCoupon(c)}>记录</ActionButton>
                        <ActionButton variant="danger" onClick={() => setDeleteTarget(c)}>删除</ActionButton>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Pagination */}
      <StickyFooter show={!loading && coupons.length > 0 && totalPages > 1}>
        <p className="text-[12px] text-surface-400">
          共 <span className="font-medium tabular-nums text-surface-600">{total}</span> 条 · 第{' '}
          <span className="tabular-nums">{page}</span> / <span className="tabular-nums">{totalPages}</span> 页
        </p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="flex h-7 w-7 items-center justify-center rounded-6 text-surface-400 transition-colors hover:bg-surface-50 hover:text-surface-600 disabled:cursor-not-allowed disabled:opacity-30">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button type="button" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="flex h-7 w-7 items-center justify-center rounded-6 text-surface-400 transition-colors hover:bg-surface-50 hover:text-surface-600 disabled:cursor-not-allowed disabled:opacity-30">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </StickyFooter>

      {/* Modals */}
      <AnimatePresence>
        {showCreate && <CouponFormModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
      </AnimatePresence>
      <AnimatePresence>
        {editCoupon && <CouponFormModal initial={editCoupon} onClose={() => setEditCoupon(null)} onSaved={() => { setEditCoupon(null); load(); }} />}
      </AnimatePresence>
      <AnimatePresence>
        {generateCoupon && <GenerateCodesModal coupon={generateCoupon} onClose={() => setGenerateCoupon(null)} onDone={() => load()} />}
      </AnimatePresence>
      <AnimatePresence>
        {usageCoupon && <UsageDrawer coupon={usageCoupon} onClose={() => setUsageCoupon(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        <ConfirmDialog
          open={!!deleteTarget}
          title="确认删除优惠券"
          description={`将永久删除「${deleteTarget?.name}」，此操作不可撤销。`}
          confirmText="删除"
          danger
          loading={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      </AnimatePresence>
    </div>
  );
}
