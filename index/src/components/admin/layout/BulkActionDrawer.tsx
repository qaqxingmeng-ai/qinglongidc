'use client';

import { useEffect, useState, type ReactNode } from 'react';

interface BulkActionDrawerProps {
  /** 是否显示 */
  open: boolean;
  /** 已选数量 */
  count: number;
  /** 当前可选总数（用于"全选筛选"的交互与显示） */
  total?: number;
  /** 清空选择回调（必传） */
  onClear: () => void;
  /** 全选筛选结果（可选） */
  onSelectAll?: () => void;
  /** 标题，默认「批量操作」 */
  title?: string;
  /** 顶部简要信息副标题（可选） */
  subtitle?: ReactNode;
  /** 操作区内容（按钮/表单），由调用方组织 */
  children: ReactNode;
  /** 本次会话默认是否折叠成小胶囊。默认 false */
  defaultCollapsed?: boolean;
  /** 顶部距离（px），默认 96（避开 header + tab bar） */
  topOffset?: number;
  /** 底部距离（px），默认 16 */
  bottomOffset?: number;
}

/**
 * 后台通用「右侧悬浮批量操作抽屉」
 * - 选中数 > 0 时从右侧滑入
 * - 可一键折叠成胶囊以便查看表格
 * - 样式走高级感：玻璃质感 + 柔和阴影 + 圆角
 */
export function BulkActionDrawer({
  open,
  count,
  total,
  onClear,
  onSelectAll,
  title = '批量操作',
  subtitle,
  children,
  defaultCollapsed = false,
  topOffset = 96,
  bottomOffset = 16,
}: BulkActionDrawerProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // 新一次选中自动展开
  useEffect(() => {
    if (open && count > 0) setCollapsed(false);
  }, [open, count]);

  if (!open) return null;

  // 折叠态：右下角小胶囊
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed right-4 z-40 flex items-center gap-2 rounded-full border border-brand-500/20 bg-white px-4 py-2 shadow-[0_10px_30px_-8px_rgba(51,115,255,0.35)] transition-all hover:shadow-[0_14px_38px_-8px_rgba(51,115,255,0.5)]"
        style={{ bottom: bottomOffset }}
        aria-label="展开批量操作"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-brand-500/40" />
          <span className="relative h-2 w-2 rounded-full bg-brand-500" />
        </span>
        <span className="text-[12px] font-medium text-surface-600">
          已选 <span className="text-brand-500 tabular-nums">{count}</span>
          {typeof total === 'number' ? <span className="text-surface-400"> / {total}</span> : null}
        </span>
        <svg className="h-3.5 w-3.5 text-surface-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M8 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }

  return (
    <aside
      className="fixed right-4 z-40 w-[324px] animate-[slide-in-right_220ms_ease-out] overflow-hidden rounded-[22px] border border-[rgba(136,155,194,0.22)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,255,0.96))] shadow-[0_28px_90px_-32px_rgba(15,23,42,0.5),0_14px_32px_rgba(15,23,42,0.08)] backdrop-blur"
      style={{ top: topOffset, bottom: bottomOffset }}
    >
      <div className="flex h-full flex-col">
        {/* 头部 */}
        <div className="relative border-b border-surface-100/80 bg-[linear-gradient(180deg,rgba(248,250,255,0.98),rgba(255,255,255,0.94))] px-4 pt-4 pb-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 animate-ping rounded-full bg-brand-500/40" />
                  <span className="relative h-2 w-2 rounded-full bg-brand-500" />
                </span>
                <span className="text-[11px] font-medium tracking-wide text-surface-400 uppercase">{title}</span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-[30px] font-semibold leading-none text-brand-500 tabular-nums">{count}</span>
                {typeof total === 'number' && (
                  <span className="text-[13px] text-surface-400 tabular-nums">/ {total}</span>
                )}
                <span className="text-[12px] text-surface-400">已选</span>
              </div>
              {subtitle && <div className="mt-1 text-[11px] text-surface-400">{subtitle}</div>}
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-surface-300 transition-colors hover:bg-surface-100 hover:text-surface-500"
              aria-label="折叠"
              title="折叠"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* 操作内容区 */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-2.5">{children}</div>
        </div>

        {/* 底部通用辅助区 */}
        <div className="border-t border-surface-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.66),rgba(246,248,252,0.92))] px-4 py-3">
          <div className="flex items-center gap-2">
            {onSelectAll && (
              <button
                type="button"
                onClick={onSelectAll}
                className="flex-1 h-8 rounded-6 border border-surface-200 bg-white text-[11.5px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500"
              >
                全选筛选
              </button>
            )}
            <button
              type="button"
              onClick={onClear}
              className="flex-1 h-8 rounded-6 border border-surface-200 bg-white text-[11.5px] font-medium text-surface-500 transition-colors hover:border-semantic-danger hover:text-semantic-danger"
            >
              清空
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** 分组小节（用于包裹 children 里多段操作） */
export function BulkActionSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="rounded-8 border border-surface-100 bg-white px-3 py-2.5">
      {label && <p className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.14em] text-surface-400">{label}</p>}
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
