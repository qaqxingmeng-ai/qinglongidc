'use client';

import { useState, useEffect } from 'react';
import { useFrameParams } from '@/components/admin/PageKeepAlive';
import Link from 'next/link';
import { apiFetch, extractApiError } from '@/lib/api-client';

interface UserDetail {
  id: string;
  numericId: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  level: string;
  inviteCode: string | null;
  identityCode: string | null;
  agentId: string | null;
  agentName: string | null;
  createdAt: string;
  servers: {
    id: string;
    ip: string | null;
    status: string;
    expireDate: string | null;
    productName: string | null;
  }[];
  orders: {
    id: string;
    orderNo: string;
    totalPrice: number;
    status: string;
    createdAt: string;
  }[];
  tickets: {
    id: string;
    ticketNo: string;
    subject: string;
    status: string;
    category: string | null;
    createdAt: string;
  }[];
  logs: {
    id: string;
    event: string;
    meta: string | null;
    ip: string | null;
    createdAt: string;
  }[];
  stats: {
    totalSpend: number;
    serverCount: number;
    orderCount: number;
    ticketCount: number;
  };
}

const ROLE_LABELS: Record<string, string> = { ADMIN: '管理员', AGENT: '渠道', USER: '用户' };
const LEVEL_LABELS: Record<string, string> = { PARTNER: '合作商', VIP_TOP: '高级会员', VIP: '会员', GUEST: '普通用户' };
const ORDER_STATUS: Record<string, string> = { PENDING: '待处理', PROCESSING: '处理中', COMPLETED: '已完成', CANCELLED: '已取消' };
const TICKET_STATUS: Record<string, string> = { OPEN: '待回复', PROCESSING: '已回复', RESOLVED: '已回复', CLOSED: '已关闭' };
const EVENT_LABELS: Record<string, string> = {
  LOGIN: '登录', REGISTER: '注册', SERVER_OPEN: '开通', SERVER_RENEW: '续费',
  INFO_CHANGE: '信息变更', EMAIL_CHANGE: '邮箱变更', PASSWORD_CHANGE: '密码变更',
  TICKET_CREATE: '工单', ORDER_CREATE: '订单',
};

export default function AdminUserDetailPage() {
  const params = useFrameParams<{ id: string }>();
  const userId = params.id as string;
  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'servers' | 'orders' | 'tickets' | 'logs'>('servers');
  const [profileForm, setProfileForm] = useState({ name: '', email: '', phone: '', identityCode: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    apiFetch(`/api/admin/users/${userId}`, { method: 'GET' })
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setData(json.data);
          setProfileForm({
            name: json.data.name,
            email: json.data.email,
            phone: json.data.phone || '',
            identityCode: json.data.identityCode || '',
          });
        }
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileMessage(null);
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(profileForm),
      });
      const json = await res.json();
      if (!json.success) throw new Error(extractApiError(json.error, '保存失败'));

      setData((prev) => prev ? {
        ...prev,
        name: json.data.name,
        email: json.data.email,
        phone: json.data.phone,
        identityCode: json.data.identityCode,
        agentName: json.data.agentName,
      } : prev);
      setProfileMessage({ type: 'success', text: '基础资料已更新' });
      setTimeout(() => setProfileMessage(null), 2500);
    } catch (e) {
      setProfileMessage({ type: 'error', text: e instanceof Error ? e.message : '保存失败' });
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) return <div className="text-surface-400 py-20 text-center">加载中...</div>;
  if (!data) return <div className="text-surface-400 py-20 text-center">用户不存在</div>;

  const tabs = [
    { key: 'servers', label: '服务器', count: data.stats.serverCount },
    { key: 'orders', label: '订单', count: data.stats.orderCount },
    { key: 'tickets', label: '工单', count: data.stats.ticketCount },
    { key: 'logs', label: '操作日志', count: data.logs.length },
  ] as const;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/users" className="text-sm text-surface-400 hover:text-surface-500">&larr; 返回</Link>
        <h1 className="page-title">客户详情</h1>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-8 border border-surface-100 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl font-semibold text-surface-600">{data.name}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-semantic-info-light text-brand-600">#{data.numericId}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                data.role === 'ADMIN' ? 'bg-semantic-danger-light text-semantic-danger' :
                data.role === 'AGENT' ? 'bg-yellow-50 text-yellow-700' :
                'bg-semantic-info-light text-brand-600'
              }`}>{ROLE_LABELS[data.role] || data.role}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-surface-50 text-surface-500">{LEVEL_LABELS[data.level] || data.level}</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-surface-400">
              <span>{data.email}</span>
              {data.phone && <span>{data.phone}</span>}
              {data.identityCode && <span>身份码: {data.identityCode}</span>}
              {data.inviteCode && <span>邀请码: {data.inviteCode}</span>}
              {data.agentName && <span>渠道: {data.agentName}</span>}
            </div>
            <p className="text-xs text-surface-400 mt-2">注册于 {new Date(data.createdAt).toLocaleString()}</p>
          </div>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-lg font-semibold text-surface-600">{data.stats.serverCount}</p>
              <p className="text-[11px] text-surface-400">服务器</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-surface-600">{data.stats.orderCount}</p>
              <p className="text-[11px] text-surface-400">订单</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-surface-600">{data.stats.totalSpend.toLocaleString()}</p>
              <p className="text-[11px] text-surface-400">总消费</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-surface-600">{data.stats.ticketCount}</p>
              <p className="text-[11px] text-surface-400">工单</p>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-surface-100">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-surface-600">基础资料编辑</p>
            {profileMessage && (
              <span className={`text-xs ${profileMessage.type === 'success' ? 'text-semantic-success' : 'text-semantic-danger'}`}>
                {profileMessage.text}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">用户名</label>
              <input className="input" value={profileForm.name} onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">邮箱</label>
              <input className="input" type="email" value={profileForm.email} onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))} />
            </div>
            <div>
              <label className="label">手机号</label>
              <input className="input" value={profileForm.phone} onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="未设置可留空" />
            </div>
            <div>
              <label className="label">身份码</label>
              <input className="input" value={profileForm.identityCode} onChange={(e) => setProfileForm((prev) => ({ ...prev, identityCode: e.target.value }))} placeholder="未设置可留空" />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button onClick={saveProfile} disabled={savingProfile} className="btn-primary btn-sm disabled:opacity-50">
              {savingProfile ? '保存中...' : '保存基础资料'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              tab === t.key ? 'bg-brand-500 text-white' : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'servers' && (
        <div className="admin-page animate-fade-in-up">
          {data.servers.length === 0 ? (
            <div className="text-center py-10 text-surface-400 text-sm">暂无服务器</div>
          ) : data.servers.map(s => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3 bg-white rounded-8 border border-surface-100">
              <div>
                <span className="text-sm font-medium text-surface-600">{s.productName || '-'}</span>
                <span className="text-xs text-surface-400 ml-3">{s.ip || '未分配IP'}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-[11px] px-1.5 py-0.5 rounded ${
                  s.status === 'ACTIVE' ? 'bg-semantic-success-light text-semantic-success-dark' :
                  s.status === 'EXPIRED' ? 'bg-semantic-danger-light text-semantic-danger' :
                  'bg-yellow-50 text-yellow-700'
                }`}>{s.status}</span>
                <span className="text-xs text-surface-400">{s.expireDate ? new Date(s.expireDate).toLocaleDateString() : '-'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'orders' && (
        <div className="admin-page animate-fade-in-up">
          {data.orders.length === 0 ? (
            <div className="text-center py-10 text-surface-400 text-sm">暂无订单</div>
          ) : data.orders.map(o => (
            <div key={o.id} className="flex items-center justify-between px-4 py-3 bg-white rounded-8 border border-surface-100">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-surface-400">{o.orderNo}</span>
                <span className={`text-[11px] px-1.5 py-0.5 rounded ${
                  o.status === 'COMPLETED' ? 'bg-semantic-success-light text-semantic-success-dark' :
                  o.status === 'CANCELLED' ? 'bg-surface-50 text-surface-400' :
                  'bg-yellow-50 text-yellow-700'
                }`}>{ORDER_STATUS[o.status] || o.status}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-medium text-surface-600">{o.totalPrice.toLocaleString()}</span>
                <span className="text-xs text-surface-400">{new Date(o.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'tickets' && (
        <div className="admin-page animate-fade-in-up">
          {data.tickets.length === 0 ? (
            <div className="text-center py-10 text-surface-400 text-sm">暂无工单</div>
          ) : data.tickets.map(t => (
            <div key={t.id} className="flex items-center justify-between px-4 py-3 bg-white rounded-8 border border-surface-100">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-surface-400">{t.ticketNo}</span>
                <span className="text-sm text-surface-600">{t.subject}</span>
                {t.category && <span className="text-[11px] text-surface-400">{t.category}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[11px] px-1.5 py-0.5 rounded ${
                  t.status === 'OPEN' ? 'bg-semantic-info-light text-brand-600' :
                  t.status === 'RESOLVED' ? 'bg-semantic-success-light text-semantic-success-dark' :
                  t.status === 'CLOSED' ? 'bg-surface-50 text-surface-400' :
                  'bg-yellow-50 text-yellow-700'
                }`}>{TICKET_STATUS[t.status] || t.status}</span>
                <span className="text-xs text-surface-400">{new Date(t.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'logs' && (
        <div className="space-y-1.5">
          {data.logs.length === 0 ? (
            <div className="text-center py-10 text-surface-400 text-sm">暂无日志</div>
          ) : data.logs.map(log => {
            let metaStr = '';
            if (log.meta) {
              try { metaStr = Object.entries(JSON.parse(log.meta)).map(([k, v]) => `${k}: ${v}`).join(', '); } catch { metaStr = log.meta; }
            }
            return (
              <div key={log.id} className="flex items-center justify-between px-4 py-2.5 bg-white rounded-8 border border-surface-100">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface-100 text-surface-500">
                    {EVENT_LABELS[log.event] || log.event}
                  </span>
                  {metaStr && <span className="text-xs text-surface-400">{metaStr}</span>}
                </div>
                <div className="flex items-center gap-4">
                  {log.ip && <span className="text-xs text-surface-300 font-mono">{log.ip}</span>}
                  <span className="text-xs text-surface-400">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
