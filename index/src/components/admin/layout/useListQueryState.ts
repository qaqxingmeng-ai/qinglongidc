'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export interface ListQueryState {
  page: number;
  pageSize: number;
  search: string;
  sort?: string;
  order?: 'asc' | 'desc';
  /** 其它任意筛选参数（如 status、category）。 */
  filters: Record<string, string>;
}

export interface UseListQueryStateOptions {
  /** 默认 pageSize。 */
  defaultPageSize?: number;
  /** 需要额外从 URL 读取/写入的筛选字段名。 */
  filterKeys?: string[];
}

/**
 * 把列表页的 page/pageSize/search/sort/filters 与 URL query 双向同步。
 * 变更会通过 router.replace 写入 URL（不触发 history 堆栈），
 * 让刷新/回退/分享链接都保持同一状态。
 */
export function useListQueryState({ defaultPageSize = 20, filterKeys = [] }: UseListQueryStateOptions = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const state = useMemo<ListQueryState>(() => {
    const filters: Record<string, string> = {};
    for (const key of filterKeys) {
      const v = params.get(key);
      if (v != null && v !== '') filters[key] = v;
    }
    const order = params.get('order');
    return {
      page: Math.max(1, Number(params.get('page') ?? '1') || 1),
      pageSize: Math.max(1, Number(params.get('pageSize') ?? String(defaultPageSize)) || defaultPageSize),
      search: params.get('search') ?? '',
      sort: params.get('sort') ?? undefined,
      order: order === 'asc' || order === 'desc' ? order : undefined,
      filters,
    };
  }, [params, defaultPageSize, filterKeys]);

  const writeQuery = useCallback((next: Partial<ListQueryState>) => {
    const sp = new URLSearchParams(params.toString());
    const merged: ListQueryState = { ...state, ...next, filters: { ...state.filters, ...(next.filters ?? {}) } };

    const set = (k: string, v: string | number | undefined | null) => {
      if (v == null || v === '' || (typeof v === 'number' && Number.isNaN(v))) sp.delete(k);
      else sp.set(k, String(v));
    };

    set('page', merged.page === 1 ? undefined : merged.page);
    set('pageSize', merged.pageSize === defaultPageSize ? undefined : merged.pageSize);
    set('search', merged.search || undefined);
    set('sort', merged.sort);
    set('order', merged.order);
    for (const key of filterKeys) {
      set(key, merged.filters[key] || undefined);
    }

    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, state, router, pathname, defaultPageSize, filterKeys]);

  return {
    state,
    setPage: (page: number) => writeQuery({ page }),
    setPageSize: (pageSize: number) => writeQuery({ pageSize, page: 1 }),
    setSearch: (search: string) => writeQuery({ search, page: 1 }),
    setSort: (sort: string | undefined, order: 'asc' | 'desc' | undefined) => writeQuery({ sort, order, page: 1 }),
    setFilter: (key: string, value: string | undefined) => writeQuery({ filters: { [key]: value ?? '' }, page: 1 }),
    resetFilters: () => writeQuery({ search: '', filters: Object.fromEntries(filterKeys.map((k) => [k, ''])), page: 1 }),
  };
}
