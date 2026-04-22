'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';

interface CountUpProps {
  value: number;
  duration?: number;
  className?: string;
  format?: (n: number) => string;
  prefix?: string;
  suffix?: string;
}

/**
 * 进入可视区域后数字从 0 滚动到 value。尊重 reduced-motion。
 */
export function CountUp({
  value,
  duration = 0.9,
  className,
  format,
  prefix = '',
  suffix = '',
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setDisplay(value);
      return;
    }
    let rafId = 0;
    const start = performance.now();
    const from = 0;
    const delta = value - from;
    const total = duration * 1000;

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / total);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + delta * eased);
      if (t < 1) rafId = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [inView, value, duration, reduced]);

  const rendered = format
    ? format(display)
    : Number.isInteger(value)
      ? Math.round(display).toLocaleString()
      : display.toFixed(2);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {rendered}
      {suffix}
    </span>
  );
}
