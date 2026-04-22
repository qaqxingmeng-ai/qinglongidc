'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { easeOut } from '../motion/config';

type EmptyStateProps = {
  icon?: ReactNode;
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
};

const defaultIcon = (
  <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
  </svg>
);

/** 统一空状态。compact=true 用于面板内内嵌。 */
export function EmptyState({ icon, title = '暂无数据', description, action, compact }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeOut}
      className={[
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8' : 'py-16',
      ].join(' ')}
    >
      <div className="mb-3 text-surface-300">{icon ?? defaultIcon}</div>
      <p className="text-[13px] font-medium text-surface-500">{title}</p>
      {description && <p className="mt-1 text-[12px] text-surface-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}
