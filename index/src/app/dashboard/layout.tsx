'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import NotificationBell from '@/components/NotificationBell';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import { RealtimeProvider, useRealtime } from '@/components/RealtimeProvider';
import { useSiteMeta } from '@/components/SiteMetaProvider';
import type { ReactNode } from 'react';

type NavLink = {
  href: string;
  label: string;
  exact?: boolean;
};

const dashboardLinks: NavLink[] = [
  { href: '/dashboard', label: '概览', exact: true },
  { href: '/dashboard/servers', label: '我的产品' },
  { href: '/dashboard/server-tags', label: '服务器标签' },
  { href: '/dashboard/orders', label: '我的订单' },
  { href: '/dashboard/tickets', label: '工单中心' },
  { href: '/dashboard/logs', label: '操作日志' },
  { href: '/dashboard/finance', label: '财务中心' },
  { href: '/dashboard/notifications', label: '通知中心' },
  { href: '/dashboard/favorites', label: '我的收藏' },
  { href: '/dashboard/coupons', label: '我的优惠券' },
  { href: '/dashboard/analytics', label: '数据看板' },
  { href: '/dashboard/settings/api-usage', label: 'API 调用统计' },
  { href: '/dashboard/sessions', label: '会话管理' },
  { href: '/dashboard/profile', label: '账号设置' },
];

const mobileTabs: NavLink[] = [
  { href: '/dashboard', label: '首页', exact: true },
  { href: '/dashboard/servers', label: '服务器' },
  { href: '/dashboard/tickets', label: '工单' },
  { href: '/dashboard/finance', label: '财务' },
  { href: '/dashboard/profile', label: '我的' },
];

function isLinkActive(pathname: string, link: NavLink) {
  return link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(link.href + '/');
}

function SidebarLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-1">
      {dashboardLinks.map((link) => {
        const active = isLinkActive(pathname, link);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={`block rounded-8 px-3 py-2.5 text-sm transition-colors ${
              active
                ? 'bg-brand-50 text-brand-700 font-medium'
                : 'text-surface-600 hover:bg-surface-50 hover:text-surface-900'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function DashboardSidebar({ pathname }: { pathname: string }) {
  const { user, logout } = useAuth();
  const { siteMeta } = useSiteMeta();

  return (
    <aside className="hidden w-56 shrink-0 border-r border-surface-100 bg-white p-4 md:block">
      <Link href="/" className="mb-6 block px-3 text-lg font-semibold text-surface-900">
        {siteMeta.siteName}
      </Link>
      <SidebarLinks pathname={pathname} />
      <div className="mt-10 border-t border-surface-100 px-3 pt-4">
        <p className="mb-1 text-xs text-surface-400">{user?.name}</p>
        <p className="mb-3 text-xs text-surface-400">{user?.email}</p>
        <button onClick={logout} className="text-xs text-semantic-danger hover:underline">
          退出登录
        </button>
      </div>
    </aside>
  );
}

function MobileDrawer({
  pathname,
  open,
  onClose,
}: {
  pathname: string;
  open: boolean;
  onClose: () => void;
}) {
  const { user, logout } = useAuth();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-surface-800/35 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 flex w-full max-w-sm flex-col bg-white shadow-modal animate-slide-in-right">
        <div className="flex items-center justify-between border-b border-surface-100 px-5 py-4 pt-safe">
          <div>
            <p className="text-base font-semibold text-surface-700">用户控制台</p>
            <p className="text-xs text-surface-400">移动导航</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target inline-flex items-center justify-center rounded-8 border border-surface-200 text-surface-400"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-5 rounded-3xl border border-surface-100 bg-surface-50 px-4 py-4">
            <p className="truncate text-sm font-semibold text-surface-600">{user?.name}</p>
            <p className="mt-1 truncate text-xs text-surface-400">{user?.email}</p>
          </div>

          <SidebarLinks pathname={pathname} onNavigate={onClose} />
        </div>

        <div className="border-t border-surface-100 px-5 py-4 pb-safe">
          <button
            type="button"
            onClick={() => {
              logout();
              onClose();
            }}
            className="flex min-h-[46px] w-full items-center justify-center rounded-8 border border-red-100 bg-semantic-danger-light text-sm font-medium text-semantic-danger"
          >
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileTabs({ pathname }: { pathname: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-200 bg-white/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-5 px-2 pb-safe pt-2">
        {mobileTabs.map((tab) => {
          const active = isLinkActive(pathname, tab);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex min-h-[48px] flex-col items-center justify-center rounded-8 text-xs font-medium transition-colors ${
                active ? 'text-brand-700 bg-brand-50' : 'text-surface-400'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Inner({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { connected } = useRealtime();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname || '/dashboard')}`);
      return;
    }
    if (user.role === 'ADMIN') {
      router.replace('/admin');
      return;
    }
    if (user.role === 'AGENT') {
      router.replace('/agent');
    }
  }, [user, loading, router, pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [mobileNavOpen]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const pageTitle = useMemo(() => {
    const current = dashboardLinks.find((link) => isLinkActive(pathname, link));
    return current?.label || '用户控制台';
  }, [pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex gap-1.5">
          <div className="typing-dot h-2 w-2 rounded-full bg-surface-300" />
          <div className="typing-dot h-2 w-2 rounded-full bg-surface-300" />
          <div className="typing-dot h-2 w-2 rounded-full bg-surface-300" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-surface-500">
        <p className="text-sm">正在跳转到登录页面...</p>
        <Link href="/" className="text-sm text-brand-600 hover:underline">返回首页</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-surface-50">
      <DashboardSidebar pathname={pathname} />
      <MobileDrawer pathname={pathname} open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-surface-100 bg-white/95 px-4 py-3 backdrop-blur md:h-12 md:px-6 md:py-0">
          <div className="flex items-center justify-between gap-3 md:h-full">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="touch-target inline-flex items-center justify-center rounded-8 border border-surface-200 text-surface-500 md:hidden"
                aria-label="打开控制台菜单"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
              <div>
                <p className="text-sm font-semibold text-surface-600 md:hidden">{pageTitle}</p>
                <p className="text-xs text-surface-400 md:hidden">{user.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`hidden text-[11px] md:inline ${connected ? 'text-semantic-success' : 'text-semantic-warning'}`}>
                {connected ? '实时已连接' : '实时重连中'}
              </span>
              <NotificationBell />
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col">
          <AnnouncementBanner />
          <div className="flex-1 px-4 py-4 pb-24 animate-fade-in sm:px-6 md:px-8 md:py-8 md:pb-8">
            {children}
          </div>
        </main>
      </div>

      <MobileTabs pathname={pathname} />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <Inner>{children}</Inner>
      </RealtimeProvider>
    </AuthProvider>
  );
}
