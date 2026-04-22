'use client';

import type { Product } from '../types';
import { ProductRow } from './ProductRow';

export interface ProductGroupData {
  value: string;
  label: string;
  items: Product[];
  categorySummary: string;
  moreCategoryCount: number;
  activeCount: number;
  inactiveCount: number;
  instanceCount: number;
  activeInstanceCount: number;
  autoProvisionCount: number;
  startingPrice: number;
}

interface ProductGroupProps {
  group: ProductGroupData;
  collapsed: boolean;
  selectedIds: string[];
  onToggleCollapse: () => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onToggleRegionSelectAll: (ids: string[], checked: boolean) => void;
  onEdit: (product: Product) => void;
  onAllocate: (product: Product) => void;
  onStockEdit: (product: Product) => void;
  onToggleStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onCreateInRegion: (region: string) => void;
}

export function ProductGroup({
  group,
  collapsed,
  selectedIds,
  onToggleCollapse,
  onToggleSelect,
  onToggleRegionSelectAll,
  onEdit,
  onAllocate,
  onStockEdit,
  onToggleStatus,
  onDelete,
  onCreateInRegion,
}: ProductGroupProps) {
  return (
    <div className="border-b border-surface-100 last:border-b-0">
      <div className="grid grid-cols-[40px_minmax(280px,3.5fr)_minmax(140px,1.3fr)_minmax(140px,1.3fr)_minmax(90px,0.8fr)_minmax(130px,1.2fr)_minmax(130px,1.2fr)_minmax(220px,2fr)] gap-3 px-4 py-3 bg-[#f4f7fb] border-b border-surface-200 text-sm">
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={group.items.every((item) => selectedIds.includes(item.id)) && group.items.length > 0}
            onChange={(e) => onToggleRegionSelectAll(group.items.map((item) => item.id), e.target.checked)}
          />
        </div>
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onToggleCollapse}
            className="text-surface-400 hover:text-surface-600 text-sm leading-none"
          >
            {collapsed ? '▸' : '▾'}
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-surface-600">{group.label}</span>
              <span className="text-[11px] text-surface-400 bg-white border border-surface-200 rounded-full px-2 py-0.5">{group.items.length} 个商品</span>
            </div>
            <p className="text-[11px] text-surface-400 mt-0.5">
              {group.categorySummary || '未分类'}
              {group.moreCategoryCount > 0 ? ` 等 ${group.moreCategoryCount + 3} 类` : ''}
              <span className="ml-2">上架 {group.activeCount} / 下架 {group.inactiveCount}</span>
            </p>
          </div>
        </div>
        <div className="text-xs text-surface-400 self-center">起价 ¥{group.startingPrice}</div>
        <div className="text-xs text-surface-400 self-center">实例 {group.activeInstanceCount}/{group.instanceCount}</div>
        <div className="text-xs text-surface-400 self-center">可售 {group.activeCount}</div>
        <div className="text-xs text-surface-400 self-center">可直接开通 {group.autoProvisionCount}</div>
        <div className="text-right self-center" />
        <div className="flex justify-end gap-3 text-[11px] items-center">
          <button onClick={() => onCreateInRegion(group.value)} className="text-semantic-success hover:underline">新增商品</button>
          <button onClick={onToggleCollapse} className="text-brand-500 hover:underline">{collapsed ? '展开' : '收起'}</button>
        </div>
      </div>

      {!collapsed && group.items.map((p) => (
        <ProductRow
          key={p.id}
          product={p}
          isSelected={selectedIds.includes(p.id)}
          onToggleSelect={onToggleSelect}
          onEdit={onEdit}
          onAllocate={onAllocate}
          onStockEdit={onStockEdit}
          onToggleStatus={onToggleStatus}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
