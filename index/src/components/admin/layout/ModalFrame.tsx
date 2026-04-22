'use client';

import { motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const modalTransition = { type: 'spring' as const, stiffness: 340, damping: 30, mass: 0.9 };

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '5xl' | 'wide' | '6xl';

const sizeClassMap: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '5xl': 'max-w-5xl',
  wide: 'max-w-[1200px]',
  '6xl': 'max-w-6xl',
};

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export interface ModalFrameProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: ModalSize;
  className?: string;
  bodyClassName?: string;
  align?: 'center' | 'bottom';
  closeOnOverlay?: boolean;
}

export function ModalFrame({
  open,
  onClose,
  children,
  size = 'md',
  className,
  align = 'center',
  closeOnOverlay = true,
}: ModalFrameProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !open) return;
    document.body.classList.add('modal-open');
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [mounted, open]);

  if (!open) return null;
  if (!mounted) return null;

  return createPortal(
    <div
      className={joinClasses(
        'fixed inset-0 z-[120] flex h-screen w-screen modal-overlay',
        align === 'bottom'
          ? 'items-end justify-center px-0 sm:items-center sm:px-4'
          : 'items-center justify-center px-4 sm:px-6',
      )}
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 modal-backdrop" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: align === 'bottom' ? 18 : -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: align === 'bottom' ? 18 : -10 }}
        transition={modalTransition}
        className={joinClasses('relative modal-panel modal-shell', sizeClassMap[size], className)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </div>,
    document.body,
  );
}

export function ModalHeader({
  title,
  subtitle,
  onClose,
  rightSlot,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose?: () => void;
  rightSlot?: ReactNode;
  className?: string;
}) {
  return (
    <div className={joinClasses('modal-header', className)}>
      <div className="min-w-0 flex-1">
        <div className="modal-title-row">
          <span className="modal-title-mark" />
          <div className="min-w-0">
            <h3 className="modal-title">{title}</h3>
            {subtitle ? <p className="modal-subtitle">{subtitle}</p> : null}
          </div>
        </div>
      </div>
      <div className="ml-4 flex items-center gap-2">
        {rightSlot}
        {onClose ? (
          <button type="button" onClick={onClose} className="modal-close" aria-label="关闭">
            <svg className="h-3.5 w-3.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M2 2l6 6M8 2l-6 6" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ModalBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={joinClasses('modal-body', className)}>{children}</div>;
}

export function ModalFooter({
  children,
  className,
  hint,
}: {
  children: ReactNode;
  className?: string;
  hint?: ReactNode;
}) {
  return (
    <div className={joinClasses('modal-footer', className)}>
      {hint ? <div className="modal-footer-hint">{hint}</div> : <div />}
      <div className="modal-footer-actions">{children}</div>
    </div>
  );
}

export function ModalSection({
  title,
  description,
  children,
  accent = 'plain',
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  accent?: 'plain' | 'soft' | 'highlight';
  className?: string;
}) {
  return (
    <section
      className={joinClasses(
        'modal-section',
        accent === 'soft' && 'modal-section-soft',
        accent === 'highlight' && 'modal-section-highlight',
        className,
      )}
    >
      {title ? (
        <div className="modal-section-head">
          <div>
            <p className="modal-section-title">{title}</p>
            {description ? <p className="modal-section-desc">{description}</p> : null}
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function ModalNotice({
  tone = 'info',
  children,
  className,
}: {
  tone?: 'info' | 'success' | 'danger';
  children: ReactNode;
  className?: string;
}) {
  return <div className={joinClasses('modal-notice', `modal-notice-${tone}`, className)}>{children}</div>;
}
