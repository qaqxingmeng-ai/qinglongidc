'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { easeOut, staggerContainer, staggerItem } from '../motion/config';

type PanelProps = {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
};

/**
 * 后台面板容器。头部包含标题 / 徽标 / 右侧动作区。
 * 克制企业风：圆角 8 / 边框 surface-200 / 1px 阴影。
 */
export function Panel({
  title,
  description,
  icon,
  badge,
  actions,
  children,
  className,
  bodyClassName,
  noPadding,
}: PanelProps) {
  const hasHeader = title || icon || badge || actions || description;
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeOut}
      className={[
        'overflow-hidden rounded-8 border border-surface-200 bg-white shadow-card',
        className ?? '',
      ].join(' ')}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-3 border-b border-surface-100 px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {icon && <span className="text-surface-300">{icon}</span>}
              {title && <h2 className="text-[13px] font-semibold text-surface-600">{title}</h2>}
              {badge && <span className="ml-1">{badge}</span>}
            </div>
            {description && <p className="mt-0.5 text-[12px] text-surface-400">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={[noPadding ? '' : 'px-5 py-4', bodyClassName ?? ''].join(' ')}>
        {children}
      </div>
    </motion.section>
  );
}

type PanelGridProps = {
  children: ReactNode;
  className?: string;
  stagger?: number;
};

/** 面板网格容器：子项按 stagger 顺序进入。子项请用 PanelGridItem 包裹。 */
export function PanelGrid({ children, className, stagger = 0.05 }: PanelGridProps) {
  return (
    <motion.div
      variants={staggerContainer(stagger)}
      initial="initial"
      animate="animate"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function PanelGridItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  );
}
