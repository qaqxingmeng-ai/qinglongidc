'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api-client';
import {
  CATEGORY_LABELS,
  COMPLIANCE_NOTES,
  DELIVERY_NOTES,
  createRegionAnchor,
  formatCurrency,
  getRegionDescription,
} from '@/lib/catalog';
import type { ProductDetailPayload, ResolvedProductDetail } from '@/lib/types';
import { SCORE_DIMENSIONS, sumScoreFields } from '@/lib/scoring';
import { addToCart } from '@/lib/cart';
import { recordBrowse, getDisplayBrowseHistory, clearBrowseHistory } from '@/lib/browse-history';
import { checkFavorite, addFavorite, removeFavorite } from '@/lib/favorites';
import ShoppingCart from '@/components/ShoppingCart';
import { getTotalBenchmark, normalizeTagList } from '@/lib/utils';

function normalizeDetailProduct(raw: ProductDetailPayload | Record<string, unknown>): ResolvedProductDetail {
  const cpu = (raw?.cpu as {
    id?: unknown;
    model?: unknown;
    cores?: unknown;
    threads?: unknown;
    frequency?: unknown;
    benchmark?: unknown;
    tags?: string | string[] | null;
    description?: string | null;
    source?: string | null;
  } | undefined) ?? {};
  const benchmark = Number(cpu?.benchmark ?? 0);
  const cpuCount = Number(raw?.cpuCount ?? 0);
  const isDualCPU = Boolean(raw?.isDualCPU);
  const displayPrice = Number(raw?.displayPrice ?? 0);

  return {
    ...(raw as ProductDetailPayload),
    category: String(raw?.category ?? 'general'),
    cpu: {
      id: String(cpu?.id ?? ''),
      model: String(cpu?.model ?? '-'),
      cores: Number(cpu?.cores ?? 0),
      threads: Number(cpu?.threads ?? 0),
      frequency: String(cpu?.frequency ?? '-'),
      benchmark,
      tags: normalizeTagList(cpu?.tags),
      description: cpu?.description ?? null,
      source: String(cpu?.source ?? ''),
    },
    isDualCPU,
    cpuCount,
    totalBenchmark: Number(raw?.totalBenchmark ?? getTotalBenchmark(benchmark, isDualCPU, cpuCount)),
    displayPrice,
    originalPrice: Number(raw?.originalPrice ?? displayPrice),
    referencePrice: Number(raw?.referencePrice ?? displayPrice),
    scoreNetwork: Number(raw?.scoreNetwork ?? 0),
    scoreCpuSingle: Number(raw?.scoreCpuSingle ?? 0),
    scoreMemory: Number(raw?.scoreMemory ?? 0),
    scoreStorage: Number(raw?.scoreStorage ?? 0),
    clickCount: Number(raw?.clickCount ?? 0),
    orderCount: Number(raw?.orderCount ?? 0),
    stock: typeof raw?.stock === 'number' ? raw.stock : -1,
    costPrice: Number(raw?.costPrice ?? raw?.originalPrice ?? 0),
  };
}

export default function ProductDetailClient({ product }: { product: ProductDetailPayload }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [currentProduct, setCurrentProduct] = useState(() => normalizeDetailProduct(product));
  const [quantity, setQuantity] = useState(1);
  const [period, setPeriod] = useState(1);
  const [cartAdded, setCartAdded] = useState(false);
  const [cartError, setCartError] = useState('');
  const [browseHistory, setBrowseHistory] = useState(getDisplayBrowseHistory());
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const hasResolvedInitialAuth = useRef(false);

  // Record browse on mount
  useEffect(() => {
    recordBrowse({
      id: currentProduct.id,
      name: currentProduct.name,
      region: currentProduct.region,
      displayPrice: currentProduct.displayPrice,
    });
    // Update local state
    const timer = setTimeout(() => setBrowseHistory(getDisplayBrowseHistory()), 50);
    return () => clearTimeout(timer);
  }, [currentProduct.displayPrice, currentProduct.id, currentProduct.name, currentProduct.region]);

  // Check favorite status when user logs in
  useEffect(() => {
    if (!user) {
      setIsFavorited(false);
      return;
    }
    checkFavorite(product.id).then((res) => setIsFavorited(res.isFavorited)).catch(() => undefined);
  }, [user, product.id]);

  // Listen for browse history updates
  useEffect(() => {
    const handler = () => setBrowseHistory(getDisplayBrowseHistory());
    window.addEventListener('browse-history-update', handler);
    return () => window.removeEventListener('browse-history-update', handler);
  }, []);

  useEffect(() => {
    if (loading) return;

    if (!hasResolvedInitialAuth.current) {
      hasResolvedInitialAuth.current = true;
      return;
    }

    let cancelled = false;

    apiFetch(`/api/products/${product.id}?track=1`, { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.success) {
          const raw = json.data;
          const merged = raw.product
            ? { ...raw.product, displayPrice: raw.displayPrice, costPrice: raw.costPrice }
            : raw;
          setCurrentProduct(normalizeDetailProduct(merged));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [loading, product.id, user?.id, user?.level]);

  const totalScore = sumScoreFields(currentProduct);
  const summaryTags = [
    totalScore > 0 ? `综合 ${totalScore}` : null,
    currentProduct.scoreNetwork > 0 ? `网络 ${currentProduct.scoreNetwork}` : null,
  ].filter(Boolean).slice(0, 3) as string[];
  const regionAnchor = createRegionAnchor(currentProduct.region);
  const totalPrice = currentProduct.displayPrice * quantity * period;
  const ticketHref = `/dashboard/tickets?create=1&type=PRESALE&serverId=${encodeURIComponent(currentProduct.id)}&serverName=${encodeURIComponent(currentProduct.name)}`;
  const categoryLabel = CATEGORY_LABELS[currentProduct.category] || currentProduct.category;
  const parameterRows = [
    { label: '产品定位', value: categoryLabel },
    { label: '地区机房', value: currentProduct.region },
    { 
      label: 'CPU 型号', 
      value: `${currentProduct.isDualCPU ? '双路 ' : ''}${currentProduct.cpu.model.replace(/^x2\s*/i, '').replace(/\s*x2$/i, '').trim()}` 
    },
    { label: '综合跑分', value: formatCurrency(currentProduct.totalBenchmark) },
    { label: '内存配置', value: currentProduct.memory },
    { label: '磁盘配置', value: currentProduct.storage },
    { label: '带宽线路', value: currentProduct.bandwidth },
  ];

  return (
    <div className="min-h-screen bg-[#f3f5f7] text-surface-600">
      <Header />

      <div className="bg-[#f9fafb] border-b border-surface-200 py-2 overflow-hidden">
        <div className="max-w-[1380px] mx-auto px-4">
          <p className="text-sm text-surface-400 truncate font-medium">
            <Link href="/servers" className="hover:text-surface-500 transition">服务器列表</Link>
            <span className="mx-2">/</span>
            <Link href={`/servers#${regionAnchor}`} className="hover:text-surface-500 transition">{currentProduct.region}</Link>
            <span className="mx-2">/</span>
            <span className="text-surface-500">{currentProduct.name}</span>
          </p>
        </div>
      </div>

      <div className="max-w-[1380px] mx-auto px-4 py-6 pb-28 xl:pb-6">
        <section className="rounded-[28px] bg-white border border-surface-200 shadow-[0_20px_60px_rgba(15,23,42,0.06)] overflow-hidden mb-6">
          <div className="px-6 py-8 md:px-8 border-b border-surface-100 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_45%,#eef3ff_100%)]">
            <div className="text-sm text-surface-400">
              <Link href={`/servers#${regionAnchor}`} className="hover:text-surface-500">返回价格表</Link>
              <span className="mx-2">/</span>
              <span>{currentProduct.region}</span>
              <span className="mx-2">/</span>
              <span>{currentProduct.name}</span>
            </div>

            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between mt-5">
              <div className="max-w-4xl">
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="px-3 py-1 rounded-full bg-surface-800 text-white text-xs font-medium tracking-[0.08em]">独立服务器</span>
                  <span className="px-3 py-1 rounded-full bg-surface-100 text-surface-500 text-xs font-medium">{currentProduct.region}</span>
                  <span className="px-3 py-1 rounded-full bg-surface-100 text-surface-500 text-xs font-medium">{categoryLabel}</span>
                  {currentProduct.isDualCPU && <span className="px-3 py-1 rounded-full bg-semantic-warning-light text-semantic-warning-dark text-xs font-medium">双路配置</span>}
                  {summaryTags.map((tag) => (
                    <span key={tag} className="px-3 py-1 rounded-full bg-surface-100 text-surface-400 text-xs font-medium">{tag}</span>
                  ))}
                </div>

                <h1 className="text-3xl md:text-5xl font-semibold tracking-tight text-surface-700">{currentProduct.name}</h1>
                <p className="mt-4 text-sm md:text-base text-surface-400 leading-7">
                  {currentProduct.aiDescription || `${getRegionDescription(currentProduct.region)} 当前配置支持按月提交开通申请，适合需要明确机房和硬件规格的采购场景。`}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 min-w-full xl:min-w-[520px]">
                <div className="rounded-8 border border-surface-200 bg-white px-4 py-4">
                  <p className="text-xs text-surface-400">当前月付</p>
                  <p className="mt-2 text-2xl font-semibold text-surface-700">¥{formatCurrency(currentProduct.displayPrice)}</p>
                </div>
                <div className="rounded-8 border border-surface-200 bg-white px-4 py-4">
                  <p className="text-xs text-surface-400">CPU 跑分</p>
                  <p className="mt-2 text-2xl font-semibold text-surface-700">{formatCurrency(currentProduct.totalBenchmark)}</p>
                </div>
                <div className="rounded-8 border border-surface-200 bg-white px-4 py-4">
                  <p className="text-xs text-surface-400">订单热度</p>
                  <p className="mt-2 text-2xl font-semibold text-surface-700">{currentProduct.orderCount}</p>
                </div>
                <div className="rounded-8 border border-surface-200 bg-white px-4 py-4">
                  <p className="text-xs text-surface-400">浏览次数</p>
                  <p className="mt-2 text-2xl font-semibold text-surface-700">{currentProduct.clickCount}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6 min-w-0">
            <section className="rounded-[28px] bg-white border border-surface-200 p-6 md:p-8 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-surface-400">机房概览</p>
                  <h2 className="mt-2 text-2xl font-semibold text-surface-700">机房说明</h2>
                </div>
                <Link href={`/servers#${regionAnchor}`} className="px-3.5 py-2 rounded-8 border border-surface-200 text-surface-500 text-sm transition hover:border-surface-300 hover:text-surface-600">
                  返回 {product.region} 价格表
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-8 border border-surface-200 bg-surface-50 px-5 py-4">
                  <p className="text-sm font-medium text-surface-600 mb-2">地区线路说明</p>
                  <p className="text-sm text-surface-400 leading-7">{getRegionDescription(currentProduct.region)}</p>
                </div>
                <div className="rounded-8 border border-surface-200 bg-surface-50 px-5 py-4">
                  <p className="text-sm font-medium text-surface-600 mb-2">业务建议</p>
                  <p className="text-sm text-surface-400 leading-7">
                    {currentProduct.aiSuitableFor || '适合需要确定机房、线路和单台硬件配置的稳定型业务，可按地区目录逐项比较后再提交开通工单。'}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] bg-white border border-surface-200 p-6 md:p-8 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
              <p className="text-xs uppercase tracking-[0.22em] text-surface-400">配置参数</p>
              <h2 className="mt-2 text-2xl font-semibold text-surface-700">产品参数</h2>

              <div className="mt-5 grid gap-3 sm:hidden">
                {parameterRows.map((row) => (
                  <div key={row.label} className="rounded-8 border border-surface-200 bg-surface-50 px-4 py-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-surface-400">{row.label}</p>
                    <p className="mt-2 text-sm font-medium text-surface-600">{row.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 hidden overflow-hidden rounded-8 border border-surface-200 sm:block">
                <table className="w-full text-sm">
                  <tbody>
                    {parameterRows.map((row) => (
                      <tr key={row.label} className="border-t border-surface-100 first:border-t-0">
                        <th className="w-40 bg-surface-50 px-5 py-4 text-left font-medium text-surface-400">{row.label}</th>
                        <td className="px-5 py-4 text-surface-600">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-[28px] bg-white border border-surface-200 p-6 md:p-8 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
              <div>
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-surface-400">评分</p>
                  <h2 className="mt-2 text-2xl font-semibold text-surface-700">产品评分</h2>
                  {totalScore > 0 ? (
                  <>
                  <p className="mt-1 text-sm text-surface-400">综合得分 {totalScore}</p>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {SCORE_DIMENSIONS.map((dimension) => {
                      const score = Number(currentProduct[dimension.field] ?? 0);
                      return (
                      <div key={dimension.field}>
                        <div className="flex justify-between text-xs text-surface-500 mb-1">
                          <span>{dimension.label}</span>
                          <span className="font-medium">{score}/100</span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-100 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${score}%`, backgroundColor: dimension.color }} />
                        </div>
                      </div>
                      );
                    })}
                  </div>
                  </>
                  ) : (
                  <p className="mt-5 text-sm text-surface-400 bg-surface-50 rounded-8 px-4 py-3">该产品暂未评分，管理员完成基准测试后将自动更新。</p>
                  )}
                </div>
                {currentProduct.cpu.tags.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {currentProduct.cpu.tags.map((tag) => (
                    <span key={tag} className="px-3 py-1.5 rounded-8 bg-surface-100 text-surface-500 text-xs font-medium">{tag}</span>
                  ))}
                </div>
                )}
              </div>
            </section>

            <section className="rounded-[28px] bg-white border border-surface-200 p-6 md:p-8 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-surface-400">交付规则</p>
                  <h2 className="mt-2 text-2xl font-semibold text-surface-700">开通说明</h2>
                  <div className="mt-5 space-y-2.5 text-sm text-surface-400">
                    {DELIVERY_NOTES.map((item) => (
                      <p key={item} className="rounded-8 bg-surface-50 px-4 py-3">{item}</p>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-surface-400">使用规范</p>
                  <h2 className="mt-2 text-2xl font-semibold text-surface-700">使用限制</h2>
                  <div className="mt-5 space-y-2.5 text-sm text-surface-400">
                    {COMPLIANCE_NOTES.map((item) => (
                      <p key={item} className="rounded-8 bg-surface-50 px-4 py-3">{item}</p>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside className="order-first space-y-6 xl:order-none xl:sticky xl:top-20 h-fit">
            <div className="rounded-[28px] bg-white border border-surface-200 p-6 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
              <p className="text-xs uppercase tracking-[0.22em] text-surface-400">当前定价</p>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-5xl font-semibold text-surface-700">¥{formatCurrency(currentProduct.displayPrice)}</span>
                <span className="text-sm text-surface-400 mb-2">/ 月</span>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="text-xs font-medium uppercase tracking-[0.2em] text-surface-400">数量</label>
                  <select
                    className="mt-2 h-12 w-full rounded-8 border border-surface-200 bg-white px-4 text-sm text-surface-500 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
                  >
                    {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                      <option key={value} value={value}>{value} 台</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium uppercase tracking-[0.2em] text-surface-400">时长</label>
                  <select
                    className="mt-2 h-12 w-full rounded-8 border border-surface-200 bg-white px-4 text-sm text-surface-500 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
                    value={period}
                    onChange={(e) => setPeriod(parseInt(e.target.value, 10))}
                  >
                    {[1, 3, 6, 12].map((value) => (
                      <option key={value} value={value}>{value} 个月</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 rounded-8 bg-surface-50 px-4 py-4">
                <div className="flex items-center justify-between text-sm text-surface-400 mb-2">
                  <span>计费方式</span>
                  <span>{formatCurrency(currentProduct.displayPrice)} x {quantity} x {period}</span>
                </div>
                <div className="flex items-center justify-between text-base font-semibold text-surface-700">
                  <span>合计</span>
                  <span>¥{formatCurrency(totalPrice)}</span>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setCartError('');
                    // Stock check (stock === -1 means unlimited)
                    if (currentProduct.stock !== -1 && currentProduct.stock < quantity) {
                      setCartError(`库存不足，当前库存 ${currentProduct.stock} 台`);
                      return;
                    }
                    const err = addToCart({
                      productId: currentProduct.id,
                      name: currentProduct.name,
                      region: currentProduct.region,
                      cpu: currentProduct.cpu.model,
                      memory: currentProduct.memory,
                      storage: currentProduct.storage,
                      bandwidth: currentProduct.bandwidth,
                      price: currentProduct.displayPrice,
                      quantity,
                      period,
                    });
                    if (err) {
                      setCartError(err);
                      return;
                    }
                    setCartAdded(true);
                    setTimeout(() => setCartAdded(false), 1500);
                  }}
                  className="w-full h-12 rounded-8 bg-surface-800 text-white text-sm font-medium transition hover:bg-surface-700 flex items-center justify-center"
                >
                  {cartAdded ? '已加入购物车' : '加入购物车'}
                </button>
                {cartError && (
                  <p className="text-xs text-semantic-danger text-center -mt-1">{cartError}</p>
                )}
                {user ? (
                  <Link
                    href={ticketHref}
                    className="w-full h-12 rounded-8 border border-surface-200 text-surface-500 text-sm font-medium transition hover:border-surface-300 hover:bg-surface-50 flex items-center justify-center"
                  >
                    联系开通
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => router.push('/login')}
                    className="w-full h-12 rounded-8 border border-surface-200 text-surface-500 text-sm font-medium transition hover:border-surface-300 hover:bg-surface-50 flex items-center justify-center"
                  >
                    登录后咨询
                  </button>
                )}

                <button
                  type="button"
                  disabled={favoriteLoading}
                  onClick={async () => {
                    if (!user) { router.push('/login'); return; }
                    setFavoriteLoading(true);
                    try {
                      if (isFavorited) {
                        await removeFavorite(currentProduct.id);
                        setIsFavorited(false);
                      } else {
                        await addFavorite(currentProduct.id);
                        setIsFavorited(true);
                      }
                    } catch {
                      // silent
                    } finally {
                      setFavoriteLoading(false);
                    }
                  }}
                  className={`w-full h-12 rounded-8 border text-sm font-medium transition flex items-center justify-center gap-2 ${
                    isFavorited
                      ? 'border-amber-300 bg-semantic-warning-light text-semantic-warning-dark hover:bg-amber-100'
                      : 'border-surface-200 text-surface-500 hover:border-surface-300 hover:bg-surface-50'
                  } disabled:opacity-60`}
                >
                  <span>{isFavorited ? '★' : '☆'}</span>
                  <span>{isFavorited ? '已收藏' : '收藏产品'}</span>
                </button>
              </div>
            </div>

            <div className="rounded-[28px] bg-white border border-surface-200 p-6 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
              <p className="text-xs uppercase tracking-[0.22em] text-surface-400">快捷入口</p>
              <div className="mt-4 space-y-2.5">
                <Link
                  href={`/servers#${regionAnchor}`}
                  className="flex items-center justify-between rounded-8 border border-surface-200 px-4 py-3 text-sm text-surface-500 transition hover:border-surface-300 hover:text-surface-600"
                >
                  <span>返回 {currentProduct.region} 价格表</span>
                  <span>查看</span>
                </Link>
                <Link
                  href="/servers"
                  className="flex items-center justify-between rounded-8 border border-surface-200 px-4 py-3 text-sm text-surface-500 transition hover:border-surface-300 hover:text-surface-600"
                >
                  <span>返回全部地区目录</span>
                  <span>查看</span>
                </Link>
                {user ? (
                  <Link
                    href={ticketHref}
                    className="flex items-center justify-between rounded-8 border border-surface-200 px-4 py-3 text-sm text-surface-500 transition hover:border-surface-300 hover:text-surface-600"
                  >
                    <span>提交工单咨询</span>
                    <span>前往</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => router.push('/login')}
                    className="w-full flex items-center justify-between rounded-8 border border-surface-200 px-4 py-3 text-sm text-surface-500 transition hover:border-surface-300 hover:text-surface-600"
                  >
                    <span>登录后提交咨询</span>
                    <span>前往</span>
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* 最近浏览 */}
      {browseHistory.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 py-10 md:px-10 md:py-12">
          <div className="mb-5 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-surface-600">最近浏览 ({browseHistory.length})</p>
            <button
              onClick={() => {
                clearBrowseHistory();
                setBrowseHistory([]);
              }}
              className="text-xs text-surface-400 hover:text-surface-500 transition"
            >
              清空
            </button>
          </div>
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4">
              {browseHistory.map((item) => (
                <Link
                  key={item.productId}
                  href={`/servers/${item.productId}`}
                  className="shrink-0 w-64 rounded-8 border border-surface-200 p-4 hover:shadow-md transition"
                >
                  <p className="font-medium text-surface-600 truncate">{item.productName}</p>
                  <p className="text-xs text-surface-400 mt-1">{item.region}</p>
                  <p className="text-sm font-semibold text-surface-600 mt-3">¥{formatCurrency(item.displayPrice)}<span className="text-xs font-normal text-surface-400">/月</span></p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-surface-200 bg-white/95 backdrop-blur xl:hidden">
        <div className="flex items-center gap-3 px-4 py-3 pb-safe">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-surface-400">当前合计</p>
            <p className="mt-1 text-lg font-semibold text-surface-700">¥{formatCurrency(totalPrice)}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCartError('');
              if (currentProduct.stock !== -1 && currentProduct.stock < quantity) {
                setCartError(`库存不足，当前库存 ${currentProduct.stock} 台`);
                return;
              }
              const err = addToCart({
                productId: currentProduct.id,
                name: currentProduct.name,
                region: currentProduct.region,
                cpu: currentProduct.cpu.model,
                memory: currentProduct.memory,
                storage: currentProduct.storage,
                bandwidth: currentProduct.bandwidth,
                price: currentProduct.displayPrice,
                quantity,
                period,
              });
              if (err) {
                setCartError(err);
                return;
              }
              setCartAdded(true);
              setTimeout(() => setCartAdded(false), 1500);
            }}
            className="flex min-h-[48px] items-center justify-center rounded-8 bg-surface-800 px-5 text-sm font-medium text-white"
          >
            {cartAdded ? '已加入购物车' : '加入购物车'}
          </button>
        </div>
      </div>

      <ShoppingCart />
    </div>
  );
}
