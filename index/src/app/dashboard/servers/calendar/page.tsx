'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

interface CalendarDay {
  date: string;
  count: number;
  level: 'red' | 'orange' | 'green' | 'gray';
}

interface CalendarServer {
  id: string;
  ip?: string | null;
  status: string;
  userNote?: string | null;
  expireDate?: string | null;
  daysUntilExpire: number;
  product: {
    name: string;
    region: string;
  };
}

const WEEK_DAYS = ['一', '二', '三', '四', '五', '六', '日'];

const DAY_LEVEL_CLS: Record<string, string> = {
  red: 'bg-semantic-danger-light border-red-200 text-red-700',
  orange: 'bg-orange-50 border-orange-200 text-orange-700',
  green: 'bg-semantic-success-light border-emerald-200 text-semantic-success-dark',
  gray: 'bg-surface-100 border-surface-200 text-surface-400',
};

function toMonthString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, delta: number) {
  const [year, mon] = month.split('-').map(Number);
  const d = new Date(year, mon - 1 + delta, 1);
  return toMonthString(d);
}

export default function DashboardServersCalendarPage() {
  const [month, setMonth] = useState(toMonthString(new Date()));
  const [selectedDate, setSelectedDate] = useState('');
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [servers, setServers] = useState<CalendarServer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (targetMonth: string, date?: string) => {
    const qs = new URLSearchParams();
    qs.set('month', targetMonth);
    if (date) qs.set('date', date);

    const res = await apiFetch(`/api/dashboard/servers/calendar?${qs.toString()}`, { method: 'GET' });
    const json = await res.json();
    if (json.success) {
      setDays(json.data.calendar || []);
      setServers(json.data.servers || []);
    }
  };

  useEffect(() => {
    setLoading(true);
    load(month, selectedDate || undefined).finally(() => setLoading(false));
  }, [month, selectedDate]);

  const dayMap = useMemo(() => {
    const map = new Map<string, CalendarDay>();
    days.forEach((d) => map.set(d.date, d));
    return map;
  }, [days]);

  const calendarCells = useMemo(() => {
    const [year, mon] = month.split('-').map(Number);
    const first = new Date(year, mon - 1, 1);
    const totalDays = new Date(year, mon, 0).getDate();
    const weekStart = (first.getDay() + 6) % 7;

    const cells: Array<{ date: string; day: number; data?: CalendarDay }> = [];
    for (let i = 0; i < weekStart; i++) {
      cells.push({ date: '', day: 0 });
    }
    for (let d = 1; d <= totalDays; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      cells.push({ date, day: d, data: dayMap.get(date) });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ date: '', day: 0 });
    }
    return cells;
  }, [dayMap, month]);

  const title = useMemo(() => {
    const [year, mon] = month.split('-').map(Number);
    return `${year}年${mon}月`;
  }, [month]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="section-title">到期日历</h1>
          <p className="text-xs text-surface-400 mt-1">按月份查看你的服务器到期分布，点击日期查看实例明细。</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/servers" className="btn-secondary btn-sm">列表视图</Link>
          <Link href="/dashboard/server-tags" className="btn-secondary btn-sm">标签管理</Link>
        </div>
      </div>

      <div className="rounded-8 border border-surface-100 bg-white p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setMonth((m) => shiftMonth(m, -1))} className="btn-secondary btn-sm">上月</button>
          <p className="text-sm font-semibold text-surface-500">{title}</p>
          <button onClick={() => setMonth((m) => shiftMonth(m, 1))} className="btn-secondary btn-sm">下月</button>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2">
          {WEEK_DAYS.map((w) => (
            <div key={w} className="text-center text-xs text-surface-400 py-1">{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {calendarCells.map((cell, idx) => {
            if (!cell.date) {
              return <div key={`empty-${idx}`} className="h-20 rounded-lg bg-surface-50/40" />;
            }
            const selected = selectedDate === cell.date;
            const dayData = cell.data;
            return (
              <button
                key={cell.date}
                onClick={() => setSelectedDate((prev) => (prev === cell.date ? '' : cell.date))}
                className={`h-20 rounded-lg border p-2 text-left transition ${
                  selected
                    ? 'border-blue-400 ring-2 ring-blue-100'
                    : dayData
                      ? DAY_LEVEL_CLS[dayData.level] || 'bg-white border-surface-200 text-surface-500'
                      : 'bg-white border-surface-200 text-surface-500 hover:bg-surface-50'
                }`}
              >
                <p className="text-xs font-semibold">{cell.day}</p>
                <p className="text-[11px] mt-1">
                  {dayData ? `${dayData.count} 台到期` : '无到期'}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-8 border border-surface-100 bg-white overflow-hidden">
        <div className="px-4 py-2 border-b border-surface-100 bg-surface-50/60 text-xs text-surface-400">
          {selectedDate ? `日期 ${selectedDate} 的到期实例` : '请选择日期查看实例明细'}
        </div>
        {loading ? (
          <div className="text-center py-12 text-surface-400 text-sm">加载中...</div>
        ) : selectedDate && servers.length === 0 ? (
          <div className="text-center py-12 text-surface-400 text-sm">当天没有到期实例</div>
        ) : !selectedDate ? (
          <div className="text-center py-12 text-surface-400 text-sm">点击上方日历中的日期查看明细</div>
        ) : (
          <div>
            {servers.map((s) => {
              const renewHref = `/dashboard/tickets?create=1&type=AFTERSALE&serverId=${encodeURIComponent(s.id)}&serverName=${encodeURIComponent(s.product?.name || '')}&serverIp=${encodeURIComponent(s.ip || '')}`;
              return (
                <div key={s.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-surface-50 last:border-b-0 text-xs items-center">
                  <div className="col-span-4 min-w-0">
                    <p className="font-medium text-surface-600 truncate">{s.product?.name || '-'}</p>
                    <p className="text-surface-400 mt-0.5">{s.product?.region || '-'}</p>
                  </div>
                  <div className="col-span-3 text-surface-400">
                    <p className="font-mono">{s.ip || 'IP 待分配'}</p>
                    <p className="mt-0.5">{s.userNote || '无备注'}</p>
                  </div>
                  <div className="col-span-2 text-surface-400">
                    {s.expireDate ? new Date(s.expireDate).toLocaleDateString() : '-'}
                  </div>
                  <div className={`col-span-1 font-medium ${
                    s.daysUntilExpire < 0 ? 'text-surface-400' : s.daysUntilExpire <= 7 ? 'text-semantic-danger' : s.daysUntilExpire <= 30 ? 'text-semantic-warning' : 'text-semantic-success'
                  }`}>
                    {s.daysUntilExpire < 0 ? '已过期' : `${s.daysUntilExpire}天`}
                  </div>
                  <div className="col-span-2 text-right">
                    <Link href={renewHref} className="text-brand-500 hover:underline">续费指引</Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
