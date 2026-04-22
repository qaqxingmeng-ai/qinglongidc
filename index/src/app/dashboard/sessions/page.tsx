'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';

type SessionItem = {
  id: string;
  deviceId: string;
  ip: string;
  userAgent: string;
  isCurrent: boolean;
  isActive: boolean;
  lastActiveAt: string;
  expiresAt: string;
  createdAt: string;
};

function parseDevice(ua: string): string {
  if (!ua) return '未知设备';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'Apple 移动设备';
  if (ua.includes('Android')) return 'Android 设备';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  return '其他设备';
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadSessions = useCallback(async () => {
    setErr('');
    const res = await apiFetch('/api/auth/sessions');
    const json = await res.json();
    if (!json?.success) {
      setErr(typeof json?.error === 'string' ? json.error : json?.error?.message || '加载会话失败');
      return;
    }
    setSessions(json?.data?.sessions ?? []);
  }, []);

  useEffect(() => {
    loadSessions().finally(() => setLoading(false));
  }, [loadSessions]);

  const logoutOthers = async () => {
    setErr('');
    setMsg('');
    const res = await apiFetch('/api/auth/sessions/logout-others', { method: 'POST' });
    const json = await res.json();
    if (!json?.success) {
      setErr(typeof json?.error === 'string' ? json.error : json?.error?.message || '操作失败');
      return;
    }
    setMsg(`已退出其他设备 ${json?.data?.revoked ?? 0} 个会话`);
    await loadSessions();
  };

  const revoke = async (id: string) => {
    setErr('');
    setMsg('');
    const res = await apiFetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json?.success) {
      setErr(typeof json?.error === 'string' ? json.error : json?.error?.message || '移除会话失败');
      return;
    }
    setMsg('会话已移除');
    await loadSessions();
  };

  return (
    <div className="max-w-5xl space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-surface-600">会话管理</h1>
          <p className="mt-0.5 text-sm text-surface-400">查看当前登录设备，并可踢出不再使用的设备</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={logoutOthers}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-semantic-danger hover:bg-semantic-danger-light"
          >
            退出其他设备
          </button>
          <Link href="/dashboard/profile" className="text-sm text-surface-400 hover:text-surface-500">
            返回账号设置
          </Link>
        </div>
      </div>

      {msg && <p className="rounded-lg border border-green-200 bg-semantic-success-light px-3 py-2 text-sm text-semantic-success-dark">{msg}</p>}
      {err && <p className="rounded-lg border border-red-200 bg-semantic-danger-light px-3 py-2 text-sm text-semantic-danger">{err}</p>}

      <div className="overflow-hidden rounded-8 border border-surface-100 bg-white">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-surface-100 bg-surface-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-surface-400">设备</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-surface-400">IP</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-surface-400">最近活跃</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-surface-400">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-surface-400">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {!loading && sessions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-surface-400">
                  暂无会话数据
                </td>
              </tr>
            )}
            {sessions.map((session) => (
              <tr key={session.id} className="hover:bg-surface-50/60">
                <td className="px-4 py-3 text-surface-500">
                  <p className="font-medium text-surface-600">{parseDevice(session.userAgent)}</p>
                  <p className="max-w-[360px] truncate text-xs text-surface-400" title={session.userAgent}>
                    {session.userAgent || '无 UA 信息'}
                  </p>
                </td>
                <td className="px-4 py-3 font-mono text-surface-500">{session.ip || '-'}</td>
                <td className="px-4 py-3 text-surface-500">{new Date(session.lastActiveAt).toLocaleString('zh-CN')}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {session.isCurrent ? (
                      <span className="rounded-full bg-semantic-info-light px-2 py-0.5 text-xs text-brand-600">当前设备</span>
                    ) : null}
                    {session.isActive ? (
                      <span className="rounded-full bg-semantic-success-light px-2 py-0.5 text-xs text-semantic-success-dark">在线</span>
                    ) : (
                      <span className="rounded-full bg-surface-100 px-2 py-0.5 text-xs text-surface-400">已失效</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    disabled={session.isCurrent || !session.isActive}
                    onClick={() => revoke(session.id)}
                    className="rounded border border-surface-200 px-2.5 py-1 text-xs text-surface-500 hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    移除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
