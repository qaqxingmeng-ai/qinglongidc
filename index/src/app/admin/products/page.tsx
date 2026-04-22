'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import type { Product } from './types';
import { emptyForm } from './types';
import { useProducts } from './hooks/useProducts';
import { useBatchOperations } from './hooks/useBatchOperations';
import { ProductFilters } from './components/ProductFilters';
import { ProductList, useGroupedProductStats } from './components/ProductList';
import { ProductEditModal } from './components/ProductEditModal';
import { AllocateModal } from './components/AllocateModal';
import { StockEditModal } from './components/StockEditModal';
import { ImportModal } from './components/ImportModal';
import { ProductBulkDrawerBody } from './components/ProductBulkDrawerBody';
import { PageHeader, SkeletonTable, useToast, BulkActionDrawer } from '@/components/admin/layout';

export default function AdminProductsPage() {
  const toast = useToast();
  const {
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
  } = useProducts();

  useEffect(() => {
    if (!message) return;
    if (message.type === 'success') toast.success(message.text);
    else toast.error(message.text);
    setMessage(null);
  }, [message, setMessage, toast]);

  const batch = useBatchOperations(products, refresh, setMessage);

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [allocatingProduct, setAllocatingProduct] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const stats = useGroupedProductStats(products);

  const hasExpandedGroup = useMemo(() => {
    return stats.grouped.some((group) => !collapsedGroups[group.value]);
  }, [stats.grouped, collapsedGroups]);

  const toggleAllGroups = (collapsed: boolean) => {
    setCollapsedGroups(
      stats.grouped.reduce<Record<string, boolean>>((acc, group) => {
        acc[group.value] = collapsed;
        return acc;
      }, {})
    );
  };

  const openCreate = (preset?: { category?: string; region?: string }) => {
    setMessage(null);
    setEditingProduct({
      ...emptyForm,
      id: '',
      category: preset?.category || emptyForm.category,
      region: preset?.region || '',
    } as unknown as Product);
  };

  const openEdit = (product: Product) => {
    setMessage(null);
    setEditingProduct(product);
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="商品管理" subtitle="按地区集中管理商品，地区下再看具体 SKU，结构更接近 IDC 商品后台的地区分仓视图。" />
        <SkeletonTable rows={6} columns={6} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="商品管理"
        subtitle="按地区集中管理商品，地区下再看具体 SKU，结构更接近 IDC 商品后台的地区分仓视图。"
        actions={
          <>
            <Link
              href="/admin/products/settings"
              className="flex h-8 items-center rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500"
            >
              商品全局设置
            </Link>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500"
            >
              AI 识别导入
            </button>
            <button
              type="button"
              onClick={() => toggleAllGroups(hasExpandedGroup)}
              className="h-8 rounded-6 border border-surface-200 bg-white px-3 text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500"
            >
              {hasExpandedGroup ? '全部收起' : '全部展开'}
            </button>
            <button
              type="button"
              onClick={() => openCreate()}
              className="h-8 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600"
            >
              + 创建商品
            </button>
          </>
        }
      />

      {/* 统计概览 */}
      <div className="rounded-8 border border-surface-200 bg-white px-4 py-2.5 shadow-card">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="inline-flex items-center gap-1.5 rounded-6 border border-surface-200 bg-surface-50 px-2.5 py-1 text-surface-500">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
            </svg>
            地区分组 <span className="font-semibold text-surface-600 tabular-nums">{stats.grouped.length}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-6 border border-semantic-success-light bg-semantic-success-light px-2.5 py-1 text-semantic-success-dark">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            上架商品 <span className="font-semibold tabular-nums">{stats.totalActiveProducts}</span> / {stats.totalProducts}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-6 border border-surface-200 bg-surface-50 px-2.5 py-1 text-surface-500">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
            </svg>
            实例 <span className="font-semibold text-surface-600 tabular-nums">{stats.totalActiveInstances}</span> / {stats.totalInstances}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-6 border border-semantic-info-light bg-semantic-info-light px-2.5 py-1 text-brand-600">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            可直接开通 <span className="font-semibold tabular-nums">{stats.totalAutoProvision}</span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, status: 'ACTIVE' }))}
              className="h-7 rounded-6 border border-surface-200 bg-white px-2.5 text-[11px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500"
            >
              仅看上架商品
            </button>
          </div>
        </div>
      </div>

      <ProductFilters
        filters={filters}
        onChange={setFilters}
        availableRegions={availableRegions}
        cpus={cpus}
      />

      {/* 顶部轻量选择工具条（批量操作改至右侧悬浮抽屉） */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-8 border border-surface-100 bg-white px-3 py-2 text-[12px]">
        <span className="text-surface-400">
          已选 <span className="font-semibold tabular-nums text-brand-500">{batch.selectedProductIds.length}</span>
          {' / '}
          <span className="tabular-nums">{stats.visibleProductIds.length}</span>
        </span>
        <button
          onClick={() => batch.selectVisibleProducts(stats.visibleProductIds)}
          disabled={stats.visibleProductIds.length === 0}
          className="h-7 rounded-6 border border-surface-200 bg-white px-2.5 text-[11px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500 disabled:opacity-50"
        >
          全选筛选
        </button>
        <button
          onClick={batch.clearSelection}
          disabled={batch.selectedProductIds.length === 0}
          className="h-7 rounded-6 border border-surface-200 bg-white px-2.5 text-[11px] font-medium text-surface-500 transition-colors hover:border-semantic-danger hover:text-semantic-danger disabled:opacity-50"
        >
          清空勾选
        </button>
        <span className="ml-auto text-[11px] text-surface-400">选中后批量操作面板将在右侧弹出</span>
      </div>

      <BulkActionDrawer
        open={batch.selectedProductIds.length > 0}
        count={batch.selectedProductIds.length}
        total={stats.visibleProductIds.length}
        onClear={batch.clearSelection}
        onSelectAll={() => batch.selectVisibleProducts(stats.visibleProductIds)}
      >
        <ProductBulkDrawerBody
          selectedCount={batch.selectedProductIds.length}
          visibleActiveProductIds={stats.visibleActiveProductIds}
          batchField={batch.batchField}
          setBatchField={batch.setBatchField}
          batchValue={batch.batchValue}
          setBatchValue={batch.setBatchValue}
          batchSaving={batch.batchSaving}
          batchGenLoading={batch.batchGenLoading}
          batchGenResults={batch.batchGenResults}
          batchGenOverwrite={batch.batchGenOverwrite}
          setBatchGenOverwrite={batch.setBatchGenOverwrite}
          showBatchGenPanel={batch.showBatchGenPanel}
          setShowBatchGenPanel={batch.setShowBatchGenPanel}
          onSelectActive={(ids) => batch.selectVisibleProducts(ids)}
          onApplyBatchUpdate={batch.applyBatchUpdate}
          onBatchGenerateDesc={batch.batchGenerateDesc}
        />
      </BulkActionDrawer>

      <ProductList
        products={products}
        collapsedGroups={collapsedGroups}
        selectedIds={batch.selectedProductIds}
        onToggleGroup={(region) => setCollapsedGroups((prev) => ({ ...prev, [region]: !prev[region] }))}
        onToggleSelect={batch.toggleProductSelect}
        onToggleRegionSelectAll={batch.toggleRegionSelectAll}
        onEdit={openEdit}
        onAllocate={setAllocatingProduct}
        onStockEdit={setStockProduct}
        onToggleStatus={toggleProduct}
        onDelete={deleteProduct}
        onCreateInRegion={(region) => openCreate({ region })}
      />

      {editingProduct && (
        <ProductEditModal
          product={editingProduct}
          cpus={cpus}
          onSave={saveProduct}
          onClose={() => setEditingProduct(null)}
          setMessage={setMessage}
        />
      )}

      <AllocateModal
        product={allocatingProduct}
        onClose={() => setAllocatingProduct(null)}
        onSuccess={refresh}
        setMessage={setMessage}
      />

      <StockEditModal
        product={stockProduct}
        onClose={() => setStockProduct(null)}
        onSuccess={refresh}
        setMessage={setMessage}
      />

      <ImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={refresh}
        setMessage={setMessage}
      />
    </div>
  );
}
