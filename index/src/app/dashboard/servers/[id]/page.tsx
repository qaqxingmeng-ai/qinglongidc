'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { apiFetch, extractApiError } from '@/lib/api-client';

interface ServerDetail {
  id: string;
  ip?: string;
  hostname?: string;
  status: string;
  autoRenew: boolean;
  userNote?: string;
  startDate?: string;
  expireDate?: string;
  createdAt: string;
  product: {
    name: string;
    region: string;
    category: string;
    memory: string;
    storage: string;
    bandwidth: string;
    cpuDisplay: string;
    protectionLabel: string;
  };
}

export default function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [server, setServer] = useState<ServerDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/dashboard/servers/${id}`, { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) {
          setError(extractApiError(json.error, '实例加载失败'));
          setLoading(false);
          return;
        }
        setServer(json.data || null);
        setLoading(false);
      })
      .catch(() => {
        setError('实例加载失败');
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div className="text-center py-20 text-surface-400">加载中...</div>;
  if (error || !server) return <div className="text-center py-20 text-semantic-danger">{error || '实例不存在'}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">服务器详情</h1>
          <p className="text-xs text-surface-400 mt-1">实例 ID: {server.id}</p>
        </div>
        <Link href="/dashboard/servers" className="btn-secondary btn-sm">返回列表</Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card md:col-span-2">
          <h2 className="font-semibold text-surface-600 mb-3">实例信息</h2>
          <div className="grid gap-3 md:grid-cols-2 text-sm text-surface-500">
            <p>状态: {server.status}</p>
            <p>IP: {server.ip || '-'}</p>
            <p>主机名: {server.hostname || '-'}</p>
            <p>自动续费: {server.autoRenew ? '已开启' : '未开启'}</p>
            <p>开通时间: {server.startDate ? new Date(server.startDate).toLocaleString() : '-'}</p>
            <p>到期时间: {server.expireDate ? new Date(server.expireDate).toLocaleString() : '-'}</p>
            <p>创建时间: {new Date(server.createdAt).toLocaleString()}</p>
          </div>
          {server.userNote && (
            <div className="mt-3 rounded-lg bg-surface-50 border border-surface-100 px-3 py-2 text-sm text-surface-500">
              备注: {server.userNote}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold text-surface-600 mb-3">产品配置</h2>
          <div className="space-y-2 text-sm text-surface-500">
            <p>产品: {server.product.name}</p>
            <p>地区: {server.product.region}</p>
            <p>类别: {server.product.category}</p>
            <p>CPU: {server.product.cpuDisplay || '-'}</p>
            <p>内存: {server.product.memory || '-'}</p>
            <p>存储: {server.product.storage || '-'}</p>
            <p>带宽: {server.product.bandwidth || '-'}</p>
            <p>防护: {server.product.protectionLabel || '-'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
