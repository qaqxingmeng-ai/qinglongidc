'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';

interface Ticket {
  id: string;
  ticketNo: string;
  type: string;
  subject: string;
  status: string;
  createdAt: string;
  user: { name: string };
}

interface AgentUserOption {
  id: string;
  name: string;
  email: string;
}

interface ServerOption {
  id: string;
  userId: string;
  productId: string;
  product?: { name?: string } | null;
}

interface AgentOrderOption {
  id: string;
  userId: string;
  orderNo: string;
  totalPrice: number;
}

export default function AgentTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [users, setUsers] = useState<AgentUserOption[]>([]);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [orders, setOrders] = useState<AgentOrderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState('');
  const [form, setForm] = useState({
    type: 'PRESALE',
    category: 'GENERAL',
    subject: '',
    content: '',
    userId: '',
    orderId: '',
  });

  useEffect(() => {
    Promise.all([
      apiFetch('/api/tickets', { method: 'GET' }).then((r) => r.json()),
      apiFetch('/api/agent/users', { method: 'GET' }).then((r) => r.json()),
      apiFetch('/api/servers', { method: 'GET' }).then((r) => r.json()),
      apiFetch('/api/agent/orders', { method: 'GET' }).then((r) => r.json()),
    ])
      .then(([ticketJson, usersJson, serversJson, ordersJson]) => {
        if (ticketJson.success) setTickets(ticketJson.data);
        if (usersJson.success) setUsers(usersJson.data?.users || []);
        if (serversJson.success) {
          const normalized = (serversJson.data || []).map((server: Record<string, unknown>) => ({
            id: String(server.id),
            userId: String(server.userId),
            productId: String(server.productId),
            product: (server.product as ServerOption['product']) ?? null,
          }));
          setServers(normalized);
        }
        if (ordersJson.success) {
          const normalizedOrders = (ordersJson.data?.orders || []).map((order: Record<string, unknown>) => ({
            id: String(order.id ?? ''),
            userId: String((order.user as { id?: unknown } | undefined)?.id ?? order.userId ?? ''),
            orderNo: String(order.orderNo ?? ''),
            totalPrice: Number(order.totalPrice ?? 0),
          }));
          setOrders(normalizedOrders);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setSelectedServerId('');
    setForm((prev) => ({ ...prev, orderId: '' }));
  }, [form.userId, form.category]);

  const createTicket = async () => {
    if (!form.subject.trim() || !form.content.trim()) return;
    if (form.type === 'AFTERSALE' && !selectedServerId) return;
    if (form.type === 'FINANCE' && !form.orderId) return;

    const body: {
      type: string;
      category: string;
      subject: string;
      content: string;
      onBehalfUserId?: string;
      relatedProductIds?: string[];
      orderId?: string;
    } = {
      type: form.type,
      category: form.category,
      subject: form.subject,
      content: form.content,
    };
    if (form.userId) body.onBehalfUserId = form.userId;
    if (selectedServerId) {
      const server = servers.find((item) => item.id === selectedServerId);
      if (server) body.relatedProductIds = [server.productId];
    }
    if (form.type === 'FINANCE' && form.orderId) body.orderId = form.orderId;

    const res = await apiFetch('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.success) {
      setShowNew(false);
      setSelectedServerId('');
      setForm({ type: 'PRESALE', category: 'GENERAL', subject: '', content: '', userId: '', orderId: '' });
      window.location.reload();
    }
  };

  const filteredServers = form.userId ? servers.filter((item) => item.userId === form.userId) : servers;
  const filteredOrders = form.userId ? orders.filter((item) => item.userId === form.userId) : orders;
  const submitDisabled =
    !form.subject.trim() ||
    !form.content.trim() ||
    (form.type === 'AFTERSALE' && !selectedServerId) ||
    (form.type === 'FINANCE' && !form.orderId);

  const typeMap: Record<string, string> = { PRESALE: '售前', AFTERSALE: '售后', FINANCE: '财务' };
  const statusMap: Record<string, { label: string; cls: string }> = {
    OPEN: { label: '待回复', cls: 'badge-yellow' },
    PROCESSING: { label: '处理中', cls: 'badge-green' },
    RESOLVED: { label: '已解决', cls: 'text-surface-400 bg-surface-100 px-2 py-0.5 rounded text-xs' },
    CLOSED: { label: '已关闭', cls: 'text-surface-400 bg-surface-100 px-2 py-0.5 rounded text-xs' },
  };

  if (loading) return <div className="text-surface-400 py-20 text-center">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="section-title">用户工单</h1>
        <button onClick={() => setShowNew(!showNew)} className="btn-primary btn-sm">代用户提交</button>
      </div>

      {showNew && (
        <div className="card mb-6 animate-fade-in-up">
          <h3 className="font-medium text-surface-600 mb-4">代提工单</h3>
          <div className="space-y-4">
            <div>
              <label className="label">目标下级用户</label>
              <select className="input" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                <option value="">请选择下级用户（留空则以自己名义提交）</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">类型</label>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="PRESALE">售前咨询</option>
                <option value="AFTERSALE">售后支持</option>
                <option value="FINANCE">财务问题</option>
              </select>
            </div>
            <div>
              <label className="label">分类</label>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="GENERAL">常规咨询</option>
                <option value="TECHNICAL">技术支持</option>
                <option value="BILLING">账单/发票</option>
              </select>
            </div>
            {form.type === 'AFTERSALE' && (
              <div>
                <label className="label">关联产品（必选）</label>
                <select
                  className="input"
                  value={selectedServerId}
                  onChange={(e) => setSelectedServerId(e.target.value)}
                  disabled={!form.userId}
                >
                  <option value="">{form.userId ? '请选择下级用户的服务器产品' : '请先选择下级用户'}</option>
                  {filteredServers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {(server.product?.name || '未命名产品') + ' · ' + server.productId}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {form.type === 'FINANCE' && (
              <div>
                <label className="label">关联账单（必选）</label>
                <select
                  className="input"
                  value={form.orderId}
                  onChange={(e) => setForm({ ...form, orderId: e.target.value })}
                  disabled={!!form.userId && filteredOrders.length === 0}
                >
                  <option value="">{form.userId ? '请选择下级用户订单' : '请选择订单'}</option>
                  {filteredOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.orderNo} · ¥{order.totalPrice.toFixed(2)}
                    </option>
                  ))}
                </select>
                {filteredOrders.length === 0 && (
                  <p className="mt-1 text-xs text-surface-400">当前范围暂无可选订单，请先确认用户下是否存在已创建订单。</p>
                )}
              </div>
            )}
            <div>
              <label className="label">主题</label>
              <input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div>
              <label className="label">内容</label>
              <textarea className="input min-h-[100px]" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button onClick={createTicket} className="btn-primary btn-sm" disabled={submitDisabled}>提交</button>
              <button onClick={() => setShowNew(false)} className="btn-secondary btn-sm">取消</button>
            </div>
          </div>
        </div>
      )}

      {tickets.length === 0 ? (
        <div className="text-center py-20 text-surface-400">暂无工单</div>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => {
            const status = statusMap[t.status] || { label: t.status, cls: '' };
            return (
              <Link key={t.id} href={`/agent/tickets/${t.id}`} className="card-hover flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-surface-400 font-mono">{t.ticketNo}</span>
                  <span className="badge-blue text-[10px]">{typeMap[t.type] || t.type}</span>
                  <span className="text-sm text-surface-600">{t.subject}</span>
                  <span className="text-xs text-surface-400">{t.user?.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={status.cls}>{status.label}</span>
                  <span className="text-xs text-surface-400">{new Date(t.createdAt).toLocaleDateString()}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
