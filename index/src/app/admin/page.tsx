'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { apiFetch } from '@/lib/api-client';
import { normalizeAdminDashboardData, type AdminDashboardData } from '@/lib/admin-dashboard';
import { CountUp, easeOut, staggerContainer, kpiItem } from '@/components/admin/motion';
import {
  PageHeader,
  Panel,
  EmptyState,
  SkeletonKpi,
  Skeleton,
  StatusBadge,
} from '@/components/admin/layout';

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: '待处理', PROCESSING: '处理中', ACTIVE: '服务中', COMPLETED: '已完成', CANCELLED: '已取消',
};
const TICKET_STATUS_LABEL: Record<string, string> = {
  OPEN: '待回复', PROCESSING: '处理中', RESOLVED: '已解决', CLOSED: '已关闭',
};

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = async (soft = false) => {
    if (soft) setRefreshing(true);
    try {
      const r = await apiFetch('/api/admin/dashboard', { method: 'GET' });
      const json = await r.json();
      if (json.success) {
        setData(normalizeAdminDashboardData(json.data));
        setErr(null);
        setLastUpdated(new Date());
      } else {
        setErr(json.error?.message || '数据加载失败');
      }
    } catch {
      setErr('网络错误');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => load(true), 30000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  if (loading) return <DashboardSkeleton />;

  if (err || !data) {
    return (
      <div className="space-y-5">
        <PageHeader title="仪表盘" subtitle="关键业务指标与待处理事项一览" />
        <Panel>
          <EmptyState
            title={err || '数据加载失败'}
            description="请检查网络或刷新页面重试"
            action={
              <button
                onClick={() => location.reload()}
                className="rounded-6 border border-surface-200 bg-white px-3 py-1.5 text-[12px] font-medium text-surface-600 transition-colors hover:border-brand-500 hover:text-brand-500"
              >
                刷新页面
              </button>
            }
          />
        </Panel>
      </div>
    );
  }

  const pendingOrders = data.orderStatusBuckets.find((b) => b.status === 'PENDING')?.count ?? 0;
  const orderTotal = data.orderStatusBuckets.reduce((s, b) => s + b.count, 0);
  const ticketTotal = data.ticketStatusBuckets.reduce((s, b) => s + b.count, 0);

  const kpis = [
    {
      key: 'users',
      label: '用户总量',
      value: data.summary.totalUsers,
      sub: `${data.summary.totalAgents} 个渠道代理`,
      trend: null as 'warn' | null,
      iconPath: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8z',
      tone: 'info' as const,
      href: '/admin/users',
    },
    {
      key: 'orders',
      label: '订单总量',
      value: data.summary.totalOrders,
      sub: `${pendingOrders} 笔待处理`,
      trend: (pendingOrders > 0 ? 'warn' : null) as 'warn' | null,
      iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
      tone: (pendingOrders > 0 ? 'warning' : 'info') as 'info' | 'warning',
      href: pendingOrders > 0 ? '/admin/orders?status=PENDING' : '/admin/orders',
    },
    {
      key: 'servers',
      label: '服务器实例',
      value: data.summary.totalServers,
      sub: `${data.summary.pendingServers} 台待交付`,
      trend: (data.summary.pendingServers > 0 ? 'warn' : null) as 'warn' | null,
      iconPath: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2',
      tone: (data.summary.pendingServers > 0 ? 'warning' : 'info') as 'info' | 'warning',
      href: data.summary.pendingServers > 0 ? '/admin/servers?status=PENDING' : '/admin/servers',
    },
    {
      key: 'tickets',
      label: '未关闭工单',
      value: data.summary.openTickets,
      sub: `商品 ${data.summary.totalProducts} 个在售`,
      trend: (data.summary.openTickets > 0 ? 'warn' : null) as 'warn' | null,
      iconPath: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
      tone: (data.summary.openTickets > 0 ? 'warning' : 'info') as 'info' | 'warning',
      href: data.summary.openTickets > 0 ? '/admin/tickets?status=OPEN' : '/admin/tickets',
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="仪表盘"
        subtitle="关键业务指标与待处理事项一览"
        meta={
          (pendingOrders > 0 || data.summary.openTickets > 0 || data.summary.pendingServers > 0) ? (
            <>
              {pendingOrders > 0 && (
                <AlertPill href="/admin/orders?status=PENDING" label="待处理订单" value={pendingOrders} variant="danger" />
              )}
              {data.summary.openTickets > 0 && (
                <AlertPill href="/admin/tickets?status=OPEN" label="未关闭工单" value={data.summary.openTickets} variant="warning" />
              )}
              {data.summary.pendingServers > 0 && (
                <AlertPill href="/admin/servers?status=PENDING" label="待交付实例" value={data.summary.pendingServers} variant="warning" />
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-6 bg-semantic-success-light px-2 py-1 text-[11px] font-medium text-semantic-success-dark">
              <span className="h-1.5 w-1.5 rounded-full bg-semantic-success" />
              当前无待处理事项
            </span>
          )
        }
        actions={
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-surface-400 tabular-nums">
                <span className={`h-1.5 w-1.5 rounded-full ${refreshing ? 'bg-brand-500 animate-pulse' : 'bg-semantic-success'}`} />
                更新于 {lastUpdated.toLocaleTimeString('zh-CN', { hour12: false })}
              </span>
            )}
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className={`flex h-8 items-center gap-1.5 rounded-6 border px-3 text-[12px] font-medium transition-colors ${
                autoRefresh
                  ? 'border-brand-500 bg-brand-50 text-brand-600'
                  : 'border-surface-200 bg-white text-surface-500 hover:border-brand-500 hover:text-brand-500'
              }`}
              title="每 30 秒自动刷新"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? 'bg-brand-500 animate-pulse' : 'bg-surface-300'}`} />
              自动
            </button>
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="flex h-8 items-center gap-1.5 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500 disabled:opacity-60"
            >
              <svg
                className={`h-3.5 w-3.5 transition-transform duration-500 ${refreshing ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {refreshing ? '刷新中' : '刷新'}
            </button>
          </div>
        }
      />

      <motion.div
        variants={staggerContainer(0.06)}
        initial="initial"
        animate="animate"
        className="grid grid-cols-2 gap-4 xl:grid-cols-4"
      >
        {kpis.map((k) => {
          const { key, ...kpiProps } = k;
          return (
            <motion.div key={key} variants={kpiItem}>
              <KpiCard {...kpiProps} />
            </motion.div>
          );
        })}
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel
          className="h-full"
          title="订单状态"
          description={`合计 ${orderTotal.toLocaleString()} 笔`}
          icon={<IconSvg d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />}
          actions={
            <Link href="/admin/orders" className="text-[12px] text-surface-400 transition-colors hover:text-brand-500">
              详情 →
            </Link>
          }
        >
          {data.orderStatusBuckets.length === 0 ? (
            <EmptyState compact />
          ) : (
            <div className="space-y-1">
              {data.orderStatusBuckets.map((item, i) => (
                <StatusBarRow
                  key={item.status}
                  label={ORDER_STATUS_LABEL[item.status] || item.status}
                  count={item.count}
                  pct={orderTotal > 0 ? (item.count / orderTotal) * 100 : 0}
                  accent={item.status === 'PENDING'}
                  delay={i * 0.04}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          className="h-full"
          title="工单状态"
          description={`合计 ${ticketTotal.toLocaleString()} 条`}
          icon={<IconSvg d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />}
          actions={
            <Link href="/admin/tickets" className="text-[12px] text-surface-400 transition-colors hover:text-brand-500">
              详情 →
            </Link>
          }
        >
          {data.ticketStatusBuckets.length === 0 ? (
            <EmptyState compact />
          ) : (
            <div className="space-y-1">
              {data.ticketStatusBuckets.map((item, i) => (
                <StatusBarRow
                  key={item.status}
                  label={TICKET_STATUS_LABEL[item.status] || item.status}
                  count={item.count}
                  pct={ticketTotal > 0 ? (item.count / ticketTotal) * 100 : 0}
                  accent={item.status === 'OPEN'}
                  delay={i * 0.04}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          className="h-full"
          title="AI 转化"
          icon={<IconSvg d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-8 bg-surface-50 px-4 py-3 text-center">
              <p className="text-[22px] font-semibold leading-none tracking-tight text-surface-600 tabular-nums">
                <CountUp value={data.summary.aiSessionCount} />
              </p>
              <p className="mt-1.5 text-[11px] text-surface-400">会话总量</p>
            </div>
            <div className="rounded-8 bg-semantic-info-light px-4 py-3 text-center">
              <p className="text-[22px] font-semibold leading-none tracking-tight text-brand-500 tabular-nums">
                {data.summary.aiConversionRate}
              </p>
              <p className="mt-1.5 text-[11px] text-brand-500/70">转化率</p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel
          className="h-full lg:col-span-2"
          title="最近订单"
          icon={<IconSvg d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />}
          actions={
            <Link href="/admin/orders" className="text-[12px] text-surface-400 transition-colors hover:text-brand-500">
              查看全部 →
            </Link>
          }
          noPadding
        >
          {data.recentOrders.length === 0 ? (
            <div className="px-5 py-4">
              <EmptyState compact />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
                  <th className="py-2.5 pl-5 pr-4 font-medium">订单号</th>
                  <th className="py-2.5 pr-4 font-medium">用户</th>
                  <th className="py-2.5 pr-4 font-medium">状态</th>
                  <th className="py-2.5 pr-4 text-right font-medium">金额</th>
                  <th className="py-2.5 pr-5 text-right font-medium">时间</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((order, i) => (
                  <motion.tr
                    key={order.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...easeOut, delay: 0.15 + i * 0.03 }}
                    className="border-b border-surface-50 transition-colors last:border-b-0 hover:bg-surface-50/60"
                  >
                    <td className="py-3 pl-5 pr-4 font-mono text-xs text-surface-500">{order.orderNo}</td>
                    <td className="py-3 pr-4 text-surface-600">{order.user.name}</td>
                    <td className="py-3 pr-4"><StatusBadge status={order.status} /></td>
                    <td className="py-3 pr-4 text-right font-medium tabular-nums text-surface-600">¥{order.totalPrice.toFixed(0)}</td>
                    <td className="py-3 pr-5 text-right text-xs text-surface-400">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel
          className="h-full"
          title="到期提醒"
          icon={<IconSvg d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />}
          badge={data.expiringServers.length > 0 ? (
            <span className="rounded-4 bg-semantic-danger-light px-1.5 py-0.5 text-[10px] font-medium text-semantic-danger">
              {data.expiringServers.length}
            </span>
          ) : undefined}
          actions={
            <Link href="/admin/servers" className="text-[12px] text-surface-400 transition-colors hover:text-brand-500">
              全部 →
            </Link>
          }
        >
          {data.expiringServers.length === 0 ? (
            <EmptyState compact title="暂无即将到期的服务器" />
          ) : (
            <div className="space-y-1">
              {data.expiringServers.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...easeOut, delay: 0.1 + i * 0.03 }}
                  className="flex items-center justify-between gap-3 rounded-6 px-3 py-2.5 transition-colors hover:bg-surface-50/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-surface-600">{s.product?.name || '-'}</p>
                    <p className="mt-0.5 text-[11px] text-surface-400">
                      {s.user.name} · {s.ip || '无 IP'}
                    </p>
                  </div>
                  {s.daysUntilExpire !== null && (
                    <span className={`shrink-0 rounded-4 px-2 py-0.5 text-[11px] font-medium ${s.daysUntilExpire <= 3 ? 'bg-semantic-danger-light text-semantic-danger' : 'bg-semantic-warning-light text-semantic-warning-dark'}`}>
                      {s.daysUntilExpire >= 0 ? `${s.daysUntilExpire}天` : '已过期'}
                    </span>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel
          className="h-full"
          title="代理排行"
          icon={<IconSvg d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />}
          actions={
            <Link href="/admin/agent-commission" className="text-[12px] text-surface-400 transition-colors hover:text-brand-500">
              详情 →
            </Link>
          }
          noPadding
        >
          {data.agentLeaderboard.length === 0 ? (
            <div className="px-5 py-4"><EmptyState compact title="暂无代理数据" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
                  <th className="py-2.5 pl-5 pr-4 font-medium">#</th>
                  <th className="py-2.5 pr-4 font-medium">代理</th>
                  <th className="py-2.5 pr-5 text-right font-medium">营收</th>
                </tr>
              </thead>
              <tbody>
                {data.agentLeaderboard.map((agent, i) => (
                  <tr key={agent.id} className="border-b border-surface-50 transition-colors last:border-b-0 hover:bg-surface-50/60">
                    <td className="py-3 pl-5 pr-4"><RankBadge rank={i + 1} /></td>
                    <td className="py-3 pr-4">
                      <div className="font-medium text-surface-600">{agent.name}</div>
                      <div className="mt-0.5 text-[11px] text-surface-400 tabular-nums">下级 {agent.subUserCount} · 订单 {agent.totalOrders}</div>
                    </td>
                    <td className="py-3 pr-5 text-right font-medium tabular-nums text-surface-600">
                      ¥{agent.totalRevenue.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel
          className="h-full"
          title="热门商品"
          icon={<IconSvg d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />}
          actions={
            <Link href="/admin/products" className="text-[12px] text-surface-400 transition-colors hover:text-brand-500">
              详情 →
            </Link>
          }
          noPadding
        >
          {data.topProducts.length === 0 ? (
            <div className="px-5 py-4"><EmptyState compact /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
                  <th className="py-2.5 pl-5 pr-4 font-medium">#</th>
                  <th className="py-2.5 pr-4 font-medium">商品</th>
                  <th className="py-2.5 pr-5 text-right font-medium">订单</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.map((p, i) => (
                  <tr key={p.id} className="border-b border-surface-50 transition-colors last:border-b-0 hover:bg-surface-50/60">
                    <td className="py-3 pl-5 pr-4"><RankBadge rank={i + 1} /></td>
                    <td className="py-3 pr-4">
                      <div className="font-medium text-surface-600 truncate">{p.name}</div>
                      <div className="mt-0.5 text-[11px] text-surface-400">{p.region} · 点击 {p.clickCount}</div>
                    </td>
                    <td className="py-3 pr-5 text-right font-medium text-surface-600 tabular-nums">{p.orderCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel
          className="h-full"
          title="最近工单"
          icon={<IconSvg d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />}
          actions={
            <Link href="/admin/tickets" className="text-[12px] text-surface-400 transition-colors hover:text-brand-500">
              全部 →
            </Link>
          }
        >
          {data.recentTickets.length === 0 ? (
            <EmptyState compact title="暂无工单" />
          ) : (
            <div className="space-y-1">
              {data.recentTickets.map((ticket, i) => (
                <motion.div
                  key={ticket.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...easeOut, delay: 0.1 + i * 0.03 }}
                  className="flex items-center justify-between gap-3 rounded-6 px-3 py-2.5 transition-colors hover:bg-surface-50/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-surface-600">{ticket.subject}</p>
                    <p className="mt-0.5 text-[11px] text-surface-400">
                      {ticket.user?.name ?? '-'} · {ticket.ticketNo}
                    </p>
                  </div>
                  <StatusBadge status={ticket.status} />
                </motion.div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ——————————— 小组件 ——————————— */

function IconSvg({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={`h-4 w-4 ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// StatusBadge 来自共享 @/components/admin/layout

function AlertPill({
  href, label, value, variant,
}: { href: string; label: string; value: number; variant: 'danger' | 'warning' }) {
  const cls = variant === 'danger'
    ? 'bg-semantic-danger-light text-semantic-danger hover:bg-semantic-danger-light/80'
    : 'bg-semantic-warning-light text-semantic-warning-dark hover:bg-semantic-warning-light/80';
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-6 px-2.5 py-1 text-[11px] font-medium transition-colors ${cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${variant === 'danger' ? 'bg-semantic-danger' : 'bg-semantic-warning'}`} />
      {label}
      <span className="font-semibold tabular-nums">{value}</span>
    </Link>
  );
}

type KpiProps = {
  label: string;
  value: number;
  sub: string;
  iconPath: string;
  tone: 'info' | 'warning';
  trend: 'warn' | null;
  href?: string;
};

function KpiCard({ label, value, sub, iconPath, tone, trend, href }: KpiProps) {
  const isWarn = tone === 'warning';
  const inner = (
    <motion.div
      whileHover={{ y: -2, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } }}
      className="group relative h-full overflow-hidden rounded-8 border border-surface-200 bg-white p-4 shadow-card transition-all duration-200 hover:border-brand-500/40 hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] text-surface-400">{label}</p>
          <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight text-surface-600 tabular-nums">
            <CountUp value={value} />
          </p>
          <p className={`mt-2.5 flex items-center gap-1 text-[11px] ${isWarn ? 'text-semantic-warning-dark' : 'text-surface-400'}`}>
            {trend === 'warn' && (
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 12 12">
                <path d="M6 1L11 10H1L6 1z" />
              </svg>
            )}
            {sub}
          </p>
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-8 transition-colors ${isWarn ? 'bg-semantic-warning-light text-semantic-warning' : 'bg-semantic-info-light text-brand-500'}`}>
          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d={iconPath} />
          </svg>
        </div>
      </div>
      {href && (
        <span className="pointer-events-none absolute right-3 top-3 text-surface-300 opacity-0 transition-opacity group-hover:opacity-100">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </span>
      )}
    </motion.div>
  );
  return href ? (
    <Link href={href} className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-8">
      {inner}
    </Link>
  ) : inner;
}

function StatusBarRow({
  label, count, pct, accent, delay = 0,
}: { label: string; count: number; pct: number; accent?: boolean; delay?: number }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-14 shrink-0 text-[13px] text-surface-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-100">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(pct, 2)}%` }}
          transition={{ delay, duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          className={`h-full rounded-full ${accent ? 'bg-brand-500' : 'bg-surface-300'}`}
        />
      </div>
      <span className={`w-10 shrink-0 text-right text-[13px] font-medium tabular-nums ${accent ? 'text-brand-500' : 'text-surface-600'}`}>
        {count}
      </span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const isTop = rank <= 3;
  const bg = rank === 1 ? 'bg-brand-500 text-white'
    : rank === 2 ? 'bg-brand-500/80 text-white'
      : rank === 3 ? 'bg-brand-500/60 text-white'
        : 'bg-surface-100 text-surface-400';
  return (
    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium tabular-nums ${bg} ${isTop ? 'shadow-[0_1px_2px_rgba(22,93,255,0.25)]' : ''}`}>
      {rank}
    </span>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 border-b border-surface-100 pb-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <SkeletonKpi />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="space-y-5 xl:col-span-3">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-8 border border-surface-200 bg-white p-5 shadow-card">
                <Skeleton className="mb-4 h-3 w-20" />
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="my-2 h-4 w-full" />
                ))}
              </div>
            ))}
          </div>
          <div className="rounded-8 border border-surface-200 bg-white p-5 shadow-card">
            <Skeleton className="mb-4 h-3 w-24" />
            {Array.from({ length: 5 }).map((_, j) => (
              <Skeleton key={j} className="my-3 h-3 w-full" />
            ))}
          </div>
        </div>
        <div className="space-y-5 xl:col-span-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-8 border border-surface-200 bg-white p-5 shadow-card">
              <Skeleton className="mb-3 h-3 w-20" />
              <Skeleton className="my-2 h-4 w-full" />
              <Skeleton className="my-2 h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
