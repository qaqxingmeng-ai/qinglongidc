import { calculateAllPrices } from '@/lib/pricing';
import { createEmptyScoreInputs } from '@/lib/scoring';

export interface Product {
  id: string;
  name: string;
  category: string;
  region: string;
  cpuId: string;
  cpuDisplay: string | null;
  originalPrice: number;
  costPrice: number;
  allPrices: {
    PARTNER: number;
    VIP_TOP: number;
    VIP: number;
    GUEST: number;
  };
  status: string;
  isDualCPU: boolean;
  cpuCount: number;
  totalBenchmark: number;
  memory: string;
  storage: string;
  bandwidth: string;
  scoreNetwork: number;
  scoreCpuSingle: number;
  scoreMemory: number;
  scoreStorage: number;
  scoreNotes: Record<string, string>;
  scoreUpdatedAt: string | null;
  aiDescription: string | null;
  aiSuitableFor: string | null;
  cpu: { id: string; model: string; benchmark: number } | null;
  clickCount: number;
  orderCount: number;
  instanceCount: number;
  activeInstanceCount: number;
  supplier: string;
  stock: number;
  stockAlert: number;
}

export interface CPUOption {
  id: string;
  model: string;
  benchmark: number;
  source: string;
}

export interface UserCandidate {
  id: string;
  numericId: number;
  name: string;
  email: string;
}

export interface ImportCandidate {
  key: string;
  name: string;
  region: string;
  category: string;
  cpuModel: string;
  isDualCPU: boolean;
  memory: string;
  storage: string;
  bandwidth: string;
  originalPrice: number;
  aiDescription?: string;
  aiSuitableFor?: string;
  cpuDisplay?: string;
  valid?: boolean;
  errors?: string[];
}

export interface ImportSummary {
  total: number;
  validCount?: number;
  errorCount?: number;
  categories: Array<{ category: string; count: number }>;
  regions: Array<{ region: string; count: number }>;
}

export type BatchField = 'status' | 'category' | 'region' | 'isDualCPU';

export interface Filters {
  q: string;
  status: string;
  category: string;
  region: string;
  cpuId: string;
}

export interface Message {
  type: 'success' | 'error';
  text: string;
}

export const IMPORT_FIELD_LABELS: Record<string, string> = {
  name: '名称',
  region: '地区',
  category: '分类',
  cpuModel: 'CPU型号',
  isDualCPU: '单双路',
  memory: '内存',
  storage: '硬盘',
  bandwidth: '带宽',
  originalPrice: '价格',
  aiDescription: 'AI描述',
  aiSuitableFor: '适用场景',
  cpuDisplay: '展示CPU',
};

export const DEFAULT_CATEGORY_ORDER = [
  'dedicated',
  'gpu',
  'storage',
  'high-frequency',
  'large-memory',
  'general',
];

export const categoryLabelMap: Record<string, string> = {
  dedicated: '独立服务器',
  gpu: 'GPU',
  storage: '存储型',
  'high-frequency': '高频型',
  'large-memory': '大内存',
  general: '通用型',
};

export const emptyForm = {
  name: '',
  category: 'dedicated',
  region: '',
  cpuId: '',
  cpuDisplay: '',
  isDualCPU: true,
  memory: '',
  storage: '',
  bandwidth: '',
  originalPrice: '',
  supplier: '',
  status: 'ACTIVE',
  ...createEmptyScoreInputs(),
  aiDescription: '',
  aiSuitableFor: '',
};

export function normalizeAdminProduct(raw: unknown): Product {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const originalPrice = Number(obj?.originalPrice) || 0;
  const fallbackPrices = calculateAllPrices(originalPrice);
  const allPrices = obj?.allPrices;
  const prices = obj?.prices;
  const sourcePrices = obj?.allPrices && typeof obj.allPrices === 'object'
    ? (allPrices as Record<string, unknown>)
    : (prices && typeof prices === 'object' ? (prices as Record<string, unknown>) : {});

  return {
    ...obj,
    id: String(obj?.id ?? ''),
    name: String(obj?.name ?? ''),
    category: String(obj?.category ?? ''),
    region: String(obj?.region ?? ''),
    cpuId: String(obj?.cpuId ?? ''),
    cpuDisplay: typeof obj?.cpuDisplay === 'string' ? obj.cpuDisplay : null,
    originalPrice,
    costPrice: Number(obj?.costPrice) || originalPrice / 2,
    allPrices: {
      PARTNER: Number(sourcePrices.PARTNER) || fallbackPrices.PARTNER,
      VIP_TOP: Number(sourcePrices.VIP_TOP) || fallbackPrices.VIP_TOP,
      VIP: Number(sourcePrices.VIP) || fallbackPrices.VIP,
      GUEST: Number(sourcePrices.GUEST) || fallbackPrices.GUEST,
    },
    status: String(obj?.status ?? 'INACTIVE'),
    memory: String(obj?.memory ?? ''),
    storage: String(obj?.storage ?? ''),
    bandwidth: String(obj?.bandwidth ?? ''),
    supplier: String(obj?.supplier ?? ''),
    stock: Number(obj?.stock ?? -1),
    stockAlert: Number(obj?.stockAlert ?? 0),
  } as Product;
}

export function hasInventoryRisk(p: Product) {
  if (p.stock === -1) return false;
  if (p.stock === 0) return true;
  if (p.stockAlert > 0 && p.stock <= p.stockAlert) return true;
  return false;
}

export function getStockMeta(product: Product) {
  if (product.status !== 'ACTIVE') {
    return { label: '关闭', cls: 'text-surface-400' };
  }
  if (hasInventoryRisk(product)) {
    return { label: '紧张', cls: 'text-semantic-danger' };
  }
  return { label: '正常', cls: 'text-semantic-success' };
}

export function getProvisionMeta(product: Product) {
  if (product.status !== 'ACTIVE') {
    return { label: '已暂停', cls: 'text-surface-400' };
  }
  if (hasInventoryRisk(product)) {
    return { label: '人工确认', cls: 'text-semantic-warning' };
  }
  return { label: '可直接开通', cls: 'text-semantic-success' };
}

export function getCpuDisplayText(product: Product) {
  if (product.cpuDisplay) return product.cpuDisplay;
  const rawModel = product.cpu?.model || '未绑定 CPU';
  if (rawModel === '未绑定 CPU') return rawModel;
  const base = rawModel.replace(/^x2\s*/i, '').replace(/\s*x2$/i, '').trim();
  return product.isDualCPU ? `${base} ×2` : base;
}
