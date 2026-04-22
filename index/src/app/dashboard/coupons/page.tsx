'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import { apiFetch, extractApiError } from '@/lib/api-client';

interface Coupon {
  id: string;
  code: string;
  name: string;
  type: 'PERCENTAGE' | 'FIXED' | 'RENEWAL';
  value: number;
  minOrderAmount: number;
  maxDiscount: number;
  startAt: string;
  endAt: string;
  totalCount: number;
  usedCount: number;
  perUserLimit: number;
  isActive: boolean;
  scope: string;
  scopeIds: string;
  createdBy: string;
  createdAt: string;
}

interface UserCoupon {
  id: string;
  userId: string;
  couponId: string;
  coupon: Coupon;
  status: 'UNUSED' | 'USED' | 'EXPIRED';
  usedAt?: string;
  orderId?: string;
  createdAt: string;
}

type Tab = 'UNUSED' | 'USED' | 'EXPIRED';

const TAB_LABELS: Record<Tab, string> = {
  UNUSED: '未使用',
  USED: '已使用',
  EXPIRED: '已过期',
};

function formatDate(s: string) {
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function CouponCard({ uc }: { uc: UserCoupon }) {
  const cp = uc.coupon;
  const isExpired = uc.status === 'EXPIRED';
  const isUsed = uc.status === 'USED';

  let valueLabel = '';
  if (cp.type === 'PERCENTAGE') {
    valueLabel = `${(cp.value * 100).toFixed(0)}% 折扣`;
  } else {
    valueLabel = `减 ¥${cp.value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
  }

  return (
    <div className={`relative rounded-8 border overflow-hidden transition ${isExpired || isUsed ? 'opacity-50 border-surface-200' : 'border-blue-200 bg-semantic-info-light/30'}`}>
      <div className="flex">
        {/* Left accent */}
        <div className={`w-2 shrink-0 ${isExpired || isUsed ? 'bg-surface-300' : 'bg-semantic-info-light'}`} />
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-surface-600">{cp.name}</p>
              <p className="mt-0.5 text-xs text-surface-400">
                {cp.minOrderAmount > 0 ? `满 ¥${cp.minOrderAmount} 可用` : '无门槛'}
                {cp.maxDiscount > 0 && ` · 最多优惠 ¥${cp.maxDiscount}`}
              </p>
            </div>
            <p className={`text-xl font-bold shrink-0 ${isExpired || isUsed ? 'text-surface-400' : 'text-brand-500'}`}>
              {valueLabel}
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-surface-400">
            <span>CODE: <span className="font-mono font-medium text-surface-500">{cp.code}</span></span>
            <span>至 {formatDate(cp.endAt)}</span>
          </div>
          {isUsed && uc.orderId && (
            <p className="mt-1 text-xs text-surface-400">已用于订单</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DashboardCouponsInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('UNUSED');
  const [coupons, setCoupons] = useState<UserCoupon[]>([]);
  const [fetching, setFetching] = useState(false);
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState('');
  const [redeemSuccess, setRedeemSuccess] = useState('');

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [loading, user, router]);

  const load = useCallback(async (tab: Tab) => {
    setFetching(true);
    try {
      const res = await apiFetch(`/api/dashboard/coupons?status=${tab}&pageSize=50`);
      const json = await res.json();
      if (json.success) setCoupons(json.data.coupons ?? []);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (user) load(activeTab);
  }, [user, activeTab, load]);

  const handleRedeem = async () => {
    if (!code.trim()) return;
    setRedeeming(true);
    setRedeemError('');
    setRedeemSuccess('');
    try {
      const res = await apiFetch('/api/dashboard/coupons/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setRedeemSuccess(`已领取优惠券「${json.data.coupon?.name ?? ''}」`);
        setCode('');
        load(activeTab);
      } else {
        setRedeemError(extractApiError(json.error, '领取失败'));
      }
    } catch {
      setRedeemError('网络错误');
    } finally {
      setRedeeming(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16 text-sm text-surface-400">加载中...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-surface-600">我的优惠券</h1>
        <p className="mt-1 text-sm text-surface-400">输入兑换码领取优惠券，在结算时自动抵扣</p>
      </div>

      {/* Redeem input */}
      <div className="rounded-8 border border-surface-200 bg-white p-5">
        <p className="text-sm font-medium text-surface-500 mb-3">兑换优惠码</p>
        <div className="flex gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleRedeem()}
            placeholder="输入大写字母数字兑换码"
            maxLength={30}
            className="flex-1 h-10 rounded-8 border border-surface-200 bg-surface-50 px-4 text-sm font-mono text-surface-600 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition"
          />
          <button
            onClick={handleRedeem}
            disabled={redeeming || !code.trim()}
            className="h-10 px-5 rounded-8 bg-surface-800 text-white text-sm font-medium transition hover:bg-surface-700 disabled:opacity-50"
          >
            {redeeming ? '领取中...' : '立即领取'}
          </button>
        </div>
        {redeemError && <p className="mt-2 text-sm text-semantic-danger">{redeemError}</p>}
        {redeemSuccess && <p className="mt-2 text-sm text-semantic-success">{redeemSuccess}</p>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-8 bg-surface-100 p-1 w-fit">
        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              activeTab === tab ? 'bg-white text-surface-600 shadow-card' : 'text-surface-400 hover:text-surface-500'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* List */}
      {fetching ? (
        <div className="text-center py-10 text-sm text-surface-400">加载中...</div>
      ) : coupons.length === 0 ? (
        <div className="rounded-8 border border-surface-200 bg-white p-12 text-center">
          <p className="text-surface-400 text-sm">暂无{TAB_LABELS[activeTab]}优惠券</p>
          {activeTab === 'UNUSED' && (
            <p className="mt-2 text-xs text-surface-400">在上方输入兑换码领取</p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {coupons.map((uc) => (
            <CouponCard key={uc.id} uc={uc} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardCouponsPage() {
  return (
    <AuthProvider>
      <DashboardCouponsInner />
    </AuthProvider>
  );
}
