'use client';

export type StatusTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE_STYLE: Record<StatusTone, string> = {
  info: 'bg-semantic-info-light text-brand-600',
  success: 'bg-semantic-success-light text-semantic-success-dark',
  warning: 'bg-semantic-warning-light text-semantic-warning-dark',
  danger: 'bg-semantic-danger-light text-semantic-danger',
  neutral: 'bg-surface-100 text-surface-400',
};

/**
 * 统一状态字典：对已知业务状态码给出默认 tone 与中文文案。
 * 页面可通过 `overrideLabel` 覆盖文案，或直接用 <StatusBadge tone label /> 绕过字典。
 */
export const STATUS_DICT: Record<string, { tone: StatusTone; label: string }> = {
  // 订单
  PENDING: { tone: 'warning', label: '待处理' },
  PROCESSING: { tone: 'info', label: '处理中' },
  ACTIVE: { tone: 'success', label: '服务中' },
  COMPLETED: { tone: 'success', label: '已完成' },
  CANCELLED: { tone: 'neutral', label: '已取消' },
  REFUNDED: { tone: 'danger', label: '已退款' },
  PAID: { tone: 'info', label: '已支付' },
  UNPAID: { tone: 'warning', label: '未支付' },
  // 工单
  OPEN: { tone: 'warning', label: '待回复' },
  RESOLVED: { tone: 'success', label: '已解决' },
  CLOSED: { tone: 'neutral', label: '已关闭' },
  // 备份
  RUNNING: { tone: 'warning', label: '备份中' },
  SUCCESS: { tone: 'success', label: '成功' },
  FAILED: { tone: 'danger', label: '失败' },
  // 佣金 / 提现
  AVAILABLE: { tone: 'info', label: '可提现' },
  FROZEN: { tone: 'warning', label: '冻结中' },
  SETTLED: { tone: 'success', label: '已结算' },
  APPROVED: { tone: 'success', label: '已通过' },
  REJECTED: { tone: 'danger', label: '已拒绝' },
  // 服务器
  EXPIRED: { tone: 'danger', label: '已过期' },
  SUSPENDED: { tone: 'warning', label: '已暂停' },
  // 通用
  ENABLED: { tone: 'success', label: '已启用' },
  DISABLED: { tone: 'neutral', label: '已禁用' },
  ACTIVE_FLAG: { tone: 'success', label: '已发布' },
  INACTIVE: { tone: 'neutral', label: '未发布' },
};

export interface StatusBadgeProps {
  /** 业务状态码（如 'PENDING'），优先查字典。 */
  status?: string;
  /** 直接指定色调，绕过字典。 */
  tone?: StatusTone;
  /** 显示文案，覆盖字典中的 label。 */
  label?: string;
  className?: string;
}

export function StatusBadge({ status, tone, label, className }: StatusBadgeProps) {
  const entry = status ? STATUS_DICT[status] : undefined;
  const resolvedTone: StatusTone = tone ?? entry?.tone ?? 'neutral';
  const resolvedLabel = label ?? entry?.label ?? status ?? '';
  return (
    <span
      className={[
        'inline-flex items-center rounded-4 px-2 py-0.5 text-[11px] font-medium',
        TONE_STYLE[resolvedTone],
        className ?? '',
      ].join(' ')}
    >
      {resolvedLabel}
    </span>
  );
}
