'use client';

import {
  type ComponentType,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  Suspense,
  type ReactNode,
  type MutableRefObject,
} from 'react';
import { useWorkTabs, getTabInfoFromPath } from '@/components/WorkTabsProvider';
import { resolveAdminPage } from '@/app/admin/_registry';

const MAX_CACHE = 15;

/* ─── Params context (replaces useParams for frame-loaded pages) ──────────── */

const FrameParamsContext = createContext<Record<string, string>>({});

export function useFrameParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useContext(FrameParamsContext) as T;
}

/* ─── Cache entry ─────────────────────────────────────────────────────────── */

interface CacheEntry {
  path: string;
  Component: ComponentType<object>;
  params: Record<string, string>;
  ts: number;
}

/* ─── Contexts ────────────────────────────────────────────────────────────── */

interface KeepAliveCtx {
  activePath: string;
  navigateTo: (path: string) => void;
  invalidate: (path: string) => void;
}

const KeepAliveContext = createContext<KeepAliveCtx | null>(null);
const CacheRefContext = createContext<MutableRefObject<Map<string, CacheEntry>> | null>(null);

export function useKeepAlive(): KeepAliveCtx {
  const ctx = useContext(KeepAliveContext);
  if (!ctx) throw new Error('useKeepAlive must be used inside KeepAliveProvider');
  return ctx;
}

/* ─── KeepAliveProvider ───────────────────────────────────────────────────── */

export function KeepAliveProvider({ children }: { children: ReactNode }) {
  const { tabs, openOrActivate, setNavigateFn } = useWorkTabs();
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const orderRef = useRef<string[]>([]);
  const [activePath, setActivePath] = useState('/admin');
  const [, bump] = useState(0);

  const normalizePath = useCallback((path: string) => {
    const clean = path.split('?')[0].split('#')[0].replace(/\/$/, '');
    return clean || '/admin';
  }, []);

  const ensureCached = useCallback((path: string) => {
    const clean = normalizePath(path);
    if (cacheRef.current.has(clean)) return true;
    const resolved = resolveAdminPage(clean);
    if (!resolved) return false;
    cacheRef.current.set(clean, {
      path: clean,
      Component: resolved.Component,
      params: resolved.params,
      ts: Date.now(),
    });
    if (!orderRef.current.includes(clean)) orderRef.current.push(clean);
    bump((v) => v + 1);
    return true;
  }, [normalizePath]);

  // Init: detect direct sub-route access or hash-based restore
  useEffect(() => {
    const pathname = window.location.pathname;
    const hash = window.location.hash.slice(1);

    let initial = '/admin';

    // Direct sub-route access: /admin/users → redirect to /admin#/admin/users
    if (pathname !== '/admin' && pathname.startsWith('/admin/') && resolveAdminPage(pathname)) {
      initial = pathname;
      window.history.replaceState(null, '', `/admin#${pathname}`);
    } else if (hash && resolveAdminPage(hash)) {
      // Hash-based restore: /admin#/admin/users
      initial = hash;
    }

    ensureCached(initial);
    setActivePath(initial);
    const { title, moduleKey } = getTabInfoFromPath(initial);
    openOrActivate(initial, title, moduleKey, initial !== '/admin');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateTo = useCallback(
    (path: string) => {
      const clean = normalizePath(path);
      if (clean === activePath) return;
      const ok = ensureCached(clean);
      if (!ok) return;
      setActivePath(clean);
      window.history.pushState(null, '', `/admin#${clean}`);
      const { title, moduleKey } = getTabInfoFromPath(clean);
      openOrActivate(clean, title, moduleKey, clean !== '/admin');
    },
    [activePath, ensureCached, normalizePath, openOrActivate],
  );

  const invalidate = useCallback(
    (path: string) => {
      const clean = normalizePath(path);
      cacheRef.current.delete(clean);
      orderRef.current = orderRef.current.filter((k) => k !== clean);
      if (clean === activePath) {
        ensureCached(clean);
      }
    },
    [activePath, ensureCached, normalizePath],
  );

  useEffect(() => {
    setNavigateFn(navigateTo);
    return () => setNavigateFn(null);
  }, [navigateTo, setNavigateFn]);

  // Evict orphaned cache entries
  useEffect(() => {
    const tabPaths = new Set(tabs.map((t) => t.path));
    let changed = false;
    for (const key of Array.from(cacheRef.current.keys())) {
      if (key !== activePath && !tabPaths.has(key)) {
        cacheRef.current.delete(key);
        orderRef.current = orderRef.current.filter((k) => k !== key);
        changed = true;
      }
    }
    while (cacheRef.current.size > MAX_CACHE) {
      const oldest = orderRef.current.find((k) => k !== activePath && !tabPaths.has(k));
      if (!oldest) break;
      cacheRef.current.delete(oldest);
      orderRef.current = orderRef.current.filter((k) => k !== oldest);
      changed = true;
    }
    if (changed) bump((v) => v + 1);
  }, [tabs, activePath]);

  // popstate (browser back/forward)
  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.slice(1);
      const next = hash || '/admin';
      if (ensureCached(next)) setActivePath(next);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [ensureCached]);

  const ctx: KeepAliveCtx = { activePath, navigateTo, invalidate };

  return (
    <CacheRefContext.Provider value={cacheRef}>
      <KeepAliveContext.Provider value={ctx}>
        {children}
      </KeepAliveContext.Provider>
    </CacheRefContext.Provider>
  );
}

/* ─── KeepAliveOutlet ─────────────────────────────────────────────────────── */

export function KeepAliveOutlet() {
  const { activePath } = useKeepAlive();
  const cacheRef = useContext(CacheRefContext);
  const entries = cacheRef ? Array.from(cacheRef.current.entries()) : [];

  return (
    <>
      {entries.map(([path, entry]) => (
        <div
          key={path}
          data-frame-page={path}
          className="h-full w-full"
          style={{ display: path === activePath ? 'block' : 'none' }}
        >
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-20 text-surface-400 text-sm">
                Loading...
              </div>
            }
          >
            <FrameParamsContext.Provider value={entry.params}>
              <entry.Component />
            </FrameParamsContext.Provider>
          </Suspense>
        </div>
      ))}
    </>
  );
}
