'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch, extractApiError } from '@/lib/api-client';
import type { Product, BatchField, Message } from '../types';
import { DEFAULT_CATEGORY_ORDER } from '../types';

interface BatchGenResult {
  id: string;
  name: string;
  status: string;
  description?: string;
  suitableFor?: string;
  error?: string;
}

export function useBatchOperations(
  products: Product[],
  refresh: () => Promise<void>,
  setMessage: (msg: Message | null) => void,
) {
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [batchField, setBatchField] = useState<BatchField>('status');
  const [batchValue, setBatchValue] = useState('ACTIVE');
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchGenLoading, setBatchGenLoading] = useState(false);
  const [batchGenResults, setBatchGenResults] = useState<BatchGenResult[] | null>(null);
  const [batchGenOverwrite, setBatchGenOverwrite] = useState(false);
  const [showBatchGenPanel, setShowBatchGenPanel] = useState(false);

  useEffect(() => {
    const validSet = new Set(products.map((item) => item.id));
    setSelectedProductIds((prev) => prev.filter((id) => validSet.has(id)));
  }, [products]);

  useEffect(() => {
    setBatchValue((prev) => {
      if (batchField === 'status') return prev === 'ACTIVE' || prev === 'INACTIVE' ? prev : 'ACTIVE';
      if (batchField === 'category') return DEFAULT_CATEGORY_ORDER.includes(prev) ? prev : DEFAULT_CATEGORY_ORDER[0];
      if (batchField === 'region') return prev;
      return prev === 'true' || prev === 'false' ? prev : 'false';
    });
  }, [batchField]);

  const isProductSelected = useCallback((id: string) => selectedProductIds.includes(id), [selectedProductIds]);

  const toggleProductSelect = useCallback((id: string, checked: boolean) => {
    setSelectedProductIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((item) => item !== id);
    });
  }, []);

  const toggleRegionSelectAll = useCallback((groupIds: string[], checked: boolean) => {
    setSelectedProductIds((prev) => {
      if (checked) {
        const set = new Set(prev);
        groupIds.forEach((id) => set.add(id));
        return Array.from(set);
      }
      const set = new Set(groupIds);
      return prev.filter((id) => !set.has(id));
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedProductIds([]), []);

  const selectVisibleProducts = useCallback((ids: string[]) => {
    setSelectedProductIds(Array.from(new Set(ids)));
  }, []);

  const applyBatchUpdate = useCallback(async () => {
    if (selectedProductIds.length === 0) return;

    const payload: Record<string, unknown> = {};
    if (batchField === 'status') payload.status = batchValue;
    if (batchField === 'category') payload.category = batchValue;
    if (batchField === 'region') payload.region = batchValue.trim();
    if (batchField === 'isDualCPU') payload.isDualCPU = batchValue === 'true';

    if (batchField === 'region' && !String(payload.region || '').trim()) {
      setMessage({ type: 'error', text: '地区不能为空' });
      return;
    }

    try {
      setBatchSaving(true);
      const res = await apiFetch('/api/admin/products/batch', {
        method: 'POST',
        body: JSON.stringify({
          ids: selectedProductIds,
          updates: payload,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(extractApiError(json.error, '批量更新失败'));
      setMessage({ type: 'success', text: `已批量更新 ${json.data?.count ?? selectedProductIds.length} 个商品` });
      clearSelection();
      await refresh();
    } catch (e) {
      const text = e instanceof Error ? e.message : '批量更新失败';
      setMessage({ type: 'error', text });
    } finally {
      setBatchSaving(false);
    }
  }, [selectedProductIds, batchField, batchValue, refresh, clearSelection, setMessage]);

  const batchGenerateDesc = useCallback(async () => {
    if (selectedProductIds.length === 0) return;
    setBatchGenLoading(true);
    setBatchGenResults(null);
    try {
      const res = await apiFetch('/api/admin/products/batch-gen-desc', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedProductIds, overwrite: batchGenOverwrite }),
      });
      const json = await res.json();
      if (json.success) {
        const payload = json.data && typeof json.data === 'object' ? json.data : json;
        setBatchGenResults(Array.isArray(payload?.results) ? payload.results : []);
        await refresh();
      } else {
        setMessage({ type: 'error', text: extractApiError(json.error, 'AI描述生成失败') });
      }
    } catch {
      setMessage({ type: 'error', text: 'AI描述生成请求失败' });
    } finally {
      setBatchGenLoading(false);
    }
  }, [selectedProductIds, batchGenOverwrite, refresh, setMessage]);

  return {
    selectedProductIds,
    batchField,
    setBatchField,
    batchValue,
    setBatchValue,
    batchSaving,
    batchGenLoading,
    batchGenResults,
    batchGenOverwrite,
    setBatchGenOverwrite,
    showBatchGenPanel,
    setShowBatchGenPanel,
    isProductSelected,
    toggleProductSelect,
    toggleRegionSelectAll,
    clearSelection,
    selectVisibleProducts,
    applyBatchUpdate,
    batchGenerateDesc,
  };
}
