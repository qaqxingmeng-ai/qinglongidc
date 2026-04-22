'use client';

import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

interface AgentStats {
  userCount: number;
  orderCount: number;
  ticketCount: number;
  totalRevenue: number;
}

const levelLabels: Record<string, string> = {
  PARTNER: '合作商',
  VIP_TOP: '高级会员',
  VIP: '会员',
  GUEST: '普通用户',
};

export default function AgentPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<AgentStats | null>(null);

  useEffect(() => {
    apiFetch('/api/agent/stats', { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setStats(json.data);
      });
  }, []);

  const statCards = [
    { label: '客户数', value: stats?.userCount ?? '—', color: 'text-brand-500', bg: 'bg-semantic-info-light' },
    { label: '订单数', value: stats?.orderCount ?? '—', color: 'text-semantic-success', bg: 'bg-semantic-success-light' },
    { label: '未结工单', value: stats?.ticketCount ?? '—', color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: '累计营收', value: stats ? `¥${stats.totalRevenue.toLocaleString()}` : '—', color: 'text-surface-500', bg: 'bg-surface-50' },
  ];

  const quickLinks = [
    { title: '我的客户', desc: '管理下属用户', href: '/agent/users', badge: stats?.userCount ?? null },
    { title: '客户服务器', desc: '查看到期 / 状态', href: '/agent/servers', badge: null },
    { title: '客户订单', desc: '订单跟踪', href: '/agent/orders', badge: null },
    { title: '工单管理', desc: '代客户处理工单', href: '/agent/tickets', badge: stats?.ticketCount ?? null, badgeCls: 'bg-blue-100 text-brand-500' },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="section-title">渠道概览</h1>
          <p className="text-xs text-surface-400 mt-1">
            {user?.name}
            <span className="ml-2 bg-surface-100 text-surface-500 px-2 py-0.5 rounded text-[11px]">{levelLabels[user?.level ?? ''] || user?.level}</span>
            {user?.inviteCode && <span className="ml-2 font-mono text-[11px]">邀请码: {user.inviteCode}</span>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {statCards.map((item) => (
          <div key={item.label} className={`rounded-8 ${item.bg} px-4 py-3`}>
            <p className="text-[11px] text-surface-400 mb-1">{item.label}</p>
            <p className={`text-xl font-semibold ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickLinks.map((card) => (
          <Link key={card.href} href={card.href} className="card-hover group relative">
            {card.badge !== null && card.badge !== undefined && card.badge > 0 && (
              <span className={`absolute top-3 right-3 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${card.badgeCls || 'bg-surface-100 text-surface-500'}`}>
                {card.badge}
              </span>
            )}
            <h3 className="font-medium text-surface-600 mb-1">{card.title}</h3>
            <p className="text-xs text-surface-400">{card.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

