'use client';

import { useMemo } from 'react';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

/**
 * 统一分页控件：页码切换 + 每页条数选择。
 * 与 StickyFooter 搭配使用：<StickyFooter left={<Pagination ... />} right={...} />。
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [20, 50, 100],
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const clamped = Math.min(Math.max(1, page), totalPages);

  const pages = useMemo(() => {
    const all: (number | '…')[] = [];
    const win = 2;
    const add = (n: number) => {
      if (all[all.length - 1] !== n) all.push(n);
    };
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - clamped) <= win) add(i);
      else if (all[all.length - 1] !== '…') all.push('…');
    }
    return all;
  }, [clamped, totalPages]);

  const btn = (disabled: boolean, active: boolean) => [
    'h-7 min-w-7 rounded-6 px-2 text-[11px] font-medium transition-colors',
    active
      ? 'bg-brand-500 text-white'
      : disabled
        ? 'cursor-not-allowed text-surface-300'
        : 'border border-surface-200 bg-white text-surface-500 hover:border-brand-500 hover:text-brand-500',
  ].join(' ');

  return (
    <div className={['flex items-center gap-2 text-[11px] text-surface-400', className ?? ''].join(' ')}>
      <span>共 <span className="font-semibold text-surface-600 tabular-nums">{total}</span> 条</span>
      <button type="button" disabled={clamped <= 1} onClick={() => onPageChange(clamped - 1)} className={btn(clamped <= 1, false)}>
        上一页
      </button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="px-1 text-surface-300">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={btn(false, p === clamped)}
          >
            {p}
          </button>
        )
      )}
      <button type="button" disabled={clamped >= totalPages} onClick={() => onPageChange(clamped + 1)} className={btn(clamped >= totalPages, false)}>
        下一页
      </button>
      {onPageSizeChange && (
        <label className="ml-2 inline-flex items-center gap-1">
          <span>每页</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-7 rounded-6 border border-surface-200 bg-white px-1 text-[11px] text-surface-500"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span>条</span>
        </label>
      )}
    </div>
  );
}
