'use client';

import { useState } from 'react';
import { apiFetch, extractApiError } from '@/lib/api-client';
import { ModalBody, ModalFooter, ModalFrame, ModalHeader, ModalSection } from '@/components/admin/layout';
import type { Product, Message } from '../types';

interface StockEditModalProps {
  product: Product | null;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  setMessage: (msg: Message | null) => void;
}

export function StockEditModal({ product, onClose, onSuccess, setMessage }: StockEditModalProps) {
  const [form, setForm] = useState({ stock: String(product?.stock ?? -1), stockAlert: String(product?.stockAlert ?? 0) });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!product) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/admin/products/${product.id}/stock`, {
        method: 'PATCH',
        body: JSON.stringify({ stock: parseInt(form.stock), stockAlert: parseInt(form.stockAlert) }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(extractApiError(json.error, '更新失败'));
      setMessage({ type: 'success', text: '库存已更新' });
      onClose();
      await onSuccess();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : '更新失败' });
    } finally {
      setSaving(false);
    }
  };

  if (!product) return null;

  return (
    <ModalFrame open={!!product} onClose={onClose} size="sm">
      <ModalHeader title="调整库存" subtitle={product.name} onClose={onClose} />
      <ModalBody>
        <ModalSection title="库存规则" description="小型操作弹窗统一用单栏栈式布局。" accent="soft">
          <div className="flex flex-col gap-3">
          <div>
            <label className="label">库存数量（-1 = 不限）</label>
            <input
              type="number"
              className="input"
              value={form.stock}
              onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">预警阈值（0 = 不预警）</label>
            <input
              type="number"
              className="input"
              value={form.stockAlert}
              onChange={(e) => setForm((f) => ({ ...f, stockAlert: e.target.value }))}
            />
          </div>
        </div>
        </ModalSection>
      </ModalBody>
      <ModalFooter>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary btn-sm">取消</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </ModalFooter>
    </ModalFrame>
  );
}
