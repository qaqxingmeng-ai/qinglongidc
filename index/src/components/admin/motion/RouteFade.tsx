'use client';

import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * 后台内容区路由切换淡入。
 * 去掉 exit 等待，新路由直接渐入，避免切换时的卡顿感。
 */
export function RouteFade({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
      className="h-full w-full"
    >
      {children}
    </motion.div>
  );
}
