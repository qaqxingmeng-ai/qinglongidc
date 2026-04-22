'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch, extractApiError } from '@/lib/api-client';
import { browserPushSupported, getCurrentPushSubscription, subscribeBrowserPush } from '@/lib/browser-push';
import { useRealtime } from '@/components/RealtimeProvider';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  content: string;
  isRead: boolean;
  relatedId?: string;
  relatedType?: string;
  createdAt: string;
}

interface NotificationPreferences {
  userId: string;
  browserPushEnabled: boolean;
  ticketReplyPush: boolean;
  serverExpiryPush: boolean;
  balanceChangePush: boolean;
  securityAlertPush: boolean;
}

type BrowserPermissionState = NotificationPermission | 'unsupported';

const TYPE_LABELS: Record<string, string> = {
  TICKET_REPLY: '工单回复',
  SERVER_EXPIRY: '到期提醒',
  SERVER_STATUS: '状态变更',
  BALANCE_CHANGE: '余额变动',
  SYSTEM_ANNOUNCE: '系统公告',
  COMMISSION: '佣金结算',
  COUPON_EXPIRY: '优惠券到期',
  SECURITY_ALERT: '安全提醒',
};

export default function NotificationsPage() {
  const { connected, unreadCount, setUnreadCount, lastNotification } = useRealtime();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState('');
  const [filterRead, setFilterRead] = useState('');
  const [loading, setLoading] = useState(true);
  const [readingAll, setReadingAll] = useState(false);

  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [publicKey, setPublicKey] = useState('');
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [permission, setPermission] = useState<BrowserPermissionState>('default');
  const [pushSupported, setPushSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');
  const [savingPref, setSavingPref] = useState('');

  const pageSize = 20;

  const syncBrowserState = useCallback(async () => {
    const supported = browserPushSupported();
    setPushSupported(supported);
    if (!supported) {
      setPermission('unsupported');
      setSubscribed(false);
      return;
    }

    setPermission(Notification.permission);
    const current = await getCurrentPushSubscription();
    setSubscribed(Boolean(current));
  }, []);

  const loadPreferences = useCallback(async () => {
    const res = await apiFetch('/api/dashboard/notifications/preferences', { method: 'GET' });
    const json = await res.json();
    const data = json.data ?? {};
    setPreferences(data.preferences ?? null);
    setPushConfigured(Boolean(data.browserPushConfigured));
    setPublicKey(data.webPushPublicKey ?? '');
    setSubscriptionCount(data.subscriptionCount ?? 0);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (filterType) params.set('type', filterType);
      if (filterRead !== '') params.set('isRead', filterRead);
      const res = await apiFetch(`/api/dashboard/notifications?${params}`);
      const json = await res.json();
      const data = json.data ?? json;
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setUnreadCount(data.unreadCount ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, filterType, filterRead, setUnreadCount]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadPreferences();
    void syncBrowserState();
  }, [loadPreferences, syncBrowserState]);

  useEffect(() => {
    if (!lastNotification) return;
    void load();
  }, [lastNotification, load]);

  const updatePreferences = async (patch: Partial<NotificationPreferences>) => {
    setSavingPref(Object.keys(patch)[0] || 'saving');
    try {
      const res = await apiFetch('/api/dashboard/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(extractApiError(json.error, '保存通知偏好失败'));
      }
      const data = json.data ?? {};
      setPreferences(data.preferences ?? null);
      setPushConfigured(Boolean(data.browserPushConfigured));
      setPublicKey(data.webPushPublicKey ?? '');
      setSubscriptionCount(data.subscriptionCount ?? 0);
      setPushError('');
    } catch (error) {
      setPushError(error instanceof Error ? error.message : '保存通知偏好失败');
    } finally {
      setSavingPref('');
    }
  };

  const enableBrowserPush = async () => {
    setPushBusy(true);
    setPushError('');
    try {
      if (!browserPushSupported()) {
        throw new Error('当前浏览器不支持推送通知');
      }
      if (!pushConfigured || !publicKey) {
        throw new Error('服务端尚未配置浏览器推送');
      }

      let nextPermission = Notification.permission;
      if (nextPermission === 'default') {
        nextPermission = await Notification.requestPermission();
      }
      setPermission(nextPermission);
      if (nextPermission !== 'granted') {
        throw new Error('浏览器未授予通知权限');
      }

      let subscription = await getCurrentPushSubscription();
      if (!subscription) {
        subscription = await subscribeBrowserPush(publicKey);
      }
      const payload = subscription.toJSON();
      if (!payload.keys?.p256dh || !payload.keys?.auth) {
        throw new Error('推送订阅密钥缺失');
      }

      const saveRes = await apiFetch('/api/dashboard/notifications/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: payload.keys.p256dh,
          auth: payload.keys.auth,
          userAgent: navigator.userAgent,
        }),
      });
      const saveJson = await saveRes.json();
      if (!saveJson.success) {
        throw new Error(extractApiError(saveJson.error, '保存推送订阅失败'));
      }

      await updatePreferences({ browserPushEnabled: true });
      await syncBrowserState();
    } catch (error) {
      setPushError(error instanceof Error ? error.message : '开启浏览器推送失败');
    } finally {
      setPushBusy(false);
    }
  };

  const disableBrowserPush = async () => {
    setPushBusy(true);
    setPushError('');
    try {
      const subscription = await getCurrentPushSubscription();
      if (subscription) {
        await apiFetch('/api/dashboard/notifications/subscriptions', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      await updatePreferences({ browserPushEnabled: false });
      await syncBrowserState();
    } catch (error) {
      setPushError(error instanceof Error ? error.message : '关闭浏览器推送失败');
    } finally {
      setPushBusy(false);
    }
  };

  const markRead = async (id: string) => {
    await apiFetch(`/api/dashboard/notifications/${id}/read`, { method: 'PATCH' });
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
    setUnreadCount((count) => Math.max(0, count - 1));
  };

  const readAll = async () => {
    setReadingAll(true);
    try {
      await apiFetch('/api/dashboard/notifications/read-all', { method: 'POST' });
      setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } finally {
      setReadingAll(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-surface-600">通知中心</h1>
          {unreadCount > 0 && <p className="mt-0.5 text-sm text-surface-400">{unreadCount} 条未读</p>}
        </div>
        {unreadCount > 0 && (
          <button onClick={readAll} disabled={readingAll} className="btn-secondary btn-sm">
            {readingAll ? '处理中...' : '全部标为已读'}
          </button>
        )}
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-8 border border-surface-100 bg-white p-5">
          <p className="text-sm font-semibold text-surface-600">实时连接</p>
          <p className={`mt-2 text-sm ${connected ? 'text-semantic-success' : 'text-semantic-warning'}`}>
            {connected ? '已连接，通知将实时推送到当前页面。' : '连接中断，系统会自动重连。'}
          </p>
          <p className="mt-2 text-xs text-surface-400">实时链路开启后，小铃铛未读数与最新通知会自动刷新，不再依赖定时轮询。</p>
        </div>

        <div className="rounded-8 border border-surface-100 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-surface-600">浏览器推送</p>
              <p className="mt-1 text-xs text-surface-400">
                浏览器支持：{pushSupported ? '支持' : '不支持'} · 服务端配置：{pushConfigured ? '已配置' : '未配置'} · 权限：{permission}
              </p>
            </div>
            {preferences?.browserPushEnabled ? (
              <button onClick={disableBrowserPush} disabled={pushBusy} className="btn-secondary btn-sm">
                {pushBusy ? '处理中...' : '关闭推送'}
              </button>
            ) : (
              <button onClick={enableBrowserPush} disabled={pushBusy || !pushConfigured} className="btn-primary btn-sm disabled:opacity-50">
                {pushBusy ? '处理中...' : '开启推送'}
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-surface-400">当前浏览器订阅状态：{subscribed ? '已订阅' : '未订阅'}；服务器已保存订阅数：{subscriptionCount}</p>
          {pushError && <p className="mt-2 text-xs text-semantic-danger">{pushError}</p>}
        </div>
      </div>

      {preferences && (
        <div className="mb-6 rounded-8 border border-surface-100 bg-white p-5">
          <p className="text-sm font-semibold text-surface-600">推送偏好</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ['ticketReplyPush', '工单回复'],
              ['serverExpiryPush', '服务器到期 / 状态变更'],
              ['balanceChangePush', '余额与佣金变动'],
              ['securityAlertPush', '安全提醒'],
            ].map(([key, label]) => {
              const typedKey = key as keyof NotificationPreferences;
              return (
                <label key={key} className="flex items-center justify-between rounded-8 border border-surface-100 px-4 py-3 text-sm text-surface-500">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(preferences[typedKey])}
                    disabled={savingPref === key}
                    onChange={(event) => {
                      void updatePreferences({ [typedKey]: event.target.checked } as Partial<NotificationPreferences>);
                    }}
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={filterType}
          onChange={(event) => {
            setFilterType(event.target.value);
            setPage(1);
          }}
          className="input max-w-[180px] text-sm"
        >
          <option value="">全部类型</option>
          {Object.entries(TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={filterRead}
          onChange={(event) => {
            setFilterRead(event.target.value);
            setPage(1);
          }}
          className="input max-w-[140px] text-sm"
        >
          <option value="">全部状态</option>
          <option value="false">未读</option>
          <option value="true">已读</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-8 border border-surface-100 bg-white">
        {loading && <div className="py-16 text-center text-sm text-surface-400">加载中...</div>}
        {!loading && items.length === 0 && <div className="py-16 text-center text-sm text-surface-400">暂无通知</div>}
        {!loading &&
          items.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                if (!item.isRead) void markRead(item.id);
              }}
              className={`flex cursor-pointer items-start gap-3 border-b border-surface-50 px-5 py-4 transition last:border-b-0 hover:bg-surface-50/60 ${!item.isRead ? 'bg-semantic-info-light/30' : ''}`}
            >
              <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${!item.isRead ? 'bg-semantic-info-light' : 'bg-surface-200'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-surface-600">{item.title}</span>
                  <span className="rounded-full bg-surface-100 px-1.5 py-0.5 text-[11px] text-surface-400">
                    {TYPE_LABELS[item.type] ?? item.type}
                  </span>
                </div>
                {item.content && <p className="mt-1 text-sm text-surface-400">{item.content}</p>}
                <p className="mt-1.5 text-[11px] text-surface-400">{formatTime(item.createdAt)}</p>
              </div>
              {!item.isRead && (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    void markRead(item.id);
                  }}
                  className="mt-1 shrink-0 text-[11px] text-brand-500 hover:underline"
                >
                  标为已读
                </button>
              )}
            </div>
          ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} className="btn-secondary btn-sm">
            上一页
          </button>
          <span className="text-sm text-surface-400">
            {page} / {totalPages}
          </span>
          <button onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages} className="btn-secondary btn-sm">
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
