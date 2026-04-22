'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import Header from '@/components/Header';
import ShoppingCart from '@/components/ShoppingCart';
import { AuthProvider } from '@/components/AuthProvider';
import { useSiteMeta } from '@/components/SiteMetaProvider';
import { apiFetch } from '@/lib/api-client';

type HomeProduct = {
  id: string;
  name: string;
  region: string;
  cpuDisplay?: string;
  memory?: string;
  storage?: string;
  bandwidth?: string;
  protectionLabel?: string;
  originalPrice?: number;
  price?: number;
  stock?: number;
  orderCount?: number;
};

type RegionStat = {
  region: string;
  count: number;
};

const TRUST_BADGES = [
  { label: '7×24 工单响应', desc: '高级会员 1 小时内响应' },
  { label: '多线 BGP', desc: '国内外优质节点' },
  { label: '透明价格', desc: '按等级阶梯定价，无隐性费用' },
  { label: '开通即服务', desc: '常规机型 30 分钟内交付' },
];

const SOLUTION_CARDS = [
  {
    title: '电商 / 建站',
    desc: '高并发、低延迟，适合商城、官网、ERP 等业务。',
    tag: '推荐 BGP / 高防',
  },
  {
    title: '游戏 / 加速',
    desc: '多线接入 + 防御防护，适合游戏厅、联机、加速节点。',
    tag: '推荐 高防 / 低延迟',
  },
  {
    title: 'AI / 渲染',
    desc: '高主频多核 CPU + 大内存，跑模型、渲染、数据处理。',
    tag: '推荐 多路 CPU',
  },
  {
    title: '企业办公 / 托管',
    desc: '数据本地化，支持托管自有设备。',
    tag: '推荐 托管服务',
  },
];

function formatPrice(v?: number) {
  if (v === undefined || v === null || Number.isNaN(v)) return '--';
  if (v >= 1000) return `¥${Math.round(v)}`;
  return `¥${v.toFixed(0)}`;
}

function HomePage() {
  const { siteMeta } = useSiteMeta();
  const [hotProducts, setHotProducts] = useState<HomeProduct[]>([]);
  const [regions, setRegions] = useState<RegionStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [prodRes, filterRes] = await Promise.all([
          apiFetch('/api/products?page=1&pageSize=6&sort=hot').catch(() => null),
          apiFetch('/api/filters').catch(() => null),
        ]);
        if (!cancelled && prodRes && prodRes.ok) {
          const data = await prodRes.json();
          const list: HomeProduct[] = (data?.products || data?.data?.products || []).slice(0, 6);
          setHotProducts(list);
        }
        if (!cancelled && filterRes && filterRes.ok) {
          const data = await filterRes.json();
          const raw = data?.regions || data?.data?.regions || [];
          const mapped: RegionStat[] = raw
            .map((r: unknown) => {
              if (typeof r === 'string') {
                return { region: r, count: 0 };
              }
              if (r && typeof r === 'object') {
                const obj = r as { region?: unknown; name?: unknown; count?: unknown; productCount?: unknown };
                return {
                  region: String(obj.region ?? obj.name ?? ''),
                  count: Number(obj.count ?? obj.productCount ?? 0) || 0,
                };
              }
              return { region: '', count: 0 };
            })
            .filter((r: RegionStat) => r.region)
            .slice(0, 8);
          setRegions(mapped);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#f4f8ff] text-surface-600">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(98,151,255,0.22),transparent_30%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.92),transparent_26%),linear-gradient(180deg,#eef5ff_0%,#f7fbff_42%,#ffffff_100%)]" />
      <div className="pointer-events-none absolute left-[-120px] top-24 -z-10 h-72 w-72 rounded-full bg-blue-200/30 blur-3xl" />
      <div className="pointer-events-none absolute right-[-80px] top-40 -z-10 h-64 w-64 rounded-full bg-sky-100/60 blur-3xl" />

      <Suspense fallback={<div className="h-[60px]" />}>
        <Header />
      </Suspense>

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-6 pt-16 pb-10 md:pt-24">
        <div className="grid gap-12 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div>
            <div className="inline-flex items-center rounded-full border border-blue-100 bg-semantic-info-light px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] text-brand-500">
              {siteMeta.siteName} · Cloud & Dedicated
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-surface-700 sm:text-5xl md:text-6xl">
              为业务精选的<br />
              物理服务器与机房资源
            </h1>
            <p className="mt-5 text-base leading-7 text-surface-400 md:text-lg">
              多地区 BGP / 高防 / 托管节点，按等级透明定价，常规机型 30 分钟内开通。
              支持按业务场景 AI 选配，售后工单 7×24 跟进。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
              <Link
                href="/servers"
                className="inline-flex h-12 items-center justify-center rounded-8 bg-[linear-gradient(135deg,#2f6dd6_0%,#5293ff_100%)] px-7 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(47,109,214,0.28)] transition hover:brightness-105"
              >
                按地区挑选
              </Link>
              <Link
                href="/provision"
                className="inline-flex h-12 items-center justify-center rounded-8 border border-blue-200 bg-white px-7 text-sm font-semibold text-surface-500 transition hover:border-blue-300 hover:bg-semantic-info-light"
              >
                AI 智选（按场景）
              </Link>
              <Link
                href="/docs"
                className="inline-flex h-12 items-center justify-center rounded-8 px-4 text-sm font-medium text-surface-400 transition hover:text-brand-500"
              >
                查看帮助文档 →
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TRUST_BADGES.map((b) => (
                <div
                  key={b.label}
                  className="rounded-8 border border-blue-100/80 bg-white/80 px-3 py-3 backdrop-blur"
                >
                  <div className="text-sm font-semibold text-surface-600">{b.label}</div>
                  <div className="mt-1 text-xs text-surface-400">{b.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Region card */}
          <div className="relative rounded-3xl border border-blue-100 bg-white/80 p-6 shadow-[0_20px_60px_rgba(47,109,214,0.08)] backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-surface-400">按地区选购</div>
                <div className="mt-1 text-lg font-semibold text-surface-600">
                  {regions.length > 0 ? `${regions.length} 个可用地区` : '加载中…'}
                </div>
              </div>
              <Link
                href="/servers"
                className="text-xs font-medium text-brand-500 hover:underline"
              >
                全部地区 →
              </Link>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {loading && regions.length === 0
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-14 rounded-8 bg-surface-100/70 animate-pulse" />
                  ))
                : regions.map((r) => (
                    <Link
                      key={r.region}
                      href={`/servers?region=${encodeURIComponent(r.region)}`}
                      className="flex items-center justify-between rounded-8 border border-surface-100 bg-white px-3 py-3 transition hover:border-blue-200 hover:bg-semantic-info-light/60"
                    >
                      <span className="text-sm font-medium text-surface-600">{r.region}</span>
                      {r.count > 0 && (
                        <span className="text-xs text-surface-400">{r.count} 款</span>
                      )}
                    </Link>
                  ))}
            </div>
          </div>
        </div>
      </section>

      {/* Hot products */}
      <section className="relative mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-500">
              Hot Products
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-surface-600">本周热门机型</h2>
          </div>
          <Link
            href="/servers"
            className="text-sm font-medium text-brand-500 hover:underline"
          >
            查看全部 →
          </Link>
        </div>

        {loading && hotProducts.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-44 rounded-8 border border-surface-100 bg-white/70 animate-pulse"
              />
            ))}
          </div>
        ) : hotProducts.length === 0 ? (
          <div className="rounded-8 border border-dashed border-surface-200 bg-white/60 py-10 text-center text-sm text-surface-400">
            暂无上架产品，请管理员先发布
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hotProducts.map((p) => (
              <Link
                key={p.id}
                href={`/servers/${p.id}`}
                className="group flex flex-col justify-between rounded-8 border border-surface-100 bg-white p-5 shadow-[0_8px_30px_rgba(47,109,214,0.05)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_16px_40px_rgba(47,109,214,0.12)]"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-semantic-info-light px-2.5 py-0.5 text-xs font-medium text-brand-500">
                      {p.region}
                    </span>
                    {p.protectionLabel && (
                      <span className="text-xs text-surface-400">{p.protectionLabel}</span>
                    )}
                  </div>
                  <div className="mt-3 line-clamp-2 text-base font-semibold text-surface-600 group-hover:text-brand-500">
                    {p.name}
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-surface-400">
                    {p.cpuDisplay && <div>CPU · {p.cpuDisplay}</div>}
                    {p.memory && <div>内存 · {p.memory}</div>}
                    {p.storage && <div>硬盘 · {p.storage}</div>}
                    {p.bandwidth && <div>带宽 · {p.bandwidth}</div>}
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-xs text-surface-400">起价</div>
                    <div className="text-xl font-semibold text-surface-600">
                      {formatPrice(p.price ?? p.originalPrice)}
                      <span className="ml-1 text-xs font-normal text-surface-400">/月</span>
                    </div>
                  </div>
                  <span className="rounded-full border border-blue-100 px-3 py-1 text-xs text-brand-500 transition group-hover:bg-brand-500 group-hover:text-white">
                    查看配置
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Solutions */}
      <section className="relative mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-500">
            Solutions
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-surface-600">按业务场景挑选</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SOLUTION_CARDS.map((s) => (
            <Link
              key={s.title}
              href={`/provision?scene=${encodeURIComponent(s.title)}`}
              className="group flex flex-col rounded-8 border border-surface-100 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_16px_40px_rgba(47,109,214,0.1)]"
            >
              <div className="text-sm font-semibold text-surface-600 group-hover:text-brand-500">
                {s.title}
              </div>
              <div className="mt-2 flex-1 text-xs leading-5 text-surface-400">{s.desc}</div>
              <div className="mt-4 inline-flex w-max items-center rounded-full bg-semantic-info-light px-2.5 py-0.5 text-xs text-brand-500">
                {s.tag}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="relative mx-auto max-w-6xl px-6 pb-16 pt-6">
        <div className="flex flex-col items-center justify-between gap-4 rounded-3xl border border-blue-100 bg-white/80 px-8 py-10 shadow-[0_20px_60px_rgba(47,109,214,0.08)] backdrop-blur md:flex-row">
          <div>
            <div className="text-lg font-semibold text-surface-600">企业采购 / 批量询价</div>
            <div className="mt-1 text-sm text-surface-400">
              5 台起支持定制配置、合同签署、对公转账与发票开具。
            </div>
          </div>
          <div className="flex gap-3">
            <Link
              href="/tickets/new?type=PRESALE&subject=企业采购询价"
              className="inline-flex h-11 items-center justify-center rounded-8 bg-surface-800 px-5 text-sm font-semibold text-white transition hover:bg-surface-700"
            >
              发起询价工单
            </Link>
            <Link
              href="/docs"
              className="inline-flex h-11 items-center justify-center rounded-8 border border-surface-200 bg-white px-5 text-sm font-medium text-surface-500 transition hover:border-blue-200 hover:text-brand-500"
            >
              查看合作方案
            </Link>
          </div>
        </div>
      </section>

      {/* Site Footer */}
      <footer className="border-t border-surface-100 bg-white/60 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <div className="text-sm font-semibold text-surface-600">{siteMeta.siteName}</div>
              <p className="mt-2 text-xs leading-5 text-surface-400">
                多地区物理服务器租用与托管，按等级透明定价，售后工单 7x24 跟进。
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.15em] text-surface-400">产品</div>
              <div className="mt-3 space-y-2">
                <Link href="/servers" className="block text-sm text-surface-500 hover:text-surface-600 transition">服务器列表</Link>
                <Link href="/provision" className="block text-sm text-surface-500 hover:text-surface-600 transition">AI 智选</Link>
                <Link href="/membership" className="block text-sm text-surface-500 hover:text-surface-600 transition">会员权益</Link>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.15em] text-surface-400">支持</div>
              <div className="mt-3 space-y-2">
                <Link href="/docs" className="block text-sm text-surface-500 hover:text-surface-600 transition">帮助中心</Link>
                <Link href="/dashboard/tickets" className="block text-sm text-surface-500 hover:text-surface-600 transition">提交工单</Link>
                <Link href="/api-docs" className="block text-sm text-surface-500 hover:text-surface-600 transition">API 文档</Link>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.15em] text-surface-400">账户</div>
              <div className="mt-3 space-y-2">
                <Link href="/dashboard" className="block text-sm text-surface-500 hover:text-surface-600 transition">控制台</Link>
                <Link href="/register" className="block text-sm text-surface-500 hover:text-surface-600 transition">注册</Link>
              </div>
            </div>
          </div>
          <div className="mt-8 border-t border-surface-100 pt-6 text-center text-xs text-surface-400">
            &copy; {new Date().getFullYear()} {siteMeta.siteName}. All rights reserved.
          </div>
        </div>
      </footer>

      <ShoppingCart />
    </div>
  );
}

export default function Page() {
  return (
    <AuthProvider>
      <HomePage />
    </AuthProvider>
  );
}
