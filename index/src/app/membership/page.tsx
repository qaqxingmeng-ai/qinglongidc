'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { useSiteMeta } from '@/components/SiteMetaProvider';

interface LevelBenefit {
  level: string;
  label: string;
  color: string;
  minSpend: number;
  discountPercent: number;
  ticketPriority: string;
  supportSLA: string;
  dedicatedCSM: boolean;
  apiRateLimit: number;
  badge: boolean;
}

interface Progress {
  currentLevel: string;
  totalSpent: number;
  benefits: LevelBenefit;
  nextLevel: string | null;
  nextThreshold: number | null;
  progressPercent: number;
}

const levelColor: Record<string, string> = {
  GUEST: 'text-surface-500 bg-surface-100',
  VIP: 'text-brand-600 bg-semantic-info-light',
  VIP_TOP: 'text-purple-700 bg-purple-50',
  PARTNER: 'text-yellow-700 bg-yellow-50',
};

const levelBorder: Record<string, string> = {
  GUEST: 'border-surface-200',
  VIP: 'border-blue-200',
  VIP_TOP: 'border-purple-200',
  PARTNER: 'border-yellow-200',
};

export default function MembershipPage() {
  const { siteMeta } = useSiteMeta();
  const [benefits, setBenefits] = useState<LevelBenefit[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    apiFetch('/api/membership/benefits').then(r => r.json()).then(j => {
      if (j.success) setBenefits(j.data.levels ?? []);
    });
    apiFetch('/api/membership/progress').then(r => r.json()).then(j => {
      if (j.success) { setProgress(j.data); setLoggedIn(true); }
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Header */}
      <div className="bg-white border-b border-surface-100 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="text-surface-600 font-semibold text-sm">{siteMeta.siteName}</Link>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link href="/docs" className="text-surface-400 hover:text-surface-500">帮助中心</Link>
            {loggedIn ? (
              <Link href="/dashboard" className="text-surface-400 hover:text-surface-500">控制台</Link>
            ) : (
              <Link href="/register" className="text-surface-400 hover:text-surface-500">注册</Link>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-surface-600">会员权益</h1>
          <p className="text-sm text-surface-400">累计消费即可自动升级，享受更多专属权益</p>
        </div>

        {/* Progress card */}
        {progress && (
          <div className={`bg-white border-2 ${levelBorder[progress.currentLevel]} rounded-8 p-6 space-y-4`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-surface-400">当前等级</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${levelColor[progress.currentLevel]}`}>
                    {progress.benefits.label}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-surface-400">累计消费</p>
                <p className="text-xl font-bold text-surface-600 mt-1">¥{progress.totalSpent.toFixed(2)}</p>
              </div>
            </div>

            {progress.nextLevel && progress.nextThreshold != null && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-surface-400">
                  <span>距升级到 {progress.nextLevel} 还需 ¥{(progress.nextThreshold - progress.totalSpent).toFixed(2)}</span>
                  <span>{progress.progressPercent.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-surface-800 rounded-full transition-all"
                    style={{ width: `${progress.progressPercent}%` }}
                  />
                </div>
                <p className="text-xs text-surface-400 text-right">目标：¥{progress.nextThreshold}</p>
              </div>
            )}

            {!progress.nextLevel && (
              <p className="text-sm text-semantic-warning font-medium">您已达到最高等级，享受全部专属权益</p>
            )}
          </div>
        )}

        {/* Benefits comparison table */}
        <div className="bg-white border border-surface-100 rounded-8 overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-50">
            <h2 className="text-sm font-medium text-surface-600">等级权益对比</h2>
          </div>
          <div className="space-y-3 p-4 sm:hidden">
            {benefits.map((b) => (
              <div key={b.level} className={`rounded-8 border p-4 ${levelBorder[b.level]}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${levelColor[b.level]}`}>{b.label}</span>
                  <span className="text-xs text-surface-400">{b.minSpend === 0 ? '免费' : `≥¥${b.minSpend}`}</span>
                </div>
                <div className="mt-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-surface-400">专属折扣</span>
                    <span className="font-medium text-surface-500">{b.discountPercent === 0 ? '-' : `${b.discountPercent}% OFF`}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-surface-400">工单优先级</span>
                    <span className="font-medium text-surface-500">{b.ticketPriority === 'HIGH' ? '高优先' : '普通'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-surface-400">工单响应 SLA</span>
                    <span className="font-medium text-surface-500">{b.supportSLA}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-surface-400">API 调用限制</span>
                    <span className="font-medium text-surface-500">{b.apiRateLimit.toLocaleString()} / 天</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-surface-400">专属客户经理</span>
                    <span className="font-medium text-surface-500">{b.dedicatedCSM ? '支持' : '不支持'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-surface-400">等级徽章</span>
                    <span className="font-medium text-surface-500">{b.badge ? '支持' : '不支持'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-xs text-surface-400">
                <tr>
                  <th className="px-4 py-3 text-left">权益项目</th>
                  {benefits.map((b) => (
                    <th key={b.level} className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${levelColor[b.level]}`}>{b.label}</span>
                      <div className="text-[10px] text-surface-400 mt-1">
                        {b.minSpend === 0 ? '免费' : `≥¥${b.minSpend}`}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <tr className="hover:bg-surface-50/50">
                  <td className="px-4 py-3 text-surface-500 font-medium">专属折扣</td>
                  {benefits.map((b) => (
                    <td key={b.level} className="px-4 py-3 text-center font-medium">
                      {b.discountPercent === 0 ? <span className="text-surface-400">-</span> : <span className="text-semantic-success">{b.discountPercent}% OFF</span>}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-surface-50/50">
                  <td className="px-4 py-3 text-surface-500 font-medium">工单优先级</td>
                  {benefits.map((b) => (
                    <td key={b.level} className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs ${b.ticketPriority === 'HIGH' ? 'bg-orange-50 text-semantic-warning' : 'bg-surface-50 text-surface-400'}`}>
                        {b.ticketPriority === 'HIGH' ? '高优先' : '普通'}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-surface-50/50">
                  <td className="px-4 py-3 text-surface-500 font-medium">工单响应 SLA</td>
                  {benefits.map((b) => (
                    <td key={b.level} className="px-4 py-3 text-center text-surface-500">{b.supportSLA}</td>
                  ))}
                </tr>
                <tr className="hover:bg-surface-50/50">
                  <td className="px-4 py-3 text-surface-500 font-medium">API 调用限制</td>
                  {benefits.map((b) => (
                    <td key={b.level} className="px-4 py-3 text-center text-surface-500">{b.apiRateLimit.toLocaleString()} / 天</td>
                  ))}
                </tr>
                <tr className="hover:bg-surface-50/50">
                  <td className="px-4 py-3 text-surface-500 font-medium">专属客户经理</td>
                  {benefits.map((b) => (
                    <td key={b.level} className="px-4 py-3 text-center">
                      {b.dedicatedCSM ? (
                        <svg className="w-4 h-4 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-surface-300">-</span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-surface-50/50">
                  <td className="px-4 py-3 text-surface-500 font-medium">等级徽章</td>
                  {benefits.map((b) => (
                    <td key={b.level} className="px-4 py-3 text-center">
                      {b.badge ? (
                        <svg className="w-4 h-4 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-surface-300">-</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {!loggedIn && (
          <div className="text-center pt-4">
            <Link
              href="/register"
              className="inline-block px-6 py-3 bg-surface-800 text-white text-sm rounded-8 hover:bg-surface-700 transition-colors"
            >
              立即注册，开始享受会员权益
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
