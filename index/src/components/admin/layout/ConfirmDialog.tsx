'use client';

import { ModalBody, ModalFooter, ModalFrame, ModalHeader, ModalNotice } from './ModalFrame';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <ModalFrame open={open} onClose={onCancel} size="sm" className="z-[60]">
      <ModalHeader
        title={title}
        subtitle={danger ? '此操作可能不可逆，请确认后继续。' : undefined}
        onClose={onCancel}
      />
      <ModalBody>
        {description ? (
          <ModalNotice tone={danger ? 'danger' : 'info'} className="whitespace-pre-line">
            {description}
          </ModalNotice>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary btn-sm"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={danger ? 'btn-danger btn-sm disabled:opacity-50' : 'btn-primary btn-sm disabled:opacity-50'}
          >
            {loading ? '处理中...' : confirmText}
          </button>
        </div>
      </ModalFooter>
    </ModalFrame>
  );
}
