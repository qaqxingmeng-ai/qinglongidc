'use client';

import { useState } from 'react';
import { ModalBody, ModalFooter, ModalFrame, ModalHeader, ModalSection } from '@/components/admin/layout';
import { SCORE_DIMENSIONS } from '@/lib/scoring';
import type { Product, CPUOption, Message } from '../types';
import { emptyForm, DEFAULT_CATEGORY_ORDER, categoryLabelMap } from '../types';

interface ProductEditModalProps {
  product: Product | null;
  cpus: CPUOption[];
  onSave: (editingId: string | null, form: typeof emptyForm) => Promise<void>;
  onClose: () => void;
  setMessage: (msg: Message | null) => void;
}

export function ProductEditModal({ product, cpus, onSave, onClose, setMessage }: ProductEditModalProps) {
  const editingId = product?.id ?? null;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<typeof emptyForm>(() => {
    if (!product) return { ...emptyForm };
    return {
      name: product.name,
      category: product.category,
      region: product.region,
      cpuId: product.cpuId,
      cpuDisplay: product.cpuDisplay || '',
      isDualCPU: product.isDualCPU,
      memory: product.memory,
      storage: product.storage,
      bandwidth: product.bandwidth,
      originalPrice: String(product.originalPrice),
      supplier: product.supplier || '',
      status: product.status,
      scoreNetwork: String(product.scoreNetwork || 0),
      scoreCpuSingle: String(product.scoreCpuSingle || 0),
      scoreMemory: String(product.scoreMemory || 0),
      scoreStorage: String(product.scoreStorage || 0),
      aiDescription: product.aiDescription || '',
      aiSuitableFor: product.aiSuitableFor || '',
    };
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(editingId, form);
      onClose();
    } catch (e) {
      const text = e instanceof Error ? e.message : '保存失败';
      setMessage({ type: 'error', text });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFrame open={!!product || editingId === null} onClose={onClose} size="3xl" className="max-h-[90vh]">
      <ModalHeader
        title={editingId ? '编辑商品' : '创建商品'}
        subtitle={editingId ? '统一使用模块化表单区块，减少编辑噪音。' : '先完成基础配置，再补充评分和 AI 说明。'}
        onClose={onClose}
      />
      <ModalBody className="space-y-4">
        <div className="admin-page animate-fade-in-up">
          <ModalSection title="基础信息" description="商品名称、地区、分类与上架状态。">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">名称</label>
                  <input className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">地区</label>
                  <input className="input" value={form.region} onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))} />
                </div>
                <div>
                  <label className="label">分类</label>
                  <select className="input" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                    {DEFAULT_CATEGORY_ORDER.map((v) => (
                      <option key={v} value={v}>{categoryLabelMap[v]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">状态</label>
                  <select className="input" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                    <option value="ACTIVE">上架</option>
                    <option value="INACTIVE">下架</option>
                  </select>
                </div>
              </div>
          </ModalSection>

          <ModalSection title="硬件与展示" description="控制 CPU、存储、带宽与首页展示文案。">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">CPU型号</label>
                  <select className="input" value={form.cpuId} onChange={(e) => setForm((p) => ({ ...p, cpuId: e.target.value }))}>
                    <option value="">选择CPU</option>
                    {cpus.map((c) => (
                      <option key={c.id} value={c.id}>{c.model}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">首页CPU展示文案</label>
                  <input
                    className="input"
                    value={form.cpuDisplay}
                    onChange={(e) => setForm((p) => ({ ...p, cpuDisplay: e.target.value }))}
                    placeholder="留空则自动按单双路 + CPU型号生成"
                  />
                </div>
                <div>
                  <label className="label">内存</label>
                  <input className="input" value={form.memory} onChange={(e) => setForm((p) => ({ ...p, memory: e.target.value }))} />
                </div>
                <div>
                  <label className="label">硬盘</label>
                  <input className="input" value={form.storage} onChange={(e) => setForm((p) => ({ ...p, storage: e.target.value }))} />
                </div>
                <div>
                  <label className="label">带宽</label>
                  <input className="input" value={form.bandwidth} onChange={(e) => setForm((p) => ({ ...p, bandwidth: e.target.value }))} />
                </div>
                <div>
                  <label className="label">原价</label>
                  <input className="input" type="number" value={form.originalPrice} onChange={(e) => setForm((p) => ({ ...p, originalPrice: e.target.value }))} />
                </div>
                <div>
                  <label className="label">上家名称</label>
                  <input className="input" value={form.supplier} onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))} placeholder="供应商" />
                </div>
              </div>
              <label className="mt-3 inline-flex items-center gap-2 text-sm text-surface-500 cursor-pointer">
                <input type="checkbox" checked={form.isDualCPU} onChange={(e) => setForm((p) => ({ ...p, isDualCPU: e.target.checked }))} />
                双路CPU（勾选后将同步 cpuCount=2）
              </label>
          </ModalSection>

          <ModalSection title="评分与 AI 说明" description="保持评分与文案在同一视觉层级，避免编辑区域割裂。">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                {SCORE_DIMENSIONS.map((dimension) => (
                  <div key={dimension.field}>
                    <label className="label">{dimension.label} (0-100)</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={100}
                      value={form[dimension.field]}
                      onChange={(e) => setForm((p) => ({ ...p, [dimension.field]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className="md:col-span-2">
                  <label className="label">AI描述</label>
                  <textarea className="input min-h-[80px]" value={form.aiDescription} onChange={(e) => setForm((p) => ({ ...p, aiDescription: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <label className="label">适用场景</label>
                  <textarea className="input min-h-[80px]" value={form.aiSuitableFor} onChange={(e) => setForm((p) => ({ ...p, aiSuitableFor: e.target.value }))} />
                </div>
              </div>
          </ModalSection>
        </div>
      </ModalBody>

      <ModalFooter hint="商品弹窗现在统一为分段式编辑结构，长表单阅读压力更低。">
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary btn-sm">取消</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm disabled:opacity-50">
            {saving ? '保存中...' : editingId ? '保存修改' : '创建商品'}
          </button>
        </div>
      </ModalFooter>
    </ModalFrame>
  );
}
