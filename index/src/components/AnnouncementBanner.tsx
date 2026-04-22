'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  priority: string;
}

// Displays active BANNER / MAINTENANCE announcements as a dismissible top bar.
// MAINTENANCE is not dismissible. BANNER is dismissed per-session (localStorage key).
export default function AnnouncementBanner() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const safeParseDismissed = () => {
      try {
        return JSON.parse(localStorage.getItem('dismissed_banners') || '{}') as Record<string, number>;
      } catch {
        return {};
      }
    };

    const stored = safeParseDismissed();
    const now = Date.now();
    // filter out entries older than 24h
    const valid = new Set<string>(
      Object.entries(stored)
        .filter(([, ts]) => (now - Number(ts)) < 86400000)
        .map(([id]) => id)
    );
    setDismissed(valid);

    apiFetch('/api/announcements/active?type=BANNER')
      .then(r => r.json())
      .then(json => {
        if (json?.data?.items) setItems(json.data.items);
      })
      .catch(() => {});

    // Also load MAINTENANCE
    apiFetch('/api/announcements/active?type=MAINTENANCE')
      .then(r => r.json())
      .then(json => {
        if (json?.data?.items) {
          setItems(prev => [...prev, ...json.data.items]);
        }
      })
      .catch(() => {});
  }, []);

  const dismiss = (id: string, type: string) => {
    if (type === 'MAINTENANCE') return;
    let stored: Record<string, number> = {};
    try {
      stored = JSON.parse(localStorage.getItem('dismissed_banners') || '{}') as Record<string, number>;
    } catch {
      stored = {};
    }
    stored[id] = Date.now();
    localStorage.setItem('dismissed_banners', JSON.stringify(stored));
    setDismissed(prev => new Set(Array.from(prev).concat(id)));
  };

  const visible = items.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-0">
      {visible.map(a => {
        const isMaintenance = a.type === 'MAINTENANCE';
        const isUrgent = a.priority === 'URGENT';
        return (
          <div
            key={a.id}
            className={`w-full flex items-center justify-between px-4 py-2 text-sm ${
              isMaintenance
                ? 'bg-red-600 text-white'
                : isUrgent
                ? 'bg-orange-500 text-white'
                : 'bg-brand-500 text-white'
            }`}
          >
            <span className="truncate flex-1">{a.title}</span>
            {!isMaintenance && (
              <button
                onClick={() => dismiss(a.id, a.type)}
                className="ml-4 text-white/70 hover:text-white text-lg leading-none shrink-0"
                aria-label="关闭"
              >
                &times;
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
