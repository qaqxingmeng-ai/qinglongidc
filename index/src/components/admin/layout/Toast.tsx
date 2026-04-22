'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { springSoft } from '../motion/config';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export type Toast = {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
};

type ToastContextValue = {
  push: (t: Omit<Toast, 'id'> & { duration?: number }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const ICONS: Record<ToastVariant, ReactNode> = {
  success: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  warning: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M4.93 19h14.14a2 2 0 001.74-3l-7.07-12a2 2 0 00-3.48 0l-7.07 12a2 2 0 001.74 3z" />
    </svg>
  ),
  info: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const STYLE: Record<ToastVariant, string> = {
  success: 'border-semantic-success-light/80 bg-white text-semantic-success-dark',
  error: 'border-semantic-danger-light/80 bg-white text-semantic-danger',
  warning: 'border-semantic-warning-light/80 bg-white text-semantic-warning-dark',
  info: 'border-semantic-info-light bg-white text-brand-600',
};

const ICON_BG: Record<ToastVariant, string> = {
  success: 'bg-semantic-success-light text-semantic-success-dark',
  error: 'bg-semantic-danger-light text-semantic-danger',
  warning: 'bg-semantic-warning-light text-semantic-warning-dark',
  info: 'bg-semantic-info-light text-brand-600',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) {
      clearTimeout(tm);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback<ToastContextValue['push']>((t) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const duration = t.duration ?? 3200;
    setToasts((prev) => [...prev, { id, variant: t.variant, title: t.title, description: t.description }]);
    if (duration > 0) {
      const tm = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, tm);
    }
  }, [dismiss]);

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      dismiss,
      success: (title, description) => push({ variant: 'success', title, description }),
      error: (title, description) => push({ variant: 'error', title, description }),
      warning: (title, description) => push({ variant: 'warning', title, description }),
      info: (title, description) => push({ variant: 'info', title, description }),
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[320px] max-w-[calc(100vw-32px)] flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 20, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1, transition: springSoft }}
              exit={{ opacity: 0, x: 20, scale: 0.96, transition: { duration: 0.16, ease: [0.4, 0, 0.2, 1] } }}
              className={[
                'pointer-events-auto flex items-start gap-2.5 rounded-8 border px-3.5 py-3 shadow-dropdown backdrop-blur-sm',
                STYLE[t.variant],
              ].join(' ')}
            >
              <span
                className={[
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-6',
                  ICON_BG[t.variant],
                ].join(' ')}
              >
                {ICONS[t.variant]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-surface-600">{t.title}</p>
                {t.description && <p className="mt-0.5 text-[12px] text-surface-400">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded p-0.5 text-surface-300 transition-colors hover:bg-surface-100 hover:text-surface-500"
                aria-label="关闭"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
