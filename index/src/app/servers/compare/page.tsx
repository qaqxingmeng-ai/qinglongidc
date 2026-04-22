'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/catalog';
import { AuthProvider } from '@/components/AuthProvider';

interface CompareProduct {
  id: string;
  name: string;
  category: string;
  region: string;
  cpuDisplay: string;
  cpuModel: string;
  cpuCores: number;
  cpuFrequency: string;
  cpuBenchmark: number;
  cpuTags: string;
  isDualCPU: boolean;
  memory: string;
  storage: string;
  bandwidth: string;
  ipLabel: string;
  protectionLabel: string;
  displayPrice: number;
  stock: number;
  scoreNetwork: number;
  scoreCpuSingle: number;
  scoreMemory: number;
  scoreStorage: number;
  aiDescription: string;
  aiSuitableFor: string;
}

const SCORE_LABELS: Array<{ key: keyof CompareProduct; label: string }> = [
  { key: 'scoreNetwork', label: '网络评分' },
  { key: 'scoreCpuSingle', label: 'CPU单核' },
  { key: 'scoreMemory', label: '内存评分' },
  { key: 'scoreStorage', label: '硬盘评分' },
];

function ScoreBar({ value, best, worst }: { value: number; best: number; worst: number }) {
  const isBest = value === best && best > 0;
  const isWorst = value === worst && worst < best;
  const color = isBest ? '#007aff' : isWorst ? '#e5e8ee' : '#94a3b8';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          height: 6,
          width: `${value}%`,
          maxWidth: '100%',
          minWidth: value > 0 ? 4 : 0,
          background: color,
          borderRadius: 4,
          transition: 'width 0.4s',
        }}
      />
      <span style={{ fontSize: 13, color: isBest ? '#007aff' : '#666b73', fontWeight: isBest ? 700 : 400 }}>
        {value}
      </span>
    </div>
  );
}

function trimModelName(name: string, region: string) {
  const escaped = region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name.replace(new RegExp(`^${escaped}[-\\s]*`), '');
}

function ComparePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [products, setProducts] = useState<CompareProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(false);

  const idsParam = searchParams.get('ids') || '';

  useEffect(() => {
    if (!idsParam) {
      setError('未指定对比商品');
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch(`/api/products/compare?ids=${encodeURIComponent(idsParam)}`, { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        const data = json?.ok === false ? null : (json?.data ?? json);
        if (!data?.products || data.products.length < 2) {
          setError('未能找到足够的商品进行对比');
          return;
        }
        setProducts(data.products);
      })
      .catch(() => setError('加载失败，请重试'))
      .finally(() => setLoading(false));
  }, [idsParam]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  // Compute best/worst per score key
  function getBestWorst(key: keyof CompareProduct) {
    const vals = products.map((p) => Number(p[key]) || 0);
    return { best: Math.max(...vals), worst: Math.min(...vals) };
  }

  const numCols = products.length;

  const specRows: Array<{ label: string; render: (p: CompareProduct) => string }> = [
    { label: '地区', render: (p) => p.region },
    { label: '分类', render: (p) => p.category },
    { label: 'CPU', render: (p) => p.cpuDisplay || p.cpuModel || '-' },
    { label: 'CPU 核心', render: (p) => p.cpuCores ? String(p.cpuCores) : '-' },
    { label: '双路', render: (p) => p.isDualCPU ? '是' : '否' },
    { label: 'CPU 基准分', render: (p) => p.cpuBenchmark ? String(p.cpuBenchmark) : '-' },
    { label: '内存', render: (p) => p.memory },
    { label: '硬盘', render: (p) => p.storage },
    { label: '带宽', render: (p) => p.bandwidth },
    { label: 'IP', render: (p) => p.ipLabel || '-' },
    { label: '防护', render: (p) => p.protectionLabel || '-' },
    { label: '库存', render: (p) => p.stock === -1 ? '充裕' : p.stock > 0 ? String(p.stock) : '无货' },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#666b73' }}>加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p style={{ color: '#666b73' }}>{error}</p>
        <button onClick={() => router.back()} style={{ background: '#007aff', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer' }}>
          返回
        </button>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="min-h-screen bg-surface-50 text-surface-600">
        <header className="sticky top-0 z-20 border-b border-surface-200 bg-white/95 px-4 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="touch-target inline-flex items-center justify-center rounded-8 border border-surface-200 text-surface-400"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-base font-semibold text-surface-700">产品配置对比</h1>
              <p className="text-xs text-surface-400">共 {numCols} 款产品，纵向逐项比较</p>
            </div>
          </div>
        </header>

        <div className="space-y-4 px-4 py-4">
          {products.map((product) => (
            <section key={product.id} className="overflow-hidden rounded-[24px] border border-surface-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
              <div className="border-b border-surface-100 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_45%,#eef4ff_100%)] px-4 py-5">
                <p className="text-xs font-medium text-surface-400">{product.region}</p>
                <Link href={`/servers/${product.id}`} className="mt-1 block text-lg font-semibold text-surface-700">
                  {trimModelName(product.name, product.region)}
                </Link>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-3xl font-semibold text-brand-500">¥{formatCurrency(product.displayPrice)}</span>
                  <span className="pb-1 text-xs text-surface-400">/月</span>
                </div>
                <Link
                  href={`/servers/${product.id}`}
                  className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-8 bg-surface-800 px-4 text-sm font-medium text-white"
                >
                  查看详情
                </Link>
              </div>

              <div className="space-y-5 px-4 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-surface-600">基础规格</h2>
                  <div className="mt-3 space-y-2">
                    {specRows.map((row) => (
                      <div key={row.label} className="rounded-8 bg-surface-50 px-4 py-3">
                        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-surface-400">{row.label}</p>
                        <p className="mt-1 text-sm font-medium text-surface-600">{row.render(product)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-sm font-semibold text-surface-600">评分表现</h2>
                  <div className="mt-3 space-y-3">
                    {SCORE_LABELS.map((score) => {
                      const { best, worst } = getBestWorst(score.key);
                      const value = Number(product[score.key]) || 0;
                      return (
                        <div key={score.key} className="rounded-8 border border-surface-100 px-4 py-3">
                          <div className="mb-2 flex items-center justify-between text-xs text-surface-400">
                            <span>{score.label}</span>
                            <span className="font-medium text-surface-500">{value}</span>
                          </div>
                          <ScoreBar value={value} best={best} worst={worst} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {(product.aiDescription || product.aiSuitableFor) && (
                  <div>
                    <h2 className="text-sm font-semibold text-surface-600">AI 建议</h2>
                    <div className="mt-3 rounded-8 bg-surface-50 px-4 py-4 text-sm leading-6 text-surface-500">
                      {product.aiDescription && <p className="mb-2">{product.aiDescription}</p>}
                      {product.aiSuitableFor && (
                        <p>
                          <span className="font-medium text-surface-600">适用场景：</span>
                          {product.aiSuitableFor}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', fontFamily: '"Inter",-apple-system,BlinkMacSystemFont,sans-serif', color: '#1d1d1f' }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e8ee', padding: '20px 32px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: '1px solid #e5e8ee', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, color: '#666b73' }}
        >
          &larr; 返回
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>产品配置对比</h1>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>共 {numCols} 款产品</span>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {/* Product name cards */}
        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${numCols}, 1fr)`, gap: 1, background: '#e5e8ee', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ background: '#f7f9fc', padding: '16px 18px' }} />
          {products.map((p) => (
            <div key={p.id} style={{ background: '#fff', padding: '18px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 4px' }}>{p.region}</p>
              <Link href={`/servers/${p.id}`} style={{ fontSize: 15, fontWeight: 700, color: '#1d1d1f', textDecoration: 'none' }}>
                {trimModelName(p.name, p.region)}
              </Link>
              <p style={{ fontSize: 20, fontWeight: 800, color: '#007aff', margin: '10px 0 4px' }}>
                ¥{formatCurrency(p.displayPrice)}<span style={{ fontSize: 13, fontWeight: 400, color: '#94a3b8' }}>/月</span>
              </p>
              <Link
                href={`/servers/${p.id}`}
                style={{
                  display: 'inline-block',
                  marginTop: 8,
                  background: '#007aff',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '6px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                立即订购
              </Link>
            </div>
          ))}
        </div>

        {/* Spec rows */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e8ee', overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e8ee', background: '#f7f9fc' }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>配置规格</h2>
          </div>
          {specRows.map((row, ri) => {
            const vals = products.map(row.render);
            const allSame = vals.every((v) => v === vals[0]);
            return (
              <div
                key={row.label}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `180px repeat(${numCols}, 1fr)`,
                  borderBottom: ri < specRows.length - 1 ? '1px solid #f0f2f5' : 'none',
                  background: ri % 2 === 0 ? '#fff' : '#fafbfd',
                }}
              >
                <div style={{ padding: '11px 18px', fontSize: 13, color: '#666b73', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                  {row.label}
                </div>
                {vals.map((val, ci) => (
                  <div
                    key={ci}
                    style={{
                      padding: '11px 16px',
                      fontSize: 13,
                      color: allSame ? '#1d1d1f' : '#1d1d1f',
                      fontWeight: allSame ? 400 : 600,
                      borderLeft: '1px solid #f0f2f5',
                    }}
                  >
                    {val}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Score rows */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e8ee', overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e8ee', background: '#f7f9fc' }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>性能评分对比</h2>
          </div>
          {SCORE_LABELS.map((s, ri) => {
            const { best, worst } = getBestWorst(s.key);
            return (
              <div
                key={s.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `180px repeat(${numCols}, 1fr)`,
                  borderBottom: ri < SCORE_LABELS.length - 1 ? '1px solid #f0f2f5' : 'none',
                  background: ri % 2 === 0 ? '#fff' : '#fafbfd',
                  alignItems: 'center',
                }}
              >
                <div style={{ padding: '11px 18px', fontSize: 13, color: '#666b73', fontWeight: 600 }}>
                  {s.label}
                </div>
                {products.map((p) => {
                  const val = Number(p[s.key]) || 0;
                  return (
                    <div key={p.id} style={{ padding: '11px 16px', borderLeft: '1px solid #f0f2f5' }}>
                      <ScoreBar value={val} best={best} worst={worst} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* AI descriptions */}
        {products.some((p) => p.aiDescription || p.aiSuitableFor) && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e8ee', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e8ee', background: '#f7f9fc' }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>AI 产品描述</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${numCols}, 1fr)`, gap: 1, background: '#e5e8ee' }}>
              {products.map((p) => (
                <div key={p.id} style={{ background: '#fff', padding: '18px' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px', color: '#1d1d1f' }}>
                    {trimModelName(p.name, p.region)}
                  </p>
                  {p.aiDescription && (
                    <p style={{ fontSize: 13, color: '#444', lineHeight: 1.6, margin: '0 0 8px' }}>{p.aiDescription}</p>
                  )}
                  {p.aiSuitableFor && (
                    <p style={{ fontSize: 12, color: '#666b73', lineHeight: 1.5, margin: 0 }}>
                      <strong>适用场景：</strong>{p.aiSuitableFor}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <AuthProvider>
      <Suspense>
        <ComparePage />
      </Suspense>
    </AuthProvider>
  );
}
