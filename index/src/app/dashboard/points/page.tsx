'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

interface UserPoints {
  points: number;
  totalEarned: number;
  totalSpent: number;
  checkinStreak: number;
  lastCheckinAt?: string;
}

interface PointsRecord {
  id: string;
  type: string;
  points: number;
  note: string;
  createdAt: string;
  expireAt?: string;
}

interface ShopCoupon {
  id: string;
  name: string;
  type: string;
  value: number;
  minOrderAmount: number;
  maxDiscount: number;
  startAt: string;
  endAt: string;
  totalCount: number;
  usedCount: number;
  pointsRequired: number;
  canRedeem: boolean;
}

const typeLabel: Record<string, string> = {
  PURCHASE_EARN: '消费获得',
  CHECKIN: '每日签到',
  BIND_PHONE: '绑定手机',
  ENABLE_2FA: '开启 2FA',
  REDEEM: '积分兑换',
  EXPIRE: '积分过期',
  ADMIN_ADJUST: '管理员调整',
};

const typeColor: Record<string, string> = {
  PURCHASE_EARN: 'text-semantic-success bg-semantic-success-light',
  CHECKIN: 'text-brand-500 bg-semantic-info-light',
  BIND_PHONE: 'text-purple-600 bg-purple-50',
  ENABLE_2FA: 'text-purple-600 bg-purple-50',
  REDEEM: 'text-semantic-warning bg-orange-50',
  EXPIRE: 'text-semantic-danger bg-semantic-danger-light',
  ADMIN_ADJUST: 'text-surface-500 bg-surface-50',
};

function couponTypeLabel(type: string, value: number): string {
  if (type === 'PERCENTAGE') return `${Math.round((1 - value) * 100)}% 折扣`;
  if (type === 'FIXED') return `满减 ¥${value.toFixed(2)}`;
  if (type === 'RENEWAL') return `续费减 ¥${value.toFixed(2)}`;
  return String(value);
}

export default function PointsPage() {
  const [tab, setTab] = useState<'history' | 'shop'>('history');
  const [up, setUp] = useState<UserPoints | null>(null);
  const [records, setRecords] = useState<PointsRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkinMsg, setCheckinMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const [shopCoupons, setShopCoupons] = useState<ShopCoupon[]>([]);
  const [shopLoading, setShopLoading] = useState(false);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [redeemMsg, setRedeemMsg] = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  const pageSize = 20;

  const loadPoints = useCallback(async () => {
    const r = await apiFetch('/api/dashboard/points');
    const j = await r.json();
    if (j.success) setUp(j.data.points);
  }, []);

  const loadHistory = useCallback(async (p: number) => {
    const r = await apiFetch(`/api/dashboard/points/history?page=${p}&pageSize=${pageSize}`);
    const j = await r.json();
    if (j.success) {
      setRecords(j.data.records ?? []);
      setTotal(j.data.total ?? 0);
    }
  }, []);

  const loadShop = useCallback(async () => {
    setShopLoading(true);
    const r = await apiFetch('/api/dashboard/points/shop');
    const j = await r.json();
    setShopLoading(false);
    if (j.success) setShopCoupons(j.data.coupons ?? []);
  }, []);

  useEffect(() => {
    loadPoints();
    loadHistory(1);
  }, [loadPoints, loadHistory]);

  useEffect(() => { loadHistory(page); }, [page, loadHistory]);

  useEffect(() => {
    if (tab === 'shop') loadShop();
  }, [tab, loadShop]);

  // Check if already checked in today
  useEffect(() => {
    if (!up?.lastCheckinAt) return;
    const lastDate = new Date(up.lastCheckinAt).toDateString();
    const today = new Date().toDateString();
    setCheckedIn(lastDate === today);
  }, [up]);

  const handleCheckin = async () => {
    setLoading(true);
    const r = await apiFetch('/api/dashboard/checkin', { method: 'POST' });
    const j = await r.json();
    setLoading(false);
    if (j.success) {
      setCheckinMsg(j.data.message);
      setCheckedIn(true);
      loadPoints();
      loadHistory(1);
    } else {
      setCheckinMsg(j.error ?? '签到失败');
    }
  };

  const handleRedeem = async (couponId: string) => {
    setRedeemingId(couponId);
    setRedeemMsg(null);
    const r = await apiFetch('/api/dashboard/points/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ couponId }),
    });
    const j = await r.json();
    setRedeemingId(null);
    if (j.success) {
      setRedeemMsg({ id: couponId, msg: '兑换成功！优惠券已添加至「我的优惠券」', ok: true });
      loadPoints();
      loadShop();
    } else {
      setRedeemMsg({ id: couponId, msg: j.error ?? '兑换失败', ok: false });
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-lg font-semibold text-surface-600">我的积分</h1>
        <p className="text-sm text-surface-400 mt-0.5">消费、签到等均可获得积分</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-surface-100 rounded-8 p-4 space-y-1">
          <p className="text-xs text-surface-400">可用积分</p>
          <p className="text-2xl font-bold text-surface-600">{up?.points ?? 0}</p>
        </div>
        <div className="bg-white border border-surface-100 rounded-8 p-4 space-y-1">
          <p className="text-xs text-surface-400">累计获取</p>
          <p className="text-2xl font-bold text-surface-500">{up?.totalEarned ?? 0}</p>
        </div>
        <div className="bg-white border border-surface-100 rounded-8 p-4 space-y-1">
          <p className="text-xs text-surface-400">累计使用</p>
          <p className="text-2xl font-bold text-surface-500">{up?.totalSpent ?? 0}</p>
        </div>
        <div className="bg-white border border-surface-100 rounded-8 p-4 space-y-1">
          <p className="text-xs text-surface-400">连续签到</p>
          <p className="text-2xl font-bold text-surface-500">{up?.checkinStreak ?? 0} 天</p>
        </div>
      </div>

      {/* Checkin card */}
      <div className="bg-white border border-surface-100 rounded-8 p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-surface-600">每日签到</p>
          <p className="text-xs text-surface-400 mt-0.5">
            {checkedIn ? '今日已签到' : '签到获得积分，连续签到可获更多'}
          </p>
          {checkinMsg && (
            <p className="text-xs text-semantic-success mt-1">{checkinMsg}</p>
          )}
        </div>
        <button
          onClick={handleCheckin}
          disabled={checkedIn || loading}
          className="px-5 py-2 bg-surface-800 text-white text-sm rounded-lg hover:bg-surface-700 disabled:opacity-40 transition-colors"
        >
          {checkedIn ? '已签到' : loading ? '签到中...' : '立即签到'}
        </button>
      </div>

      {/* Streak info */}
      <div className="bg-white border border-surface-100 rounded-8 p-4">
        <p className="text-xs font-medium text-surface-400 mb-3">连续签到奖励规则</p>
        <div className="flex gap-2 flex-wrap text-xs">
          {[
            { days: '第1天', pts: 1 },
            { days: '第2天', pts: 2 },
            { days: '第3天', pts: 3 },
            { days: '第4-6天', pts: 5 },
            { days: '第7天+', pts: 10 },
          ].map((r) => (
            <div key={r.days} className="flex items-center gap-1 px-2 py-1 bg-surface-50 rounded-lg">
              <span className="text-surface-400">{r.days}</span>
              <span className="font-semibold text-surface-600">+{r.pts}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-surface-400 mt-3">积分获取方式：消费 1 元 = 1 积分 / 绑定手机 +50 积分 / 提交评价 +10 积分</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-100">
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'history'
              ? 'border-surface-800 text-surface-600'
              : 'border-transparent text-surface-400 hover:text-surface-500'
          }`}
        >
          积分明细
        </button>
        <button
          onClick={() => setTab('shop')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'shop'
              ? 'border-surface-800 text-surface-600'
              : 'border-transparent text-surface-400 hover:text-surface-500'
          }`}
        >
          积分商城
        </button>
      </div>

      {tab === 'history' && (
        <div className="bg-white border border-surface-100 rounded-8 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-50 border-b border-surface-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-surface-400">时间</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-surface-400">类型</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-surface-400">备注</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-surface-400">积分</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {records.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-surface-400">暂无记录</td></tr>
              )}
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-surface-50/50">
                  <td className="px-4 py-3 text-surface-400 text-xs whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${typeColor[r.type] ?? 'text-surface-400 bg-surface-50'}`}>
                      {typeLabel[r.type] ?? r.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-surface-500 text-xs">{r.note}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${r.points > 0 ? 'text-semantic-success' : 'text-semantic-danger'}`}>
                    {r.points > 0 ? '+' : ''}{r.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-surface-50 flex items-center justify-between text-sm">
              <span className="text-surface-400">共 {total} 条</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1 rounded border border-surface-200 text-surface-500 disabled:opacity-40 hover:bg-surface-50">
                  上一页
                </button>
                <span className="px-3 py-1 text-surface-400">{page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 rounded border border-surface-200 text-surface-500 disabled:opacity-40 hover:bg-surface-50">
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'shop' && (
        <div>
          {shopLoading ? (
            <div className="py-12 text-center text-sm text-surface-400">加载中...</div>
          ) : shopCoupons.length === 0 ? (
            <div className="py-12 text-center text-sm text-surface-400">暂无可兑换优惠券</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {shopCoupons.map((cp) => (
                <div key={cp.id} className={`bg-white border rounded-8 p-5 space-y-3 ${cp.canRedeem ? 'border-surface-100' : 'border-surface-50 opacity-70'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-surface-600">{cp.name}</p>
                      <p className="text-xs text-surface-400 mt-0.5">{couponTypeLabel(cp.type, cp.value)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-surface-600">{cp.pointsRequired}</p>
                      <p className="text-xs text-surface-400">积分</p>
                    </div>
                  </div>

                  <div className="text-xs text-surface-400 space-y-0.5">
                    {cp.minOrderAmount > 0 && <p>满 ¥{cp.minOrderAmount.toFixed(2)} 可用</p>}
                    {cp.maxDiscount > 0 && <p>最高减 ¥{cp.maxDiscount.toFixed(2)}</p>}
                    <p>有效期至 {new Date(cp.endAt).toLocaleDateString('zh-CN')}</p>
                    {cp.totalCount > 0 && (
                      <p>剩余 {cp.totalCount - cp.usedCount} / {cp.totalCount} 份</p>
                    )}
                  </div>

                  {redeemMsg?.id === cp.id && (
                    <p className={`text-xs ${redeemMsg.ok ? 'text-semantic-success' : 'text-semantic-danger'}`}>
                      {redeemMsg.msg}
                    </p>
                  )}

                  <button
                    onClick={() => handleRedeem(cp.id)}
                    disabled={!cp.canRedeem || redeemingId === cp.id}
                    className="w-full py-2 text-sm font-medium rounded-lg border transition-colors
                      disabled:opacity-40 disabled:cursor-not-allowed
                      enabled:bg-surface-800 enabled:text-white enabled:border-surface-800 enabled:hover:bg-surface-700"
                  >
                    {redeemingId === cp.id
                      ? '兑换中...'
                      : cp.canRedeem
                      ? `兑换（${cp.pointsRequired} 积分）`
                      : (up?.points ?? 0) < cp.pointsRequired
                      ? `积分不足（差 ${cp.pointsRequired - (up?.points ?? 0)} 积分）`
                      : '已兑完'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
