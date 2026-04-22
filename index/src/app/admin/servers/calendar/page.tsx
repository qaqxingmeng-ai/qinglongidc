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
  user: { name: string; email: string };
  product: { name: string; region: string };
}

const WEEK_DAYS = ['一', '二', '三', '四', '五', '六', '日'];

const DAY_LEVEL_CLS: Record<string, { bg: string; dot: string; text: string }> = {
  red: { bg: 'bg-red-50 border-red-200 hover:border-red-400', dot: 'bg-red-400', text: 'text-red-700' },
  orange: { bg: 'bg-orange-50 border-orange-200 hover:border-orange-400', dot: 'bg-orange-400', text: 'text-orange-700' },
  green: { bg: 'bg-emerald-50 border-emerald-200 hover:border-emerald-400', dot: 'bg-emerald-400', text: 'text-emerald-700' },
  gray: { bg: 'bg-surface-50 border-surface-200 hover:border-surface-300', dot: 'bg-surface-300', text: 'text-surface-400' },
};

function toMonthString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, delta: number) {
  const [year, mon] = month.split('-').map(Number);
  const d = new Date(year, mon - 1 + delta, 1);
  return toMonthString(d);
}

export default function AdminServersCalendarPage() {
  const [month, setMonth] = useState(toMonthString(new Date()));
  const [selectedDate, setSelectedDate] = useState('');
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [servers, setServers] = useState<CalendarServer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (targetMonth: string, date?: string) => {
    const qs = new URLSearchParams();
    qs.set('month', targetMonth);
    if (date) qs.set('date', date);

    const res = await apiFetch(`/api/admin/servers/calendar?${qs.toString()}`, { method: 'GET' });
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

  const totalCount = days.reduce((sum, d) => sum + d.count, 0);
  const urgentDays = days.filter((d) => d.level === 'red' || d.level === 'orange').length;

  return (
    <div className="admin-page">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="page-title">到期日历</h1>
          <p className="text-xs text-surface-400 mt-1">按月份查看全部服务器到期分布，支持按日定位用户实例。</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/servers" className="btn-secondary btn-sm">列表视图</Link>
          <Link href="/admin/servers/renewal" className="btn-secondary btn-sm">续费管理</Link>
        </div>
      </div>

      {/* 月度概览 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="admin-panel">
          <div className="admin-panel-body py-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center">
              <svg className="h-4.5 w-4.5 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
            <div>
              <p className="text-[11px] text-surface-400">本月到期总数</p>
              <p className="text-lg font-bold text-surface-700">{totalCount}</p>
            </div>
          </div>
        </div>
        <div className="admin-panel">
          <div className="admin-panel-body py-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center">
              <svg className="h-4.5 w-4.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            </div>
            <div>
              <p className="text-[11px] text-surface-400">紧急到期天数</p>
              <p className="text-lg font-bold text-red-600">{urgentDays}</p>
            </div>
          </div>
        </div>
        <div className="admin-panel">
          <div className="admin-panel-body py-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-surface-50 flex items-center justify-center">
              <svg className="h-4.5 w-4.5 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            </div>
            <div>
              <p className="text-[11px] text-surface-400">有到期记录天数</p>
              <p className="text-lg font-bold text-surface-700">{days.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 日历面板 */}
      <div className="admin-panel mb-4">
        <div className="admin-panel-header">
          <span className="admin-panel-title">{title}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setMonth((m) => shiftMonth(m, -1))} className="btn-secondary btn-sm">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={() => setMonth(toMonthString(new Date()))} className="px-2.5 py-1 rounded-md text-xs font-medium bg-surface-50 text-surface-500 hover:bg-surface-100 transition-colors">今天</button>
            <button onClick={() => setMonth((m) => shiftMonth(m, 1))} className="btn-secondary btn-sm">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
        <div className="admin-panel-body">
          {/* 图例 */}
          <div className="flex items-center gap-4 mb-3 text-[11px] text-surface-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" />紧急（≤3天）</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-400" />临近（≤7天）</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />正常</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-surface-300" />无到期</span>
          </div>

          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {WEEK_DAYS.map((w) => (
              <div key={w} className="text-center text-[11px] text-surface-400 font-medium py-1">{w}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {calendarCells.map((cell, idx) => {
              if (!cell.date) {
                return <div key={`empty-${idx}`} className="h-20 rounded-lg bg-surface-50/40" />;
              }
              const selected = selectedDate === cell.date;
              const dayData = cell.data;
              const levelStyle = dayData ? DAY_LEVEL_CLS[dayData.level] : null;
              return (
                <button
                  key={cell.date}
                  onClick={() => setSelectedDate((prev) => (prev === cell.date ? '' : cell.date))}
                  className={`h-20 rounded-lg border p-2 text-left transition-all ${
                    selected
                      ? 'border-brand-400 ring-2 ring-brand-100 shadow-sm'
                      : levelStyle
                        ? levelStyle.bg
                        : 'bg-white border-surface-200 hover:bg-surface-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-surface-600">{cell.day}</p>
                    {dayData && <span className={`h-1.5 w-1.5 rounded-full ${levelStyle?.dot || 'bg-surface-300'}`} />}
                  </div>
                  {dayData ? (
                    <p className={`text-[11px] mt-1 font-medium ${levelStyle?.text || 'text-surface-400'}`}>
                      {dayData.count} 台到期
                    </p>
                  ) : (
                    <p className="text-[11px] mt-1 text-surface-300">-</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 实例明细 */}
      <div className="admin-panel">
        <div className="admin-panel-header">
          <span className="admin-panel-title">
            {selectedDate ? `${selectedDate} 到期实例` : '实例明细'}
          </span>
          {selectedDate && (
            <button onClick={() => setSelectedDate('')} className="text-xs text-surface-400 hover:text-surface-600 transition-colors">清除选择</button>
          )}
        </div>
        <div className="admin-panel-body">
          {loading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : !selectedDate ? (
            <div className="empty-state py-16">
              <svg className="h-10 w-10 text-surface-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <p className="text-surface-400 text-sm">点击上方日历中的日期查看明细</p>
            </div>
          ) : servers.length === 0 ? (
            <div className="empty-state py-16">
              <p className="text-surface-400 text-sm">当天没有到期实例</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-50">
              {servers.map((s) => (
                <div key={s.id} className="grid grid-cols-12 gap-2 py-3 text-xs items-center first:pt-0 last:pb-0">
                  <div className="col-span-3 min-w-0">
                    <p className="font-medium text-surface-600 truncate">{s.product?.name || '-'}</p>
                    <p className="text-surface-400 mt-0.5">{s.product?.region || '-'}</p>
                  </div>
                  <div className="col-span-2 text-surface-400">
                    <p className="truncate">{s.user?.name || '-'}</p>
                    <p className="truncate text-surface-400">{s.user?.email || '-'}</p>
                  </div>
                  <div className="col-span-2 text-surface-400">
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
                    <Link href="/admin/servers" className="text-brand-500 hover:underline text-[11px]">去实例列表</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
