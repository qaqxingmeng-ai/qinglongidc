'use client';

import { useState, useEffect, useCallback } from 'react';
import { sortRegionNamesLikeE81 } from '@/lib/catalog';
import { apiFetch, isApiSuccess, pickApiData, extractApiError } from '@/lib/api-client';
import { SCORE_DIMENSIONS } from '@/lib/scoring';
import type { Product, CPUOption, Filters, Message } from '../types';
import { normalizeAdminProduct, emptyForm } from '../types';

const defaultFilters: Filters = { q: '', status: 'ALL', category: 'ALL', region: 'ALL', cpuId: 'ALL' };

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cpus, setCpus] = useState<CPUOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [message, setMessage] = useState<Message | null>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.q.trim()) params.set('q', filters.q.trim());
      if (filters.status !== 'ALL') params.set('status', filters.status);
      if (filters.category !== 'ALL') params.set('category', filters.category);
      if (filters.region !== 'ALL') params.set('region', filters.region);
      if (filters.cpuId !== 'ALL') params.set('cpuId', filters.cpuId);

      const res = await apiFetch(`/api/admin/products${params.toString() ? `?${params.toString()}` : ''}`, { method: 'GET' });
      const json = await res.json();
      if (!isApiSuccess(json)) throw new Error(extractApiError(json.error, '加载失败'));
      const data = pickApiData<Product[] | { products?: Product[] }>(json, ['products']);
      const list = Array.isArray(data) ? data : (Array.isArray(data?.products) ? data.products : []);
      setProducts(list.map((item) => normalizeAdminProduct(item)));
    } catch (e) {
      const text = e instanceof Error ? e.message : '加载失败';
      setMessage({ type: 'error', text });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadCpus = useCallback(async () => {
    const res = await apiFetch('/api/admin/cpus', { method: 'GET' });
    const json = await res.json();
    if (!isApiSuccess(json)) return;
    const data = pickApiData<CPUOption[] | { cpus?: CPUOption[] }>(json, ['cpus']);
    const list = Array.isArray(data) ? data : (Array.isArray(data?.cpus) ? data.cpus : []);
    setCpus(list);
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    loadCpus();
  }, [loadCpus]);

  const refresh = useCallback(() => loadProducts(), [loadProducts]);

  const toggleProduct = useCallback(async (id: string, status: string) => {
    const newStatus = status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await apiFetch(`/api/admin/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(extractApiError(json.error, '状态更新失败'));
      setProducts((prev) => prev.map((product) => {
        if (product.id !== id) return product;
        return json.data && typeof json.data === 'object' ? json.data : { ...product, status: newStatus };
      }));
    } catch (e) {
      const text = e instanceof Error ? e.message : '状态更新失败';
      setMessage({ type: 'error', text });
    }
  }, []);

  const deleteProduct = useCallback(async (id: string) => {
    if (!confirm('确认删除?')) return;
    try {
      const res = await apiFetch(`/api/admin/products/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(extractApiError(json.error, '删除失败'));
      setProducts((prev) => prev.filter((product) => product.id !== id));
    } catch (e) {
      const text = e instanceof Error ? e.message : '删除失败';
      setMessage({ type: 'error', text });
    }
  }, []);

  const saveProduct = useCallback(async (editingId: string | null, form: typeof emptyForm) => {
    setMessage(null);

    const scorePayload = SCORE_DIMENSIONS.reduce<Record<string, number>>((acc, dimension) => {
      acc[dimension.field] = Number(form[dimension.field]) || 0;
      return acc;
    }, {});

    const payload = {
      name: form.name.trim(),
      category: form.category,
      region: form.region.trim(),
      cpuId: form.cpuId,
      cpuDisplay: form.cpuDisplay.trim() || undefined,
      isDualCPU: form.isDualCPU,
      memory: form.memory.trim(),
      storage: form.storage.trim(),
      bandwidth: form.bandwidth.trim(),
      originalPrice: Number(form.originalPrice),
      supplier: form.supplier.trim(),
      status: form.status,
      ...scorePayload,
      aiDescription: form.aiDescription.trim() || undefined,
      aiSuitableFor: form.aiSuitableFor.trim() || undefined,
    };

    const res = await apiFetch(editingId ? `/api/admin/products/${editingId}` : '/api/admin/products', {
      method: editingId ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.success) throw new Error(extractApiError(json.error, '保存失败'));

    setMessage({ type: 'success', text: editingId ? '商品已更新' : '商品已创建' });
    await refresh();
  }, [refresh]);

  const availableRegions = sortRegionNamesLikeE81(Array.from(new Set(products.map((p) => p.region).filter(Boolean))));

  return {
    products,
    cpus,
    loading,
    filters,
    setFilters,
    message,
    setMessage,
    refresh,
    toggleProduct,
    deleteProduct,
    saveProduct,
    availableRegions,
  };
}
