'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import { RealtimeProvider } from '@/components/RealtimeProvider';
import { useSiteMeta } from '@/components/SiteMetaProvider';
import type { ReactNode } from 'react';

type NavLink = {
  href: string;
  label: string;
  exact?: boolean;
};

const agentLinks: NavLink[] = [
  { href: '/agent', label: '概览', exact: true },
  { href: '/agent/users', label: '我的客户' },
  { href: '/agent/orders', label: '客户订单' },
  { href: '/agent/servers', label: '客户服务器' },
  { href: '/agent/tickets', label: '客户工单' },
  { href: '/agent/logs', label: '操作日志' },
  { href: '/agent/finance', label: '财务中心' },
  { href: '/agent/commissions', label: '佣金中心' },
  { href: '/agent/promo', label: '推广工具' },
  { href: '/agent/performance', label: '业绩看板' },
];

const quickTabs: NavLink[] = [
  { href: '/agent', label: '概览', exact: true },
  { href: '/agent/users', label: '客户' },
  { href: '/agent/orders', label: '订单' },
  { href: '/agent/tickets', label: '工单' },
  { href: '/agent/finance', label: '财务' },
];

function isActive(pathname: string, link: NavLink) {
  return link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(link.href + '/');
}

function SidebarLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-1">
      {agentLinks.map((link) => {
        const active = isActive(pathname, link);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={`block rounded-8 px-3 py-2.5 text-sm transition-colors ${
              active ? 'bg-brand-50 text-brand-700 font-medium' : 'text-surface-600 hover:bg-surface-50 hover:text-surface-900'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AgentSidebar({ pathname }: { pathname: string }) {
  const { user, logout } = useAuth();
  const { siteMeta } = useSiteMeta();

  return (
    <aside className="hidden w-56 shrink-0 border-r border-surface-100 bg-white p-4 md:block">
      <Link href="/" className="mb-1 block px-3 text-lg font-semibold text-surface-900">
        {siteMeta.siteName}
      </Link>
      <p className="mb-6 px-3 text-xs text-surface-400">渠道面板</p>
      <SidebarLinks pathname={pathname} />
      <div className="mt-10 border-t border-surface-100 px-3 pt-4">
        <p className="mb-1 text-xs text-surface-400">{user?.name}</p>
        <p className="mb-1 text-xs text-surface-400">等级: {user?.level}</p>
        {user?.inviteCode && <p className="mb-1 text-xs text-surface-400">邀请码: {user.inviteCode}</p>}
        <button onClick={logout} className="text-xs text-semantic-danger hover:underline">退出登录</button>
      </div>
    </aside>
  );
}

function AgentDrawer({
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
            <p className="text-base font-semibold text-surface-700">渠道面板</p>
            <p className="text-xs text-surface-400">移动导航</p>
          </div>
          <button type="button" onClick={onClose} className="touch-target inline-flex items-center justify-center rounded-8 border border-surface-200 text-surface-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-5 rounded-3xl border border-surface-100 bg-surface-50 px-4 py-4">
            <p className="truncate text-sm font-semibold text-surface-600">{user?.name}</p>
            <p className="mt-1 text-xs text-surface-400">等级: {user?.level}</p>
            {user?.inviteCode && <p className="mt-1 text-xs text-surface-400">邀请码: {user.inviteCode}</p>}
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

function MobileQuickTabs({ pathname }: { pathname: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-200 bg-white/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-5 px-2 pb-safe pt-2">
        {quickTabs.map((tab) => {
          const active = isActive(pathname, tab);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex min-h-[48px] flex-col items-center justify-center rounded-8 text-xs font-medium ${
                active ? 'bg-brand-50 text-brand-700' : 'text-surface-400'
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
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname || '/agent')}`);
      return;
    }
    if (user.role === 'ADMIN') {
      router.replace('/admin');
      return;
    }
    if (user.role === 'USER') {
      router.replace('/dashboard');
      return;
    }
  }, [user, loading, router, pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [drawerOpen]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const title = useMemo(() => {
    const current = agentLinks.find((link) => isActive(pathname, link));
    return current?.label || '渠道面板';
  }, [pathname]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-surface-400">加载中...</div>;
  if (!user || user.role !== 'AGENT') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-surface-500">
        <p className="text-sm">正在跳转到正确页面...</p>
        <Link href="/" className="text-sm text-brand-600 hover:underline">返回首页</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-surface-50">
      <AgentSidebar pathname={pathname} />
      <AgentDrawer pathname={pathname} open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-surface-100 bg-white/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="touch-target inline-flex items-center justify-center rounded-8 border border-surface-200 text-surface-500"
                aria-label="打开渠道菜单"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
              <div>
                <p className="text-sm font-semibold text-surface-600">{title}</p>
                <p className="text-xs text-surface-400">{user.name}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-4 pb-24 md:p-8 md:pb-8">{children}</main>
      </div>

      <MobileQuickTabs pathname={pathname} />
    </div>
  );
}

export default function AgentLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <Inner>{children}</Inner>
      </RealtimeProvider>
    </AuthProvider>
  );
}
