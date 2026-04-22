'use client';

import { useMemo } from 'react';
import { sortRegionNamesLikeE81 } from '@/lib/catalog';
import type { Product } from '../types';
import { categoryLabelMap, hasInventoryRisk } from '../types';
import { ProductGroup, type ProductGroupData } from './ProductGroup';

interface ProductListProps {
  products: Product[];
  collapsedGroups: Record<string, boolean>;
  selectedIds: string[];
  onToggleGroup: (region: string) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onToggleRegionSelectAll: (ids: string[], checked: boolean) => void;
  onEdit: (product: Product) => void;
  onAllocate: (product: Product) => void;
  onStockEdit: (product: Product) => void;
  onToggleStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onCreateInRegion: (region: string) => void;
}

function buildGroupedProducts(products: Product[]): ProductGroupData[] {
  return sortRegionNamesLikeE81(Array.from(new Set(products.map((p) => p.region).filter(Boolean)))).map((regionValue) => {
    const items = products.filter((p) => p.region === regionValue);
    const categoryLabels = Array.from(new Set(items.map((item) => categoryLabelMap[item.category] || item.category)));
    return {
      value: regionValue,
      label: regionValue,
      items,
      categorySummary: categoryLabels.slice(0, 3).join(' / '),
      moreCategoryCount: Math.max(categoryLabels.length - 3, 0),
      activeCount: items.filter((p) => p.status === 'ACTIVE').length,
      inactiveCount: items.filter((p) => p.status !== 'ACTIVE').length,
      instanceCount: items.reduce((sum, p) => sum + (Number(p.instanceCount) || 0), 0),
      activeInstanceCount: items.reduce((sum, p) => sum + (Number(p.activeInstanceCount) || 0), 0),
      autoProvisionCount: items.filter((p) => p.status === 'ACTIVE' && !hasInventoryRisk(p)).length,
      startingPrice: items.length > 0 ? Math.min(...items.map((p) => Number(p.allPrices?.GUEST) || 0)) : 0,
    };
  }).filter((g) => g.items.length > 0);
}

export function ProductList({
  products,
  collapsedGroups,
  selectedIds,
  onToggleGroup,
  onToggleSelect,
  onToggleRegionSelectAll,
  onEdit,
  onAllocate,
  onStockEdit,
  onToggleStatus,
  onDelete,
  onCreateInRegion,
}: ProductListProps) {
  const groupedProducts = useMemo(() => buildGroupedProducts(products), [products]);

  return (
    <div className="rounded-8 border border-surface-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[1024px] 2xl:min-w-[1240px]">
          <div className="grid grid-cols-[40px_minmax(280px,3.5fr)_minmax(140px,1.3fr)_minmax(140px,1.3fr)_minmax(90px,0.8fr)_minmax(130px,1.2fr)_minmax(130px,1.2fr)_minmax(220px,2fr)] gap-3 px-4 py-2.5 bg-surface-100 border-b border-surface-200 text-[11px] font-medium text-surface-400">
            <div>勾选</div>
            <div>商品名称</div>
            <div>类型</div>
            <div>定价 (含成本)</div>
            <div>库存</div>
            <div>已开通 / 总量</div>
            <div>开通方式</div>
            <div className="text-right">操作</div>
          </div>

          {groupedProducts.map((group) => (
            <ProductGroup
              key={group.value}
              group={group}
              collapsed={!!collapsedGroups[group.value]}
              selectedIds={selectedIds}
              onToggleCollapse={() => onToggleGroup(group.value)}
              onToggleSelect={onToggleSelect}
              onToggleRegionSelectAll={onToggleRegionSelectAll}
              onEdit={onEdit}
              onAllocate={onAllocate}
              onStockEdit={onStockEdit}
              onToggleStatus={onToggleStatus}
              onDelete={onDelete}
              onCreateInRegion={onCreateInRegion}
            />
          ))}

          {groupedProducts.length === 0 && (
            <div className="text-center text-surface-400 py-16 text-sm">当前筛选下暂无商品</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function useGroupedProductStats(products: Product[]) {
  return useMemo(() => {
    const grouped = buildGroupedProducts(products);
    const visibleProductIds = grouped.flatMap((group) => group.items.map((item) => item.id));
    const visibleActiveProductIds = grouped
      .flatMap((group) => group.items)
      .filter((item) => item.status === 'ACTIVE')
      .map((item) => item.id);
    const totalProducts = grouped.reduce((sum, group) => sum + group.items.length, 0);
    const totalActiveProducts = grouped.reduce((sum, group) => sum + group.activeCount, 0);
    const totalInstances = grouped.reduce((sum, group) => sum + group.instanceCount, 0);
    const totalActiveInstances = grouped.reduce((sum, group) => sum + group.activeInstanceCount, 0);
    const totalAutoProvision = grouped.reduce((sum, group) => sum + group.autoProvisionCount, 0);
    const hasExpandedGroup = grouped.some(() => true);

    return {
      grouped,
      visibleProductIds,
      visibleActiveProductIds,
      totalProducts,
      totalActiveProducts,
      totalInstances,
      totalActiveInstances,
      totalAutoProvision,
      hasExpandedGroup,
    };
  }, [products]);
}
