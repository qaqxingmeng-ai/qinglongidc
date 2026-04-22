// 最近浏览记录 - localStorage 持久化

export const MAX_BROWSE_HISTORY = 20; // 最多保留20条记录
export const DISPLAY_BROWSE_HISTORY = 10; // 页面上最多展示10条

export interface BrowseHistory {
  productId: string;
  productName: string;
  region: string;
  displayPrice: number;
  viewedAt: number; // timestamp
}

const BROWSE_HISTORY_KEY = 'serverai_browse_history';

/**
 * 获取所有浏览记录（按时间倒序）
 */
export function getBrowseHistory(): BrowseHistory[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BROWSE_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as BrowseHistory[]) : [];
  } catch {
    return [];
  }
}

/**
 * 保存浏览记录到 localStorage
 */
function saveBrowseHistory(items: BrowseHistory[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BROWSE_HISTORY_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('browse-history-update'));
}

/**
 * 记录一次浏览。相同 productId 时更新时间，去重。最多保留20条（时间倒序）。
 */
export function recordBrowse(product: {
  id: string;
  name: string;
  region: string;
  displayPrice: number;
}): void {
  const history = getBrowseHistory();

  // 去重：移除相同 productId 的旧记录
  const filtered = history.filter((h) => h.productId !== product.id);

  // 新建记录插入头部
  const newRecord: BrowseHistory = {
    productId: product.id,
    productName: product.name,
    region: product.region,
    displayPrice: product.displayPrice,
    viewedAt: Date.now(),
  };

  const updated = [newRecord, ...filtered];

  // 保留最多20条
  if (updated.length > MAX_BROWSE_HISTORY) {
    updated.splice(MAX_BROWSE_HISTORY);
  }

  saveBrowseHistory(updated);
}

/**
 * 清空所有浏览记录
 */
export function clearBrowseHistory(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(BROWSE_HISTORY_KEY);
  window.dispatchEvent(new CustomEvent('browse-history-update'));
}

/**
 * 移除指定 productId 的浏览记录（用于删除下架产品）
 */
export function removeBrowseHistoryByIds(productIds: string[]): void {
  const history = getBrowseHistory();
  const idSet = new Set(productIds);
  const filtered = history.filter((h) => !idSet.has(h.productId));

  if (filtered.length < history.length) {
    saveBrowseHistory(filtered);
  }
}

/**
 * 获取展示用的浏览记录（最多10条）
 */
export function getDisplayBrowseHistory(): BrowseHistory[] {
  return getBrowseHistory().slice(0, DISPLAY_BROWSE_HISTORY);
}
