// 购物车 - localStorage 持久化

export const MAX_ITEM_QTY = 10;   // 单品最大数量
export const MAX_CART_TOTAL = 20; // 购物车总数量上限
export const CART_TTL_DAYS = 30;  // 购物车有效期（天）

export interface CartItem {
  productId: string;
  name: string;
  region: string;
  cpu: string;
  memory: string;
  storage: string;
  bandwidth: string;
  price: number;        // 单月单价 (displayPrice)
  quantity: number;      // 台数
  period: number;        // 月数
  addedAt: number;       // timestamp
}

const CART_KEY = 'serverai_cart';
const CART_META_KEY = 'serverai_cart_meta';

interface CartMeta {
  createdAt: number;
}

function getCartMeta(): CartMeta {
  if (typeof window === 'undefined') return { createdAt: Date.now() };
  try {
    const raw = localStorage.getItem(CART_META_KEY);
    if (raw) return JSON.parse(raw) as CartMeta;
  } catch { /* empty */ }
  const meta: CartMeta = { createdAt: Date.now() };
  localStorage.setItem(CART_META_KEY, JSON.stringify(meta));
  return meta;
}

function resetCartMeta() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CART_META_KEY, JSON.stringify({ createdAt: Date.now() }));
}

/**
 * 检查购物车是否已过期（超过 30 天），过期则自动清空并返回 true。
 */
export function checkAndClearIfExpired(): boolean {
  if (typeof window === 'undefined') return false;
  const meta = getCartMeta();
  const ageMs = Date.now() - meta.createdAt;
  if (ageMs > CART_TTL_DAYS * 24 * 60 * 60 * 1000) {
    localStorage.removeItem(CART_KEY);
    resetCartMeta();
    window.dispatchEvent(new CustomEvent('cart-update'));
    return true;
  }
  return false;
}

export function getCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function saveCart(items: CartItem[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('cart-update'));
}

/**
 * 加入购物车。
 * @returns null 表示成功，否则返回错误提示字符串。
 */
export function addToCart(item: Omit<CartItem, 'addedAt'>): string | null {
  const cart = getCart();

  // 确保 meta 存在
  getCartMeta();

  const clampedQty = Math.min(item.quantity, MAX_ITEM_QTY);
  const existing = cart.find(
    (c) => c.productId === item.productId && c.period === item.period,
  );

  const newQty = existing ? existing.quantity + clampedQty : clampedQty;
  if (newQty > MAX_ITEM_QTY) {
    return `单品最多加入 ${MAX_ITEM_QTY} 台`;
  }

  const currentTotal = getCartCount(cart);
  const delta = existing ? clampedQty : clampedQty;
  if (currentTotal + delta > MAX_CART_TOTAL) {
    return `购物车最多 ${MAX_CART_TOTAL} 台，当前已有 ${currentTotal} 台`;
  }

  if (existing) {
    existing.quantity = newQty;
  } else {
    cart.push({ ...item, quantity: clampedQty, addedAt: Date.now() });
  }
  saveCart(cart);
  return null;
}

export function removeFromCart(productId: string, period: number) {
  const cart = getCart().filter(
    (c) => !(c.productId === productId && c.period === period),
  );
  saveCart(cart);
}

export function updateCartItem(
  productId: string,
  period: number,
  updates: Partial<Pick<CartItem, 'quantity' | 'period'>>,
) {
  const cart = getCart();
  const item = cart.find(
    (c) => c.productId === productId && c.period === period,
  );
  if (item) {
    if (updates.quantity !== undefined) item.quantity = Math.min(updates.quantity, MAX_ITEM_QTY);
    if (updates.period !== undefined) item.period = updates.period;
  }
  saveCart(cart);
}

export function clearCart() {
  saveCart([]);
  resetCartMeta();
}

export function getCartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity * item.period, 0);
}

export function getCartCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
