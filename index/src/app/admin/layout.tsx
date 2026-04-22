'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, Reorder, motion } from 'framer-motion';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import { RealtimeProvider, useRealtime } from '@/components/RealtimeProvider';
import { useSiteMeta } from '@/components/SiteMetaProvider';
import { apiFetch } from '@/lib/api-client';
import { normalizeAdminDashboardData } from '@/lib/admin-dashboard';
import { DEFAULT_ADMIN_SITE_META } from '@/lib/site-meta';
import { RouteFade, springSoft } from '@/components/admin/motion';
import { ToastProvider } from '@/components/admin/layout';
import {
  WorkTabsProvider,
  useWorkTabs,
  getNavContextFromPath,
  getTabInfoFromPath,
  ADMIN_MODULES,
  type AdminModuleKey,
  type WorkTab,
} from '@/components/WorkTabsProvider';
import type { ReactNode } from 'react';

type AdminBadges = {
  pendingOrders: number;
  openTickets: number;
  pendingServers: number;
};

function getUserInitial(name?: string | null) {
  const trimmed = (name ?? '').trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : 'A';
}

function ModuleIcon({ moduleKey, size = 20 }: { moduleKey: AdminModuleKey; size?: number }) {
  const p = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const s = { width: size, height: size };
  switch (moduleKey) {
    case 'overview':
      return <svg viewBox="0 0 24 24" {...s} {...p}><path d="M3 13h8V3H3v10z" /><path d="M13 21h8V11h-8v10z" /><path d="M13 3h8v6h-8V3z" /><path d="M3 21h8v-6H3v6z" /></svg>;
    case 'users':
      return <svg viewBox="0 0 24 24" {...s} {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case 'products':
      return <svg viewBox="0 0 24 24" {...s} {...p}><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>;
    case 'servers':
      return <svg viewBox="0 0 24 24" {...s} {...p}><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><path d="M6 6h.01" /><path d="M6 18h.01" /><path d="M10 6h6" /><path d="M10 18h6" /></svg>;
    case 'transactions':
      return <svg viewBox="0 0 24 24" {...s} {...p}><path d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" /><path d="M6 6h.01" /><path d="M10 6h4" /><path d="M6 10h12" /><path d="M6 14h8" /><path d="M6 18h6" /></svg>;
    case 'support':
      return <svg viewBox="0 0 24 24" {...s} {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case 'agent':
      return <svg viewBox="0 0 24 24" {...s} {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case 'content':
      return <svg viewBox="0 0 24 24" {...s} {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
    case 'system':
      return <svg viewBox="0 0 24 24" {...s} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09c-.658.003-1.25.396-1.51 1z" /></svg>;
  }
}

const SIDEBAR_ICON_W = 64;
const SIDEBAR_SUB_W = 180;
const SIDEBAR_TOTAL_W = SIDEBAR_ICON_W + SIDEBAR_SUB_W; // 244
const WORKTAB_H = 36; // full-width browser-style tab bar at very top
const HEADER_H = 44; // sub-menu panel header + TopHeader, aligned

/* ── Command Palette (Cmd+K / Ctrl+K) ── */
function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { openOrActivate } = useWorkTabs();
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const results: Array<{ item: { href: string; label: string }; modKey: AdminModuleKey; modLabel: string }> = [];
    for (const mod of ADMIN_MODULES) {
      for (const item of mod.subItems) {
        if (!q || item.label.toLowerCase().includes(q) || mod.label.toLowerCase().includes(q)) {
          results.push({ item, modKey: mod.key, modLabel: mod.label });
        }
      }
    }
    return results;
  }, [query]);

  useEffect(() => { if (open) { setQuery(''); setSelectedIdx(0); setTimeout(() => inputRef.current?.focus(), 50); } }, [open]);
  useEffect(() => { setSelectedIdx(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx, open]);

  const go = (r: typeof filtered[0]) => {
    openOrActivate(r.item.href, r.item.label, r.modKey);
    router.push(r.item.href);
    onClose();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && filtered[selectedIdx]) { go(filtered[selectedIdx]); }
    else if (e.key === 'Escape') { onClose(); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -8 }}
        transition={{ duration: 0.15 }}
        className="relative w-full max-w-[440px] rounded-[12px] border border-surface-200 bg-white shadow-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-surface-100 px-4 py-3">
          <svg className="h-4 w-4 shrink-0 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="搜索功能..."
            className="flex-1 bg-transparent text-[14px] text-surface-700 placeholder:text-surface-300 outline-none"
          />
          <kbd className="hidden sm:flex items-center rounded-[4px] border border-surface-200 px-1.5 py-0.5 text-[10px] font-medium text-surface-300">ESC</kbd>
        </div>
        {/* Results */}
        <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1" style={{ scrollbarWidth: 'thin' }}>
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px] text-surface-300">没有匹配的功能</div>
          )}
          {filtered.map((r, i) => (
            <button
              key={r.item.href}
              type="button"
              onClick={() => go(r)}
              onMouseEnter={() => setSelectedIdx(i)}
              className={[
                'flex w-full items-center gap-3 px-4 py-2 text-left cursor-pointer transition-colors duration-75',
                i === selectedIdx ? 'bg-brand-50 text-brand-600' : 'text-surface-500 hover:bg-surface-50',
              ].join(' ')}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-surface-300">
                <ModuleIcon moduleKey={r.modKey} size={14} />
              </span>
              <span className="flex-1 truncate text-[13px]">{r.item.label}</span>
              <span className="shrink-0 text-[11px] text-surface-300">{r.modLabel}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Clean grouped sub-menu — all modules shown with sticky section headers.
 * Active item has brand highlight; clean, predictable layout for scanability.
 */
function SubMenuPanel({
  pathname,
  scrollRef,
  sectionRefs,
  onItemClick,
}: {
  pathname: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  sectionRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  onItemClick: (item: { href: string; label: string }, modKey: AdminModuleKey) => void;
}) {
  return (
    <nav
      ref={scrollRef as React.RefObject<HTMLDivElement>}
      className="flex-1 min-h-0 overflow-y-auto px-2"
      style={{ scrollbarWidth: 'none' }}
    >
      <div className="py-1.5">
        {ADMIN_MODULES.map((mod, modIdx) => (
          <div key={mod.key} data-section-key={mod.key}>
            {/* Section header */}
            <div
              ref={(el) => { if (el) sectionRefs.current.set(mod.key, el); }}
              data-module={mod.key}
              className="sticky top-0 z-[5] px-2 pb-1 pt-3"
            >
            <span className="section-header flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors duration-700">
              <span className="text-surface-300"><ModuleIcon moduleKey={mod.key} size={11} /></span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-300">{mod.label}</span>
            </span>
            </div>
            {/* Sub items */}
            {mod.subItems.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  data-module={mod.key}
                  onClick={() => onItemClick(item, mod.key)}
                  className={[
                    'sidebar-item relative flex h-[32px] w-full items-center rounded-[7px] px-2.5 text-[12.5px] cursor-pointer transition-all duration-150 active:scale-[0.98]',
                    isActive
                      ? 'bg-brand-50 text-brand-600 font-medium'
                      : 'text-surface-500 hover:bg-surface-50 hover:text-surface-700',
                  ].join(' ')}
                >
                  {isActive && (
                    <motion.span
                      layoutId="admin-sub-active-dot"
                      className="mr-1.5 h-[5px] w-[5px] shrink-0 rounded-full bg-brand-500"
                      transition={springSoft}
                    />
                  )}
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
            {/* Separator between modules */}
            {modIdx < ADMIN_MODULES.length - 1 && (
              <div className="mx-2 my-1.5 h-px bg-surface-100/70" />
            )}
          </div>
        ))}
        {/* Bottom breathing room */}
        <div className="h-8" />
      </div>
    </nav>
  );
}

function LeftSidebar({
  activeModuleKey,
  pathname,
  badges,
  userName,
  onLogout,
  siteLogoInitials,
  collapsed,
  onToggleCollapse,
  onOpenSearch,
}: {
  activeModuleKey: AdminModuleKey;
  pathname: string;
  badges: AdminBadges;
  userName?: string | null;
  onLogout: () => void;
  siteLogoInitials: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenSearch: () => void;
}) {
  const { openOrActivate } = useWorkTabs();
  const [selectedMod, setSelectedMod] = useState<AdminModuleKey>(activeModuleKey);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const scrollingTo = useRef<string | null>(null);
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync selected module when user navigates
  useEffect(() => { setSelectedMod(activeModuleKey); }, [activeModuleKey]);

  // Auto-scroll to active item on mount or when pathname changes
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || collapsed) return;
    requestAnimationFrame(() => {
      const activeBtn = container.querySelector('.bg-brand-50') as HTMLElement | null;
      if (activeBtn) {
        const cRect = container.getBoundingClientRect();
        const bRect = activeBtn.getBoundingClientRect();
        if (bRect.top < cRect.top || bRect.bottom > cRect.bottom) {
          container.scrollTo({
            top: container.scrollTop + (bRect.top - cRect.top) - cRect.height / 2 + bRect.height / 2,
            behavior: 'smooth',
          });
        }
      }
    });
  }, [pathname, collapsed]);

  const getBadgeCount = (key: AdminModuleKey): number => {
    if (key === 'transactions') return badges.pendingOrders;
    if (key === 'support') return badges.openTickets;
    if (key === 'servers') return badges.pendingServers;
    return 0;
  };

  const handleSubItemClick = (item: { href: string; label: string }, moduleKey: AdminModuleKey) => {
    openOrActivate(item.href, item.label, moduleKey);
  };

  const handleModuleClick = (key: AdminModuleKey) => {
    setSelectedMod(key);
    if (expandTimer.current) { clearTimeout(expandTimer.current); expandTimer.current = null; }
    if (collapsed) {
      onToggleCollapse();
      expandTimer.current = setTimeout(() => { scrollToSection(key); expandTimer.current = null; }, 220);
      return;
    }
    scrollToSection(key);
  };

  const scrollToSection = (key: AdminModuleKey) => {
    const container = scrollRef.current;
    const el = sectionRefs.current.get(key);
    if (!container || !el) return;

    scrollingTo.current = key;
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    container.scrollTo({
      top: Math.max(0, container.scrollTop + (eRect.top - cRect.top)),
      behavior: 'smooth',
    });
    // release scroll-spy lock after animation
    setTimeout(() => { scrollingTo.current = null; }, 600);
  };

  // Scroll spy: track which module header is nearest to top of viewport
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const handleScroll = () => {
      if (scrollingTo.current) return;
      const cRect = container.getBoundingClientRect();
      const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 4;

      if (atBottom) {
        // At bottom: pick the LAST section header visible in the container
        let lastKey: string | null = null;
        sectionRefs.current.forEach((el, key) => {
          const r = el.getBoundingClientRect();
          if (r.top < cRect.bottom) lastKey = key;
        });
        if (lastKey) setSelectedMod(lastKey as AdminModuleKey);
        return;
      }

      let bestKey: string | null = null;
      let bestDist = -Infinity;
      // Pick the last header that is at or above the container top (+ small threshold)
      sectionRefs.current.forEach((el, key) => {
        const dist = el.getBoundingClientRect().top - cRect.top;
        if (dist <= 24 && dist > bestDist) {
          bestKey = key;
          bestDist = dist;
        }
      });
      // If nothing is at/above top, pick the closest one below
      if (!bestKey) {
        let closestDist = Infinity;
        sectionRefs.current.forEach((el, key) => {
          const dist = el.getBoundingClientRect().top - cRect.top;
          if (dist < closestDist) {
            bestKey = key;
            closestDist = dist;
          }
        });
      }
      if (bestKey) setSelectedMod(bestKey as AdminModuleKey);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // initial sync
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const currentMod = ADMIN_MODULES.find((m) => m.key === selectedMod) ?? ADMIN_MODULES[0];

  return (
    <aside className="fixed left-0 z-40 flex" style={{ top: WORKTAB_H, height: `calc(100% - ${WORKTAB_H}px)` }}>
      {/* ── Left icon rail ── */}
      <div
        className="flex flex-col items-center"
        style={{
          width: SIDEBAR_ICON_W,
          background: '#F7F8FC',
          borderRight: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        {/* Module icons */}
        <nav className="flex flex-1 flex-col items-center gap-[2px] overflow-y-auto pt-3 pb-1" style={{ scrollbarWidth: 'none' }}>
          {ADMIN_MODULES.map((mod) => {
            const isActive = mod.key === selectedMod;
            const count = getBadgeCount(mod.key);
            return (
              <button
                key={mod.key}
                type="button"
                title={mod.label}
                onClick={() => handleModuleClick(mod.key)}
                className="group relative flex flex-col items-center justify-center cursor-pointer"
                style={{ width: 54, height: 46 }}
              >
                {/* Active pill bg */}
                {isActive && (
                  <motion.span
                    layoutId="sidebar-rail-bg"
                    className="absolute inset-[3px] rounded-[10px] bg-white"
                    style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)' }}
                    transition={springSoft}
                  />
                )}
                <span
                  className={[
                    'relative z-[1] flex items-center justify-center transition-colors duration-100',
                    isActive ? 'text-brand-500' : 'text-surface-400 group-hover:text-surface-600',
                  ].join(' ')}
                >
                  <ModuleIcon moduleKey={mod.key} size={18} />
                </span>
                <span
                  className={[
                    'relative z-[1] mt-[2px] text-[9.5px] leading-tight whitespace-nowrap transition-colors duration-100',
                    isActive ? 'text-brand-500 font-semibold' : 'text-surface-400 group-hover:text-surface-500',
                  ].join(' ')}
                >
                  {mod.label}
                </span>
                {count > 0 && (
                  <span
                    className="absolute z-[2] rounded-full bg-[#EF4444] text-white leading-none flex items-center justify-center"
                    style={{ top: 2, right: 2, fontSize: 8, fontWeight: 700, height: 13, minWidth: 13, padding: '0 3px' }}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Collapse / expand toggle */}
        <div className="flex flex-col items-center pb-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-surface-400 hover:text-brand-500 hover:bg-white transition-colors cursor-pointer"
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {collapsed ? (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 5l7 7-7 7" /><path d="M6 5v14" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 19l-7-7 7-7" /><path d="M18 5v14" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Right sub-menu panel ── */}
      <div
        className="flex flex-col bg-white overflow-hidden transition-[width] duration-200 ease-out"
        style={{ width: collapsed ? 0 : SIDEBAR_SUB_W, borderRight: collapsed ? 'none' : '1px solid rgba(0,0,0,0.06)' }}
      >
        {/* Module title header — height aligned with TopHeader */}
        <div className="flex items-center justify-between px-4 border-b border-surface-100/80" style={{ height: HEADER_H, minWidth: SIDEBAR_SUB_W, flexShrink: 0 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedMod}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              transition={{ duration: 0.12 }}
              className="flex items-center gap-2"
            >
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] bg-brand-50 text-brand-500">
                <ModuleIcon moduleKey={selectedMod} size={12} />
              </span>
              <span className="text-[13px] font-semibold text-surface-700">{currentMod.label}</span>
            </motion.div>
          </AnimatePresence>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onOpenSearch}
              className="flex items-center rounded-[4px] border border-surface-100 px-1.5 py-[2px] text-[10px] font-medium text-surface-300 hover:text-surface-500 hover:border-surface-200 transition-colors cursor-pointer"
            >
              ⌘K
            </button>
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex h-5 w-5 items-center justify-center rounded-[4px] text-surface-300 hover:text-surface-500 hover:bg-surface-50 transition-colors cursor-pointer"
              title="收起菜单"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 19l-7-7 7-7" /><path d="M18 5v14" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable sub items — clean grouped list */}
        <SubMenuPanel
          pathname={pathname}
          scrollRef={scrollRef}
          sectionRefs={sectionRefs}
          onItemClick={handleSubItemClick}
        />
      </div>
    </aside>
  );
}

function WorkTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    tabs,
    activeId,
    closeTab,
    closeOthers,
    closeRight,
    closeLeft,
    togglePin,
    setActive,
    reorderTabs,
  } = useWorkTabs();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    tabId: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const el = scrollRef.current?.querySelector('[data-active="true"]') as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler, { once: true });
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  if (tabs.length === 0) {
    // Keep the bar height so layout doesn't jump when no tabs yet
    return <div className="fixed inset-x-0 top-0 z-50 border-b border-surface-200 bg-surface-50" style={{ height: WORKTAB_H }} />;
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex items-end border-b border-surface-200 bg-surface-100"
      style={{ height: WORKTAB_H, paddingLeft: 8, paddingRight: 8 }}
    >
      <Reorder.Group
        as="div"
        axis="x"
        values={tabs}
        onReorder={(next: WorkTab[]) => reorderTabs(next)}
        ref={scrollRef}
        className="flex flex-1 items-end overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        <AnimatePresence initial={false}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeId || (!activeId && tab.path === pathname);
            return (
              <Reorder.Item
                key={tab.id}
                value={tab}
                as="div"
                data-active={isActive}
                initial={{ opacity: 0, width: 0, x: -4 }}
                animate={{ opacity: 1, width: 'auto', x: 0, transition: springSoft }}
                exit={{ opacity: 0, width: 0, x: -4, transition: { duration: 0.14, ease: [0.4, 0, 0.2, 1] } }}
                whileDrag={{ scale: 1.03, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', zIndex: 10 }}
                className={[
                  'group relative flex min-w-[120px] max-w-[180px] shrink-0 cursor-pointer select-none items-center gap-1.5 px-3 mr-[2px] rounded-t-[8px] border border-b-0',
                  'h-[30px] mb-0 self-end',
                  isActive
                    ? 'bg-white text-surface-700 border-surface-200 shadow-[0_-1px_0_0_#4F6EF7_inset]'
                    : 'bg-surface-50 text-surface-400 border-transparent hover:bg-white/70 hover:text-surface-600',
                ].join(' ')}
                onClick={() => { setActive(tab.id); router.push(tab.path); }}
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ tabId: tab.id, x: e.clientX, y: e.clientY }); }}
              >
                {isActive && (
                  <motion.span
                    layoutId="admin-worktab-underline"
                    className="pointer-events-none absolute inset-x-0 bottom-[-1px] h-[2px] bg-white"
                    transition={springSoft}
                  />
                )}
                {tab.pinned && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
                <span className="flex-1 truncate text-xs font-medium">{tab.title}</span>
                {tab.closable && (
                  <button
                    className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-surface-200 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  >
                    <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M2 2l6 6M8 2l-6 6" /></svg>
                  </button>
                )}
              </Reorder.Item>
            );
          })}
        </AnimatePresence>
      </Reorder.Group>
      <AnimatePresence>
        {contextMenu && (() => {
          const tab = tabs.find((t) => t.id === contextMenu.tabId);
          if (!tab) return null;
          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.14, ease: [0.4, 0, 0.2, 1] } }}
              exit={{ opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.1 } }}
              style={{ left: contextMenu.x, top: contextMenu.y, transformOrigin: 'top left' }}
              className="fixed z-50 min-w-[152px] rounded-6 border border-surface-200 bg-white py-1 shadow-dropdown"
              onClick={(e) => e.stopPropagation()}
            >
              <button className="flex w-full items-center px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-50 transition-colors" onClick={() => { router.refresh(); setContextMenu(null); }}>刷新当前页</button>
              <div className="my-1 h-px bg-surface-100" />
              <button className="flex w-full items-center px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-50 transition-colors" onClick={() => { togglePin(tab.id); setContextMenu(null); }}>{tab.pinned ? '取消固定' : '固定标签'}</button>
              <div className="my-1 h-px bg-surface-100" />
              {tab.closable && <button className="flex w-full items-center px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-50 transition-colors" onClick={() => { closeTab(tab.id); setContextMenu(null); }}>关闭当前</button>}
              <button className="flex w-full items-center px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-50 transition-colors" onClick={() => { closeLeft(tab.id); setContextMenu(null); }}>关闭左侧</button>
              <button className="flex w-full items-center px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-50 transition-colors" onClick={() => { closeRight(tab.id); setContextMenu(null); }}>关闭右侧</button>
              <button className="flex w-full items-center px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-50 transition-colors" onClick={() => { closeOthers(tab.id); setContextMenu(null); }}>关闭其他</button>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

function TopHeader({
  activeModuleKey,
  pathname,
  connected,
  onlineUsers,
  onOpenDrawer,
}: {
  activeModuleKey: AdminModuleKey;
  pathname: string;
  connected: boolean;
  onlineUsers: number;
  onOpenDrawer: () => void;
}) {
  const mod = ADMIN_MODULES.find((m) => m.key === activeModuleKey) ?? ADMIN_MODULES[0];
  const { subItem: activeSubItem } = getNavContextFromPath(pathname);

  return (
    <header className="sticky z-30 bg-white" style={{ top: WORKTAB_H, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      <div className="flex items-center px-5" style={{ height: HEADER_H }}>
        <button
          type="button"
          className="mr-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-surface-400 hover:bg-surface-50 md:hidden transition-colors"
          onClick={onOpenDrawer}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <div className="flex flex-1 items-center gap-1">
          <span className="text-[12px] text-surface-400">{mod.label}</span>
          <svg className="h-2.5 w-2.5 text-surface-300" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M4.5 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="text-[12px] font-medium text-surface-600">
            {activeSubItem?.label ?? mod.label}
          </span>
        </div>

        <div className="hidden shrink-0 items-center gap-1.5 md:flex">
          <span className="relative flex h-[5px] w-[5px] items-center justify-center">
            <span className={`absolute inset-0 rounded-full ${connected ? 'bg-semantic-success' : 'bg-semantic-warning'}`} />
            {connected && (
              <motion.span
                className="absolute inset-0 rounded-full bg-semantic-success"
                initial={{ opacity: 0.5, scale: 1 }}
                animate={{ opacity: 0, scale: 2.4 }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
              />
            )}
          </span>
          <span className={`text-[11px] ${connected ? 'text-semantic-success' : 'text-semantic-warning'}`}>
            {onlineUsers} 在线
          </span>
        </div>
      </div>
    </header>
  );
}

function Inner({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { connected, onlineUsers } = useRealtime();
  const router = useRouter();
  const pathname = usePathname();
  const { openOrActivate, ready } = useWorkTabs();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [badges, setBadges] = useState<AdminBadges>({ pendingOrders: 0, openTickets: 0, pendingServers: 0 });
  const { siteMeta } = useSiteMeta(DEFAULT_ADMIN_SITE_META);

  const { module: activeModule } = useMemo(() => getNavContextFromPath(pathname), [pathname]);

  // Cmd+K to open command palette, [ to toggle collapse
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
      // [ key (not in input/textarea) to toggle collapse
      if (e.key === '[' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        setCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const { title, moduleKey } = getTabInfoFromPath(pathname);
    openOrActivate(pathname, title, moduleKey, pathname !== '/admin');
  }, [pathname, ready, openOrActivate]);

  useEffect(() => {
    apiFetch('/api/admin/dashboard', { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const dashboard = normalizeAdminDashboardData(json.data);
          const pendingOrders = dashboard.orderStatusBuckets
            .filter((b) => b.status === 'PENDING')
            .reduce((acc, b) => acc + b.count, 0);
          setBadges({ pendingOrders, openTickets: dashboard.summary.openTickets, pendingServers: dashboard.summary.pendingServers });
        }
      })
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace(`/login?redirect=${encodeURIComponent(pathname || '/admin')}`); return; }
    if (user.role === 'AGENT') { router.replace('/agent'); return; }
    if (user.role === 'USER') { router.replace('/dashboard'); return; }
  }, [user, loading, router, pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [drawerOpen]);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  const logoInitials = (siteMeta.siteName || 'SA').slice(0, 2).toUpperCase();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-surface-400">加载中...</div>;
  }
  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-surface-400">
        <p className="text-sm">正在跳转到正确页面...</p>
        <Link href="/" className="text-sm text-brand-500 hover:underline">返回首页</Link>
      </div>
    );
  }

  const sidebarW = collapsed ? SIDEBAR_ICON_W : SIDEBAR_TOTAL_W;

  return (
    <div className="min-h-screen bg-surface-50 text-surface-600">
      <AnimatePresence>
        {cmdOpen && <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />}
      </AnimatePresence>

      {/* Top browser-style tab bar, full width */}
      <WorkTabBar />

      <div className="hidden md:block" style={{ paddingTop: WORKTAB_H }}>
        <LeftSidebar
          activeModuleKey={activeModule.key}
          pathname={pathname}
          badges={badges}
          userName={user.name}
          onLogout={logout}
          siteLogoInitials={logoInitials}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
          onOpenSearch={() => setCmdOpen(true)}
        />
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div
            className="absolute inset-y-0 left-0 flex w-[260px] flex-col bg-white shadow-modal"
            style={{ animation: 'vcSlideIn 0.2s ease-out' }}
          >
            <div className="flex items-center justify-between border-b border-surface-200 px-4" style={{ height: 48 }}>
              <p className="text-[13px] font-semibold text-surface-600">{siteMeta.siteName}</p>
              <button type="button" onClick={() => setDrawerOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-6 text-surface-400 hover:bg-surface-50 transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2 px-2">
              {ADMIN_MODULES.map((mod) => {
                const isActiveMod = mod.key === activeModule.key;
                const { subItem: curSub } = getNavContextFromPath(pathname);
                return (
                  <div key={mod.key} className="mb-1">
                    <p className={`px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${isActiveMod ? 'text-brand-500' : 'text-surface-400'}`}>
                      {mod.label}
                    </p>
                    {mod.subItems.map((item) => {
                      const isActive = curSub?.href === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`block px-2.5 py-2 text-[13px] rounded-6 transition-all duration-200 ${isActive ? 'font-medium text-brand-500 bg-semantic-info-light' : 'text-surface-500 hover:text-surface-600 hover:bg-surface-50'}`}
                          onClick={() => setDrawerOpen(false)}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-surface-200 p-3">
              <button type="button" onClick={() => { logout(); setDrawerOpen(false); }}
                className="flex w-full items-center justify-center rounded-6 bg-semantic-danger-light py-2 text-[13px] font-medium text-semantic-danger hover:bg-semantic-danger-light transition-colors">
                退出登录
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="flex min-h-screen flex-col transition-[margin-left] duration-200"
        style={{ marginLeft: sidebarW, paddingTop: WORKTAB_H }}
      >
        <TopHeader
          activeModuleKey={activeModule.key}
          pathname={pathname}
          connected={connected}
          onlineUsers={onlineUsers}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
        <main className="flex-1 p-6">
          <RouteFade>{children}</RouteFade>
        </main>
      </div>

      {/* Floating logout button (bottom-right) */}
      <button
        type="button"
        onClick={logout}
        title={`${user.name ?? '管理员'} · 退出登录`}
        className="fixed bottom-5 right-5 z-40 flex h-11 items-center gap-2 rounded-full pl-2 pr-4 text-[12px] font-medium text-white shadow-lg hover:shadow-xl hover:scale-[1.03] active:scale-[0.98] transition-all"
        style={{ background: 'linear-gradient(135deg, #4F6EF7 0%, #7B93FF 100%)', boxShadow: '0 6px 20px rgba(79,110,247,0.35)' }}
      >
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-[11px] font-bold"
        >
          {getUserInitial(user.name)}
        </span>
        <span className="hidden sm:inline">退出登录</span>
      </button>

      <style>{`
        @keyframes vcSlideIn {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .section-highlight {
          background-color: rgba(79,110,247,0.12);
          box-shadow: 0 0 0 1px rgba(79,110,247,0.15);
        }
        .section-header { background-color: transparent; box-shadow: none; }
        .section-dimmed { opacity: 0.3; transition: opacity 0.3s ease; }
        [data-section-key] { transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); transform-origin: top center; }
        .section-pop { animation: sectionPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        @keyframes sectionPop {
          0% { transform: scale(1); }
          35% { transform: scale(1.018); }
          100% { transform: scale(1); }
        }
        .sidebar-item { transition: background-color 0.12s, color 0.12s, transform 0.1s; }
      `}</style>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <WorkTabsProvider>
          <ToastProvider>
            <Inner>{children}</Inner>
          </ToastProvider>
        </WorkTabsProvider>
      </RealtimeProvider>
    </AuthProvider>
  );
}
