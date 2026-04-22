'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import ShoppingCart from '@/components/ShoppingCart';
import { apiFetch } from '@/lib/api-client';
import {
  createRegionAnchor,
  formatCurrency,
  getRegionDescription,
  sortRegionNamesLikeE81,
} from '@/lib/catalog';
import { getDisplayBrowseHistory, clearBrowseHistory } from '@/lib/browse-history';
import { addFavorite, removeFavorite, getFavorites } from '@/lib/favorites';

function useRevealOnScroll() {
  const observerRef = useRef<IntersectionObserver | null>(null);

  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (!el) return;

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      el.style.opacity = '1';
      el.style.transform = 'none';
      return;
    }

    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('region-visible');
              obs.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
      );
    }
    observerRef.current.observe(el);
  }, []);

  useEffect(() => {
    return () => observerRef.current?.disconnect();
  }, []);

  return register;
}

interface CPU {
  id: string;
  model: string;
  cores: number;
  frequency: string;
  benchmark: number;
  tags: string[];
}

interface Product {
  id: string;
  name: string;
  region: string;
  cpuDisplay?: string;
  cpu?: CPU;
  isDualCPU: boolean;
  memory: string;
  storage: string;
  bandwidth: string;
  displayPrice: number;
  ipLabel: string;
  protectionLabel: string;
}

interface Filters {
  regions: Array<string | { name: string; count?: number }>;
}

function normalizeRegionNames(filters: Filters, products: Product[]) {
  const names = (filters.regions || [])
    .map((region) => {
      if (typeof region === 'string') return region.trim();
      return region?.name?.trim() || '';
    })
    .filter(Boolean);

  if (names.length > 0) {
    return Array.from(new Set(names));
  }

  return Array.from(
    new Set(
      products
        .map((product) => product.region?.trim() || '')
        .filter(Boolean)
    )
  );
}

const CATALOG_LIMIT = 2000;

const NAV_GROUPS = [
  { key: 'multi', label: '多线物理机' },
  { key: 'telecom', label: '电信物理机' },
  { key: 'unicom', label: '联通物理机' },
  { key: 'mobile', label: '移动物理机' },
  { key: 'overseas', label: '海外物理机' },
] as const;

function getRegionGroupKey(region: string) {
  if (region.includes('BGP') || region.includes('多线')) return 'multi';
  if (region.includes('电信')) return 'telecom';
  if (region.includes('联通')) return 'unicom';
  if (region.includes('移动')) return 'mobile';
  return 'overseas';
}

function getRegionTag(region: string): { text: string } | null {
  if (region.includes('枣庄')) return { text: '死扛攻击' };
  if (region.includes('镇江')) return { text: '高防BGP' };
  if (region.includes('襄阳BGP')) return { text: '超高防BGP' };
  if (region.includes('台州')) return { text: '高防BGP' };
  if (region.includes('广州')) return { text: '优质线路' };
  if (region.includes('温州')) return { text: '高防BGP' };
  if (region.includes('金华电信')) return { text: '性价比高防' };
  if (region.includes('宁波电信')) return { text: '线路好' };
  if (region.includes('襄阳电信')) return { text: '高防电信' };
  if (region.includes('泉州电信')) return { text: '可封UDP' };
  if (region.includes('宁波联通')) return { text: '云盾接入' };
  if (region.includes('济南联通')) return { text: '超高防' };
  return null;
}

function trimProductModelName(name: string, region: string) {
  const escapedRegion = region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name.replace(new RegExp(`^${escapedRegion}[-\\s]*`), '');
}

function formatMemoryLabel(memory: string) {
  const matched = memory.match(/(\d+)\s*G/i) || memory.match(/(\d+)\s*GB/i);
  if (matched) return `${matched[1]}G`;
  return memory;
}

function formatCpuDisplay(product: Product) {
  if (product.cpuDisplay) {
    return product.cpuDisplay;
  }
  let model = product.cpu?.model || '';
  if (!model) {
    return '待补充';
  }
  if (product.isDualCPU) {
    model = model.replace(/^x2\s*/i, '').replace(/\s*x2$/i, '').trim();
  }
  const prefix = product.isDualCPU ? '双路 ' : '';
  return `${prefix}${model}`;
}

function ServersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState<Filters>({ regions: [] });
  const [loading, setLoading] = useState(true);
  const [activeRegionId, setActiveRegionId] = useState('');
  const [browseHistory, setBrowseHistory] = useState(getDisplayBrowseHistory());
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());
  const [favoriteLoading, setFavoriteLoading] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [browseHistoryCollapsed, setBrowseHistoryCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const val = localStorage.getItem('browseHistoryCollapsed');
      return val === 'true';
    } catch {
      return false;
    }
  });
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const navScrollLock = useRef(false);
  const registerReveal = useRevealOnScroll();

  // Listen for browse history updates
  useEffect(() => {
    const handler = () => setBrowseHistory(getDisplayBrowseHistory());
    window.addEventListener('browse-history-update', handler);
    return () => window.removeEventListener('browse-history-update', handler);
  }, []);

  // Load user favorites
  useEffect(() => {
    if (!user) { setFavoritedIds(new Set()); return; }
    getFavorites(1, 50)
      .then((res) => {
        const ids = new Set(res.data.map((f) => f.productId));
        setFavoritedIds(ids);
      })
      .catch(() => undefined);
  }, [user]);

  // Save collapse state
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('browseHistoryCollapsed', browseHistoryCollapsed.toString());
  }, [browseHistoryCollapsed]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [mobileNavOpen]);

  const unwrapData = <T,>(json: unknown): T | null => {
    if (!json || typeof json !== 'object') return null;
    const obj = json as { success?: unknown; data?: unknown };
    if (Object.prototype.hasOwnProperty.call(obj, 'success')) {
      if (!obj.success) return null;
      return (obj.data ?? null) as T | null;
    }
    return json as T;
  };

  useEffect(() => {
    apiFetch('/api/filters', { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        const data = unwrapData<Filters>(json);
        if (data) setFilters(data);
      })
      .catch(() => {
        setFilters({ regions: [] });
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('sort', 'e81');
    params.set('page', '1');
    // Keep both keys for compatibility with old/new backend pagination names.
    params.set('pageSize', String(CATALOG_LIMIT));
    params.set('limit', String(CATALOG_LIMIT));
    setLoading(true);
    apiFetch(`/api/products?${params}`, { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        const data = unwrapData<{ products?: Product[] }>(json);
        setProducts(Array.isArray(data?.products) ? data.products : []);
      })
      .catch(() => {
        setProducts([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [user?.id, user?.level]);

  const regionNames = sortRegionNamesLikeE81(normalizeRegionNames(filters, products));

  const visibleRegions = regionNames
    .map((regionName) => ({
      name: regionName,
      products: products.filter((p) => p.region === regionName),
    }))
    .filter((r) => r.products.length > 0);

  const groupedSidebar = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: visibleRegions.filter((r) => getRegionGroupKey(r.name) === group.key),
    }))
    .filter((g) => g.items.length > 0);

  useEffect(() => {
    if (loading || visibleRegions.length === 0) return;
    if (!activeRegionId && visibleRegions.length > 0) {
      setActiveRegionId(createRegionAnchor(visibleRegions[0].name));
    }

    const handleScroll = () => {
      if (navScrollLock.current) return;
      const scrollY = window.scrollY + 120;
      let current = '';
      for (const region of visibleRegions) {
        const id = createRegionAnchor(region.name);
        const el = sectionRefs.current.get(id);
        if (el && el.offsetTop <= scrollY) {
          current = id;
        }
      }
      if (current && current !== activeRegionId) {
        setActiveRegionId(current);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loading, visibleRegions, activeRegionId]);

  const scrollToRegion = useCallback((regionName: string) => {
    const id = createRegionAnchor(regionName);
    const el = sectionRefs.current.get(id);
    if (el) {
      navScrollLock.current = true;
      setActiveRegionId(id);
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => { navScrollLock.current = false; }, 800);
    }
  }, []);

  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(id, el);
    else sectionRefs.current.delete(id);
    registerReveal(id, el);
  }, [registerReveal]);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  }, []);

  const startCompare = useCallback(() => {
    if (compareIds.length < 2) return;
    router.push(`/servers/compare?ids=${compareIds.join(',')}`);
  }, [compareIds, router]);

  return (
    <div className="min-h-screen md:flex" style={{ fontFamily: '"Inter",-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif', background: '#f5f7fa', color: '#1d1d1f', letterSpacing: '-0.02em' }}>
      <div className="sticky top-0 z-40 border-b bg-white/90 px-4 py-3 backdrop-blur md:hidden" style={{ borderColor: '#e5e8ee' }}>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="touch-target inline-flex items-center justify-center rounded-8 border border-surface-200 text-surface-500"
            aria-label="打开地区目录"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-surface-600">服务器租用价格表</p>
            <p className="truncate text-xs text-surface-400">
              {visibleRegions.find((region) => createRegionAnchor(region.name) === activeRegionId)?.name || '按地区查看产品'}
            </p>
          </div>
          {compareIds.length > 0 && (
            <button
              type="button"
              onClick={startCompare}
              disabled={compareIds.length < 2}
              className="rounded-8 bg-surface-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              对比 {compareIds.length}
            </button>
          )}
        </div>
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-surface-800/35 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-full max-w-sm flex-col bg-white shadow-modal animate-slide-in-right">
            <div className="border-b px-5 py-4 pt-safe" style={{ borderColor: '#e5e8ee' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-surface-600">服务器租用</h2>
                  <p className="mt-1 text-xs text-surface-400">全球数据中心</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="touch-target inline-flex items-center justify-center rounded-8 border border-surface-200 text-surface-400"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {groupedSidebar.map((group) => (
                <div key={group.key} className="mb-6">
                  <div className="mb-3 flex items-center gap-2 px-2">
                    <h3 className="text-sm font-bold tracking-wide text-surface-600">{group.label}</h3>
                    <div className="h-[3px] w-5 rounded-full bg-brand-500/80" />
                  </div>
                  <div className="space-y-1">
                    {group.items.map((region) => {
                      const tag = getRegionTag(region.name);
                      const sectionId = createRegionAnchor(region.name);
                      const isActive = activeRegionId === sectionId;
                      return (
                        <button
                          key={region.name}
                          onClick={() => {
                            scrollToRegion(region.name);
                            setMobileNavOpen(false);
                          }}
                          className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-8 border px-3 py-2 text-left text-sm ${
                            isActive
                              ? 'border-blue-600 bg-brand-500 text-white shadow-[0_10px_24px_rgba(0,122,255,0.2)]'
                              : 'border-transparent text-surface-600'
                          }`}
                        >
                          <span className="break-words">{region.name}</span>
                          {tag && (
                            <span
                              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] ${
                                isActive ? 'border border-white/30 bg-white/15 text-white' : 'border border-surface-200 bg-surface-50 text-surface-400'
                              }`}
                            >
                              {tag.text}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="border-t px-1 pt-5" style={{ borderColor: '#e5e8ee' }}>
                <button
                  onClick={() => setBrowseHistoryCollapsed(!browseHistoryCollapsed)}
                  className="mb-3 flex w-full items-center justify-between"
                >
                  <h3 className="text-sm font-bold tracking-wide text-surface-600">最近浏览</h3>
                  <span className="text-sm text-surface-400">{browseHistoryCollapsed ? '展开' : '折叠'}</span>
                </button>
                {!browseHistoryCollapsed && browseHistory.length > 0 && (
                  <div className="space-y-2">
                    {browseHistory.map((item) => (
                      <Link
                        key={item.productId}
                        href={`/servers/${item.productId}`}
                        onClick={() => setMobileNavOpen(false)}
                        className="block rounded-8 border border-surface-100 px-3 py-3 text-xs transition hover:bg-surface-50"
                      >
                        <p className="truncate font-medium text-surface-600">{item.productName}</p>
                        <p className="mt-1 text-[12px] text-surface-400">¥{formatCurrency(item.displayPrice)}/月</p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-[240px] overflow-y-auto border-r md:block" style={{ background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(16px)', borderColor: '#e5e8ee' }}>
        <div className="px-6 pb-[18px] pt-5 border-b" style={{ borderColor: '#e5e8ee' }}>
          <h2 className="text-[20px] font-bold" style={{ color: '#1d1d1f' }}>服务器租用</h2>
          <p className="text-[13px] font-medium mt-1" style={{ color: '#666b73' }}>全球数据中心</p>
        </div>
        <div className="px-[14px] pt-[18px]">
          {groupedSidebar.map((group) => (
            <div key={group.key} className="mb-7">
              <div className="px-2 mb-3.5 flex flex-col gap-2">
                <h3 className="text-[15px] font-bold tracking-wide text-surface-600">{group.label}</h3>
                <div className="w-5 h-[3px] rounded-full bg-brand-500/80" />
              </div>
              <div className="flex flex-col gap-1">
                {group.items.map((region) => {
                  const tag = getRegionTag(region.name);
                  const sectionId = createRegionAnchor(region.name);
                  const isActive = activeRegionId === sectionId;
                  return (
                    <button
                      key={region.name}
                      onClick={() => scrollToRegion(region.name)}
                      className="w-full rounded-[10px] text-left transition-colors flex items-center justify-between gap-2"
                      style={{
                        minHeight: 44,
                        padding: '8px 10px',
                        fontSize: 13,
                        fontWeight: isActive ? 600 : 500,
                        lineHeight: '1.3',
                        color: isActive ? '#fff' : '#1d1d1f',
                        background: isActive ? '#007aff' : 'transparent',
                        border: '1px solid transparent',
                        boxShadow: isActive ? '0 6px 14px rgba(0,122,255,0.2)' : 'none',
                      }}
                    >
                      <span className="break-words">{region.name}</span>
                      {tag && (
                        <span
                          className="shrink-0 rounded-full text-[10px] inline-flex items-center gap-1 whitespace-nowrap"
                          style={{
                            padding: '2px 6px',
                            border: isActive ? '1px solid rgba(255,255,255,0.38)' : '1px solid #e5e8ee',
                            background: isActive ? 'rgba(255,255,255,0.14)' : '#f7f8fa',
                            color: isActive ? '#fff' : '#666b73',
                          }}
                        >
                          <span className="w-[6px] h-[6px] rounded-full opacity-55" style={{ background: 'currentColor' }}></span>
                          {tag.text}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 最近浏览 */}
        <div className="px-[14px] pt-6 border-t" style={{ borderColor: '#e5e8ee' }}>
          <button
            onClick={() => setBrowseHistoryCollapsed(!browseHistoryCollapsed)}
            className="w-full flex items-center justify-between mb-3"
          >
            <h3 className="text-[15px] font-bold tracking-wide text-surface-600">最近浏览</h3>
            <span className="text-surface-400 text-sm">{browseHistoryCollapsed ? '展开' : '折叠'}</span>
          </button>
          {!browseHistoryCollapsed && browseHistory.length > 0 && (
            <div className="space-y-2 mb-4">
              {browseHistory.map((item) => (
                <Link
                  key={item.productId}
                  href={`/servers/${item.productId}`}
                  className="block rounded-lg p-2 hover:bg-surface-100 transition text-xs"
                >
                  <p className="font-medium text-surface-600 truncate">{item.productName}</p>
                  <p className="text-surface-400 text-[12px] mt-0.5">¥{formatCurrency(item.displayPrice)}/月</p>
                </Link>
              ))}
              <button
                onClick={() => {
                  clearBrowseHistory();
                  setBrowseHistory([]);
                }}
                className="w-full text-[12px] text-surface-400 hover:text-surface-500 transition py-1.5"
              >
                清空记录
              </button>
            </div>
          )}
          {browseHistory.length === 0 && !browseHistoryCollapsed && (
            <p className="text-[12px] text-surface-400 py-2">暂无浏览记录</p>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="min-h-screen w-full md:ml-[240px] md:w-[calc(100%-240px)]" style={{ background: '#f5f7fa' }}>
        {/* Hero section */}
        <header className="border-b text-center" style={{ background: '#fff', borderColor: '#e5e8ee', padding: '28px 0 24px' }}>
          <div style={{ maxWidth: '100%', padding: '0 16px', margin: '0 auto' }}>
            <h1 className="font-bold text-[30px] md:text-[36px]" style={{ lineHeight: 1.12, letterSpacing: '-0.025em', color: '#1d1d1f' }}>
              服务器租用价格表说明
            </h1>
            <p className="mx-auto mt-2 max-w-[640px] px-2 text-sm font-medium md:text-base" style={{ lineHeight: 1.45, color: '#666b73' }}>
              高性能 · 高稳定性 · 全球部署
            </p>

            <section className="mx-auto mt-5 text-left" style={{ maxWidth: 920 }}>
              <div className="rounded-8" style={{ background: '#f8fafd', border: '1px solid #e5e8ee', padding: '16px 16px 14px', boxShadow: '0 6px 20px rgba(16,24,40,0.06)' }}>
                <h3 className="mb-2 text-base font-bold md:text-lg" style={{ color: '#1d1d1f' }}>使用须知</h3>
                <p style={{ color: '#666b73', marginBottom: 0, lineHeight: 1.6 }}>
                  机房禁止承载违法违规、攻击滥用、侵权传播、灰黑产交易等业务。若发现违规使用，将直接关停并清退相关资源，已支付费用不予退还。
                </p>
              </div>
            </section>
          </div>
        </header>

        {/* Region sections */}
        <main style={{ padding: '18px 0 120px' }}>
          {loading ? (
            <div className="mx-4 rounded-8 p-8 text-center md:mx-5" style={{ background: '#fff', border: '1px solid #e5e8ee' }}>
              <p style={{ color: '#666b73' }}>数据加载中...</p>
            </div>
          ) : visibleRegions.length === 0 ? (
            <div className="mx-4 rounded-8 p-8 text-center md:mx-5" style={{ background: '#fff', border: '1px solid #e5e8ee' }}>
              <p style={{ color: '#666b73' }}>暂无数据</p>
            </div>
          ) : (
            groupedSidebar.map((group) => (
              <div key={group.key} className="mb-[60px]">
                <div className="mx-4 mb-4 mt-2 select-none border-b border-surface-200 pb-3 md:mx-[20px] md:mb-[20px] md:pb-[12px]">
                  <h2 className="flex items-center gap-3 text-[22px] font-bold tracking-tight text-surface-600 md:text-[28px]">
                    <span className="w-1.5 h-[28px] rounded-full bg-brand-500 inline-block mr-2" />
                    {group.label}
                  </h2>
                </div>
                {group.items.map((region) => {
                  const sectionId = createRegionAnchor(region.name);
                  return (
                    <section
                      key={region.name}
                      id={sectionId}
                      ref={(el) => registerRef(sectionId, el)}
                      className="rounded-[20px] region-reveal"
                      style={{
                        background: '#fff',
                        border: '1px solid #e5e8ee',
                        boxShadow: '0 6px 20px rgba(16,24,40,0.06)',
                        margin: '0 16px 20px',
                        padding: '24px 0 20px',
                      }}
                    >
                      <div style={{ marginBottom: 18, padding: '0 16px', maxWidth: 1060, marginLeft: 'auto', marginRight: 'auto' }}>
                        <h3 className="font-bold tracking-tight text-[22px] md:text-[24px]" style={{ lineHeight: 1.25, color: '#1d1d1f', marginBottom: 8 }}>
                          {region.name}
                        </h3>
                        <p className="text-sm md:text-[15px]" style={{ lineHeight: 1.6, color: '#666b73', margin: 0 }}>
                          {getRegionDescription(region.name)}
                        </p>
                      </div>

                      <div className="space-y-3 px-4 md:hidden">
                        {region.products.map((product) => (
                          <article key={product.id} className="rounded-8 border border-surface-200 bg-surface-50/70 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="mb-2 flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={compareIds.includes(product.id)}
                                    disabled={!compareIds.includes(product.id) && compareIds.length >= 4}
                                    onChange={() => toggleCompare(product.id)}
                                    title="加入对比"
                                    style={{ cursor: 'pointer', accentColor: '#007aff', width: 16, height: 16 }}
                                  />
                                  <Link href={`/servers/${product.id}`} className="text-sm font-semibold text-surface-600">
                                    {trimProductModelName(product.name, region.name)}
                                  </Link>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs text-surface-400">
                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-surface-400">CPU</p>
                                    <p className="mt-1 text-surface-500">{formatCpuDisplay(product)}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-surface-400">内存</p>
                                    <p className="mt-1 text-surface-500">{formatMemoryLabel(product.memory)}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-surface-400">硬盘</p>
                                    <p className="mt-1 text-surface-500">{product.storage}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-surface-400">带宽</p>
                                    <p className="mt-1 text-surface-500">{product.bandwidth}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-surface-400">IP</p>
                                    <p className="mt-1 text-surface-500">{product.ipLabel}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-surface-400">防护</p>
                                    <p className="mt-1 text-surface-500">{product.protectionLabel}</p>
                                  </div>
                                </div>
                              </div>
                              {user && (
                                <button
                                  type="button"
                                  disabled={favoriteLoading === product.id}
                                  title={favoritedIds.has(product.id) ? '取消收藏' : '收藏'}
                                  onClick={async () => {
                                    setFavoriteLoading(product.id);
                                    try {
                                      if (favoritedIds.has(product.id)) {
                                        await removeFavorite(product.id);
                                        setFavoritedIds((prev) => {
                                          const next = new Set(prev);
                                          next.delete(product.id);
                                          return next;
                                        });
                                      } else {
                                        await addFavorite(product.id);
                                        setFavoritedIds((prev) => new Set(prev).add(product.id));
                                      }
                                    } catch {
                                      // silent
                                    } finally {
                                      setFavoriteLoading(null);
                                    }
                                  }}
                                  className="text-xl leading-none"
                                  style={{
                                    color: favoritedIds.has(product.id) ? '#d97706' : '#cbd5e1',
                                    opacity: favoriteLoading === product.id ? 0.5 : 1,
                                  }}
                                >
                                  {favoritedIds.has(product.id) ? '★' : '☆'}
                                </button>
                              )}
                            </div>

                            <div className="mt-4 flex items-end justify-between gap-3">
                              <div>
                                <p className="text-[11px] uppercase tracking-[0.18em] text-surface-400">月付价格</p>
                                <p className="mt-1 text-xl font-semibold text-surface-600">¥{formatCurrency(product.displayPrice)}</p>
                              </div>
                              <Link
                                href={`/servers/${product.id}`}
                                className="inline-flex min-h-[44px] items-center justify-center rounded-8 bg-surface-800 px-4 text-sm font-medium text-white"
                              >
                                查看详情
                              </Link>
                            </div>
                          </article>
                        ))}
                      </div>

                      <div className="hidden overflow-x-auto md:block" style={{ padding: '0 32px' }}>
                        <table style={{ width: '100%', minWidth: 760, borderCollapse: 'separate', borderSpacing: 0, background: '#fff' }}>
                      <thead>
                        <tr>
                          {['', '型号', 'CPU', '内存', '硬盘', '带宽', 'IP', '防护', '月付价格', ''].map((h, i) => (
                            <th
                              key={h || `h${i}`}
                              style={{
                                background: '#f7f9fc',
                                color: '#666b73',
                                padding: '11px 12px',
                                textAlign: 'left' as const,
                                fontWeight: 700,
                                fontSize: 14,
                                borderTopLeftRadius: i === 0 ? 12 : 0,
                                borderTopRightRadius: i === 9 ? 12 : 0,
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {region.products.map((product, idx) => (
                          <tr key={product.id} className="hover-row row-fade" style={{ animationDelay: `${idx * 0.05}s` }}>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e8ee', textAlign: 'center' as const, width: 36 }}>
                              <input
                                type="checkbox"
                                checked={compareIds.includes(product.id)}
                                disabled={!compareIds.includes(product.id) && compareIds.length >= 4}
                                onChange={() => toggleCompare(product.id)}
                                title="加入对比"
                                style={{ cursor: 'pointer', accentColor: '#007aff', width: 15, height: 15 }}
                              />
                            </td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #e5e8ee', fontSize: 14, lineHeight: 1.38 }}>
                              <Link href={`/servers/${product.id}`} className="font-medium hover:underline" style={{ color: '#1d1d1f' }}>
                                {trimProductModelName(product.name, region.name)}
                              </Link>
                            </td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #e5e8ee', fontSize: 14, lineHeight: 1.38 }}>
                              <span>
                                {formatCpuDisplay(product)}
                              </span>
                            </td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #e5e8ee', fontSize: 14, lineHeight: 1.38 }}>
                              {formatMemoryLabel(product.memory)}
                            </td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #e5e8ee', fontSize: 14, lineHeight: 1.38 }}>
                              {product.storage}
                            </td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #e5e8ee', fontSize: 14, lineHeight: 1.38 }}>
                              {product.bandwidth}
                            </td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #e5e8ee', fontSize: 14, lineHeight: 1.38 }}>
                              {product.ipLabel}
                            </td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #e5e8ee', fontSize: 14, lineHeight: 1.38 }}>
                              {product.protectionLabel}
                            </td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #e5e8ee', fontSize: 14, lineHeight: 1.38, color: '#1d1d1f', fontWeight: 600 }}>
                              ¥{formatCurrency(product.displayPrice)}/月
                            </td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e8ee', textAlign: 'center' as const }}>
                              {user && (
                                <button
                                  type="button"
                                  disabled={favoriteLoading === product.id}
                                  title={favoritedIds.has(product.id) ? '取消收藏' : '收藏'}
                                  onClick={async () => {
                                    setFavoriteLoading(product.id);
                                    try {
                                      if (favoritedIds.has(product.id)) {
                                        await removeFavorite(product.id);
                                        setFavoritedIds((prev) => { const next = new Set(prev); next.delete(product.id); return next; });
                                      } else {
                                        await addFavorite(product.id);
                                        setFavoritedIds((prev) => new Set(prev).add(product.id));
                                      }
                                    } catch {
                                      // silent
                                    } finally {
                                      setFavoriteLoading(null);
                                    }
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: 18,
                                    color: favoritedIds.has(product.id) ? '#d97706' : '#cbd5e1',
                                    padding: '2px 4px',
                                    lineHeight: 1,
                                    opacity: favoriteLoading === product.id ? 0.5 : 1,
                                  }}
                                >
                                  {favoritedIds.has(product.id) ? '★' : '☆'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
              </div>
            ))
          )}
        </main>
      </div>

      {/* Floating compare bar */}
      {compareIds.length > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-[200] rounded-8 bg-[#1d1d1f] p-4 text-white shadow-[0_8px_32px_rgba(0,0,0,0.28)] md:bottom-7 md:left-1/2 md:right-auto md:w-auto md:min-w-[340px] md:-translate-x-1/2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <span className="whitespace-nowrap text-sm font-semibold">
              已选 {compareIds.length} / 4
            </span>
            <div className="flex flex-1 flex-wrap gap-2">
            {compareIds.map((id) => {
              const p = products.find((x) => x.id === id);
              return (
                <span
                  key={id}
                  className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-xs"
                >
                  {p ? trimProductModelName(p.name, p.region) : id}
                  <button
                    onClick={() => toggleCompare(id)}
                    className="bg-transparent p-0 text-sm leading-none text-white/60"
                  >
                    x
                  </button>
                </span>
              );
            })}
            </div>
            <div className="flex gap-2 md:ml-auto">
              <button
                onClick={() => setCompareIds([])}
                className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white/70"
              >
                清空
              </button>
              <button
                onClick={startCompare}
                disabled={compareIds.length < 2}
                className="rounded-lg bg-[#007aff] px-4 py-2 text-xs font-semibold text-white disabled:bg-white/20"
              >
                开始对比
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .hover-row:hover td { background: #f3f7ff; }

        .region-reveal {
          opacity: 0;
          transform: translateY(26px) scale(0.985);
          will-change: opacity, transform;
        }
        .region-visible {
          opacity: 1;
          transform: translateY(0) scale(1);
          transition: opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1), transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
        }

        @keyframes rowFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .row-fade {
          animation: rowFadeIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
          will-change: opacity;
        }

        .cpu-label {
          text-decoration: none;
          border-bottom: 1px dashed rgba(31,87,171,0.3);
        }
        .cpu-label:hover {
          color: #134289;
          border-bottom-color: rgba(19,66,137,0.5);
        }

        @media (prefers-reduced-motion: reduce) {
          .region-reveal { opacity: 1; transform: none; }
          .row-fade { animation: none; opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function Page() {
  return (
    <AuthProvider>
      <ServersPage />
      <ShoppingCart />
    </AuthProvider>
  );
}
