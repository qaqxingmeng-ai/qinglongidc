'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api-client';
import { PageHeader, Panel, TabChip, useToast } from '@/components/admin/layout';

type BulkTab = 'servers' | 'users';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  numericId: number;
}

function UserSearchInput({ onSelect }: { onSelect: (id: string, label: string) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AdminUser[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    const seq = ++requestSeq.current;
    const ctrl = new AbortController();
    setSearching(true);

    const t = setTimeout(() => {
      apiFetch(`/api/admin/users?search=${encodeURIComponent(q)}&pageSize=8`, { method: 'GET', signal: ctrl.signal })
        .then((r) => r.json())
        .then((json) => {
          if (seq !== requestSeq.current) return;
          if (json.success) {
            setResults((json.data as { users: AdminUser[] }).users ?? []);
            return;
          }
          setResults([]);
        })
        .catch(() => {
          if (seq === requestSeq.current) setResults([]);
        })
        .finally(() => {
          if (seq === requestSeq.current) setSearching(false);
        });
    }, 300);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="搜索目标用户（邮箱/名称）"
        className="input"
      />
      {open && (
        <div className="absolute left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded-8 border border-surface-200 bg-white shadow-dropdown">
          {results.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                onSelect(u.id, `${u.name} (${u.email})`);
                setQ(`${u.name} (${u.email})`);
                setOpen(false);
              }}
              className="w-full border-b border-surface-50 px-3 py-2 text-left text-xs hover:bg-surface-50 last:border-none"
            >
              <span className="font-medium">{u.name}</span>
              <span className="ml-2 text-surface-400">{u.email}</span>
            </button>
          ))}
          {!searching && results.length === 0 && q.trim().length >= 2 && (
            <p className="px-3 py-2 text-xs text-surface-400">未找到匹配用户</p>
          )}
          {searching && <p className="px-3 py-2 text-xs text-surface-400">搜索中...</p>}
        </div>
      )}
    </div>
  );
}

function ServerBulkSection() {
  const toast = useToast();
  const [serverIdInput, setServerIdInput] = useState('');
  const [statusAction, setStatusAction] = useState('ACTIVE');
  const [statusReason, setStatusReason] = useState('');
  const [assignTarget, setAssignTarget] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);

  const parseIds = (input: string) => input.split(/[\n,\s]+/).map((s) => s.trim()).filter(Boolean);

  const handleStatusBatch = async () => {
    const ids = parseIds(serverIdInput);
    if (!ids.length) {
      toast.warning('请输入服务器 ID');
      return;
    }
    setStatusLoading(true);
    try {
      const res = await apiFetch('/api/admin/bulk/servers/status', {
        method: 'POST',
        body: JSON.stringify({ serverIds: ids, status: statusAction, reason: statusReason }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('批量状态切换完成', `成功更新 ${(json.data as { updated: number } | null)?.updated ?? 0} 台服务器`);
      } else {
        toast.error('批量状态切换失败', json.error?.message ?? '未知错误');
      }
    } catch {
      toast.error('批量状态切换失败');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleAssignBatch = async () => {
    const ids = parseIds(serverIdInput);
    if (!ids.length || !assignTarget) {
      toast.warning('请输入服务器 ID 并选择目标用户');
      return;
    }
    setAssignLoading(true);
    try {
      const res = await apiFetch('/api/admin/bulk/servers/assign', {
        method: 'POST',
        body: JSON.stringify({ serverIds: ids, targetUserId: assignTarget }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('批量分配完成', `成功分配 ${(json.data as { updated: number }).updated} 台服务器`);
      } else {
        toast.error('批量分配失败', json.error?.message ?? '未知错误');
      }
    } catch {
      toast.error('批量分配失败');
    } finally {
      setAssignLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="服务器 ID 列表">
        <textarea
          rows={4}
          value={serverIdInput}
          onChange={(e) => setServerIdInput(e.target.value)}
          placeholder="每行或逗号分隔一个服务器 ID"
          className="input resize-none font-mono"
        />
        <p className="mt-2 text-xs text-surface-400">已输入 {parseIds(serverIdInput).length} 个 ID</p>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="批量状态切换">
          <div className="space-y-3">
            <select value={statusAction} onChange={(e) => setStatusAction(e.target.value)} className="input">
              <option value="ACTIVE">ACTIVE - 正常</option>
              <option value="ABNORMAL">ABNORMAL - 异常</option>
              <option value="SUSPENDED">SUSPENDED - 暂停</option>
              <option value="EXPIRED">EXPIRED - 到期</option>
            </select>
            <input value={statusReason} onChange={(e) => setStatusReason(e.target.value)} placeholder="切换原因（选填）" className="input" />
            <button disabled={statusLoading} onClick={handleStatusBatch} className="h-8 w-full rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
              {statusLoading ? '执行中...' : '批量切换状态'}
            </button>
          </div>
        </Panel>

        <Panel title="批量分配用户">
          <div className="space-y-3">
            <UserSearchInput onSelect={(id) => setAssignTarget(id)} />
            <button disabled={assignLoading || !assignTarget} onClick={handleAssignBatch} className="h-8 w-full rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
              {assignLoading ? '执行中...' : '批量分配'}
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function UserBulkSection() {
  const toast = useToast();
  const [userIdInput, setUserIdInput] = useState('');
  const [newLevel, setNewLevel] = useState('GUEST');
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceNote, setBalanceNote] = useState('');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifContent, setNotifContent] = useState('');
  const [levelLoading, setLevelLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);

  const parseIds = (input: string) => input.split(/[\n,\s]+/).map((s) => s.trim()).filter(Boolean);

  const handleLevel = async () => {
    const ids = parseIds(userIdInput);
    if (!ids.length) {
      toast.warning('请输入用户 ID');
      return;
    }
    setLevelLoading(true);
    try {
      const res = await apiFetch('/api/admin/bulk/users/level', { method: 'POST', body: JSON.stringify({ userIds: ids, level: newLevel }) });
      const json = await res.json();
      if (json.success) {
        toast.success('等级更新完成', `成功更新 ${(json.data as { updated: number }).updated} 个用户`);
      } else {
        toast.error('等级更新失败', json.error?.message ?? '未知错误');
      }
    } catch {
      toast.error('等级更新失败');
    } finally {
      setLevelLoading(false);
    }
  };

  const handleBalance = async () => {
    const ids = parseIds(userIdInput);
    const amount = parseFloat(balanceAmount);
    if (!ids.length || isNaN(amount) || amount === 0) {
      toast.warning('请输入用户 ID 和有效金额');
      return;
    }
    setBalanceLoading(true);
    try {
      const res = await apiFetch('/api/admin/bulk/users/balance', { method: 'POST', body: JSON.stringify({ userIds: ids, amount, note: balanceNote }) });
      const json = await res.json();
      if (json.success) {
        const d = json.data as { success: number; total: number };
        toast.success('余额调整完成', `成功 ${d.success}/${d.total} 个用户`);
      } else {
        toast.error('余额调整失败', json.error?.message ?? '未知错误');
      }
    } catch {
      toast.error('余额调整失败');
    } finally {
      setBalanceLoading(false);
    }
  };

  const handleNotif = async () => {
    const ids = parseIds(userIdInput);
    if (!ids.length || !notifTitle.trim()) {
      toast.warning('请输入用户 ID 和通知标题');
      return;
    }
    setNotifLoading(true);
    try {
      const res = await apiFetch('/api/admin/bulk/users/notify', { method: 'POST', body: JSON.stringify({ userIds: ids, title: notifTitle, content: notifContent }) });
      const json = await res.json();
      if (json.success) {
        toast.success('通知发送完成', `成功发送 ${(json.data as { sent: number }).sent} 条通知`);
      } else {
        toast.error('通知发送失败', json.error?.message ?? '未知错误');
      }
    } catch {
      toast.error('通知发送失败');
    } finally {
      setNotifLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="用户 ID 列表">
        <textarea
          rows={4}
          value={userIdInput}
          onChange={(e) => setUserIdInput(e.target.value)}
          placeholder="每行或逗号分隔一个用户 ID"
          className="input resize-none font-mono"
        />
        <p className="mt-2 text-xs text-surface-400">已输入 {parseIds(userIdInput).length} 个 ID</p>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="批量调整等级">
          <div className="space-y-3">
            <select value={newLevel} onChange={(e) => setNewLevel(e.target.value)} className="input">
              <option value="GUEST">GUEST</option>
              <option value="VIP">VIP</option>
              <option value="VIP_TOP">VIP_TOP</option>
              <option value="PARTNER">PARTNER</option>
            </select>
            <button disabled={levelLoading} onClick={handleLevel} className="h-8 w-full rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
              {levelLoading ? '执行中...' : '批量设置等级'}
            </button>
          </div>
        </Panel>

        <Panel title="批量调整余额">
          <div className="space-y-3">
            <input type="number" value={balanceAmount} onChange={(e) => setBalanceAmount(e.target.value)} placeholder="金额（负数为扣减）" className="input" />
            <input value={balanceNote} onChange={(e) => setBalanceNote(e.target.value)} placeholder="备注（选填）" className="input" />
            <button disabled={balanceLoading} onClick={handleBalance} className="h-8 w-full rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
              {balanceLoading ? '执行中...' : '批量充值/扣减'}
            </button>
          </div>
        </Panel>

        <Panel title="批量发送站内通知">
          <div className="space-y-3">
            <input value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} placeholder="通知标题" className="input" />
            <textarea rows={2} value={notifContent} onChange={(e) => setNotifContent(e.target.value)} placeholder="通知内容（选填）" className="input resize-none" />
            <button disabled={notifLoading} onClick={handleNotif} className="h-8 w-full rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
              {notifLoading ? '发送中...' : '批量发送通知'}
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function AdminBulkInner() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<BulkTab>('servers');

  useEffect(() => {
    if (user && user.role !== 'ADMIN') router.push('/');
  }, [user, router]);

  return (
    <div className="space-y-5">
      <PageHeader title="批量操作" subtitle="集中处理服务器和用户的批量运维动作" />

      <div className="flex flex-wrap items-center gap-2">
        <TabChip active={tab === 'servers'} onClick={() => setTab('servers')}>服务器操作</TabChip>
        <TabChip active={tab === 'users'} onClick={() => setTab('users')}>用户操作</TabChip>
      </div>

      {tab === 'servers' ? <ServerBulkSection /> : <UserBulkSection />}
    </div>
  );
}

export default function AdminBulkPage() {
  return (
    <AuthProvider>
      <AdminBulkInner />
    </AuthProvider>
  );
}
