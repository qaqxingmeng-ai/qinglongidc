'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

// ─── Module Config ─────────────────────────────────────────────────────────────

export type AdminModuleKey =
  | 'overview'
  | 'users'
  | 'products'
  | 'servers'
  | 'transactions'
  | 'support'
  | 'agent'
  | 'content'
  | 'system';

export interface AdminSubItem {
  href: string;
  label: string;
  exact?: boolean;
}

export interface AdminModule {
  key: AdminModuleKey;
  label: string;
  defaultPath: string;
  subItems: AdminSubItem[];
}

export const ADMIN_MODULES: AdminModule[] = [
  {
    key: 'overview',
    label: '数据总览',
    defaultPath: '/admin',
    subItems: [
      { href: '/admin', label: '仪表盘', exact: true },
      { href: '/admin/realtime', label: '实时监控' },
      { href: '/admin/analytics', label: '数据分析' },
      { href: '/admin/reports', label: 'AI 周报' },
      { href: '/admin/nps', label: 'NPS 满意度' },
    ],
  },
  {
    key: 'users',
    label: '用户体系',
    defaultPath: '/admin/users',
    subItems: [
      { href: '/admin/users', label: '用户管理' },
      { href: '/admin/login-history', label: '登录日志' },
      { href: '/admin/points', label: '积分管理' },
    ],
  },
  {
    key: 'products',
    label: '产品 & 库存',
    defaultPath: '/admin/products',
    subItems: [
      { href: '/admin/products', label: '商品管理', exact: true },
      { href: '/admin/products/ai', label: 'AI 商品助手' },
      { href: '/admin/cpus', label: 'CPU 型号' },
      { href: '/admin/regions', label: '地区管理' },
      { href: '/admin/suppliers', label: '供应商管理' },
      { href: '/admin/pricing', label: '定价策略' },
    ],
  },
  {
    key: 'servers',
    label: '服务器运维',
    defaultPath: '/admin/servers',
    subItems: [
      { href: '/admin/servers', label: '实例管理', exact: true },
      { href: '/admin/servers/calendar', label: '到期日历' },
    ],
  },
  {
    key: 'transactions',
    label: '订单 & 交易',
    defaultPath: '/admin/orders',
    subItems: [
      { href: '/admin/orders', label: '订单管理' },
      { href: '/admin/reviews', label: '用户评价' },
      { href: '/admin/finance', label: '财务概览', exact: true },
      { href: '/admin/finance/transactions', label: '交易流水' },
      { href: '/admin/finance/balance', label: '充值 & 调账' },
      { href: '/admin/finance/trends', label: '财务趋势' },
      { href: '/admin/finance/top-users', label: '消费排行' },
    ],
  },
  {
    key: 'support',
    label: '客服 & 工单',
    defaultPath: '/admin/tickets',
    subItems: [
      { href: '/admin/tickets', label: '工单管理' },
      { href: '/admin/tickets/ai', label: 'AI 工单助手' },
      { href: '/admin/ticket-ratings', label: '工单评分' },
      { href: '/admin/sla', label: 'SLA 配置', exact: true },
      { href: '/admin/sla/violations', label: 'SLA 监控' },
    ],
  },
  {
    key: 'agent',
    label: '代理体系',
    defaultPath: '/admin/agent-commission',
    subItems: [
      { href: '/admin/agent-commission', label: '代理商管理', exact: true },
      { href: '/admin/agent-commission/withdrawals', label: '提现审批' },
    ],
  },
  {
    key: 'content',
    label: '运营 & 内容',
    defaultPath: '/admin/announcements',
    subItems: [
      { href: '/admin/announcements', label: '公告管理' },
      { href: '/admin/notifications', label: '通知广播' },
      { href: '/admin/article-categories', label: '帮助文档分类' },
      { href: '/admin/articles', label: '帮助文章' },
      { href: '/admin/coupons', label: '优惠券管理' },
      { href: '/admin/email-templates', label: '邮件模板' },
    ],
  },
  {
    key: 'system',
    label: '系统管理',
    defaultPath: '/admin/settings',
    subItems: [
      { href: '/admin/settings', label: '系统设置', exact: true },
      { href: '/admin/logs', label: '操作日志' },
      { href: '/admin/cron-logs', label: '定时任务日志' },
      { href: '/admin/anomalies', label: '异常检测' },
      { href: '/admin/api-usage', label: 'API 用量' },
      { href: '/admin/backups', label: '数据库备份' },
      { href: '/admin/bulk', label: '批量操作' },
      { href: '/admin/export', label: '数据导出' },
    ],
  },
];

function isSubItemActive(pathname: string, item: AdminSubItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + '/');
}

export function getNavContextFromPath(pathname: string): {
  module: AdminModule;
  subItem: AdminSubItem | null;
} {
  // First: try exact sub-item match
  for (const mod of ADMIN_MODULES) {
    for (const item of mod.subItems) {
      if (isSubItemActive(pathname, item)) {
        return { module: mod, subItem: item };
      }
    }
  }
  // Fallback: match module by defaultPath prefix (handles detail pages like /admin/products/123)
  for (const mod of ADMIN_MODULES) {
    if (mod.defaultPath !== '/admin' && pathname.startsWith(mod.defaultPath + '/')) {
      return { module: mod, subItem: null };
    }
  }
  return { module: ADMIN_MODULES[0], subItem: null };
}

export function getTabInfoFromPath(pathname: string): {
  title: string;
  moduleKey: AdminModuleKey;
} {
  const { module, subItem } = getNavContextFromPath(pathname);
  return { title: subItem?.label ?? '管理后台', moduleKey: module.key };
}

// ─── Work Tabs ────────────────────────────────────────────────────────────────

export interface WorkTab {
  id: string;
  title: string;
  path: string;
  moduleKey: AdminModuleKey;
  closable: boolean;
  pinned: boolean;
}

const MAX_TABS = 12;
const STORAGE_KEY = 'admin_work_tabs';

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

interface WorkTabsContextValue {
  tabs: WorkTab[];
  activeId: string | null;
  ready: boolean;
  openOrActivate: (
    path: string,
    title: string,
    moduleKey: AdminModuleKey,
    closable?: boolean,
  ) => void;
  closeTab: (id: string) => void;
  closeOthers: (id: string) => void;
  closeRight: (id: string) => void;
  closeLeft: (id: string) => void;
  togglePin: (id: string) => void;
  setActive: (id: string) => void;
  reorderTabs: (next: WorkTab[]) => void;
  /** Override navigation used by closeTab. Set by KeepAlive frame. */
  setNavigateFn: (fn: ((path: string) => void) | null) => void;
}

const WorkTabsContext = createContext<WorkTabsContextValue | null>(null);

export function WorkTabsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const navigateFnRef = useRef<((path: string) => void) | null>(null);
  const [tabs, setTabs] = useState<WorkTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);

  // Hydrate from localStorage
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as { tabs?: WorkTab[]; activeId?: string };
        if (Array.isArray(data.tabs) && data.tabs.length > 0) {
          setTabs(data.tabs);
          setActiveId(data.activeId ?? data.tabs[0].id);
        }
      }
    } catch {
      // ignore malformed data
    }
    setReady(true);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeId }));
    } catch {
      // ignore storage errors
    }
  }, [tabs, activeId, ready]);

  const openOrActivate = useCallback(
    (path: string, title: string, moduleKey: AdminModuleKey, closable = true) => {
      setTabs((prev) => {
        const existing = prev.find((t) => t.path === path);
        if (existing) {
          setActiveId(existing.id);
          return prev;
        }
        const newTab: WorkTab = {
          id: genId(),
          title,
          path,
          moduleKey,
          closable,
          pinned: false,
        };
        let next = [...prev, newTab];
        // Trim oldest closable non-pinned tab if over limit
        while (next.length > MAX_TABS) {
          const idx = next.findIndex((t) => t.closable && !t.pinned);
          if (idx < 0) break;
          next = next.filter((_, i) => i !== idx);
        }
        setActiveId(newTab.id);
        return next;
      });
    },
    [],
  );

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx < 0) return prev;
        const next = prev.filter((t) => t.id !== id);
        setActiveId((cur) => {
          if (cur !== id) return cur;
          const sibling = next[idx] ?? next[idx - 1] ?? next[0] ?? null;
          if (sibling) {
            const nav = navigateFnRef.current;
            if (nav) nav(sibling.path);
            else router.push(sibling.path);
          }
          return sibling?.id ?? null;
        });
        return next;
      });
    },
    [router],
  );

  const closeOthers = useCallback((id: string) => {
    setTabs((prev) => prev.filter((t) => t.id === id || t.pinned || !t.closable));
    setActiveId(id);
  }, []);

  const closeRight = useCallback((id: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      return prev.filter((t, i) => i <= idx || t.pinned || !t.closable);
    });
  }, []);

  const closeLeft = useCallback((id: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      return prev.filter((t, i) => i >= idx || t.pinned || !t.closable);
    });
  }, []);

  const togglePin = useCallback((id: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)),
    );
  }, []);

  const setActive = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const reorderTabs = useCallback((next: WorkTab[]) => {
    setTabs(next);
  }, []);

  const setNavigateFn = useCallback((fn: ((path: string) => void) | null) => {
    navigateFnRef.current = fn;
  }, []);

  return (
    <WorkTabsContext.Provider
      value={{
        tabs,
        activeId,
        ready,
        openOrActivate,
        closeTab,
        closeOthers,
        closeRight,
        closeLeft,
        togglePin,
        setActive,
        reorderTabs,
        setNavigateFn,
      }}
    >
      {children}
    </WorkTabsContext.Provider>
  );
}

export function useWorkTabs(): WorkTabsContextValue {
  const ctx = useContext(WorkTabsContext);
  if (!ctx) throw new Error('useWorkTabs must be used inside WorkTabsProvider');
  return ctx;
}
