'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { EmptyState, PageHeader, Panel, SkeletonTable } from '@/components/admin/layout';

interface TopUser {
  userId: string;
  email: string;
  name?: string;
  totalSpent: number;
  orderCount: number;
  lastOrderAt: string;
  membershipTier?: string;
}

export default function FinanceTopUsersPage() {
  const [users, setUsers] = useState<TopUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/finance/top-users?range=${range}`);
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        const list = Array.isArray(d) ? d : (d?.users ?? d?.items ?? d?.list ?? []);
        setUsers(Array.isArray(list) ? list : []);
      }
    } catch {}
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const tierBadge = (tier?: string) => {
    if (!tier) return 'bg-surface-100 text-surface-400';
    if (tier === 'GOLD') return 'bg-amber-50 text-amber-700 border border-amber-200';
    if (tier === 'SILVER') return 'bg-slate-50 text-slate-600 border border-slate-200';
    return 'bg-blue-50 text-blue-700 border border-blue-200';
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="消费排行"
        subtitle="查看消费金额最高的用户排名。"
        actions={
          <div className="flex gap-1.5">
            {[{ key: '30d', label: '30 天' }, { key: '90d', label: '90 天' }, { key: 'all', label: '全部' }].map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`rounded-6 px-3 py-1.5 text-xs font-medium transition-colors ${range === r.key ? 'bg-brand-500 text-white' : 'bg-surface-100 text-surface-500 hover:bg-surface-200'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <SkeletonTable rows={10} columns={5} />
      ) : users.length === 0 ? (
        <EmptyState title="暂无数据" description="还没有用户消费记录。" />
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100 text-left text-xs font-medium text-surface-400 uppercase tracking-wider">
                <th className="px-4 py-3 w-10">#</th>
                <th className="px-4 py-3">用户</th>
                <th className="px-4 py-3">邮箱</th>
                <th className="px-4 py-3">会员等级</th>
                <th className="px-4 py-3 text-right">消费总额</th>
                <th className="px-4 py-3 text-right">订单数</th>
                <th className="px-4 py-3">最近下单</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.userId} className="border-b border-surface-50 hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i < 3 ? 'bg-brand-50 text-brand-500' : 'bg-surface-100 text-surface-400'}`}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-surface-600">{u.name || '-'}</td>
                  <td className="px-4 py-3 text-surface-500">{u.email}</td>
                  <td className="px-4 py-3">
                    {u.membershipTier && (
                      <span className={`rounded-4 px-2 py-0.5 text-xs font-medium ${tierBadge(u.membershipTier)}`}>
                        {u.membershipTier}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-surface-600">¥{u.totalSpent.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-surface-500">{u.orderCount}</td>
                  <td className="px-4 py-3 text-xs text-surface-400">{u.lastOrderAt ? new Date(u.lastOrderAt).toLocaleDateString('zh-CN') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
