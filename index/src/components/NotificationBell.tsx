'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { useRealtime, type RealtimeNotification } from '@/components/RealtimeProvider';

export default function NotificationBell() {
  const { unreadCount, lastNotification, setUnreadCount } = useRealtime();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RealtimeNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/dashboard/notifications?pageSize=20');
      const json = await res.json();
      setItems(json.data?.items ?? json.items ?? []);
      setUnreadCount(json.data?.unreadCount ?? json.unreadCount ?? 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!lastNotification) return;
    setItems((prev) => {
      if (prev.some((item) => item.id === lastNotification.id)) {
        return prev;
      }
      return [lastNotification, ...prev].slice(0, 20);
    });
  }, [lastNotification]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open) fetchItems();
  };

  const readAll = async () => {
    await apiFetch('/api/dashboard/notifications/read-all', { method: 'POST' });
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const markRead = async (id: string) => {
    await apiFetch(`/api/dashboard/notifications/${id}/read`, { method: 'PATCH' });
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount((count) => Math.max(0, count - 1));
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    return d.toLocaleDateString('zh-CN');
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition"
        aria-label="通知"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] rounded-full bg-semantic-danger-light0 text-white text-xs flex items-center justify-center px-1 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 flex max-h-[70vh] w-[calc(100vw-2rem)] max-w-[22rem] flex-col rounded-8 border border-surface-100 bg-white shadow-xl sm:w-80 sm:max-h-[480px]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100">
            <span className="text-sm font-semibold text-surface-600">通知</span>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button onClick={readAll} className="text-xs text-brand-500 hover:underline">
                  全部已读
                </button>
              )}
              <Link href="/dashboard/notifications" onClick={() => setOpen(false)} className="text-xs text-surface-400 hover:underline">
                查看全部
              </Link>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {loading && (
              <div className="py-8 text-center text-sm text-surface-400">加载中...</div>
            )}
            {!loading && items.length === 0 && (
              <div className="py-8 text-center text-sm text-surface-400">暂无通知</div>
            )}
            {!loading && items.map((n) => (
              <div
                key={n.id}
                onClick={() => { if (!n.isRead) markRead(n.id); }}
                className={`px-4 py-3 border-b border-surface-50 last:border-b-0 cursor-pointer hover:bg-surface-50 transition ${!n.isRead ? 'bg-semantic-info-light/40' : ''}`}
              >
                <div className="flex items-start gap-2">
                  {!n.isRead && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-semantic-info-light shrink-0" />}
                  {n.isRead && <span className="mt-1.5 w-1.5 h-1.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm text-surface-600 font-medium leading-5">{n.title}</p>
                    {n.content && <p className="text-xs text-surface-400 mt-0.5 line-clamp-2">{n.content}</p>}
                    <p className="text-xs text-surface-400 mt-1">{formatTime(n.createdAt)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
