import { LEVEL_LABELS, normalizePriceLevel, type PriceLevel } from '@/lib/pricing';

export const USER_ROLES = ['ADMIN', 'AGENT', 'USER'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: '管理员',
  AGENT: '渠道',
  USER: '用户',
};

export const ROLE_LEVEL_OPTIONS: Record<UserRole, PriceLevel[]> = {
  ADMIN: [],
  AGENT: ['PARTNER'],
  USER: ['GUEST', 'VIP', 'VIP_TOP'],
};

export const SYSTEM_LEVEL_LABEL = '系统角色';

export function isUserRole(role: string): role is UserRole {
  return (USER_ROLES as readonly string[]).includes(role);
}

export function getAssignableLevelsForRole(role: string): PriceLevel[] {
  return isUserRole(role) ? ROLE_LEVEL_OPTIONS[role] : ROLE_LEVEL_OPTIONS.USER;
}

export function normalizeLevelForRole(
  role: string,
  requestedLevel?: string | null,
  fallbackLevel?: string | null,
): PriceLevel {
  if (role === 'ADMIN') {
    return 'GUEST';
  }

  const allowedLevels = getAssignableLevelsForRole(role);
  for (const candidate of [requestedLevel, fallbackLevel]) {
    const normalizedLevel = normalizePriceLevel(candidate);
    if (allowedLevels.includes(normalizedLevel)) {
      return normalizedLevel;
    }
  }

  return allowedLevels[0] || 'GUEST';
}

export function getRoleLevelDisplay(role: string, level: string | null | undefined) {
  if (role === 'ADMIN') {
    return {
      code: null,
      label: SYSTEM_LEVEL_LABEL,
    };
  }

  const normalizedLevel = normalizeLevelForRole(role, level);
  return {
    code: normalizedLevel,
    label: LEVEL_LABELS[normalizedLevel],
  };
}

export function getAffiliationLabel(role: string, agentName: string | null | undefined) {
  if (role === 'ADMIN') {
    return '系统账号';
  }

  if (agentName) {
    return agentName;
  }

  return role === 'AGENT' ? '平台直属' : '直客';
}

// ============================================================
// 统一「身份」概念：角色 + 等级 合并为单一身份（仅前端 UI 层）
// ============================================================

export type IdentityId = 'USER_GUEST' | 'USER_VIP' | 'USER_VIP_TOP' | 'AGENT' | 'ADMIN' | 'SUPPORT';

export interface IdentityOption {
  id: IdentityId;
  label: string;
  shortLabel: string;
  role: string;
  level: PriceLevel;
  tone: string;
  accent: string;
  disabled?: boolean;
  note?: string;
}

export const IDENTITY_OPTIONS: IdentityOption[] = [
  {
    id: 'USER_GUEST',
    label: '普通用户',
    shortLabel: '普通',
    role: 'USER',
    level: 'GUEST',
    tone: 'bg-surface-100 text-surface-600',
    accent: 'text-surface-600',
  },
  {
    id: 'USER_VIP',
    label: '会员用户',
    shortLabel: '会员',
    role: 'USER',
    level: 'VIP',
    tone: 'bg-semantic-info-light text-brand-600',
    accent: 'text-brand-500',
  },
  {
    id: 'USER_VIP_TOP',
    label: '高级会员',
    shortLabel: '高级',
    role: 'USER',
    level: 'VIP_TOP',
    tone: 'bg-brand-100 text-brand-600',
    accent: 'text-brand-600',
  },
  {
    id: 'AGENT',
    label: '渠道销售',
    shortLabel: '渠道',
    role: 'AGENT',
    level: 'PARTNER',
    tone: 'bg-semantic-warning-light text-semantic-warning-dark',
    accent: 'text-semantic-warning-dark',
  },
  {
    id: 'ADMIN',
    label: '管理员',
    shortLabel: '管理员',
    role: 'ADMIN',
    level: 'GUEST',
    tone: 'bg-semantic-danger-light text-semantic-danger',
    accent: 'text-semantic-danger',
  },
  {
    id: 'SUPPORT',
    label: '客服',
    shortLabel: '客服',
    role: 'USER',
    level: 'GUEST',
    tone: 'bg-surface-100 text-surface-400',
    accent: 'text-surface-400',
    disabled: true,
    note: '即将上线',
  },
];

export function getIdentity(role: string, level: string | null | undefined): IdentityOption {
  if (role === 'ADMIN') return IDENTITY_OPTIONS.find((o) => o.id === 'ADMIN')!;
  if (role === 'AGENT') return IDENTITY_OPTIONS.find((o) => o.id === 'AGENT')!;
  const normalized = normalizePriceLevel(level);
  if (normalized === 'VIP_TOP') return IDENTITY_OPTIONS.find((o) => o.id === 'USER_VIP_TOP')!;
  if (normalized === 'VIP') return IDENTITY_OPTIONS.find((o) => o.id === 'USER_VIP')!;
  return IDENTITY_OPTIONS.find((o) => o.id === 'USER_GUEST')!;
}

export function getIdentityByRoleLevel(role: string, level: string | null | undefined) {
  return getIdentity(role, level);
}
