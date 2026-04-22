'use client';

import type { ReactNode } from 'react';

export interface SortableThProps {
  children: ReactNode;
  /** 本列绑定的排序字段。 */
  field: string;
  /** 当前的排序字段。 */
  active?: string;
  /** 当前排序方向。 */
  order?: 'asc' | 'desc';
  /** 点击切换排序（字段、方向）。 */
  onToggle: (field: string, order: 'asc' | 'desc') => void;
  className?: string;
  align?: 'left' | 'right' | 'center';
}

/**
 * 可排序表头：点击切换 asc / desc / 清除。与 useListQueryState 搭配：
 *   <SortableTh field="createdAt" active={state.sort} order={state.order} onToggle={setSort}>时间</SortableTh>
 */
export function SortableTh({ children, field, active, order, onToggle, className, align = 'left' }: SortableThProps) {
  const isActive = active === field;
  const nextOrder: 'asc' | 'desc' = isActive && order === 'desc' ? 'asc' : 'desc';
  const arrow = !isActive ? '⇅' : order === 'asc' ? '↑' : '↓';
  const alignCls = align === 'right' ? 'text-right justify-end' : align === 'center' ? 'text-center justify-center' : 'text-left';
  return (
    <button
      type="button"
      onClick={() => onToggle(field, nextOrder)}
      className={[
        'inline-flex w-full items-center gap-1 font-medium transition-colors',
        alignCls,
        isActive ? 'text-brand-600' : 'text-surface-400 hover:text-surface-600',
        className ?? '',
      ].join(' ')}
    >
      <span>{children}</span>
      <span className="text-[10px] tabular-nums opacity-80">{arrow}</span>
    </button>
  );
}
