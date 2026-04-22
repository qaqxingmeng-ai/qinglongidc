'use client';

import type { BatchField } from '../types';
import { DEFAULT_CATEGORY_ORDER, categoryLabelMap } from '../types';
import { BulkActionSection } from '@/components/admin/layout';

interface BatchGenResult {
  id: string;
  name: string;
  status: string;
  description?: string;
  suitableFor?: string;
  error?: string;
}

interface Props {
  selectedCount: number;
  visibleActiveProductIds: string[];
  batchField: BatchField;
  setBatchField: (field: BatchField) => void;
  batchValue: string;
  setBatchValue: (value: string) => void;
  batchSaving: boolean;
  batchGenLoading: boolean;
  batchGenResults: BatchGenResult[] | null;
  batchGenOverwrite: boolean;
  setBatchGenOverwrite: (v: boolean) => void;
  showBatchGenPanel: boolean;
  setShowBatchGenPanel: (v: boolean) => void;
  onSelectActive: (ids: string[]) => void;
  onApplyBatchUpdate: () => void;
  onBatchGenerateDesc: () => void;
}

export function ProductBulkDrawerBody({
  selectedCount,
  visibleActiveProductIds,
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
  onSelectActive,
  onApplyBatchUpdate,
  onBatchGenerateDesc,
}: Props) {
  return (
    <>
      <BulkActionSection label="统一调整字段">
        <select
          className="input h-8 text-xs"
          value={batchField}
          onChange={(e) => setBatchField(e.target.value as BatchField)}
        >
          <option value="status">状态</option>
          <option value="category">分类</option>
          <option value="region">地区</option>
          <option value="isDualCPU">单双路</option>
        </select>
        {batchField === 'status' && (
          <select className="input h-8 text-xs" value={batchValue} onChange={(e) => setBatchValue(e.target.value)}>
            <option value="ACTIVE">上架</option>
            <option value="INACTIVE">下架</option>
          </select>
        )}
        {batchField === 'category' && (
          <select className="input h-8 text-xs" value={batchValue} onChange={(e) => setBatchValue(e.target.value)}>
            {DEFAULT_CATEGORY_ORDER.map((v) => (
              <option key={v} value={v}>{categoryLabelMap[v]}</option>
            ))}
          </select>
        )}
        {batchField === 'region' && (
          <input
            className="input h-8 text-xs"
            placeholder="如：香港"
            value={batchValue}
            onChange={(e) => setBatchValue(e.target.value)}
          />
        )}
        {batchField === 'isDualCPU' && (
          <select className="input h-8 text-xs" value={batchValue} onChange={(e) => setBatchValue(e.target.value)}>
            <option value="true">双路</option>
            <option value="false">单路</option>
          </select>
        )}
        <button
          onClick={onApplyBatchUpdate}
          disabled={batchSaving || selectedCount === 0}
          className="h-8 w-full rounded-6 bg-brand-500 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          {batchSaving ? '更新中…' : '应用到已选商品'}
        </button>
      </BulkActionSection>

      <BulkActionSection label="快捷选择">
        <button
          onClick={() => onSelectActive(visibleActiveProductIds)}
          disabled={visibleActiveProductIds.length === 0}
          className="h-8 w-full rounded-6 border border-surface-200 bg-white text-[12px] font-medium text-surface-500 transition-colors hover:border-brand-500 hover:text-brand-500 disabled:opacity-50"
        >
          仅选上架商品（{visibleActiveProductIds.length}）
        </button>
      </BulkActionSection>

      <BulkActionSection label="AI 批量生成描述">
        <label className="flex items-center gap-1.5 text-xs text-surface-500 cursor-pointer">
          <input
            type="checkbox"
            checked={batchGenOverwrite}
            onChange={(e) => setBatchGenOverwrite(e.target.checked)}
            className="rounded"
          />
          覆盖已有描述
        </label>
        <button
          onClick={() => {
            setShowBatchGenPanel(true);
            onBatchGenerateDesc();
          }}
          disabled={batchGenLoading || selectedCount === 0}
          className="h-8 w-full rounded-6 border border-brand-200 bg-brand-50 text-[12px] font-medium text-brand-600 transition-colors hover:bg-brand-100 disabled:opacity-50"
        >
          {batchGenLoading ? '生成中…' : '开始生成'}
        </button>
        {showBatchGenPanel && batchGenResults && batchGenResults.length > 0 && (
          <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-4 border border-surface-100 bg-surface-50 px-2 py-1.5">
            {batchGenResults.map((r) => (
              <div key={r.id} className="flex items-start gap-1.5 text-[11px] py-0.5">
                <span
                  className={`shrink-0 font-semibold ${
                    r.status === 'ok'
                      ? 'text-semantic-success'
                      : r.status === 'skipped'
                        ? 'text-surface-400'
                        : 'text-semantic-danger'
                  }`}
                >
                  {r.status === 'ok' ? '成' : r.status === 'skipped' ? '跳' : '败'}
                </span>
                <span className="truncate text-surface-500">{r.name}</span>
              </div>
            ))}
          </div>
        )}
      </BulkActionSection>
    </>
  );
}
