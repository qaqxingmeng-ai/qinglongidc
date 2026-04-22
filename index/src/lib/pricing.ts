// 价格系统
// 成本价 = 原价 / 2
// 默认等级加价规则:
//   合作商 +20%, 高级会员 +40%,
//   会员 +50%, 普通用户 +100%
// 取整: 600以内向上到10, 600以上向上到50

export const PRICE_LEVELS = ['PARTNER', 'VIP_TOP', 'VIP', 'GUEST'] as const;

export type PriceLevel = (typeof PRICE_LEVELS)[number];

export interface PricingRuleSet {
  markups: Record<PriceLevel, number>;
  roundingThreshold: number;
  roundingSmallStep: number;
  roundingLargeStep: number;
}

export const DEFAULT_PRICING_RULES: PricingRuleSet = {
  markups: {
    PARTNER: 0.20,
    VIP_TOP: 0.40,
    VIP: 0.50,
    GUEST: 1.00,
  },
  roundingThreshold: 600,
  roundingSmallStep: 10,
  roundingLargeStep: 50,
};

export const LEVEL_LABELS: Record<PriceLevel, string> = {
  PARTNER: '合作商',
  VIP_TOP: '高级会员',
  VIP: '会员',
  GUEST: '普通用户',
};

export function normalizePriceLevel(level: string | null | undefined): PriceLevel {
  return PRICE_LEVELS.includes(level as PriceLevel) ? (level as PriceLevel) : 'GUEST';
}

export function getLevelLabel(level: string | null | undefined): string {
  const normalized = normalizePriceLevel(level);
  return LEVEL_LABELS[normalized];
}

function roundUp(price: number, rules: PricingRuleSet = DEFAULT_PRICING_RULES): number {
  const step = price <= rules.roundingThreshold
    ? rules.roundingSmallStep
    : rules.roundingLargeStep;
  return Math.ceil(price / step) * step;
}

export function calculatePrice(
  originalPrice: number,
  level: PriceLevel,
  rules: PricingRuleSet = DEFAULT_PRICING_RULES,
): number {
  const costPrice = originalPrice / 2;
  const markup = rules.markups[level];
  const rawPrice = costPrice * (1 + markup);
  return roundUp(rawPrice, rules);
}

export function calculateAllPrices(
  originalPrice: number,
  rules: PricingRuleSet = DEFAULT_PRICING_RULES,
): Record<PriceLevel, number> {
  const result: Record<string, number> = {};
  for (const level of PRICE_LEVELS) {
    result[level] = calculatePrice(originalPrice, level, rules);
  }
  return result as Record<PriceLevel, number>;
}

export function getCostPrice(originalPrice: number): number {
  return originalPrice / 2;
}

export function getRetailRatePercent(
  level: PriceLevel,
  rules: PricingRuleSet = DEFAULT_PRICING_RULES,
): number {
  return Number((((1 + rules.markups[level]) / 2) * 100).toFixed(1));
}

// 权限: 哪些等级有邀请码
export function canInvite(level: string): boolean {
  return level === 'PARTNER';
}

// 权限: 哪些等级可创建下级用户
export function canCreateSubUser(level: string): boolean {
  return level === 'PARTNER';
}

// PARTNER 可创建的下级等级
export const CREATABLE_LEVELS: PriceLevel[] = ['VIP_TOP', 'VIP', 'GUEST'];

// 生成邀请码 (6位大写字母+数字)
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(bytes[i] % chars.length);
  }
  return code;
}
