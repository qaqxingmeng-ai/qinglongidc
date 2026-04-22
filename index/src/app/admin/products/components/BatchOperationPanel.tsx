'use client';

import type { BatchField } from '../types';
import { DEFAULT_CATEGORY_ORDER, categoryLabelMap } from '../types';

interface BatchGenResult {
  id: string;
  name: string;
  status: string;
  description?: string;
  suitableFor?: string;
  error?: string;
}

interface BatchOperationPanelProps {
  selectedCount: number;
  visibleProductIds: string[];
  visibleActiveProductIds: string[];
  batchField: BatchField;
  setBatchField: (field: BatchField) => void;
  batchValue: string;
  setBatchValue: (value: string) => void;
  batchSaving: boolean;
  batchGenLoading: boolean;
  batchGenResults: BatchGenResult[] | null;
  batchGenOverwrite: boolean;
  setBatchGenOverwrite: (value: boolean) => void;
  showBatchGenPanel: boolean;
  setShowBatchGenPanel: (value: boolean) => void;
  onSelectVisible: (ids: string[]) => void;
  onSelectActive: (ids: string[]) => void;
  onClearSelection: () => void;
  onApplyBatchUpdate: () => void;
  onBatchGenerateDesc: () => void;
}

export function BatchOperationPanel({
  selectedCount,
  visibleProductIds,
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
  onSelectVisible,
  onSelectActive,
  onClearSelection,
  onApplyBatchUpdate,
  onBatchGenerateDesc,
}: BatchOperationPanelProps) {
  return (
    <div className="space-y-3 mb-5">
      <div className="card py-3 px-4 border border-blue-100 bg-semantic-info-light/40">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-brand-600 bg-blue-100 rounded px-2 py-0.5">
            已选 <span className="text-blue-900">{selectedCount}</span> / {visibleProductIds.length}
          </span>
          <button onClick={() => onSelectVisible(visibleProductIds)} className="btn-secondary btn-sm" disabled={visibleProductIds.length === 0}>全选当前筛选</button>
          <button onClick={() => onSelectActive(visibleActiveProductIds)} className="btn-secondary btn-sm" disabled={visibleActiveProductIds.length === 0}>选择上架商品</button>
          <button onClick={onClearSelection} className="btn-secondary btn-sm" disabled={selectedCount === 0}>清空勾选</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-surface-400 shrink-0">统一调整</span>
          <select className="input h-8 text-sm w-28" value={batchField} onChange={(e) => setBatchField(e.target.value as BatchField)}>
            <option value="status">状态</option>
            <option value="category">分类</option>
            <option value="region">地区</option>
            <option value="isDualCPU">单双路</option>
          </select>
          <span className="text-surface-300 text-lg leading-none">→</span>
          <div className="w-40">
            {batchField === 'status' && (
              <select className="input h-8 text-sm w-full" value={batchValue} onChange={(e) => setBatchValue(e.target.value)}>
                <option value="ACTIVE">上架</option>
                <option value="INACTIVE">下架</option>
              </select>
            )}
            {batchField === 'category' && (
              <select className="input h-8 text-sm w-full" value={batchValue} onChange={(e) => setBatchValue(e.target.value)}>
                {DEFAULT_CATEGORY_ORDER.map((v) => (
                  <option key={v} value={v}>{categoryLabelMap[v]}</option>
                ))}
              </select>
            )}
            {batchField === 'region' && (
              <input
                className="input h-8 text-sm w-full"
                placeholder="如：香港"
                value={batchValue}
                onChange={(e) => setBatchValue(e.target.value)}
              />
            )}
            {batchField === 'isDualCPU' && (
              <select className="input h-8 text-sm w-full" value={batchValue} onChange={(e) => setBatchValue(e.target.value)}>
                <option value="true">双路</option>
                <option value="false">单路</option>
              </select>
            )}
          </div>
          <button onClick={onApplyBatchUpdate} disabled={batchSaving || selectedCount === 0} className="btn-primary btn-sm disabled:opacity-50">
            {batchSaving ? '更新中...' : '应用到已选商品'}
          </button>
          <div className="border-l border-blue-200 h-5 mx-1" />
          <button
            onClick={() => setShowBatchGenPanel(!showBatchGenPanel)}
            disabled={selectedCount === 0}
            className="btn-secondary btn-sm disabled:opacity-50"
          >
            AI 批量生成描述
          </button>
        </div>
      </div>

      {showBatchGenPanel && (
        <div className="card py-3 px-4 border border-purple-100 bg-purple-50/30">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="text-sm font-medium text-surface-500">已选 {selectedCount} 个产品将生成 AI 描述</span>
            <label className="flex items-center gap-1.5 text-sm text-surface-500 cursor-pointer">
              <input
                type="checkbox"
                checked={batchGenOverwrite}
                onChange={e => setBatchGenOverwrite(e.target.checked)}
                className="rounded"
              />
              覆盖已有描述
            </label>
            <button
              onClick={onBatchGenerateDesc}
              disabled={batchGenLoading || selectedCount === 0}
              className="btn-primary btn-sm disabled:opacity-50"
            >
              {batchGenLoading ? '生成中...' : '开始生成'}
            </button>
          </div>
          {batchGenLoading && (
            <p className="text-xs text-purple-500 mb-2">正在逐个调用 AI，请耐心等待...</p>
          )}
          {batchGenResults && (
            <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
              {batchGenResults.map(r => (
                <div key={r.id} className="flex items-start gap-3 text-xs py-1.5 border-b border-purple-100/60 last:border-0">
                  <span className={`shrink-0 font-semibold ${r.status === 'ok' ? 'text-semantic-success' : r.status === 'skipped' ? 'text-surface-400' : 'text-semantic-danger'}`}>
                    {r.status === 'ok' ? '已生成' : r.status === 'skipped' ? '已跳过' : '失败'}
                  </span>
                  <span className="text-surface-500 font-medium shrink-0">{r.name}</span>
                  {r.description && <span className="text-surface-400 truncate">{r.description}</span>}
                  {r.error && <span className="text-red-400">{r.error}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
