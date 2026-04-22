'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api-client';
import {
  PageHeader,
  FilterBar,
  Panel,
  EmptyState,
  SkeletonTable,
  StickyFooter,
  useToast,
} from '@/components/admin/layout';
import { easeOut } from '@/components/admin/motion';

const inputCls = 'w-full h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] text-surface-600 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';
const modalTransition = { type: 'spring' as const, stiffness: 420, damping: 32 };

interface UserPointsRow {
  userId: string;
  email: string;
  name: string;
  level: string;
  points: number;
  totalEarned: number;
  totalSpent: number;
  checkinStreak: number;
  lastCheckinAt?: string;
}

export default function AdminPointsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<UserPointsRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ userId: '', amount: 0, note: '', direction: 'earn' });
  const [adjustError, setAdjustError] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const pageSize = 20;

  const load = useCallback(async (p: number, q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) });
      if (q.trim()) params.set('search', q.trim());
      const r = await apiFetch(`/api/admin/points?${params}`);
      const j = await r.json();
      if (j.success) {
        setRows(j.data.users ?? []);
        setTotal(j.data.total ?? 0);
      }
    } catch {
      toast.error('积分数据加载失败');
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load(page, search);
  }, [page, search, load]);

  const handleAdjust = async () => {
    if (!adjustForm.userId.trim()) {
      setAdjustError('请填写用户 ID');
      return;
    }
    if (adjustForm.amount <= 0) {
      setAdjustError('积分数量必须大于 0');
      return;
    }

    setAdjusting(true);
    setAdjustError('');
    let j: { success?: boolean; error?: string } = {};
    try {
      const r = await apiFetch('/api/admin/points/adjust', {
        method: 'POST',
        body: JSON.stringify({
          userId: adjustForm.userId,
          amount: adjustForm.direction === 'earn' ? adjustForm.amount : -adjustForm.amount,
          note: adjustForm.note,
        }),
      });
      j = await r.json();
    } catch {
      setAdjusting(false);
      setAdjustError('网络错误，请稍后重试');
      toast.error('网络错误');
      return;
    }
    setAdjusting(false);

    if (j.success) {
      setShowAdjust(false);
      setAdjustForm({ userId: '', amount: 0, note: '', direction: 'earn' });
      toast.success('积分调整成功');
      load(page, search);
    } else {
      setAdjustError(j.error ?? '操作失败');
      toast.error('积分调整失败', j.error ?? '操作失败');
    }
  };

  const levelLabel: Record<string, string> = {
    GUEST: '普通', VIP: 'VIP', VIP_TOP: 'VIP+', PARTNER: '合伙人', ADMIN: '管理员',
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-5">
      <PageHeader
        title="积分管理"
        subtitle="用户积分余额与规则调整"
        actions={
          <button
            type="button"
            onClick={() => { setShowAdjust(true); setAdjustError(''); }}
            className="h-8 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600"
          >
            手动调整积分
          </button>
        }
      />

      <FilterBar
        right={
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="按邮箱或姓名搜索"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-6 border border-surface-200 bg-white pl-8 pr-3 text-[12px] text-surface-600 placeholder:text-surface-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/15 md:w-64"
            />
          </div>
        }
      >
        <span className="text-[12px] text-surface-400">积分用户列表</span>
      </FilterBar>

      <AnimatePresence>
        {showAdjust && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowAdjust(false)}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/30 backdrop-blur-[2px] modal-panel" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -8 }} transition={modalTransition} className="relative w-full max-w-md space-y-4 rounded-8 border border-surface-100 bg-white p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-surface-600">手动调整积分</h2>
            {adjustError && <p className="text-sm text-semantic-danger">{adjustError}</p>}

            <div className="space-y-3.5">
              <div>
                <label className="text-xs text-surface-400 block mb-1">用户 ID</label>
                <input
                  type="text"
                  value={adjustForm.userId}
                  onChange={(e) => setAdjustForm({ ...adjustForm, userId: e.target.value })}
                  className={inputCls}
                  placeholder="用户 ID"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-surface-400 block mb-1">操作</label>
                  <select
                    value={adjustForm.direction}
                    onChange={(e) => setAdjustForm({ ...adjustForm, direction: e.target.value })}
                    className={inputCls}
                  >
                    <option value="earn">增加积分</option>
                    <option value="spend">扣除积分</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-surface-400 block mb-1">数量</label>
                  <input
                    type="number"
                    min={1}
                    value={adjustForm.amount}
                    onChange={(e) => setAdjustForm({ ...adjustForm, amount: parseInt(e.target.value, 10) || 0 })}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-surface-400 block mb-1">备注</label>
                <input
                  type="text"
                  value={adjustForm.note}
                  onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })}
                  className={inputCls}
                  placeholder="操作原因（选填）"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setShowAdjust(false)}
                className="h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500"
              >
                取消
              </button>
              <button
                onClick={handleAdjust}
                disabled={adjusting}
                className="h-8 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {adjusting ? '处理中...' : '确认'}
              </button>
            </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {loading ? (
        <SkeletonTable rows={8} columns={5} />
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState title="暂无积分数据" description="当前筛选条件下没有匹配用户" />
        </Panel>
      ) : (
        <Panel noPadding>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">
                  <th className="py-2.5 pl-5 pr-4 font-medium">用户</th>
                  <th className="py-2.5 pr-4 text-right font-medium">可用积分</th>
                  <th className="py-2.5 pr-4 text-right font-medium">累计获取</th>
                  <th className="py-2.5 pr-4 text-right font-medium">累计使用</th>
                  <th className="py-2.5 pr-5 text-right font-medium">连续签到</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <motion.tr
                    key={r.userId}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }}
                    className="border-b border-surface-50 transition-colors last:border-b-0 hover:bg-surface-50/60"
                  >
                    <td className="py-3 pl-5 pr-4">
                      <p className="text-[13px] font-medium text-surface-600">{r.name || r.email}</p>
                      <p className="text-[11px] text-surface-400">{levelLabel[r.level] ?? r.level}</p>
                    </td>
                    <td className="py-3 pr-4 text-right font-medium tabular-nums text-surface-600">{r.points}</td>
                    <td className="py-3 pr-4 text-right text-xs tabular-nums text-surface-500">{r.totalEarned}</td>
                    <td className="py-3 pr-4 text-right text-xs tabular-nums text-surface-500">{r.totalSpent}</td>
                    <td className="py-3 pr-5 text-right text-xs text-surface-500">{r.checkinStreak} 天</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <StickyFooter show={totalPages > 1}>
        <div className="flex w-full items-center justify-between text-sm">
          <span className="text-surface-400">共 {total} 条</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              上一页
            </button>
            <span className="px-2 text-[12px] text-surface-400">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      </StickyFooter>
    </div>
  );
}
