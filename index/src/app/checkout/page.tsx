'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import { apiFetch, extractApiError } from '@/lib/api-client';
import {
  getCart,
  removeFromCart,
  clearCart,
  getCartTotal,
  type CartItem,
} from '@/lib/cart';

function formatCurrency(v: number) {
  return v.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

interface ApplicableCoupon {
  id: string;
  couponId: string;
  coupon: {
    id: string;
    code: string;
    name: string;
    type: string;
    value: number;
    minOrderAmount: number;
    maxDiscount: number;
    endAt: string;
  };
  status: string;
  discount: number;
}

function CheckoutInner() {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();
  const [showBindPhone, setShowBindPhone] = useState(false);
  const [bindPhone, setBindPhone] = useState('');
  const [bindErr, setBindErr] = useState('');
  const [bindSaving, setBindSaving] = useState(false);
  const [items, setItems] = useState<CartItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [applicableCoupons, setApplicableCoupons] = useState<ApplicableCoupon[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<string>('');

  useEffect(() => {
    setItems(getCart());
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    apiFetch('/api/dashboard/finance')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setBalance(json.data.balance ?? 0);
      })
      .catch(() => undefined);
  }, [loading, user]);

  // Fetch applicable coupons when cart changes and user is logged in
  useEffect(() => {
    if (!user || items.length === 0) {
      setApplicableCoupons([]);
      return;
    }
    const total = getCartTotal(items);
    const productIds = Array.from(new Set(items.map((i) => i.productId))).join(',');
    apiFetch(`/api/dashboard/coupons/applicable?total=${total}&productIds=${encodeURIComponent(productIds)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setApplicableCoupons(json.data ?? []);
      })
      .catch(() => undefined);
  }, [user, items]);

  const cartTotal = getCartTotal(items);
  const selectedCoupon = applicableCoupons.find((c) => c.id === selectedCouponId);
  const discount = selectedCoupon?.discount ?? 0;
  const total = Math.max(0, cartTotal - discount);
  const sufficient = balance >= total;

  const handleRemove = (productId: string, period: number) => {
    removeFromCart(productId, period);
    setItems(getCart());
    setSelectedCouponId('');
  };

  const handleSubmit = async () => {
    if (!user) {
      router.push('/login?redirect=/checkout');
      return;
    }
    if (items.length === 0) return;
    if (!user.phone || !user.phone.trim()) {
      setBindPhone('');
      setBindErr('');
      setShowBindPhone(true);
      return;
    }
    if (!sufficient) {
      setError('余额不足，请先充值');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await apiFetch('/api/dashboard/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            period: item.period,
          })),
          note: note || undefined,
          couponId: selectedCouponId || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        clearCart();
        const createdOrder = json.data.orderNo || json.data.orderId;
        router.push(createdOrder ? `/dashboard/orders?created=${encodeURIComponent(createdOrder)}` : '/dashboard/orders');
      } else {
        setError(extractApiError(json.error, '下单失败'));
      }
    } catch {
      setError('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBindPhone = async () => {
    const val = bindPhone.trim();
    if (!val) {
      setBindErr('请输入手机号');
      return;
    }
    setBindSaving(true);
    setBindErr('');
    try {
      const res = await apiFetch('/api/auth/me', {
        method: 'PUT',
        body: JSON.stringify({ phone: val }),
      });
      const json = await res.json();
      if (!json.success) {
        setBindErr(extractApiError(json.error, '绑定失败'));
        return;
      }
      await refresh();
      setShowBindPhone(false);
    } catch {
      setBindErr('网络错误，请稍后重试');
    } finally {
      setBindSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5f7] text-surface-600">
      <Header />

      {showBindPhone && (
        <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[1px] flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-8 bg-white border border-surface-200 p-5 shadow-modal">
            <h3 className="text-base font-semibold text-surface-600">下单前请先绑定手机号</h3>
            <p className="text-sm text-surface-400 mt-1">绑定后即可继续下单。你也可以在个人资料页长期维护手机号。</p>
            <input
              type="tel"
              value={bindPhone}
              onChange={(e) => setBindPhone(e.target.value)}
              className="mt-4 w-full h-11 rounded-8 border border-surface-200 px-3 text-sm outline-none focus:border-brand-500"
              placeholder="请输入手机号"
            />
            {bindErr && <p className="text-xs text-semantic-danger mt-2">{bindErr}</p>}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setShowBindPhone(false)} className="h-9 px-3 rounded-lg border border-surface-200 text-sm text-surface-500 hover:bg-surface-50">取消</button>
              <button onClick={handleBindPhone} disabled={bindSaving} className="h-9 px-4 rounded-lg bg-surface-800 text-white text-sm disabled:opacity-50">
                {bindSaving ? '保存中...' : '绑定并继续'}
              </button>
            </div>
            <p className="text-xs text-surface-400 mt-3">
              无法在此完成时，可前往
              <Link href="/dashboard/profile" className="text-brand-500 hover:underline ml-1">个人资料</Link>
              绑定。
            </p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-4xl px-4 py-6 pb-28 sm:py-8 lg:pb-8">
        <div className="mb-6">
          <Link href="/servers" className="text-sm text-surface-400 hover:text-surface-500 transition">
            返回服务器列表
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-surface-700">确认订单</h1>
        </div>

        {items.length === 0 ? (
          <div className="rounded-8 bg-white border border-surface-200 p-12 text-center">
            <p className="text-surface-400 mb-4">购物车为空</p>
            <Link href="/servers" className="text-sm text-brand-500 hover:underline">
              去选购
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* 商品列表 */}
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={`${item.productId}-${item.period}`}
                  className="rounded-8 border border-surface-200 bg-white p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-base font-medium text-surface-600">{item.name}</p>
                      <p className="text-sm text-surface-400 mt-1">{item.region} / {item.cpu}</p>
                      <p className="text-sm text-surface-400">{item.memory} / {item.storage} / {item.bandwidth}</p>
                    </div>
                    <button
                      onClick={() => handleRemove(item.productId, item.period)}
                      className="shrink-0 self-start text-sm text-surface-300 transition hover:text-semantic-danger"
                    >
                      移除
                    </button>
                  </div>
                  <div className="mt-3 flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-surface-400">
                      ¥{formatCurrency(item.price)}/月 x {item.quantity}台 x {item.period}月
                    </span>
                    <span className="font-semibold text-surface-600">
                      ¥{formatCurrency(item.price * item.quantity * item.period)}
                    </span>
                  </div>
                </div>
              ))}

              <div className="rounded-8 bg-white border border-surface-200 p-5">
                <label className="text-sm font-medium text-surface-500">订单备注</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="如有特殊要求可在此备注 (选填)"
                  maxLength={500}
                  className="mt-2 w-full h-20 rounded-8 border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-500 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50 resize-none"
                />
              </div>
            </div>

            {/* 结算侧栏 */}
            <div className="order-first space-y-4 lg:order-none lg:sticky lg:top-20 h-fit">
              <div className="rounded-8 bg-white border border-surface-200 p-5 space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-surface-400">订单汇总</p>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-surface-400">
                    <span>商品数量</span>
                    <span>{items.reduce((s, i) => s + i.quantity, 0)} 台</span>
                  </div>
                  <div className="flex justify-between text-surface-400">
                    <span>商品总额</span>
                    <span className="font-semibold text-surface-600">¥{formatCurrency(cartTotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-semantic-success">
                      <span>优惠折扣</span>
                      <span className="font-semibold">- ¥{formatCurrency(discount)}</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between text-surface-600 font-semibold border-t border-surface-100 pt-2">
                      <span>实付金额</span>
                      <span>¥{formatCurrency(total)}</span>
                    </div>
                  )}
                </div>

                {/* Coupon picker */}
                {user && applicableCoupons.length > 0 && (
                  <div className="border-t border-surface-100 pt-3">
                    <p className="text-xs font-medium text-surface-500 mb-2">优惠券</p>
                    <div className="space-y-2">
                      {/* No coupon option */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="coupon"
                          value=""
                          checked={selectedCouponId === ''}
                          onChange={() => setSelectedCouponId('')}
                          className="accent-slate-900"
                        />
                        <span className="text-sm text-surface-400">不使用优惠券</span>
                      </label>
                      {applicableCoupons.map((ac) => (
                        <label key={ac.id} className="flex items-start gap-2 cursor-pointer rounded-lg border border-blue-100 bg-semantic-info-light/50 px-3 py-2 hover:bg-semantic-info-light transition">
                          <input
                            type="radio"
                            name="coupon"
                            value={ac.id}
                            checked={selectedCouponId === ac.id}
                            onChange={() => setSelectedCouponId(ac.id)}
                            className="mt-0.5 accent-blue-600"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-surface-600">{ac.coupon.name}</p>
                            <p className="text-xs text-brand-500 font-semibold">
                              节省 ¥{formatCurrency(ac.discount)}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {user && applicableCoupons.length === 0 && items.length > 0 && (
                  <div className="border-t border-surface-100 pt-3">
                    <p className="text-xs text-surface-400">
                      暂无可用优惠券，
                      <Link href="/dashboard/coupons" className="text-brand-500 hover:underline">去领取</Link>
                    </p>
                  </div>
                )}

                <div className="border-t border-surface-100 pt-3">
                  {user && (!user.phone || !user.phone.trim()) && (
                    <p className="mb-2 text-xs text-semantic-warning-dark bg-semantic-warning-light border border-amber-200 rounded-lg px-2.5 py-2">
                      当前账号未绑定手机号，提交订单前将先引导绑定。
                    </p>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-surface-400">账户余额</span>
                    <span className={sufficient ? 'text-semantic-success font-medium' : 'text-semantic-danger font-medium'}>
                      ¥{formatCurrency(balance)}
                    </span>
                  </div>
                  {!sufficient && user && (
                    <p className="text-xs text-semantic-danger mt-1">
                      余额不足，还需 ¥{formatCurrency(total - balance)}，
                      <Link href="/dashboard/finance" className="underline">去充值</Link>
                    </p>
                  )}
                </div>

                {error && (
                  <p className="text-sm text-semantic-danger">{error}</p>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={submitting || items.length === 0}
                  className="hidden h-12 w-full items-center justify-center rounded-8 bg-surface-800 text-sm font-medium text-white transition hover:bg-surface-700 disabled:cursor-not-allowed disabled:opacity-50 lg:flex"
                >
                  {submitting ? '提交中...' : user ? '确认下单' : '登录后下单'}
                </button>
              </div>

              <div className="rounded-8 bg-white border border-surface-200 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-surface-400 mb-3">温馨提示</p>
                <ul className="space-y-2 text-xs text-surface-400">
                  <li>下单后将从账户余额中扣除相应金额</li>
                  <li>管理员确认后会尽快安排服务器开通</li>
                  <li>如有疑问可提交工单咨询</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-surface-200 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3 pb-safe">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-surface-400">应付金额</p>
              <p className="text-lg font-semibold text-surface-700">¥{formatCurrency(total)}</p>
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting || items.length === 0}
              className="flex min-h-[48px] min-w-[132px] items-center justify-center rounded-8 bg-surface-800 px-5 text-sm font-medium text-white transition hover:bg-surface-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? '提交中...' : user ? '确认下单' : '登录后下单'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <AuthProvider>
      <Suspense>
        <CheckoutInner />
      </Suspense>
    </AuthProvider>
  );
}
