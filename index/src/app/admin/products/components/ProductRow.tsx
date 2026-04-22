'use client';

import type { Product } from '../types';
import { categoryLabelMap, getStockMeta, getProvisionMeta, getCpuDisplayText } from '../types';

interface ProductRowProps {
  product: Product;
  isSelected: boolean;
  onToggleSelect: (id: string, checked: boolean) => void;
  onEdit: (product: Product) => void;
  onAllocate: (product: Product) => void;
  onStockEdit: (product: Product) => void;
  onToggleStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}

export function ProductRow({
  product: p,
  isSelected,
  onToggleSelect,
  onEdit,
  onAllocate,
  onStockEdit,
  onToggleStatus,
  onDelete,
}: ProductRowProps) {
  const stockMeta = getStockMeta(p);
  const provisionMeta = getProvisionMeta(p);

  return (
    <div
      className={`grid grid-cols-[40px_minmax(280px,3.5fr)_minmax(140px,1.3fr)_minmax(140px,1.3fr)_minmax(90px,0.8fr)_minmax(130px,1.2fr)_minmax(130px,1.2fr)_minmax(220px,2fr)] gap-3 px-4 py-3 border-b border-surface-50 last:border-b-0 hover:bg-semantic-info-light/30 transition text-xs${p.status !== 'ACTIVE' ? ' opacity-50' : ''}`}
    >
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggleSelect(p.id, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="flex items-start gap-3 min-w-0 pl-8">
        <div className="min-w-0">
          <p className="font-medium text-surface-600 truncate leading-tight">{p.name}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-surface-400">
            <span>{getCpuDisplayText(p)}</span>
            <span>{p.region}</span>
            <span>{p.memory}</span>
            <span>{p.storage}</span>
          </div>
        </div>
      </div>
      <div className="text-surface-400 leading-5">
        <div>{categoryLabelMap[p.category] || p.category}</div>
        <div className="text-[11px] text-surface-400">{p.bandwidth}</div>
      </div>
      <div className="leading-5">
        <div className="font-semibold text-surface-600 border-b border-surface-100 pb-0.5 mb-0.5">售价 ¥{p.allPrices.GUEST} <span className="text-surface-400 font-normal text-[10px]">| 成本 ¥{p.costPrice}</span></div>
        <div className="text-[10px] text-surface-400 flex gap-2"><span>合 ¥{p.allPrices.PARTNER}</span><span>SVIP ¥{p.allPrices.VIP_TOP}</span><span>VIP ¥{p.allPrices.VIP}</span></div>
      </div>
      <div className={`font-medium ${stockMeta.cls}`}>
        <div>{p.stock === -1 ? '不限' : p.stock === 0 ? '已售罄' : String(p.stock)}</div>
        {p.stockAlert > 0 && p.stock !== -1 && (
          <div className="text-[10px] text-surface-400">预警: {p.stockAlert}</div>
        )}
      </div>
      <div className="leading-5 text-surface-400">
        <div>{p.activeInstanceCount} / {p.instanceCount}</div>
        <div className="text-[11px] text-surface-400">{p.supplier || '-'}</div>
      </div>
      <div className={`leading-5 ${provisionMeta.cls}`}>
        <div>{provisionMeta.label}</div>
        <div className="text-[11px] text-surface-400">{p.status === 'ACTIVE' ? '当前可售' : '暂停销售'}</div>
      </div>
      <div className="flex justify-end gap-3 text-[11px] items-center">
        <span className={p.status === 'ACTIVE' ? 'badge-green' : 'badge-red'}>{p.status === 'ACTIVE' ? '上架' : '下架'}</span>
        <button onClick={() => onAllocate(p)} className="text-violet-600 hover:underline">分配</button>
        <button onClick={() => onStockEdit(p)} className="text-semantic-warning hover:underline">库存</button>
        <button onClick={() => onEdit(p)} className="text-surface-500 hover:text-surface-600 hover:underline">编辑</button>
        <button onClick={() => onToggleStatus(p.id, p.status)} className="text-brand-500 hover:underline">
          {p.status === 'ACTIVE' ? '下架' : '上架'}
        </button>
        <button onClick={() => onDelete(p.id)} className="text-rose-500 hover:underline">删除</button>
      </div>
    </div>
  );
}
