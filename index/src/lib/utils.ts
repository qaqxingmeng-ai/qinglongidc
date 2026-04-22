import { NextResponse } from 'next/server';
import { calculateAllPrices, DEFAULT_PRICING_RULES, type PricingRuleSet } from '@/lib/pricing';

export const PRODUCT_CATEGORIES = [
  'dedicated',
  'gpu',
  'storage',
  'high-frequency',
  'large-memory',
  'general',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

const CATEGORY_ALIASES: Record<string, ProductCategory> = {
  dedicated: 'dedicated',
  'dedicated-server': 'dedicated',
  'bare-metal': 'dedicated',
  gpu: 'gpu',
  'gpu-server': 'gpu',
  storage: 'storage',
  'storage-server': 'storage',
  'high-frequency': 'high-frequency',
  highfrequency: 'high-frequency',
  'high-frequency-server': 'high-frequency',
  'large-memory': 'large-memory',
  largememory: 'large-memory',
  'memory-optimized': 'large-memory',
  general: 'general',
  cloud: 'general',
  vps: 'general',
  '独立服务器': 'dedicated',
  独服: 'dedicated',
  gpu服务器: 'gpu',
  存储型: 'storage',
  高频型: 'high-frequency',
  大内存: 'large-memory',
  通用: 'general',
};

export function success<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function error(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function unauthorized() {
  return error('未授权', 401);
}

export function forbidden() {
  return error('无权限', 403);
}

export function notFound(resource = '资源') {
  return error(`${resource}不存在`, 404);
}

export function generateOrderNo(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD${y}${m}${d}${h}${min}${s}${rand}`;
}

export function generateTicketNo(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TK${y}${m}${d}${rand}`;
}

export function parseTags(tagsStr: string): string[] {
  return normalizeTagList(tagsStr);
}

export function normalizeText(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[＿_]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[（）()]/g, '')
    .trim();
}

export function normalizeCompareText(value: string | null | undefined) {
  return normalizeText(value).replace(/[\s\-_/|+]+/g, '');
}

export function normalizeProductCategory(category: string | null | undefined): ProductCategory {
  const key = normalizeText(category).replace(/\s+/g, '-');
  return CATEGORY_ALIASES[key] || 'general';
}

export function normalizeTagList(raw: string | string[] | null | undefined): string[] {
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((item) => String(item || '').trim()).filter(Boolean)));
  }

  const text = String(raw || '').trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return Array.from(new Set(parsed.map((item) => String(item || '').trim()).filter(Boolean)));
    }
  } catch {
    return Array.from(
      new Set(
        text
          .split(/[\n,，、|/]/)
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  }

  return [];
}

export function parseJsonRecord(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}

export function getTotalBenchmark(singleBenchmark: number, isDualCPU: boolean, cpuCount?: number) {
  const multiplier = cpuCount && cpuCount > 0 ? cpuCount : isDualCPU ? 2 : 1;
  return singleBenchmark * multiplier;
}

export function getDaysUntil(dateValue: Date | string | null | undefined, now = new Date()) {
  if (!dateValue) return null;

  const target = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(target.getTime())) return null;

  return Math.ceil((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

export function inferProductCategory(input: {
  name?: string | null;
  memory?: string | null;
  storage?: string | null;
  description?: string | null;
}) {
  const source = [
    input.name,
    input.memory,
    input.storage,
    input.description,
  ]
    .filter(Boolean)
    .join(' ');

  if (/gpu|a100|h100|rtx|tesla/i.test(source)) return 'gpu';
  if (/高频|高主频|单核/i.test(source)) return 'high-frequency';
  if (/大内存|内存优化|memory/i.test(source)) return 'large-memory';
  if (/大盘|存储|storage|hdd|raid/i.test(source)) return 'storage';
  if (/独服|独立|dedicated|bare metal/i.test(source)) return 'dedicated';

  const memorySize = parseMemorySizeGb(input.memory);
  if (memorySize >= 128) return 'large-memory';

  return 'general';
}

export function parseMemorySizeGb(memory: string | null | undefined) {
  const text = String(memory || '');
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;

  const size = Number(match[1]);
  if (!Number.isFinite(size)) return 0;
  if (/tb/i.test(text)) return size * 1024;
  return size;
}

export function serializeCPURecord(cpu: Record<string, unknown>) {
  const count = cpu._count as { products?: unknown } | undefined;
  return {
    id: cpu.id,
    model: cpu.model,
    cores: cpu.cores,
    frequency: cpu.frequency,
    benchmark: cpu.benchmark,
    tags: normalizeTagList(cpu.tags as string | string[] | null | undefined),
    description: cpu.description || null,
    source: cpu.source || 'manual',
    productCount: Number(count?.products ?? 0),
    createdAt: cpu.createdAt,
    updatedAt: cpu.updatedAt,
  };
}

export function serializeProductRecord(
  product: {
    id: string;
    name: string;
    category?: string | null;
    region: string;
    cpuDisplay?: string | null;
    status: string;
    cpu?: Record<string, unknown> | null;
    cpuId?: string | null;
    isDualCPU?: boolean;
    cpuCount?: number;
    memory: string;
    storage: string;
    bandwidth: string;
    originalPrice: number;
    costPrice: number;
    scoreNetwork?: number | null;
    scoreCpuSingle?: number | null;
    scoreCpuMulti?: number | null;
    scoreMemory?: number | null;
    scoreStorage?: number | null;
    scoreLatency?: number | null;
    scoreDelivery?: number | null;
    scoreDefense?: number | null;
    scoreSupport?: number | null;
    scorePlatformBonus?: number | null;
    scoreNotes?: string | null;
    scoreUpdatedAt?: string | Date | null;
    aiDescription?: string | null;
    aiSuitableFor?: string | null;
    clickCount?: number;
    orderCount?: number;
    instances?: Array<{ status?: string } | null>;
    createdAt?: string | Date;
    updatedAt?: string | Date;
  },
  pricingRules: PricingRuleSet = DEFAULT_PRICING_RULES,
) {
  const category = normalizeProductCategory(product.category);
  const instances = Array.isArray(product.instances) ? product.instances : [];
  const instanceCount = instances.length;
  const activeInstanceCount = instances.filter((instance: { status?: string } | null) => instance?.status === 'ACTIVE').length;
  const cpuBenchmark = Number((product.cpu as { benchmark?: unknown } | null | undefined)?.benchmark ?? 0);

  return {
    id: product.id,
    name: product.name,
    category,
    region: product.region,
    cpuDisplay: product.cpuDisplay || null,
    status: product.status,
    cpu: product.cpu ? serializeCPURecord(product.cpu) : null,
    cpuId: product.cpuId,
    isDualCPU: product.isDualCPU,
    cpuCount: product.cpuCount,
    totalBenchmark: product.cpu ? getTotalBenchmark(cpuBenchmark, product.isDualCPU ?? false, product.cpuCount ?? 1) : 0,
    memory: product.memory,
    storage: product.storage,
    bandwidth: product.bandwidth,
    originalPrice: product.originalPrice,
    costPrice: product.costPrice,
    allPrices: calculateAllPrices(product.originalPrice, pricingRules),
    scoreNetwork: product.scoreNetwork ?? 0,
    scoreCpuSingle: product.scoreCpuSingle ?? 0,
    scoreCpuMulti: product.scoreCpuMulti ?? 0,
    scoreMemory: product.scoreMemory ?? 0,
    scoreStorage: product.scoreStorage ?? 0,
    scoreLatency: product.scoreLatency ?? 0,
    scoreDelivery: product.scoreDelivery ?? 0,
    scoreDefense: product.scoreDefense ?? 0,
    scoreSupport: product.scoreSupport ?? 0,
    scorePlatformBonus: product.scorePlatformBonus ?? 0,
    scoreNotes: (() => { try { return JSON.parse(product.scoreNotes || '{}'); } catch { return {}; } })(),
    scoreUpdatedAt: product.scoreUpdatedAt || null,
    aiDescription: product.aiDescription || null,
    aiSuitableFor: product.aiSuitableFor || null,
    clickCount: product.clickCount,
    orderCount: product.orderCount,
    instanceCount,
    activeInstanceCount,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export function summarizeServerConfig(
  config: Record<string, unknown>,
  product?: {
    cpu?: { model?: string | null } | null;
    memory?: string | null;
    storage?: string | null;
    bandwidth?: string | null;
  } | null,
) {
  const cpuModel = String(config.cpuModel || product?.cpu?.model || '').trim();
  const memory = String(config.memory || product?.memory || '').trim();
  const storage = String(config.storage || product?.storage || '').trim();
  const bandwidth = String(config.bandwidth || product?.bandwidth || '').trim();

  return [cpuModel, memory, storage, bandwidth].filter(Boolean).join(' / ');
}

export function serializeServerRecord(server: {
  id: string;
  ip?: string | null;
  status: string;
  config?: string | null;
  startDate?: string | null;
  expireDate?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  user?: {
    id?: string;
    name?: string;
    email?: string;
    agent?: { id?: string; name?: string } | null;
  } | null;
  product?: {
    id?: string;
    name?: string;
    category?: string | null;
    region?: string;
    isDualCPU?: boolean;
    cpuCount?: number;
    memory?: string;
    storage?: string;
    bandwidth?: string;
    cpu?: { model?: string; benchmark?: number } | null;
  } | null;
}) {
  const parsedConfig = parseJsonRecord(server.config);
  const config = {
    ...parsedConfig,
    category: normalizeProductCategory(
      typeof parsedConfig.category === 'string' ? parsedConfig.category : server.product?.category
    ),
    cpuModel: parsedConfig.cpuModel || server.product?.cpu?.model || null,
    memory: parsedConfig.memory || server.product?.memory || null,
    storage: parsedConfig.storage || server.product?.storage || null,
    bandwidth: parsedConfig.bandwidth || server.product?.bandwidth || null,
    isDualCPU: parsedConfig.isDualCPU ?? server.product?.isDualCPU ?? null,
    cpuCount: parsedConfig.cpuCount ?? server.product?.cpuCount ?? null,
  };

  return {
    id: server.id,
    ip: server.ip || null,
    status: server.status,
    config,
    configSummary: summarizeServerConfig(config, server.product),
    startDate: server.startDate || null,
    expireDate: server.expireDate || null,
    daysUntilExpire: getDaysUntil(server.expireDate),
    user: server.user
      ? {
          id: server.user.id,
          name: server.user.name,
          email: server.user.email,
        }
      : null,
    agent: server.user?.agent
      ? {
          id: server.user.agent.id,
          name: server.user.agent.name,
        }
      : null,
    product: server.product
      ? {
          id: server.product.id,
          name: server.product.name,
          category: normalizeProductCategory(server.product.category),
          region: server.product.region,
          isDualCPU: server.product.isDualCPU,
          cpuCount: server.product.cpuCount,
          cpuModel: server.product.cpu?.model || null,
          memory: server.product.memory,
          storage: server.product.storage,
          bandwidth: server.product.bandwidth,
          totalBenchmark: server.product.cpu
            ? getTotalBenchmark(server.product.cpu.benchmark ?? 0, server.product.isDualCPU ?? false, server.product.cpuCount ?? 1)
            : 0,
        }
      : null,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  };
}
