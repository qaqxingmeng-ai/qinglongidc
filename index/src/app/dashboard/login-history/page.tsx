'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';

interface LoginRecord {
  id: string;
  ip: string;
  userAgent: string;
  isSuccessful: boolean;
  failReason?: string;
  loginAt: string;
}

function parseDevice(ua: string): string {
  if (!ua) return '未知设备';
  if (ua.includes('iPhone') || ua.includes('iPad')) return '移动设备 (Apple)';
  if (ua.includes('Android')) return '移动设备 (Android)';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  return '未知设备';
}

function parseBrowser(ua: string): string {
  if (!ua) return '';
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edg')) return 'Edge';
  return 'Browser';
}

export default function LoginHistoryPage() {
  const [records, setRecords] = useState<LoginRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = async (p: number) => {
    const res = await apiFetch(`/api/dashboard/login-history?page=${p}&pageSize=${pageSize}`);
    const j = await res.json();
    if (j.success) {
      setRecords(j.data.records ?? []);
      setTotal(j.data.total ?? 0);
    }
  };

  useEffect(() => { load(page); }, [page]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-surface-600">登录历史</h1>
          <p className="text-sm text-surface-400 mt-0.5">最近的账户登录记录</p>
        </div>
        <Link href="/dashboard/profile" className="text-sm text-surface-400 hover:text-surface-500">
          返回账户设置
        </Link>
      </div>

      <div className="bg-white border border-surface-100 rounded-8 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-surface-50 border-b border-surface-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-surface-400">时间</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-surface-400">IP 地址</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-surface-400">设备</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-surface-400">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {records.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-surface-400">暂无登录记录</td>
              </tr>
            )}
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-surface-50/50">
                <td className="px-4 py-3 text-surface-500 whitespace-nowrap">
                  {new Date(r.loginAt).toLocaleString('zh-CN')}
                </td>
                <td className="px-4 py-3 font-mono text-surface-500">{r.ip}</td>
                <td className="px-4 py-3 text-surface-500">
                  {parseDevice(r.userAgent)} · {parseBrowser(r.userAgent)}
                </td>
                <td className="px-4 py-3">
                  {r.isSuccessful ? (
                    <span className="inline-flex items-center gap-1 text-xs text-semantic-success-dark bg-semantic-success-light px-2 py-0.5 rounded-full">
                      成功
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-semantic-danger bg-semantic-danger-light px-2 py-0.5 rounded-full" title={r.failReason ?? ''}>
                      失败{r.failReason ? ` · ${r.failReason}` : ''}
                    </span>
                  )}
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
    </div>
  );
}
