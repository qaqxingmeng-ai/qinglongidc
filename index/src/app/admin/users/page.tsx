'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  BulkActionDrawer,
  BulkActionSection,
  ModalBody,
  ModalFooter,
  ModalFrame,
  ModalHeader,
  ModalNotice,
  ModalSection,
  PageHeader,
  useToast,
} from '@/components/admin/layout';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch, extractApiError } from '@/lib/api-client';
import { buildCsv } from '@/lib/csv';
import {
  getAffiliationLabel,
  normalizeLevelForRole,
  IDENTITY_OPTIONS,
  getIdentity,
  type IdentityId,
} from '@/lib/user-role';

interface User {
  id: string;
  numericId: number;
  name: string;
  email: string;
  phone?: string | null;
  identityCode?: string | null;
  role: string;
  level: string;
  inviteCode?: string | null;
  agentId: string | null;
  agent?: { id: string; name: string } | null;
  createdAt: string;
  _count?: { subUsers: number; servers: number; orders: number };
}

interface UserDetailData {
  id: string;
  numericId: number;
  name: string;
  email: string;
  phone?: string | null;
  identityCode?: string | null;
  role: string;
  level: string;
  inviteCode?: string | null;
  agentName?: string | null;
  createdAt: string;
  stats: { totalSpend: number; serverCount: number; orderCount: number; ticketCount: number };
  servers: Array<{ id: string; ip: string | null; status: string; expireDate: string | null; productName?: string | null }>;
  orders: Array<{ id: string; orderNo: string; totalPrice: number; status: string; createdAt: string }>;
  tickets: Array<{ id: string; ticketNo: string; subject: string; status: string; category: string; createdAt: string }>;
  logs: Array<{ id: string; event: string; meta?: unknown; ip?: string | null; createdAt: string }>;
}

interface EditFormState {
  name: string;
  email: string;
  phone: string;
  identityCode: string;
  role: string;
  level: string;
  agentId: string;
  password: string;
}

type ManageSection = 'account' | 'orders' | 'servers' | 'tickets' | 'logs';

const buildEditForm = (user: Pick<User, 'name' | 'email' | 'phone' | 'identityCode' | 'role' | 'level' | 'agentId'>): EditFormState => ({
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  identityCode: user.identityCode || '',
  role: user.role,
  level: normalizeLevelForRole(user.role, user.level),
  agentId: user.role === 'USER' ? (user.agentId || '') : '',
  password: '',
});

const formatLogMeta = (meta: unknown): string => {
  if (typeof meta === 'string') return meta;
  return JSON.stringify(meta ?? {});
};

const extractUsers = (raw: unknown): User[] => {
  const normalize = (user: Record<string, unknown>): User => ({
    ...user,
    id: String(user?.id ?? ''),
    numericId: Number(user?.numericId) || 0,
    name: String(user?.name ?? ''),
    email: String(user?.email ?? ''),
    phone: typeof user?.phone === 'string' ? user.phone : null,
    identityCode: typeof user?.identityCode === 'string' ? user.identityCode : null,
    role: String(user?.role ?? 'USER'),
    level: String(user?.level ?? 'GUEST'),
    inviteCode: typeof user?.inviteCode === 'string' ? user.inviteCode : null,
    agentId: typeof user?.agentId === 'string' ? user.agentId : null,
    agent: user?.agent && typeof user.agent === 'object'
      ? {
          id: String((user.agent as { id?: unknown }).id ?? ''),
          name: String((user.agent as { name?: unknown }).name ?? ''),
        }
      : null,
    createdAt: String(user?.createdAt ?? ''),
  });

  if (Array.isArray(raw)) return raw.map((item) => normalize(item as Record<string, unknown>));
  if (raw && typeof raw === 'object') {
    const nested = (raw as { users?: unknown }).users;
    if (Array.isArray(nested)) return nested.map((item) => normalize(item as Record<string, unknown>));
  }
  return [];
};

export default function AdminUsersPage() {
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | IdentityId>('ALL');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<UserDetailData | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ManageSection>('account');
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({ name: '', email: '', phone: '', identityCode: '', role: 'USER', level: 'GUEST', agentId: '', password: '' });
  const [editSnapshot, setEditSnapshot] = useState<EditFormState | null>(null);
  const [orderDrafts, setOrderDrafts] = useState<Record<string, string>>({});
  const [serverDrafts, setServerDrafts] = useState<Record<string, string>>({});
  const [ticketDrafts, setTicketDrafts] = useState<Record<string, string>>({});
  const [itemSavingKey, setItemSavingKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', phone: '', identityCode: '', password: '', role: 'USER', level: 'GUEST', agentId: '' });
  const [creating, setCreating] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkLevel, setBulkLevel] = useState('GUEST');
  const [bulkAgentId, setBulkAgentId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  // 分配服务器弹窗
  const [assignTarget, setAssignTarget] = useState<User | null>(null);
  const [assignProducts, setAssignProducts] = useState<Array<{ id: string; name: string; region: string; category: string; status: string; allPrices?: { GUEST?: number } }>>([]);
  const [assignProductsLoading, setAssignProductsLoading] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignProductId, setAssignProductId] = useState('');
  const [assignDuration, setAssignDuration] = useState(30);
  const [assignIp, setAssignIp] = useState('');
  const [assignStatus, setAssignStatus] = useState<'ACTIVE' | 'PENDING'>('ACTIVE');
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const openAssign = (user: User) => {
    setAssignTarget(user);
    setAssignProductId('');
    setAssignSearch('');
    setAssignDuration(30);
    setAssignIp('');
    setAssignStatus('ACTIVE');
    if (assignProducts.length === 0 && !assignProductsLoading) {
      setAssignProductsLoading(true);
      apiFetch('/api/admin/products?limit=500', { method: 'GET' })
        .then((r) => r.json())
        .then((j) => {
          const d = j?.data;
          const list = Array.isArray(d) ? d : (d?.products ?? d?.items ?? []);
          setAssignProducts(Array.isArray(list) ? list : []);
        })
        .catch(() => null)
        .finally(() => setAssignProductsLoading(false));
    }
  };

  const filteredAssignProducts = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    let list = assignProducts.filter((p) => p.status === 'ACTIVE');
    if (q) {
      list = list.filter((p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.region || '').toLowerCase().includes(q),
      );
    }
    return list.slice(0, 200);
  }, [assignProducts, assignSearch]);

  const submitAssign = async () => {
    if (!assignTarget || !assignProductId) return;
    setAssignSubmitting(true);
    try {
      const today = new Date();
      const expire = new Date();
      expire.setDate(today.getDate() + assignDuration);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const res = await apiFetch('/api/admin/servers', {
        method: 'POST',
        body: JSON.stringify({
          userId: assignTarget.id,
          productId: assignProductId,
          status: assignStatus,
          startDate: fmt(today),
          expireDate: fmt(expire),
          ip: assignIp.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(extractApiError(j?.error, '分配失败'));
      }
      toast.success(`已为 ${assignTarget.name} 开通服务器`);
      // 刷新该用户的服务器计数
      apiFetch('/api/admin/users', { method: 'GET' })
        .then((r) => r.json())
        .then((j) => {
          const payload = j && typeof j === 'object' && 'data' in j ? j.data : j;
          setUsers(extractUsers(payload));
        })
        .catch(() => null);
      setAssignTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '分配失败');
    } finally {
      setAssignSubmitting(false);
    }
  };

  useEffect(() => {
    if (!message) return;
    if (editTarget) return;
    if (message.type === 'success') toast.success(message.text);
    else toast.error(message.text);
    setMessage(null);
  }, [message, editTarget, toast]);

  useEffect(() => {
    apiFetch('/api/admin/users', { method: 'GET' })
      .then((response) => response.json())
      .then((json) => {
        const payload = json && typeof json === 'object' && 'data' in json
          ? (json as { data?: unknown }).data
          : json;
        setUsers(extractUsers(payload));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const agentOptions = useMemo(() => users.filter((user) => user.role === 'AGENT'), [users]);

  const stats = useMemo(() => {
    const byIdentity: Record<string, number> = {};
    for (const u of users) {
      const id = getIdentity(u.role, u.level).id;
      byIdentity[id] = (byIdentity[id] || 0) + 1;
    }
    return {
      total: users.length,
      USER_GUEST: byIdentity.USER_GUEST || 0,
      USER_VIP: byIdentity.USER_VIP || 0,
      USER_VIP_TOP: byIdentity.USER_VIP_TOP || 0,
      AGENT: byIdentity.AGENT || 0,
      ADMIN: byIdentity.ADMIN || 0,
    };
  }, [users]);

  const filtered = useMemo(() => {
    let list = users;
    if (roleFilter !== 'ALL') {
      list = list.filter((user) => getIdentity(user.role, user.level).id === roleFilter);
    }
    if (levelFilter !== 'ALL') {
      list = list.filter((user) => user.level === levelFilter);
    }
    if (query.trim()) {
      const loweredQuery = query.trim().toLowerCase();
      list = list.filter(
        (user) =>
          (user.name || '').toLowerCase().includes(loweredQuery) ||
          (user.email || '').toLowerCase().includes(loweredQuery) ||
          (user.phone || '').toLowerCase().includes(loweredQuery) ||
          (user.identityCode || '').toLowerCase().includes(loweredQuery) ||
          String(user.numericId).includes(loweredQuery),
      );
    }
    return list;
  }, [users, query, roleFilter, levelFilter]);

  const openEdit = (user: User) => {
    const nextForm = buildEditForm(user);

    setActiveSection('account');
    setEditTarget(user);
    setEditForm(nextForm);
    setEditSnapshot(nextForm);
    setDetailLoading(true);
    setDetailData(null);
    setDetailError(null);
    apiFetch(`/api/admin/users/${user.id}`, { method: 'GET' })
      .then((response) => response.json())
      .then((json) => {
        if (!json.success) {
          throw new Error(extractApiError(json.error, '加载详情失败'));
        }
        setDetailData(json.data);
        setOrderDrafts(Object.fromEntries((json.data.orders || []).map((order: UserDetailData['orders'][number]) => [order.id, order.status])));
        setServerDrafts(Object.fromEntries((json.data.servers || []).map((server: UserDetailData['servers'][number]) => [server.id, server.status])));
        setTicketDrafts(Object.fromEntries((json.data.tickets || []).map((ticket: UserDetailData['tickets'][number]) => [ticket.id, ticket.status])));
      })
      .catch((error) => {
        setDetailError(error instanceof Error ? error.message : '加载详情失败');
      })
      .finally(() => {
        setDetailLoading(false);
      });

    setMessage(null);
  };

  const resetEditForm = () => {
    if (editSnapshot) {
      setEditForm({ ...editSnapshot, password: '' });
    }
    if (detailData) {
      setOrderDrafts(Object.fromEntries((detailData.orders || []).map((order) => [order.id, order.status])));
      setServerDrafts(Object.fromEntries((detailData.servers || []).map((server) => [server.id, server.status])));
      setTicketDrafts(Object.fromEntries((detailData.tickets || []).map((ticket) => [ticket.id, ticket.status])));
    }
    setMessage(null);
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ type: 'success', text: `${label}已复制` });
      setTimeout(() => setMessage(null), 1200);
    } catch {
      setMessage({ type: 'error', text: `复制${label}失败` });
    }
  };

  const quickGeneratePassword = () => {
    const seed = Math.random().toString(36).slice(-6);
    const generated = `Aq${Date.now().toString().slice(-4)}${seed}`;
    setEditForm((prev) => ({ ...prev, password: generated }));
  };

  const selectAllFiltered = () => {
    setSelectedUserIds(filtered.map((user) => user.id));
  };

  const clearSelection = () => {
    setSelectedUserIds([]);
  };

  const toggleUserSelected = (userId: string) => {
    setSelectedUserIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((user) => selectedUserIds.includes(user.id));

  const toggleAllFilteredSelected = () => {
    if (allFilteredSelected) {
      setSelectedUserIds((prev) => prev.filter((id) => !filtered.some((user) => user.id === id)));
      return;
    }
    const merged = new Set([...selectedUserIds, ...filtered.map((user) => user.id)]);
    setSelectedUserIds(Array.from(merged));
  };

  const applyBulkLevel = async () => {
    if (selectedUserIds.length === 0) return;
    setBulkSaving(true);
    setMessage(null);
    try {
      const response = await apiFetch('/api/admin/users/batch', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedUserIds, updates: { level: bulkLevel } }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(extractApiError(json.error, '批量更新失败'));

      const count = json.data?.count ?? selectedUserIds.length;
      // Reload list to reflect server-side changes
      apiFetch('/api/admin/users', { method: 'GET' }).then(r => r.json()).then(j => {
        if (j.success) setUsers(Array.isArray(j.data) ? j.data : (j.data?.users ?? []));
      }).catch(() => null);
      setMessage({ type: 'success', text: `已批量更新 ${count} 个用户等级` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '批量更新失败' });
    } finally {
      setBulkSaving(false);
    }
  };

  const applyBulkAgent = async () => {
    if (selectedUserIds.length === 0) return;
    setBulkSaving(true);
    setMessage(null);
    try {
      const response = await apiFetch('/api/admin/users/batch', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedUserIds, updates: { agent_id: bulkAgentId || null } }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(extractApiError(json.error, '批量更新失败'));

      const count = json.data?.count ?? selectedUserIds.length;
      apiFetch('/api/admin/users', { method: 'GET' }).then(r => r.json()).then(j => {
        if (j.success) setUsers(Array.isArray(j.data) ? j.data : (j.data?.users ?? []));
      }).catch(() => null);
      setMessage({ type: 'success', text: `已批量更新 ${count} 个用户归属` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '批量更新失败' });
    } finally {
      setBulkSaving(false);
    }
  };

  const exportFilteredCsv = () => {
    const header = ['numericId', 'name', 'email', 'role', 'level', 'agentName', 'orders', 'servers', 'createdAt'];
    const rows = filtered.map((user) => [
      user.numericId,
      user.name,
      user.email,
      user.role,
      user.level,
      user.agent?.name || '',
      user._count?.orders || 0,
      user._count?.servers || 0,
      new Date(user.createdAt).toLocaleString(),
    ]);
    const csv = buildCsv([header, ...rows]);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const updateActiveUserState = (nextUser: User) => {
    setEditTarget(nextUser);
    const nextForm = buildEditForm(nextUser);
    setEditForm(nextForm);
    setEditSnapshot(nextForm);
    setDetailData((prev) => {
      if (!prev || prev.id !== nextUser.id) return prev;
      return {
        ...prev,
        name: nextUser.name,
        email: nextUser.email,
        phone: nextUser.phone,
        identityCode: nextUser.identityCode,
        role: nextUser.role,
        level: nextUser.level,
        inviteCode: nextUser.inviteCode,
        agentName: nextUser.agent?.name || null,
      };
    });
  };

  const saveOrderStatus = async (orderId: string) => {
    const nextStatus = orderDrafts[orderId];
    if (!nextStatus) return;
    setItemSavingKey(`order:${orderId}`);
    setMessage(null);
    try {
      const response = await apiFetch('/api/admin/orders', {
        method: 'PUT',
        body: JSON.stringify({ orderId, status: nextStatus }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(extractApiError(json.error, '订单更新失败'));
      setDetailData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          orders: prev.orders.map((order) => (order.id === orderId ? { ...order, status: json.data.status } : order)),
        };
      });
      setMessage({ type: 'success', text: '订单状态已更新' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '订单更新失败' });
    } finally {
      setItemSavingKey(null);
    }
  };

  const saveServerStatus = async (serverId: string) => {
    const nextStatus = serverDrafts[serverId];
    if (!nextStatus) return;
    setItemSavingKey(`server:${serverId}`);
    setMessage(null);
    try {
      const response = await apiFetch('/api/admin/servers', {
        method: 'PUT',
        body: JSON.stringify({ id: serverId, status: nextStatus }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(extractApiError(json.error, '服务器状态更新失败'));
      setDetailData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          servers: prev.servers.map((server) => (server.id === serverId ? { ...server, status: json.data.status, expireDate: json.data.expireDate ?? server.expireDate } : server)),
        };
      });
      setMessage({ type: 'success', text: '服务器状态已更新' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '服务器状态更新失败' });
    } finally {
      setItemSavingKey(null);
    }
  };

  const saveTicketStatus = async (ticketId: string) => {
    const nextStatus = ticketDrafts[ticketId];
    if (!nextStatus) return;
    setItemSavingKey(`ticket:${ticketId}`);
    setMessage(null);
    try {
      const response = await apiFetch('/api/admin/tickets', {
        method: 'PUT',
        body: JSON.stringify({ ticketId, status: nextStatus }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(extractApiError(json.error, '工单状态更新失败'));
      setDetailData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tickets: prev.tickets.map((ticket) => (ticket.id === ticketId ? { ...ticket, status: json.data.status } : ticket)),
        };
      });
      setMessage({ type: 'success', text: '工单状态已更新' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '工单状态更新失败' });
    } finally {
      setItemSavingKey(null);
    }
  };

  const saveEdit = async () => {
    if (!editTarget) {
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const payload: { name?: string; email?: string; phone?: string | null; identityCode?: string | null; role?: string; level?: string; agentId?: string | null; password?: string } = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim() || null,
        identityCode: editForm.identityCode.trim() || null,
        role: editForm.role,
        level: editForm.role === 'ADMIN' ? undefined : editForm.level,
        agentId: editForm.role === 'USER' ? (editForm.agentId || null) : null,
      };
      if (editForm.password.trim()) {
        payload.password = editForm.password.trim();
      }

      const response = await apiFetch(`/api/admin/users/${editTarget.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!json.success) {
        throw new Error(extractApiError(json.error, '保存失败'));
      }

      const nextUser = { ...editTarget, ...json.data } as User;
      setUsers((prev) => prev.map((user) => (user.id === editTarget.id ? nextUser : user)));
      updateActiveUserState(nextUser);
      setMessage({ type: 'success', text: `${nextUser.name} 已更新` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  const createUser = async () => {
    setCreating(true);
    setMessage(null);
    try {
      const payload = {
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        phone: createForm.phone.trim() || undefined,
        identityCode: createForm.identityCode.trim() || undefined,
        password: createForm.password,
        role: createForm.role,
        level: createForm.role === 'ADMIN' ? undefined : createForm.level,
        agentId: createForm.role === 'USER' && createForm.agentId ? createForm.agentId : undefined,
      };

      const response = await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!json.success) {
        throw new Error(extractApiError(json.error, '创建失败'));
      }

      setUsers((prev) => [json.data, ...prev]);
      setShowCreate(false);
      setCreateForm({ name: '', email: '', phone: '', identityCode: '', password: '', role: 'USER', level: 'GUEST', agentId: '' });
      setMessage({ type: 'success', text: '用户已创建' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '创建失败' });
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="text-surface-400 py-20 text-center">加载中...</div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="用户管理"
        subtitle={`当前 ${filtered.length} 人，已选 ${selectedUserIds.length} 人`}
        actions={
          <>
            <button
              type="button"
              onClick={exportFilteredCsv}
              className="h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500"
            >
              导出当前列表
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(true); setMessage(null); }}
              className="h-8 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600"
            >
              新增用户
            </button>
          </>
        }
      />

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
        {([
          { key: 'ALL', label: '全部', value: stats.total, accent: 'text-surface-600' },
          { key: 'USER_GUEST', label: '普通用户', value: stats.USER_GUEST, accent: 'text-surface-600' },
          { key: 'USER_VIP', label: '会员用户', value: stats.USER_VIP, accent: 'text-brand-500' },
          { key: 'USER_VIP_TOP', label: '高级会员', value: stats.USER_VIP_TOP, accent: 'text-brand-600' },
          { key: 'AGENT', label: '渠道销售', value: stats.AGENT, accent: 'text-semantic-warning-dark' },
          { key: 'ADMIN', label: '管理员', value: stats.ADMIN, accent: 'text-semantic-danger' },
        ] as const).map((s) => {
          const active = roleFilter === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setRoleFilter(s.key as 'ALL' | IdentityId)}
              className={`group text-left rounded-8 border px-3 py-2.5 transition-all ${
                active
                  ? 'border-brand-500 bg-brand-50/50 shadow-card'
                  : 'border-surface-100 bg-white hover:border-surface-300 hover:shadow-card'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] truncate text-surface-400">{s.label}</p>
                {active && (
                  <span className="rounded-4 bg-brand-500 px-1 py-0.5 text-[9px] font-medium text-white shrink-0">已筛选</span>
                )}
              </div>
              <p className={`text-lg font-semibold mt-0.5 tabular-nums ${active ? 'text-brand-600' : s.accent}`}>{s.value}</p>
            </button>
          );
        })}
      </div>

      <div className="card mb-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-center">
          <div className="relative w-full flex-1 xl:min-w-[200px]">
            <input
              className="input w-full pr-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索用户ID / 用户名 / 邮箱 / 手机号 / 身份码"
            />
            {query && (
              <button
                type="button"
                aria-label="清除搜索"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-surface-300 hover:bg-surface-100 hover:text-surface-500"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {/* 身份筛选已合并到上方卡片，无需独立等级下拉 */}
          {(roleFilter !== 'ALL' || levelFilter !== 'ALL' || query) && (
            <button
              type="button"
              onClick={() => { setRoleFilter('ALL'); setLevelFilter('ALL'); setQuery(''); }}
              className="h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500"
            >
              清除筛选
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-surface-400 text-sm">暂无用户</div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2 rounded-8 border border-surface-100 bg-white px-4 py-3 text-sm md:hidden">
            <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFilteredSelected} />
            <span className="text-surface-500">全选当前筛选结果</span>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((user) => {
              const identity = getIdentity(user.role, user.level);
              const affiliationLabel = getAffiliationLabel(user.role, user.agent?.name || null);

              return (
                <div key={user.id} className="rounded-8 border border-surface-100 bg-white p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() => toggleUserSelected(user.id)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-surface-600">{user.name}</p>
                        <p className="mt-1 truncate text-xs text-surface-400">ID: {user.numericId} · {user.email}</p>
                        <p className="mt-1 truncate text-[11px] text-surface-400">{user.phone || '无手机号'} · {user.identityCode || '无身份码'}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <button onClick={() => openEdit(user)} className="rounded-8 bg-semantic-info-light px-3 py-2 text-xs font-medium text-brand-500">
                        管理
                      </button>
                      <button onClick={() => openAssign(user)} className="rounded-8 bg-semantic-success-light px-3 py-2 text-xs font-medium text-semantic-success-dark">
                        分配
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`inline-flex items-center rounded-4 px-2.5 py-0.5 text-[11px] font-medium ${identity.tone}`}>{identity.label}</span>
                    {user.role === 'AGENT' && user.inviteCode && <span className="text-[10px] text-semantic-warning">邀请码: {user.inviteCode}</span>}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 rounded-8 bg-surface-50 px-3 py-3 text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-surface-400">归属渠道</p>
                      <p className="mt-1 text-surface-500">{affiliationLabel}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-surface-400">注册时间</p>
                      <p className="mt-1 text-surface-500">{new Date(user.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-surface-400">订单</p>
                      <p className="mt-1 text-surface-500">{user._count?.orders || 0}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-surface-400">服务器</p>
                      <p className="mt-1 text-surface-500">{user._count?.servers || 0}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-hidden rounded-8 border border-surface-100 bg-white md:block">
            <div className="grid grid-cols-12 gap-2 border-b border-surface-100 bg-surface-50/50 px-4 py-1.5 text-[11px] font-medium text-surface-400">
              <div className="col-span-3 flex items-center gap-2">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFilteredSelected} />
                <span>用户ID / 用户名 / 邮箱</span>
              </div>
              <div className="col-span-2">身份</div>
              <div className="col-span-2">归属渠道</div>
              <div className="col-span-1 text-center">订单</div>
              <div className="col-span-1 text-center">服务器</div>
              <div className="col-span-2">注册时间</div>
              <div className="col-span-1 text-right">操作</div>
            </div>
            <div className="max-h-[62vh] overflow-y-auto">
            {filtered.map((user) => {
              const identity = getIdentity(user.role, user.level);
              const affiliationLabel = getAffiliationLabel(user.role, user.agent?.name || null);

              return (
                <div key={user.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-surface-50 last:border-b-0 hover:bg-surface-50/80 transition text-xs items-center">
                  <div className="col-span-3 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() => toggleUserSelected(user.id)}
                      />
                      <p className="font-medium text-surface-600 truncate leading-tight">{user.name}</p>
                    </div>
                    <p className="text-xs text-surface-400 mt-0.5 truncate">ID: {user.numericId} · {user.email}</p>
                    <p className="text-xs text-surface-400 mt-0.5 truncate">{user.phone || '无手机号'} · {user.identityCode || '无身份码'}</p>
                  </div>
                  <div className="col-span-2 flex flex-col gap-1">
                    <span className={`inline-flex w-fit items-center rounded-4 px-2.5 py-0.5 text-[11px] font-medium ${identity.tone}`}>{identity.label}</span>
                    {user.role === 'AGENT' && user.inviteCode && <span className="text-xs text-semantic-warning">邀请码: {user.inviteCode}</span>}
                  </div>
                  <div className="col-span-2 text-[11px] text-surface-400 truncate">{affiliationLabel}</div>
                  <div className="col-span-1 text-center text-[11px] text-surface-500"><span className="inline-flex min-w-[24px] justify-center rounded-md bg-surface-100 px-1.5 py-0.5">{user._count?.orders || 0}</span></div>
                  <div className="col-span-1 text-center text-[11px] text-surface-500"><span className="inline-flex min-w-[24px] justify-center rounded-md bg-surface-100 px-1.5 py-0.5">{user._count?.servers || 0}</span></div>
                  <div className="col-span-2 text-[11px] text-surface-400">{new Date(user.createdAt).toLocaleDateString()}</div>
                  <div className="col-span-1 text-right flex justify-end gap-1.5">
                    <button onClick={() => openAssign(user)} className="text-[11px] text-semantic-success-dark hover:text-semantic-success px-1.5 py-0.5 rounded hover:bg-semantic-success-light" title="分配服务器">分配</button>
                    <button onClick={() => openEdit(user)} className="text-[11px] text-brand-500 hover:text-brand-600 px-1.5 py-0.5 rounded hover:bg-semantic-info-light">管理</button>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </>
      )}

      {editTarget && (
        <ModalFrame
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          size="wide"
          align="center"
          className="flex h-[86vh] w-full max-w-[980px] flex-col overflow-hidden sm:h-auto sm:max-h-[80vh]"
        >
            <ModalHeader
              title="客户管理面板"
              subtitle={`#${editTarget.numericId} · ${editForm.email}`}
              onClose={() => setEditTarget(null)}
            />

            <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)]">
              <aside className="modal-rail px-2.5 py-3 overflow-y-auto">
                <div className="modal-rail-card px-3 py-3 mb-2.5">
                  <p className="text-[13px] font-semibold text-surface-600 truncate">{editForm.name || '未命名用户'}</p>
                  <p className="text-[11px] text-surface-400 mt-0.5">ID {editTarget.numericId}</p>
                  <p className="text-[11px] text-surface-400 mt-0.5 truncate">{editForm.email}</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  {[
                    { key: 'account' as ManageSection, label: '账户信息', desc: '姓名、邮箱、角色、归属' },
                    { key: 'orders' as ManageSection, label: '订单信息', desc: '订单状态可修改', count: detailData?.orders.length ?? 0 },
                    { key: 'servers' as ManageSection, label: '服务器信息', desc: '实例状态可修改', count: detailData?.servers.length ?? 0 },
                    { key: 'tickets' as ManageSection, label: '工单信息', desc: '工单状态可修改', count: detailData?.tickets.length ?? 0 },
                    { key: 'logs' as ManageSection, label: '操作日志', desc: '审计记录只读', count: detailData?.logs.length ?? 0 },
                  ].map((item) => {
                    const active = activeSection === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setActiveSection(item.key)}
                        className={`modal-rail-item ${
                          active
                            ? 'modal-rail-item-active'
                            : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-[12px] ${active ? 'font-semibold' : 'font-medium'}`}>{item.label}</p>
                          {typeof item.count === 'number' ? (
                            <span className={`text-[10px] tabular-nums ${active ? 'text-brand-500' : 'text-surface-400'}`}>{item.count}</span>
                          ) : null}
                        </div>
                        <p className={`text-[10px] mt-0.5 leading-4 ${active ? 'text-brand-500/80' : 'text-surface-400'}`}>{item.desc}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="modal-rail-card mt-2.5 px-3 py-3">
                  <p className="text-[11px] text-surface-400">累计消费</p>
                  <p className="text-[13px] text-surface-600 font-semibold mt-0.5 tabular-nums">¥{detailData?.stats.totalSpend ?? 0}</p>
                  <p className="text-[11px] text-surface-400 mt-1.5">当前身份 · {getIdentity(editForm.role, editForm.level).label}</p>
                </div>
              </aside>

                <div className="min-h-0 flex flex-col bg-[#f6f8fb]">
                <ModalBody className="flex-1 bg-[#f6f8fb] px-4 py-4">
                  <div className="mx-auto w-full max-w-[720px] space-y-3">
                    {message && (
                      <ModalNotice tone={message.type === 'success' ? 'success' : 'danger'}>
                        {message.text}
                      </ModalNotice>
                    )}
                    {detailError && <ModalNotice tone="danger">{detailError}</ModalNotice>}
                    {detailLoading && <div className="text-sm text-surface-400">加载客户信息中...</div>}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="rounded-[12px] border border-surface-200 bg-white px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-surface-400">账户标识</p>
                        <p className="mt-2 text-[15px] font-semibold text-surface-600 tabular-nums">#{editTarget.numericId}</p>
                        <p className="mt-1 text-[11px] text-surface-400 truncate">{editForm.email}</p>
                      </div>
                      <div className="rounded-[12px] border border-surface-200 bg-white px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-surface-400">当前身份</p>
                        <p className="mt-2 text-[15px] font-semibold text-surface-600">{getIdentity(editForm.role, editForm.level).label}</p>
                        <p className="mt-1 text-[11px] text-surface-400">支持按角色/等级切换</p>
                      </div>
                      <div className="rounded-[12px] border border-surface-200 bg-white px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-surface-400">业务概览</p>
                        <p className="mt-2 text-[15px] font-semibold text-surface-600 tabular-nums">¥{detailData?.stats.totalSpend ?? 0}</p>
                        <p className="mt-1 text-[11px] text-surface-400">累计消费</p>
                      </div>
                    </div>

                    {activeSection === 'account' && (
                      <>
                        <ModalSection
                          title="基础账户信息"
                          description="只保留最常用字段，降低第一次打开时的认知负担。"
                        >
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div>
                              <label className="label">用户名</label>
                              <input className="input" value={editForm.name} onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))} />
                            </div>
                            <div>
                              <label className="label">邮箱</label>
                              <input className="input" type="email" value={editForm.email} onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))} />
                            </div>
                            <div>
                              <label className="label">手机号</label>
                              <input className="input" value={editForm.phone} onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="可留空" />
                            </div>
                            <div>
                              <label className="label">身份码</label>
                              <input className="input" value={editForm.identityCode} onChange={(e) => setEditForm((prev) => ({ ...prev, identityCode: e.target.value }))} placeholder="可留空" />
                            </div>
                          </div>
                        </ModalSection>

                        <ModalSection
                          title="身份与归属"
                          description="身份切换和渠道归属独立成段，避免和基础资料混在一起。"
                          accent="soft"
                        >
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div>
                              <label className="label">身份</label>
                              <select
                                className="input"
                                value={getIdentity(editForm.role, editForm.level).id}
                                disabled={editTarget.id === currentUser?.id}
                                onChange={(e) => {
                                  const opt = IDENTITY_OPTIONS.find((o) => o.id === e.target.value);
                                  if (!opt || opt.disabled) return;
                                  setEditForm((prev) => ({ ...prev, role: opt.role, level: opt.level }));
                                }}
                              >
                                {IDENTITY_OPTIONS.map((opt) => (
                                  <option key={opt.id} value={opt.id} disabled={opt.disabled}>
                                    {opt.label}{opt.note ? `（${opt.note}）` : ''}
                                  </option>
                                ))}
                              </select>
                              {editTarget.id === currentUser?.id && <p className="text-xs text-surface-400 mt-1">不能修改自己的身份</p>}
                            </div>
                            {editForm.role === 'USER' ? (
                              <div>
                                <label className="label">归属渠道</label>
                                <select className="input" value={editForm.agentId} onChange={(e) => setEditForm((prev) => ({ ...prev, agentId: e.target.value }))}>
                                  <option value="">直客 / 无渠道</option>
                                  {agentOptions.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                                </select>
                              </div>
                            ) : (
                              <div className="rounded-[10px] border border-dashed border-surface-200 bg-white px-4 py-3 text-xs text-surface-400">
                                当前身份不需要设置归属渠道。
                              </div>
                            )}
                          </div>
                        </ModalSection>

                        <ModalSection
                          title="密码处理"
                          description="密码操作降级成辅助区块，不再占据主视觉。"
                        >
                          <div className="rounded-[12px] bg-surface-50 border border-surface-200 p-4">
                            <div className="flex items-center justify-between">
                              <label className="label mb-0">重置密码（可选）</label>
                              <button type="button" className="text-xs text-brand-500 hover:underline" onClick={quickGeneratePassword}>随机生成</button>
                            </div>
                            <input
                              className="input bg-white mt-2"
                              type="password"
                              value={editForm.password}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, password: e.target.value }))}
                              placeholder="留空则不修改密码"
                            />
                          </div>
                        </ModalSection>
                      </>
                    )}

                    {activeSection === 'orders' && (
                      <ModalSection title="订单信息管理" description="订单按工作卡片展示，状态调整和操作入口统一收口。">
                        <div className="admin-page animate-fade-in-up">
                          {(detailData?.orders || []).map((order) => {
                            const options = Array.from(new Set([order.status, 'PENDING', 'PAID', 'COMPLETED', 'CANCELLED', 'REFUNDED']));
                            return (
                              <div key={order.id} className="rounded-[12px] border border-surface-200 bg-surface-50/70 px-4 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-medium text-surface-600">{order.orderNo}</p>
                                  <button type="button" className="text-xs text-brand-500 hover:underline" onClick={() => copyText(order.orderNo, '订单号')}>复制订单号</button>
                                </div>
                                <p className="text-xs text-surface-400 mt-1">金额 ¥{order.totalPrice} · 创建于 {new Date(order.createdAt).toLocaleString()}</p>
                                <div className="flex flex-wrap items-center gap-2 mt-3">
                                  <select className="input w-[180px]" value={orderDrafts[order.id] || order.status} onChange={(e) => setOrderDrafts((prev) => ({ ...prev, [order.id]: e.target.value }))}>
                                    {options.map((status) => <option key={status} value={status}>{status}</option>)}
                                  </select>
                                  <button className="btn-primary btn-sm disabled:opacity-50" disabled={itemSavingKey === `order:${order.id}`} onClick={() => saveOrderStatus(order.id)}>
                                    {itemSavingKey === `order:${order.id}` ? '保存中...' : '保存订单状态'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {(detailData?.orders.length || 0) === 0 && !detailLoading && <p className="text-xs text-surface-400">暂无订单</p>}
                        </div>
                      </ModalSection>
                    )}

                    {activeSection === 'servers' && (
                      <ModalSection title="服务器信息管理" description="把状态修改、续期信息和实例摘要统一放进工作卡片。">
                        <div className="admin-page animate-fade-in-up">
                          {(detailData?.servers || []).map((server) => {
                            const options = Array.from(new Set([server.status, 'PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'TERMINATED']));
                            return (
                              <div key={server.id} className="rounded-[12px] border border-surface-200 bg-surface-50/70 px-4 py-3">
                                <p className="text-sm font-medium text-surface-600">{server.productName || '未命名产品'}</p>
                                <p className="text-xs text-surface-400 mt-1">IP: {server.ip || '-'} · 到期: {server.expireDate ? new Date(server.expireDate).toLocaleString() : '-'}</p>
                                <div className="flex flex-wrap items-center gap-2 mt-3">
                                  <select className="input w-[180px]" value={serverDrafts[server.id] || server.status} onChange={(e) => setServerDrafts((prev) => ({ ...prev, [server.id]: e.target.value }))}>
                                    {options.map((status) => <option key={status} value={status}>{status}</option>)}
                                  </select>
                                  <button className="btn-primary btn-sm disabled:opacity-50" disabled={itemSavingKey === `server:${server.id}`} onClick={() => saveServerStatus(server.id)}>
                                    {itemSavingKey === `server:${server.id}` ? '保存中...' : '保存服务器状态'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {(detailData?.servers.length || 0) === 0 && !detailLoading && <p className="text-xs text-surface-400">暂无服务器</p>}
                        </div>
                      </ModalSection>
                    )}

                    {activeSection === 'tickets' && (
                      <ModalSection title="工单信息管理" description="工单信息以更紧凑的工作列表方式呈现。">
                        <div className="admin-page animate-fade-in-up">
                          {(detailData?.tickets || []).map((ticket) => {
                            const options = Array.from(new Set([ticket.status, 'OPEN', 'RESOLVED', 'CLOSED']));
                            return (
                              <div key={ticket.id} className="rounded-[12px] border border-surface-200 bg-surface-50/70 px-4 py-3">
                                <p className="text-sm font-medium text-surface-600">{ticket.ticketNo}</p>
                                <p className="text-xs text-surface-400 mt-1 truncate">{ticket.subject}</p>
                                <p className="text-xs text-surface-400 mt-1">分类: {ticket.category} · 创建于 {new Date(ticket.createdAt).toLocaleString()}</p>
                                <div className="flex flex-wrap items-center gap-2 mt-3">
                                  <select className="input w-[180px]" value={ticketDrafts[ticket.id] || ticket.status} onChange={(e) => setTicketDrafts((prev) => ({ ...prev, [ticket.id]: e.target.value }))}>
                                    {options.map((status) => <option key={status} value={status}>{status}</option>)}
                                  </select>
                                  <button className="btn-primary btn-sm disabled:opacity-50" disabled={itemSavingKey === `ticket:${ticket.id}`} onClick={() => saveTicketStatus(ticket.id)}>
                                    {itemSavingKey === `ticket:${ticket.id}` ? '保存中...' : '保存工单状态'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {(detailData?.tickets.length || 0) === 0 && !detailLoading && <p className="text-xs text-surface-400">暂无工单</p>}
                        </div>
                      </ModalSection>
                    )}

                    {activeSection === 'logs' && (
                      <ModalSection title="操作日志" description="日志保持只读，但整体仍然像同一套后台工作区。">
                        <div className="admin-page animate-fade-in-up">
                          {(detailData?.logs || []).map((log) => (
                            <div key={log.id} className="rounded-[12px] border border-surface-200 bg-surface-50/75 px-4 py-3 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-medium text-surface-600">{log.event}</p>
                                <p className="text-surface-400">{new Date(log.createdAt).toLocaleString()}</p>
                              </div>
                              {log.ip ? <p className="text-surface-400 mt-1">IP: {log.ip}</p> : null}
                              {Boolean(log.meta) ? <p className="text-surface-400 mt-1 break-all">{formatLogMeta(log.meta)}</p> : null}
                            </div>
                          ))}
                          {(detailData?.logs.length || 0) === 0 && !detailLoading && <p className="text-xs text-surface-400">暂无日志</p>}
                        </div>
                      </ModalSection>
                    )}
                  </div>
                </ModalBody>

                <ModalFooter hint="重置会恢复账户和各业务模块的未保存修改。">
                  <div className="flex items-center gap-2">
                    <button onClick={resetEditForm} className="btn-secondary btn-sm">重置内容</button>
                    <button onClick={() => setEditTarget(null)} className="btn-secondary btn-sm">取消</button>
                    {activeSection === 'account' ? (
                      <button onClick={saveEdit} disabled={saving} className="btn-primary btn-sm disabled:opacity-50">
                        {saving ? '保存中...' : '保存账户信息'}
                      </button>
                    ) : (
                        <button disabled className="btn-primary btn-sm opacity-50 cursor-not-allowed">当前模块按条目单独保存</button>
                    )}
                  </div>
                </ModalFooter>
              </div>
            </div>
        </ModalFrame>
      )}

      <BulkActionDrawer
        open={selectedUserIds.length > 0 && !editTarget && !showCreate && !assignTarget}
        count={selectedUserIds.length}
        total={filtered.length}
        onClear={clearSelection}
        onSelectAll={selectAllFiltered}
      >
        <BulkActionSection label="调整会员身份">
          <select
            className="input h-8 text-xs"
            value={bulkLevel}
            onChange={(e) => setBulkLevel(e.target.value)}
          >
            <option value="PARTNER">合伙人</option>
            <option value="VIP_TOP">SVIP</option>
            <option value="VIP">VIP</option>
            <option value="GUEST">普通用户</option>
          </select>
          <button
            type="button"
            disabled={bulkSaving}
            onClick={applyBulkLevel}
            className="h-8 w-full rounded-6 bg-brand-500 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {bulkSaving ? '提交中…' : '应用等级'}
          </button>
        </BulkActionSection>

        <BulkActionSection label="变更归属渠道">
          <select
            className="input h-8 text-xs"
            value={bulkAgentId}
            onChange={(e) => setBulkAgentId(e.target.value)}
          >
            <option value="">直客 / 无渠道</option>
            {agentOptions.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
          <button
            type="button"
            disabled={bulkSaving}
            onClick={applyBulkAgent}
            className="h-8 w-full rounded-6 bg-brand-500 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {bulkSaving ? '提交中…' : '应用归属'}
          </button>
        </BulkActionSection>
      </BulkActionDrawer>

      {assignTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center px-0 sm:items-center sm:px-4 modal-overlay"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setAssignTarget(null); }}
        >
          <div className="flex h-[88vh] w-full max-w-[820px] flex-col overflow-hidden sm:h-auto sm:max-h-[88vh] modal-panel">
            <div className="flex items-center justify-between border-b border-surface-100 px-6 py-4">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-surface-600">分配服务器</p>
                <p className="mt-0.5 truncate text-xs text-surface-400">
                  目标用户: <span className="text-surface-600">{assignTarget.name}</span> · ID {assignTarget.numericId} · {assignTarget.email}
                </p>
              </div>
              <button
                onClick={() => setAssignTarget(null)}
                className="text-surface-400 hover:text-surface-600 text-xl leading-none"
                aria-label="关闭"
              >
                ×
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_280px]">
              <div className="flex min-h-0 flex-col border-b border-surface-100 sm:border-b-0 sm:border-r">
                <div className="border-b border-surface-100 px-5 py-3">
                  <div className="relative">
                    <input
                      className="input w-full pr-8"
                      placeholder="搜索商品名称 / 地区"
                      value={assignSearch}
                      onChange={(e) => setAssignSearch(e.target.value)}
                    />
                    {assignSearch && (
                      <button
                        type="button"
                        onClick={() => setAssignSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-surface-300 hover:bg-surface-100 hover:text-surface-500"
                        aria-label="清除"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-[11px] text-surface-400">
                    共 {filteredAssignProducts.length} 个上架商品{assignProductsLoading ? ' · 加载中…' : ''}
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                  {assignProductsLoading ? (
                    <div className="py-10 text-center text-sm text-surface-400">加载商品中…</div>
                  ) : filteredAssignProducts.length === 0 ? (
                    <div className="py-10 text-center text-sm text-surface-400">没有匹配的商品</div>
                  ) : (
                    <ul className="space-y-1">
                      {filteredAssignProducts.map((p) => {
                        const active = assignProductId === p.id;
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => setAssignProductId(p.id)}
                              className={`flex w-full items-start justify-between gap-3 rounded-6 border px-3 py-2.5 text-left transition-colors ${
                                active
                                  ? 'border-brand-500 bg-brand-50/60'
                                  : 'border-transparent hover:border-surface-200 hover:bg-surface-50'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className={`truncate text-[13px] font-medium ${active ? 'text-brand-600' : 'text-surface-600'}`}>{p.name}</p>
                                <p className="mt-0.5 truncate text-[11px] text-surface-400">{p.region} · {p.category}</p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className={`text-[13px] font-semibold tabular-nums ${active ? 'text-brand-600' : 'text-surface-600'}`}>
                                  ¥{Number(p.allPrices?.GUEST ?? 0).toFixed(0)}
                                </p>
                                {active && (
                                  <span className="mt-1 inline-block rounded-4 bg-brand-500 px-1.5 py-0.5 text-[9px] font-medium text-white">已选</span>
                                )}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              <div className="flex min-h-0 flex-col">
                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                  <div>
                    <label className="label">使用时长</label>
                    <div className="mt-1 grid grid-cols-3 gap-1.5">
                      {[7, 30, 60, 90, 180, 365].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setAssignDuration(d)}
                          className={`h-8 rounded-6 border text-[12px] font-medium transition-colors ${
                            assignDuration === d
                              ? 'border-brand-500 bg-brand-500 text-white'
                              : 'border-surface-200 bg-white text-surface-500 hover:border-brand-500 hover:text-brand-500'
                          }`}
                        >
                          {d === 365 ? '1年' : `${d}天`}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      className="input mt-2 w-full"
                      value={assignDuration}
                      onChange={(e) => setAssignDuration(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))}
                      placeholder="自定义天数"
                    />
                    <p className="mt-1 text-[11px] text-surface-400">
                      到期日: {(() => {
                        const d = new Date();
                        d.setDate(d.getDate() + assignDuration);
                        return d.toLocaleDateString('zh-CN');
                      })()}
                    </p>
                  </div>

                  <div>
                    <label className="label">初始状态</label>
                    <div className="mt-1 grid grid-cols-2 gap-1.5">
                      {(['ACTIVE', 'PENDING'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setAssignStatus(s)}
                          className={`h-8 rounded-6 border text-[12px] font-medium transition-colors ${
                            assignStatus === s
                              ? 'border-brand-500 bg-brand-500 text-white'
                              : 'border-surface-200 bg-white text-surface-500 hover:border-brand-500 hover:text-brand-500'
                          }`}
                        >
                          {s === 'ACTIVE' ? '直接服务中' : '待处理'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="label">IP 地址（可选）</label>
                    <input
                      className="input"
                      value={assignIp}
                      onChange={(e) => setAssignIp(e.target.value)}
                      placeholder="留空则后续填写"
                    />
                  </div>
                </div>

                <div className="border-t border-surface-100 bg-surface-50 px-5 py-3">
                  <button
                    type="button"
                    disabled={!assignProductId || assignSubmitting}
                    onClick={submitAssign}
                    className="h-10 w-full rounded-6 bg-brand-500 text-[13px] font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {assignSubmitting ? '分配中…' : (assignProductId ? '一键开通' : '请先选择商品')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignTarget(null)}
                    className="mt-2 h-9 w-full rounded-6 border border-surface-200 bg-white text-[12px] font-medium text-surface-500 transition-colors hover:border-surface-300"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center px-0 sm:items-center sm:px-4 modal-overlay"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div className="w-full max-w-md modal-panel">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
              <p className="font-semibold text-surface-600">新增用户</p>
              <button onClick={() => setShowCreate(false)} className="text-surface-400 hover:text-surface-500 text-lg leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {message && showCreate && (
                <div className={`rounded-8 px-3 py-2 text-sm ${message.type === 'success' ? 'bg-semantic-success-light text-semantic-success-dark' : 'bg-semantic-danger-light text-semantic-danger'}`}>
                  {message.text}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">用户名</label>
                  <input className="input" value={createForm.name} onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">身份</label>
                  <select
                    className="input"
                    value={getIdentity(createForm.role, createForm.level).id}
                    onChange={(e) => {
                      const opt = IDENTITY_OPTIONS.find((o) => o.id === e.target.value);
                      if (!opt || opt.disabled) return;
                      setCreateForm((prev) => ({ ...prev, role: opt.role, level: opt.level }));
                    }}
                  >
                    {IDENTITY_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id} disabled={opt.disabled}>
                        {opt.label}{opt.note ? `（${opt.note}）` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="label">邮箱</label>
                  <input className="input" type="email" value={createForm.email} onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))} />
                </div>
                <div>
                  <label className="label">手机号</label>
                  <input className="input" value={createForm.phone} onChange={(e) => setCreateForm((prev) => ({ ...prev, phone: e.target.value }))} />
                </div>
                <div>
                  <label className="label">身份码</label>
                  <input className="input" value={createForm.identityCode} onChange={(e) => setCreateForm((prev) => ({ ...prev, identityCode: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="label">密码</label>
                  <input className="input" type="password" value={createForm.password} onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))} />
                </div>
                {createForm.role === 'USER' && (
                  <div className="col-span-2">
                    <label className="label">归属渠道</label>
                    <select className="input" value={createForm.agentId} onChange={(e) => setCreateForm((prev) => ({ ...prev, agentId: e.target.value }))}>
                      <option value="">直客 / 无渠道</option>
                      {agentOptions.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-surface-100 px-6 py-4 pb-safe">
              <button onClick={() => setShowCreate(false)} className="btn-secondary btn-sm">取消</button>
              <button onClick={createUser} disabled={creating} className="btn-primary btn-sm disabled:opacity-50">
                {creating ? '创建中...' : '创建用户'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
