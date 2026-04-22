'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

interface Ticket {
  id: string;
  ticketNo: string;
  type: string;
  category: string | null;
  subject: string;
  status: string;
  createdAt: string;
  order?: { id: string; orderNo: string; status: string } | null;
}

interface TicketServerOption {
  id: string;
  ip: string | null;
  product?: { name?: string | null } | null;
}

interface TicketOrderOption {
  id: string;
  orderNo: string;
  totalPrice: number;
}

export default function TicketsPage() {
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ type: 'PRESALE', category: 'GENERAL', subject: '', content: '', orderId: '' });
  const [servers, setServers] = useState<{ id: string; name: string; ip: string | null }[]>([]);
  const [orders, setOrders] = useState<{ id: string; orderNo: string; totalPrice: number }[]>([]);
  const [selectedServerId, setSelectedServerId] = useState('');

  useEffect(() => {
    fetchTickets();
    apiFetch('/api/servers', { method: 'GET' }).then(r => r.json()).then(json => {
      if (json.success) {
        const payload = json.data ?? {};
        const serverList: TicketServerOption[] = Array.isArray(payload.servers) ? payload.servers : Array.isArray(payload) ? payload : [];
        setServers(serverList.map((s) => ({ id: s.id, name: s.product?.name || s.id, ip: s.ip })));
      }
    });
    apiFetch('/api/orders', { method: 'GET' }).then(r => r.json()).then(json => {
      if (json.success) {
        const payload = json.data ?? {};
        const orderList: TicketOrderOption[] = Array.isArray(payload.orders) ? payload.orders : Array.isArray(payload) ? payload : [];
        setOrders(orderList.map((o) => ({ id: o.id, orderNo: o.orderNo, totalPrice: o.totalPrice })));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (searchParams.get('create') !== '1') return;

    const orderNo = searchParams.get('orderNo');
    const orderId = searchParams.get('orderId') || '';
    const type = searchParams.get('type') || 'AFTERSALE';
    const serverId = searchParams.get('serverId') || '';
    const serverName = searchParams.get('serverName') || '';
    const serverIp = searchParams.get('serverIp') || '';

    const subject = serverName
      ? `${type === 'FINANCE' ? '财务咨询' : '售后工单'}：${serverName}`
      : orderNo
        ? `订单 ${orderNo} 开通申请`
        : '新建工单';

    const content = serverName
      ? [
          `服务器：${serverName}`,
          serverIp ? `IP 地址：${serverIp}` : '',
          '需求：请协助排查并处理当前问题。',
        ].filter(Boolean).join('\n')
      : orderNo
        ? `请协助处理订单 ${orderNo} 的开通事宜。`
        : '';

    setShowNew(true);
    setForm({
      type,
      category: 'TECHNICAL',
      subject,
      content,
      orderId,
    });
    setSelectedServerId(serverId);
  }, [searchParams]);

  const fetchTickets = () => {
    apiFetch('/api/tickets', { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const payload = json.data ?? {};
          const ticketList = Array.isArray(payload.tickets) ? payload.tickets : Array.isArray(payload) ? payload : [];
          setTickets(ticketList);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const createTicket = async () => {
    if (!form.subject.trim() || !form.content.trim()) return;
    if (form.type === 'AFTERSALE' && !selectedServerId && servers.length > 0) return;
    if (form.type === 'FINANCE' && !form.orderId && orders.length > 0) return;
    const payload: {
      type: string;
      category: string;
      subject: string;
      content: string;
      orderId: string;
      relatedProductIds?: string[];
    } = { ...form };
    if (selectedServerId) payload.relatedProductIds = [selectedServerId];
    const res = await apiFetch('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.success) {
      setShowNew(false);
      setForm({ type: 'PRESALE', category: 'GENERAL', subject: '', content: '', orderId: '' });
      setSelectedServerId('');
      fetchTickets();
    }
  };

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
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="section-title">工单中心</h1>
        <button onClick={() => setShowNew(!showNew)} className="btn-primary btn-sm w-full justify-center sm:w-auto">
          新建工单
        </button>
      </div>

      {showNew && (
        <div className="card mb-6 animate-fade-in-up">
          <h3 className="font-medium text-surface-600 mb-4">新建工单</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">分类</label>
                <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="GENERAL">常规咨询</option>
                  <option value="TECHNICAL">技术支持</option>
                  <option value="BILLING">账单/发票</option>
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
            </div>
            {form.type === 'AFTERSALE' && servers.length > 0 && (
              <div>
                <label className="label">关联产品（必选）</label>
                <select className="input" value={selectedServerId} onChange={(e) => setSelectedServerId(e.target.value)}>
                  <option value="">请选择服务器</option>
                  {servers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.ip ? ` (${s.ip})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
            {form.type === 'FINANCE' && orders.length > 0 && (
              <div>
                <label className="label">关联账单（必选）</label>
                <select className="input" value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })}>
                  <option value="">请选择订单</option>
                  {orders.map(o => (
                    <option key={o.id} value={o.id}>{o.orderNo} ({o.totalPrice} 元)</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="label">主题</label>
              <input className="input" placeholder="简要描述" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div>
              <label className="label">详细内容</label>
              <textarea className="input min-h-[100px]" placeholder="详细描述你的需求" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            </div>
            {form.orderId && (
              <div className="text-xs text-surface-400">
                当前工单已绑定订单，提交后管理员可直接在后台看到对应订单信息。
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button onClick={createTicket} className="btn-primary btn-sm w-full justify-center sm:w-auto">提交</button>
              <button onClick={() => {
                setShowNew(false);
                setForm({ type: 'PRESALE', category: 'GENERAL', subject: '', content: '', orderId: '' });
              }} className="btn-secondary btn-sm w-full justify-center sm:w-auto">取消</button>
            </div>
          </div>
        </div>
      )}

      {tickets.length === 0 ? (
        <div className="text-center py-20 text-surface-400">暂无工单</div>
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {tickets.map((t) => {
              const status = statusMap[t.status] || { label: t.status, cls: '' };
              return (
                <Link key={t.id} href={`/dashboard/tickets/${t.id}`} className="block rounded-8 border border-surface-100 bg-white p-4 shadow-card transition hover:border-blue-100 hover:bg-semantic-info-light/20">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] text-surface-400">{t.ticketNo}</p>
                      <p className="mt-1 text-sm font-semibold text-surface-600">{t.subject}</p>
                    </div>
                    <span className={status.cls}>{status.label}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                    {t.category && <span className="rounded bg-surface-50 px-1.5 py-0.5 text-surface-400">{t.category}</span>}
                    <span className="badge-blue text-[10px]">{typeMap[t.type] || t.type}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-surface-400">
                    <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                    {t.order?.orderNo && <span>关联订单 {t.order.orderNo}</span>}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="hidden space-y-2 sm:block">
            {tickets.map((t) => {
              const status = statusMap[t.status] || { label: t.status, cls: '' };
              return (
                <Link key={t.id} href={`/dashboard/tickets/${t.id}`} className="card-hover flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-surface-400 font-mono">{t.ticketNo}</span>
                    {t.category && <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-50 text-surface-400">{t.category}</span>}
                    <span className="badge-blue text-[10px]">{typeMap[t.type] || t.type}</span>
                    <span className="text-sm text-surface-600">{t.subject}</span>
                    {t.order?.orderNo && <span className="text-xs text-surface-400">关联订单 {t.order.orderNo}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={status.cls}>{status.label}</span>
                    <span className="text-xs text-surface-400">{new Date(t.createdAt).toLocaleDateString()}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
