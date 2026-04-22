'use client';

import { useState, useEffect } from 'react';
import { apiFetch, extractApiError } from '@/lib/api-client';
import { ModalBody, ModalFooter, ModalFrame, ModalHeader, ModalSection } from '@/components/admin/layout';
import type { Product, UserCandidate, Message } from '../types';

interface AllocateModalProps {
  product: Product | null;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  setMessage: (msg: Message | null) => void;
}

export function AllocateModal({ product, onClose, onSuccess, setMessage }: AllocateModalProps) {
  const [form, setForm] = useState({ identifier: '', months: '1', note: '', selectedUserId: '' });
  const [candidates, setCandidates] = useState<UserCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!product) return;
    const keyword = form.identifier.trim();
    if (!keyword) {
      setCandidates([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await apiFetch(`/api/admin/users?role=USER&q=${encodeURIComponent(keyword)}`, { method: 'GET' });
        const json = await res.json();
        if (!json.success) {
          setCandidates([]);
          return;
        }
        const raw = json.data;
        const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.users) ? raw.users : []);
        setCandidates(list.slice(0, 8));
      } catch {
        setCandidates([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [product, form.identifier]);

  const handleSubmit = async () => {
    if (!product) return;
    const identifier = form.selectedUserId || form.identifier.trim();
    const months = Number(form.months);
    const trimmedNote = form.note.trim();
    if (!identifier) {
      setMessage({ type: 'error', text: '请先输入用户ID/邮箱/用户名并选择用户' });
      return;
    }
    if (!Number.isInteger(months) || months < 1 || months > 60) {
      setMessage({ type: 'error', text: '开通时长必须是 1-60 的整数（月）' });
      return;
    }
    if (trimmedNote.length > 200) {
      setMessage({ type: 'error', text: '备注最多 200 字符' });
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiFetch(`/api/admin/products/${product.id}/allocate`, {
        method: 'POST',
        body: JSON.stringify({
          identifier,
          months,
          note: trimmedNote || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(extractApiError(json.error, '分配失败'));
      setMessage({ type: 'success', text: `分配成功，已创建实例（到期：${new Date(json.data.expireDate).toLocaleDateString('zh-CN')}）` });
      onClose();
      await onSuccess();
    } catch (e) {
      const text = e instanceof Error ? e.message : '分配失败';
      setMessage({ type: 'error', text });
    } finally {
      setSubmitting(false);
    }
  };

  if (!product) return null;

  return (
    <ModalFrame open={!!product} onClose={onClose} size="2xl" className="max-h-[90vh]">
      <ModalHeader
        title="分配商品"
        subtitle={`当前商品：${product.name}`}
        onClose={onClose}
      />
      <ModalBody className="space-y-4">
        <ModalSection title="用户匹配" description="支持按用户 ID、数字 ID、邮箱或用户名模糊检索。">
            <label className="label">用户查询（支持用户ID/数字ID/邮箱/用户名）</label>
            <input
              className="input"
              value={form.identifier}
              onChange={(e) => setForm((prev) => ({ ...prev, identifier: e.target.value, selectedUserId: '' }))}
              placeholder="例如：u_xxx / 100001 / test@example.com / 张三"
            />
        </ModalSection>

        <ModalSection title="匹配结果" description="选中的用户会被固定在本次分配流程里。">
            <p className="text-xs font-medium text-surface-500 mb-2">匹配用户</p>
            {searching && <p className="text-xs text-surface-400">检索中...</p>}
            {!searching && candidates.length === 0 && (
              <p className="text-xs text-surface-400">输入关键词后会展示匹配用户，点击可直接选中。</p>
            )}
            {!searching && candidates.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {candidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    onClick={() => setForm((prev) => ({ ...prev, selectedUserId: candidate.id, identifier: candidate.email }))}
                    className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition ${
                      form.selectedUserId === candidate.id
                        ? 'border-blue-300 bg-semantic-info-light text-brand-600'
                        : 'border-surface-200 bg-white text-surface-500 hover:border-blue-200'
                    }`}
                  >
                    <div className="font-medium">{candidate.name}（#{candidate.numericId}）</div>
                    <div className="text-surface-400 mt-0.5">{candidate.email}</div>
                  </button>
                ))}
              </div>
            )}
        </ModalSection>

        <ModalSection title="开通参数" description="时长与备注保持简洁，减少分配弹窗的视觉噪音。" accent="soft">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">开通时长（月）</label>
              <input
                className="input"
                type="number"
                min={1}
                max={60}
                value={form.months}
                onChange={(e) => setForm((prev) => ({ ...prev, months: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">备注（可选）</label>
              <input
                className="input"
                value={form.note}
                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="例如：补偿赠送 / 活动赠送"
              />
            </div>
          </div>
        </ModalSection>

      </ModalBody>
      <ModalFooter hint="分配成功后会自动刷新商品和用户视图。">
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary btn-sm">取消</button>
          <button onClick={handleSubmit} disabled={submitting} className="btn-primary btn-sm disabled:opacity-50">
            {submitting ? '分配中...' : '确认分配'}
          </button>
        </div>
      </ModalFooter>
    </ModalFrame>
  );
}
