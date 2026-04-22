'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  getCart,
  removeFromCart,
  updateCartItem,
  clearCart,
  getCartTotal,
  getCartCount,
  checkAndClearIfExpired,
  MAX_ITEM_QTY,
  type CartItem,
} from '@/lib/cart';
import { apiFetch } from '@/lib/api-client';

function formatCurrency(v: number) {
  return v.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

interface PriceCheckItem {
  id: string;
  displayPrice: number;
  stock: number;
}

interface HotProduct {
  id: string;
  name: string;
  region: string;
  displayPrice: number;
}

export default function ShoppingCart() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CartItem[]>([]);
  const [expired, setExpired] = useState(false);
  const [changedPrices, setChangedPrices] = useState<CartItem[]>([]);
  const [hotProducts, setHotProducts] = useState<HotProduct[]>([]);
  const [hotLoading, setHotLoading] = useState(false);

  const refresh = useCallback(() => {
    setItems(getCart());
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('cart-update', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('cart-update', handler);
      window.removeEventListener('storage', handler);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [open]);

  // On open: check expiry + price changes + hot products
  useEffect(() => {
    if (!open) return;

    // Check expiry
    const wasExpired = checkAndClearIfExpired();
    if (wasExpired) {
      setExpired(true);
      setItems([]);
      return;
    }
    setExpired(false);

    const current = getCart();
    setItems(current);

    // Check price changes
    if (current.length > 0) {
      const ids = current.map((c) => c.productId).join(',');
      apiFetch(`/api/products/batch-check?ids=${encodeURIComponent(ids)}`)
        .then((r) => r.json())
        .then((json) => {
          const data: PriceCheckItem[] = json?.data?.items ?? json?.items ?? [];
          const changed = current.filter((cartItem) => {
            const live = data.find((d) => d.id === cartItem.productId);
            return live && Math.abs(live.displayPrice - cartItem.price) > 0.001;
          });
          setChangedPrices(changed);
        })
        .catch(() => { /* ignore */ });
    } else {
      setChangedPrices([]);
      // Load hot products
      setHotLoading(true);
      apiFetch('/api/products?sort=orderCount&order=desc&pageSize=5')
        .then((r) => r.json())
        .then((json) => {
          const list = json?.data?.products ?? json?.products ?? [];
          setHotProducts(list.slice(0, 5));
          setHotLoading(false);
        })
        .catch(() => setHotLoading(false));
    }
  }, [open]);

  const count = getCartCount(items);
  const total = getCartTotal(items);

  if (count === 0 && !open) return null;

  return (
    <>
      {/* 浮动按钮 */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between rounded-8 bg-surface-800 px-4 py-3 text-sm font-medium text-white shadow-[0_12px_40px_rgba(15,23,42,0.25)] transition hover:bg-surface-700 sm:left-auto sm:right-6 sm:w-auto sm:justify-start sm:gap-2 sm:px-5 mb-safe"
      >
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
          <div className="text-left">
            <p className="text-sm font-semibold">购物车</p>
            <p className="text-xs text-surface-300 sm:hidden">
              {count > 0 ? `${count} 件商品 · ¥${formatCurrency(total)}` : '点击查看已选商品'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {count > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-semantic-info-light px-1.5 text-xs font-semibold">
              {count}
            </span>
          )}
          <span className="text-xs text-surface-300 sm:hidden">展开</span>
        </div>
      </button>

      {/* 侧边抽屉 */}
      {open && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 top-auto flex h-[82vh] max-h-[82vh] flex-col rounded-t-[28px] bg-white shadow-modal animate-slide-up-sheet sm:right-0 sm:top-0 sm:bottom-0 sm:left-auto sm:h-auto sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:animate-slide-in-right">
            {/* 头部 */}
            <div className="flex items-center justify-between border-b border-surface-200 px-5 py-4 sm:px-6">
              <h2 className="text-lg font-semibold text-surface-600">购物车 ({count})</h2>
              <button onClick={() => setOpen(false)} className="touch-target inline-flex items-center justify-center text-surface-400 transition hover:text-surface-500">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 过期提示 */}
            {expired && (
              <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-semantic-warning-light px-4 py-3 text-sm text-amber-800">
                购物车已过期，商品已清空。
              </div>
            )}

            {/* 价格变动提示 */}
            {changedPrices.length > 0 && (
              <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-semantic-warning-light px-4 py-3 text-sm text-amber-800">
                <p className="font-medium mb-1">以下商品价格已变动：</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {changedPrices.map((item) => (
                    <li key={item.productId}>{item.name}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-semantic-warning">结算时将按最新价格计算。</p>
              </div>
            )}

            {/* 商品列表 */}
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[180px] text-surface-400">
                  <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                  </svg>
                  <p className="text-sm">购物车为空</p>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={`${item.productId}-${item.period}`}
                    className="rounded-8 border border-surface-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-surface-600 truncate">{item.name}</p>
                        <p className="text-xs text-surface-400 mt-1">{item.region} / {item.cpu}</p>
                        <p className="text-xs text-surface-400">{item.memory} / {item.storage} / {item.bandwidth}</p>
                      </div>
                      <button
                        onClick={() => {
                          removeFromCart(item.productId, item.period);
                          refresh();
                        }}
                        className="shrink-0 text-surface-300 hover:text-semantic-danger transition"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <label className="text-xs text-surface-400">数量</label>
                        <select
                          value={item.quantity}
                          onChange={(e) => {
                            updateCartItem(item.productId, item.period, {
                              quantity: parseInt(e.target.value, 10),
                            });
                            refresh();
                          }}
                          className="h-8 rounded-lg border border-surface-200 bg-white px-2 text-xs text-surface-500"
                        >
                          {Array.from({ length: MAX_ITEM_QTY }, (_, i) => i + 1).map((v) => (
                            <option key={v} value={v}>{v} 台</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="text-xs text-surface-400">时长</label>
                        <select
                          value={item.period}
                          onChange={(e) => {
                            const oldPeriod = item.period;
                            const newPeriod = parseInt(e.target.value, 10);
                            // 移除旧的，加上新的period
                            const cart = getCart();
                            const idx = cart.findIndex(
                              (c) => c.productId === item.productId && c.period === oldPeriod,
                            );
                            if (idx !== -1) {
                              cart[idx].period = newPeriod;
                              // 如果新period有重复项则合并
                              const dup = cart.findIndex(
                                (c, i) => i !== idx && c.productId === item.productId && c.period === newPeriod,
                              );
                              if (dup !== -1) {
                                cart[dup].quantity += cart[idx].quantity;
                                cart.splice(idx, 1);
                              }
                            }
                            localStorage.setItem('serverai_cart', JSON.stringify(cart));
                            window.dispatchEvent(new CustomEvent('cart-update'));
                            refresh();
                          }}
                          className="h-8 rounded-lg border border-surface-200 bg-white px-2 text-xs text-surface-500"
                        >
                          {[1, 3, 6, 12].map((v) => (
                            <option key={v} value={v}>{v} 月</option>
                          ))}
                        </select>
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-sm font-semibold text-surface-600">
                          ¥{formatCurrency(item.price * item.quantity * item.period)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* 空车时推荐产品 */}
              {items.length === 0 && !expired && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-surface-400 mb-3">推荐产品</p>
                  {hotLoading ? (
                    <p className="text-xs text-surface-300 text-center py-4">加载中...</p>
                  ) : hotProducts.length > 0 ? (
                    <div className="space-y-2">
                      {hotProducts.map((p) => (
                        <Link
                          key={p.id}
                          href={`/servers/${p.id}`}
                          onClick={() => setOpen(false)}
                          className="flex items-center justify-between rounded-8 border border-surface-100 px-3 py-2.5 hover:bg-surface-50 transition"
                        >
                          <div>
                            <p className="text-sm font-medium text-surface-500">{p.name}</p>
                            <p className="text-xs text-surface-400 mt-0.5">{p.region}</p>
                          </div>
                          <p className="text-sm font-semibold text-surface-500">¥{formatCurrency(p.displayPrice)}<span className="text-xs font-normal text-surface-400">/月</span></p>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* 底部 */}
            {items.length > 0 && (
              <div className="space-y-3 border-t border-surface-200 px-4 py-4 pb-safe sm:px-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-400">合计</span>
                  <span className="text-xl font-semibold text-surface-600">¥{formatCurrency(total)}</span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      clearCart();
                      refresh();
                    }}
                    className="flex-1 h-11 rounded-8 border border-surface-200 text-sm text-surface-500 transition hover:bg-surface-50"
                  >
                    清空
                  </button>
                  <Link
                    href="/checkout"
                    onClick={() => setOpen(false)}
                    className="flex-[2] h-11 rounded-8 bg-surface-800 text-white text-sm font-medium transition hover:bg-surface-700 flex items-center justify-center"
                  >
                    去结算
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
