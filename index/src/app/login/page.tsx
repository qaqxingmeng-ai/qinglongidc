'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import { useSiteMeta } from '@/components/SiteMetaProvider';

function sanitizeRedirect(value: string | null): string | null {
  if (!value) return null;
  const next = value.trim();
  if (!next.startsWith('/')) return null;
  if (next.startsWith('//')) return null;
  if (next.includes('://')) return null;
  return next;
}

function defaultRouteForRole(role?: string) {
  switch (role) {
    case 'ADMIN':
      return '/admin';
    case 'AGENT':
      return '/agent';
    default:
      return '/dashboard';
  }
}

const FEATURES = [
  {
    icon: (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5h14M5 6.5h14M5 18.5h14M3 12.5h.01M3 6.5h.01M3 18.5h.01" />
      </svg>
    ),
    title: '多地区节点',
    desc: 'BGP / 高防 / 托管，覆盖全国主要机房',
  },
  {
    icon: (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    title: '安全可靠',
    desc: '7×24 工单响应，高级会员 1 小时内处理',
  },
  {
    icon: (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    title: '快速交付',
    desc: '常规机型 30 分钟内开通，支持 AI 智选配置',
  },
];

function LoginForm() {
  const { user, login, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { siteMeta } = useSiteMeta();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Already logged in — redirect
  useEffect(() => {
    if (!authLoading && user) {
      const redirect = sanitizeRedirect(searchParams.get('redirect'));
      router.replace(redirect || defaultRouteForRole(user.role));
    }
  }, [authLoading, user, router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email.trim(), password);
      if (!result.success) {
        setError(result.error || '登录失败');
      } else {
        const redirect = sanitizeRedirect(searchParams.get('redirect'));
        router.push(redirect || defaultRouteForRole(result.user?.role));
      }
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="flex min-h-screen">
      {/* Left — branding panel */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col justify-between bg-gradient-to-br from-[#1a3a7a] via-[#1e4ba8] to-[#2563eb] px-12 py-10 text-white relative overflow-hidden">
        {/* Decorative shapes */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -left-16 bottom-20 h-64 w-64 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute right-12 bottom-40 h-40 w-40 rounded-full bg-white/[0.03]" />

        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-2 text-xl font-bold tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-base font-black">
              {siteMeta.siteName?.charAt(0) || 'S'}
            </span>
            {siteMeta.siteName}
          </Link>
          <h2 className="mt-14 text-3xl font-semibold leading-tight tracking-[-0.02em]">
            企业级服务器<br />
            管理与选购平台
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-blue-200/90">
            多地区物理服务器租用与托管，按等级透明定价，<br />
            AI 智选配置，售后工单 7×24 跟进。
          </p>
        </div>

        <div className="relative z-10 space-y-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-blue-200">
                {f.icon}
              </div>
              <div>
                <div className="text-sm font-semibold">{f.title}</div>
                <div className="mt-0.5 text-xs text-blue-200/80">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="relative z-10 text-xs text-blue-300/60">
          &copy; {new Date().getFullYear()} {siteMeta.siteName}. All rights reserved.
        </div>
      </div>

      {/* Right — login form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-[#f7f8fa] px-6 py-12">
        {/* Mobile logo */}
        <div className="mb-8 lg:hidden text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-xl font-bold text-surface-700">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white text-base font-black">
              {siteMeta.siteName?.charAt(0) || 'S'}
            </span>
            {siteMeta.siteName}
          </Link>
        </div>

        <div className="w-full max-w-[420px]">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-surface-700">登录</h1>
            <p className="mt-2 text-sm text-surface-400">
              登录后访问控制台、管理服务器和工单
            </p>
          </div>

          <div className="rounded-12 border border-surface-200 bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            {error && (
              <div className="mb-5 flex items-start gap-2 rounded-8 bg-semantic-danger-light p-3 text-sm text-semantic-danger">
                <svg className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-surface-600">邮箱地址</label>
                <input
                  className="input"
                  type="email"
                  placeholder="name@company.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm font-medium text-surface-600">密码</label>
                  <Link
                    href="/reset-password"
                    className="text-xs text-brand-500 hover:text-brand-600 transition-colors"
                  >
                    忘记密码?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-500 transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full justify-center h-11 text-sm disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    登录中...
                  </span>
                ) : (
                  '登 录'
                )}
              </button>
            </form>
          </div>

          <div className="mt-6 text-center text-sm text-surface-400">
            还没有账号?{' '}
            <Link href="/register" className="font-medium text-brand-500 hover:text-brand-600 transition-colors">
              立即注册
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthProvider>
  );
}
