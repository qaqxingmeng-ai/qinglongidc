'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { easeOut } from '../motion/config';

export type Crumb = { label: string; href?: string };

type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
  meta?: ReactNode;
};

/**
 * 后台统一页面头部。
 * - 面包屑（可选） -> 标题行 -> 副标题 -> 元信息
 * - 右侧 actions 区（按钮/筛选入口等）
 * - 入场动画：整体 fade-up，克制 160ms
 */
export function PageHeader({ title, subtitle, crumbs, actions, meta }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeOut}
      className="flex flex-col gap-2 border-b border-surface-100 pb-4 md:flex-row md:items-end md:justify-between md:gap-6"
    >
      <div className="min-w-0 flex-1">
        {crumbs && crumbs.length > 0 && (
          <nav className="mb-1.5 flex items-center gap-1 text-[12px] text-surface-400">
            {crumbs.map((c, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <span key={`${c.label}-${i}`} className="flex items-center gap-1">
                  {c.href && !isLast ? (
                    <Link href={c.href} className="transition-colors hover:text-brand-500">
                      {c.label}
                    </Link>
                  ) : (
                    <span className={isLast ? 'text-surface-500' : ''}>{c.label}</span>
                  )}
                  {!isLast && (
                    <svg className="h-3 w-3 text-surface-300" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M4.5 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              );
            })}
          </nav>
        )}
        <h1 className="text-lg font-semibold leading-tight text-surface-600">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-surface-400">{subtitle}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-surface-400">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  );
}
