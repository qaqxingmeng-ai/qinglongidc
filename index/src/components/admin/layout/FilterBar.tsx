'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { easeOut, springSoft } from '../motion/config';

type FilterBarProps = {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
};

/** 统一筛选栏：圆角 8 / 白底 / 低阴影，内部一行 flex。 */
export function FilterBar({ children, right, className }: FilterBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...easeOut, delay: 0.04 }}
      className={[
        'flex flex-wrap items-center gap-3 rounded-8 border border-surface-200 bg-white px-4 py-3 shadow-card',
        className ?? '',
      ].join(' ')}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
      {right && <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>}
    </motion.div>
  );
}

type TabChipProps = {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  count?: number;
};

/** 分段选择（订单状态过滤等）。active 下用 layoutId 做平滑位移。 */
export function TabChip({ active, children, onClick, count }: TabChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative flex h-8 items-center gap-1.5 rounded-6 px-3 text-[12px] font-medium transition-colors duration-150',
        active ? 'text-white' : 'text-surface-400 hover:bg-surface-100 hover:text-surface-600',
      ].join(' ')}
    >
      {active && (
        <motion.span
          layoutId="admin-filter-chip-active"
          className="absolute inset-0 rounded-6 bg-brand-500 shadow-[0_1px_2px_rgba(22,93,255,0.2)]"
          transition={springSoft}
        />
      )}
      <span className="relative z-[1]">{children}</span>
      {typeof count === 'number' && (
        <span
          className={[
            'relative z-[1] flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-medium leading-none',
            active ? 'bg-white/25 text-white' : 'bg-surface-100 text-surface-400',
          ].join(' ')}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
