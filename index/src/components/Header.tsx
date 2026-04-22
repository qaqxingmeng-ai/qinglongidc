'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { useSiteMeta } from './SiteMetaProvider';

type HeaderMenuItem = {
  href: string;
  label: string;
};

function getDashboardLink(role?: string) {
  switch (role) {
    case 'ADMIN':
      return '/admin';
    case 'AGENT':
      return '/agent';
    case 'USER':
      return '/dashboard';
    default:
      return '/';
  }
}

function getDashboardLabel(role?: string) {
  switch (role) {
    case 'ADMIN':
      return '管理后台';
    case 'AGENT':
      return '渠道后台';
    default:
      return '我的面板';
  }
}

function getMenuItems(role?: string): HeaderMenuItem[] {
  switch (role) {
    case 'ADMIN':
      return [
        { href: '/admin/users', label: '客户管理' },
        { href: '/admin/tickets', label: '工单管理' },
        { href: '/admin/orders', label: '订单管理' },
      ];
    case 'AGENT':
      return [
        { href: '/agent/users', label: '我的客户' },
        { href: '/agent/tickets', label: '客户工单' },
        { href: '/agent/finance', label: '财务中心' },
      ];
    default:
      return [
        { href: '/dashboard/servers', label: '我的服务器' },
        { href: '/dashboard/tickets', label: '工单' },
        { href: '/dashboard/profile', label: '个人资料' },
      ];
  }
}

function getSafeDisplayName(name?: string | null) {
  const trimmed = (name || '').trim();
  return trimmed || '用户';
}

function getSafeInitial(name?: string | null) {
  return getSafeDisplayName(name).slice(0, 1).toUpperCase();
}

export default function Header() {
  const { user, logout } = useAuth();
  const { siteMeta } = useSiteMeta();
  const pathname = usePathname();
  const [showMenu, setShowMenu] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const dashboardLink = getDashboardLink(user?.role);
  const dashboardLabel = getDashboardLabel(user?.role);
  const menuItems = getMenuItems(user?.role);
  const displayName = getSafeDisplayName(user?.name);
  const displayInitial = getSafeInitial(user?.name);
  const primaryLinks: HeaderMenuItem[] = [
    { href: '/servers', label: '服务器列表' },
    { href: '/docs', label: '知识库' },
    { href: '/membership', label: '会员权益' },
  ];

  useEffect(() => {
    setShowMenu(false);
    setShowMobileNav(false);
  }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-brand-50 bg-white/78 backdrop-blur-xl animate-fade-in-down">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowMobileNav(true)}
                className="touch-target inline-flex items-center justify-center rounded-8 border border-brand-50 bg-white text-surface-500 transition hover:text-brand-700 md:hidden"
                aria-label="打开导航菜单"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>

              <Link href="/" className="text-lg font-semibold tracking-tight text-surface-700 transition-opacity hover:opacity-70">
                {siteMeta.siteName}
              </Link>
            </div>

            <nav className="hidden md:flex items-center gap-6 text-sm text-surface-500">
              {primaryLinks.map((item) => (
                <Link key={item.href} href={item.href} className="transition-colors hover:text-brand-700">
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              {user ? (
                <div className="relative">
                  <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="flex items-center gap-2 text-sm text-surface-500 hover:text-brand-700"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-medium text-brand-700">
                      {displayInitial}
                    </span>
                    <span className="hidden sm:inline">{displayName}</span>
                  </button>
                  {showMenu && (
                    <div className="absolute right-0 mt-2 w-48 origin-top-right animate-scale-in rounded-8 border border-brand-50 bg-white py-1 shadow-[0_18px_40px_rgba(47,109,214,0.12)]">
                      <Link
                        href={dashboardLink}
                        className="block px-4 py-2 text-sm text-surface-500 transition-colors hover:bg-brand-50"
                        onClick={() => setShowMenu(false)}
                      >
                        {dashboardLabel}
                      </Link>
                      {menuItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="block px-4 py-2 text-sm text-surface-500 transition-colors hover:bg-brand-50"
                          onClick={() => setShowMenu(false)}
                        >
                          {item.label}
                        </Link>
                      ))}
                      <hr className="my-1 border-brand-50" />
                      <button
                        onClick={() => { logout(); setShowMenu(false); }}
                        className="block w-full text-left px-4 py-2 text-sm text-semantic-danger hover:bg-semantic-danger-light"
                      >
                        退出
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  href="/login"
                  className="btn-primary btn-sm"
                >
                  登录
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {showMobileNav && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-surface-800/35 backdrop-blur-sm" onClick={() => setShowMobileNav(false)} />
          <div className="absolute inset-y-0 left-0 flex w-full max-w-sm flex-col bg-white shadow-modal animate-slide-in-right">
            <div className="flex items-center justify-between border-b border-surface-100 px-5 py-4 pt-safe">
              <div>
                <p className="text-base font-semibold text-surface-700">{siteMeta.siteName}</p>
                <p className="text-xs text-surface-400">移动导航</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileNav(false)}
                className="touch-target inline-flex items-center justify-center rounded-8 border border-surface-200 text-surface-400"
                aria-label="关闭导航菜单"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="space-y-2">
                {primaryLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex min-h-[48px] items-center rounded-8 border border-surface-100 px-4 text-sm font-medium text-surface-500 transition hover:border-brand-50 hover:bg-brand-50 hover:text-brand-700"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>

              <div className="mt-6 rounded-3xl border border-surface-100 bg-surface-50 px-4 py-4">
                {user ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                        {displayInitial}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-surface-600">{displayName}</p>
                        <p className="truncate text-xs text-surface-400">{user.email}</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <Link
                        href={dashboardLink}
                        className="flex min-h-[46px] items-center rounded-8 bg-white px-4 text-sm font-medium text-surface-500"
                      >
                        {dashboardLabel}
                      </Link>
                      {menuItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="flex min-h-[46px] items-center rounded-8 bg-white px-4 text-sm font-medium text-surface-500"
                        >
                          {item.label}
                        </Link>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          logout();
                          setShowMobileNav(false);
                        }}
                        className="flex min-h-[46px] w-full items-center rounded-8 bg-white px-4 text-sm font-medium text-semantic-danger"
                      >
                        退出登录
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-surface-600">登录后可查看订单、工单和控制台</p>
                    <div className="mt-4 space-y-2">
                      <Link
                        href="/login"
                        className="btn-primary w-full justify-center"
                        onClick={() => setShowMobileNav(false)}
                      >
                        立即登录
                      </Link>
                      <Link href="/register" className="btn-secondary w-full justify-center">
                        注册账号
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
