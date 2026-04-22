'use client';

import { useEffect, useState, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { PageHeader, Panel, SkeletonTable } from '@/components/admin/layout';
import { useRealtime } from '@/components/RealtimeProvider';

interface OnlineUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
  connections?: number;
}

export default function RealtimePage() {
  const { connected, onlineUsers: onlineCount } = useRealtime();
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const load = async () => {
    try {
      const res = await apiFetch('/api/admin/realtime/online-users');
      const json = await res.json();
      if (json.success) {
        setUsers(json.data?.users ?? []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 8000);
    return () => clearInterval(intervalRef.current);
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="实时监控"
        subtitle="查看当前在线用户及连接状态"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Panel className="flex flex-col items-center justify-center gap-1 py-5">
          <span className={`text-2xl font-bold ${connected ? 'text-semantic-success' : 'text-semantic-warning'}`}>
            {connected ? '已连接' : '断开'}
          </span>
          <span className="text-xs text-surface-400">WebSocket 状态</span>
        </Panel>
        <Panel className="flex flex-col items-center justify-center gap-1 py-5">
          <span className="text-2xl font-bold text-brand-500">{onlineCount}</span>
          <span className="text-xs text-surface-400">在线用户</span>
        </Panel>
        <Panel className="flex flex-col items-center justify-center gap-1 py-5">
          <span className="text-2xl font-bold text-surface-600">{users.length}</span>
          <span className="text-xs text-surface-400">活跃连接</span>
        </Panel>
      </div>

      {loading ? (
        <SkeletonTable rows={5} columns={4} />
      ) : users.length === 0 ? (
        <Panel className="py-10 text-center text-sm text-surface-400">当前没有在线用户</Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100 text-left text-xs font-medium text-surface-400 uppercase tracking-wider">
                <th className="px-4 py-3">用户</th>
                <th className="px-4 py-3">邮箱</th>
                <th className="px-4 py-3">角色</th>
                <th className="px-4 py-3 text-right">活跃连接</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-surface-50 hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-surface-600">{u.name || '-'}</td>
                  <td className="px-4 py-3 text-surface-500">{u.email}</td>
                  <td className="px-4 py-3 text-surface-400 text-xs">{u.role || '-'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-surface-500">{u.connections ?? 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
