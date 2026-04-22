'use client';

type SkeletonProps = {
  className?: string;
  rounded?: '4' | '6' | '8' | 'full';
};

/** 单块骨架（shimmer 效果，走 globals.css 的 .skeleton）。 */
export function Skeleton({ className, rounded = '6' }: SkeletonProps) {
  const r = rounded === 'full' ? 'rounded-full' : `rounded-${rounded}`;
  return <div className={`skeleton ${r} ${className ?? ''}`} />;
}

type SkeletonTableProps = {
  rows?: number;
  columns?: number;
};

/** 表格骨架，用于列表页加载态。 */
export function SkeletonTable({ rows = 5, columns = 5 }: SkeletonTableProps) {
  return (
    <div className="overflow-hidden rounded-8 border border-surface-200 bg-white shadow-card">
      <div className="flex items-center gap-4 border-b border-surface-100 bg-surface-50 px-5 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-3 flex-1" />
        ))}
      </div>
      <div>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={`r-${r}`}
            className="flex items-center gap-4 border-b border-surface-50 px-5 py-4 last:border-b-0"
          >
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={`c-${r}-${c}`}
                className={`h-3 flex-1 ${c === 0 ? 'max-w-[20%]' : ''}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

type SkeletonKpiProps = {
  count?: number;
};

/** 仪表盘 KPI 卡骨架。 */
export function SkeletonKpi({ count = 4 }: SkeletonKpiProps) {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-8 border border-surface-200 bg-white p-5 shadow-card"
        >
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-6 w-24" />
          <Skeleton className="mt-3 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}
