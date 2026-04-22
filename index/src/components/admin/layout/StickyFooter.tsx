'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { springSoft } from '../motion/config';

type StickyFooterProps = {
  show?: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * 列表页底部固定栏（分页 / 批量操作）。
 * - 默认固定在 main 底部（sticky bottom-0），并承担 admin 布局的 WorkTabBar 之外的最后一层层级。
 * - 可控制显隐（批量操作条常用）。
 */
export function StickyFooter({ show = true, children, className }: StickyFooterProps) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1, transition: springSoft }}
          exit={{ y: 20, opacity: 0, transition: { duration: 0.14, ease: [0.4, 0, 0.2, 1] } }}
          className={[
            'sticky bottom-0 z-20 flex items-center justify-between gap-3 rounded-8 border border-surface-200 bg-white px-5 py-3 shadow-sticky',
            className ?? '',
          ].join(' ')}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
