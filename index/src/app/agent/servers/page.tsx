'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

interface Server {
  id: string;
  name: string;
  ip: string | null;
  status: string;
  config: string;
  region: string;
  expiresAt: string | null;
  user: { name: string; email: string };
}

export default function AgentServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/servers', { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setServers(json.data);
        setLoading(false);
      });
  }, []);

  const statusMap: Record<string, { label: string; cls: string }> = {
    PENDING: { label: '待开通', cls: 'badge-yellow' },
    ACTIVE: { label: '运行中', cls: 'badge-green' },
    SUSPENDED: { label: '已暂停', cls: 'badge-red' },
    EXPIRED: { label: '已过期', cls: 'text-surface-400 bg-surface-100 px-2 py-0.5 rounded text-xs' },
  };

  if (loading) return <div className="text-surface-400 py-20 text-center">加载中...</div>;

  return (
    <div>
      <h1 className="section-title mb-6">用户服务器</h1>
      {servers.length === 0 ? (
        <div className="text-center py-20 text-surface-400">暂无服务器</div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
          <table className="table w-full min-w-[720px]">
            <thead>
              <tr>
                <th>名称</th>
                <th>用户</th>
                <th>IP</th>
                <th>地区</th>
                <th>状态</th>
                <th>到期</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => {
                const status = statusMap[s.status] || { label: s.status, cls: '' };
                return (
                  <tr key={s.id}>
                    <td className="font-medium text-surface-600">{s.name}</td>
                    <td>{s.user?.name || '-'}</td>
                    <td className="font-mono text-sm">{s.ip || '-'}</td>
                    <td>{s.region}</td>
                    <td><span className={status.cls}>{status.label}</span></td>
                    <td>{s.expiresAt ? new Date(s.expiresAt).toLocaleDateString() : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
