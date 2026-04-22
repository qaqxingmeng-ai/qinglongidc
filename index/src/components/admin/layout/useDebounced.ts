'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 在指定延迟后返回 value 的去抖副本。常用于搜索输入节流。
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * 返回一个与入参函数等价、但带去抖的稳定引用。
 */
export function useDebouncedCallback<Args extends unknown[]>(fn: (...args: Args) => void, delay = 300) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(fn);
  latest.current = fn;

  const debounced = useCallback((...args: Args) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(...args), delay);
  }, [delay]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return debounced;
}
