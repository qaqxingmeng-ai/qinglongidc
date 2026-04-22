'use client';

import { useState } from 'react';
import { apiFetch, extractApiError } from '@/lib/api-client';
import type { ImportCandidate, ImportSummary, Message } from '../types';
import { IMPORT_FIELD_LABELS } from '../types';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  setMessage: (msg: Message | null) => void;
}

export function ImportModal({ isOpen, onClose, onSuccess, setMessage }: ImportModalProps) {
  const [rawText, setRawText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [source, setSource] = useState<'text' | 'file'>('text');
  const [strategy, setStrategy] = useState<'skip_errors' | 'abort'>('skip_errors');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [initialStatus, setInitialStatus] = useState<'ACTIVE' | 'INACTIVE'>('INACTIVE');

  const handleClose = () => {
    onClose();
  };

  const handleReset = () => {
    setRawText('');
    setFile(null);
    setHeaders([]);
    setMapping({});
    setSummary(null);
    setCandidates([]);
    setSelectedKeys([]);
  };

  const parseCandidates = async () => {
    if (!file && rawText.trim().length < 20) {
      setMessage({ type: 'error', text: '请上传 CSV/XLSX，或粘贴更完整的商品内容（至少 20 字）' });
      return;
    }

    try {
      setParsing(true);
      setMessage(null);
      let res: Response;
      if (file) {
        const formData = new FormData();
        formData.append('mode', 'preview');
        formData.append('file', file);
        if (Object.keys(mapping).length > 0) {
          formData.append('mapping', JSON.stringify(mapping));
        }
        res = await apiFetch('/api/admin/products/import', { method: 'POST', body: formData });
      } else {
        res = await apiFetch('/api/admin/products/import', {
          method: 'POST',
          body: JSON.stringify({
            mode: 'preview',
            rawText,
            mapping,
          }),
        });
      }
      const json = await res.json();
      if (!json.success) throw new Error(extractApiError(json.error, '识别失败'));

      const items: ImportCandidate[] = json.data.items || [];
      setSummary(json.data.summary || null);
      setSource((json.data.source || (file ? 'file' : 'text')) as 'text' | 'file');
      setHeaders(json.data.headers || []);
      if (json.data.suggestedMapping) {
        setMapping(json.data.suggestedMapping);
      }
      setCandidates(items);
      const validKeys = items.filter((item) => item.valid !== false).map((item) => item.key);
      setSelectedKeys(validKeys);
      const invalidCount = items.length - validKeys.length;
      setMessage({ type: 'success', text: `识别完成：共 ${items.length} 个候选商品，可导入 ${validKeys.length} 个，异常 ${invalidCount} 个` });
    } catch (e) {
      const text = e instanceof Error ? e.message : '识别失败';
      setMessage({ type: 'error', text });
    } finally {
      setParsing(false);
    }
  };

  const submitCandidates = async () => {
    if (selectedKeys.length === 0) {
      setMessage({ type: 'error', text: '请至少勾选一个候选商品' });
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiFetch('/api/admin/products/import', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'confirm',
          items: candidates,
          selectedKeys,
          initialStatus,
          strategy,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(extractApiError(json.error, '导入失败'));
      setMessage({
        type: 'success',
        text: `导入完成：新增 ${json.data.createdCount} 个，跳过 ${json.data.skippedCount} 个，失败 ${json.data.failedCount} 个`,
      });
      handleClose();
      await onSuccess();
    } catch (e) {
      const text = e instanceof Error ? e.message : '导入失败';
      setMessage({ type: 'error', text });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 modal-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col modal-panel">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <div>
            <h2 className="text-base font-semibold text-surface-600">AI 识别导入商品</h2>
            <p className="text-xs text-surface-400 mt-1">先识别并预览新增分类/商品，确认后才会真正入库。</p>
          </div>
          <button onClick={handleClose} className="text-surface-400 hover:text-surface-500 text-xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto px-6 py-5 flex-1 space-y-4">
          <div>
            <label className="label">粘贴商品文本（支持整段复制）</label>
            <textarea
              className="input min-h-[120px]"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={'粘贴商品内容后点击"识别预览"，系统会先展示将新增哪些分类和商品。'}
            />
          </div>

          <div>
            <label className="label">或上传 CSV / XLSX 文件</label>
            <input
              type="file"
              accept=".csv,.xlsx"
              className="input"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setFile(f);
              }}
            />
            <p className="text-[11px] text-surface-400 mt-1">上传文件后将优先按文件识别，可在下方调整字段映射。</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={parseCandidates} disabled={parsing} className="btn-primary btn-sm disabled:opacity-50">
              {parsing ? '识别中...' : '识别预览'}
            </button>
            <button onClick={handleReset} className="btn-secondary btn-sm">
              清空
            </button>
            <div className="ml-auto min-w-[200px]">
              <label className="label">导入后默认状态</label>
              <select className="input" value={initialStatus} onChange={(e) => setInitialStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}>
                <option value="INACTIVE">下架（建议）</option>
                <option value="ACTIVE">上架</option>
              </select>
            </div>
            <div className="min-w-[220px]">
              <label className="label">遇错策略</label>
              <select className="input" value={strategy} onChange={(e) => setStrategy(e.target.value as 'skip_errors' | 'abort')}>
                <option value="skip_errors">跳过错误行继续导入</option>
                <option value="abort">出现错误立即中止</option>
              </select>
            </div>
          </div>

          {headers.length > 0 && (
            <div className="rounded-8 border border-surface-200 bg-white px-4 py-3">
              <p className="text-sm font-medium text-surface-600 mb-2">字段映射（来源: {source === 'file' ? '文件' : '文本'})</p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {Object.keys(IMPORT_FIELD_LABELS).map((field) => (
                  <div key={field}>
                    <label className="label">{IMPORT_FIELD_LABELS[field]}</label>
                    <select
                      className="input"
                      value={mapping[field] || ''}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [field]: e.target.value }))}
                    >
                      <option value="">不映射</option>
                      {headers.map((h) => (
                        <option key={`${field}-${h}`} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary && (
            <div className="rounded-8 border border-surface-200 bg-surface-50 px-4 py-3">
              <p className="text-sm text-surface-500">
                识别到 <span className="font-semibold text-surface-600">{summary.total}</span> 个候选商品，
                可导入 <span className="font-semibold text-semantic-success-dark">{summary.validCount ?? 0}</span> 个，
                异常 <span className="font-semibold text-semantic-danger">{summary.errorCount ?? 0}</span> 个
              </p>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-surface-500">
                <div>
                  <p className="font-medium text-surface-600 mb-1">将涉及分类</p>
                  <div className="flex flex-wrap gap-2">
                    {summary.categories.map((item) => (
                      <span key={item.category} className="rounded-full border border-surface-200 bg-white px-2 py-0.5">{item.category} ({item.count})</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="font-medium text-surface-600 mb-1">将涉及地区</p>
                  <div className="flex flex-wrap gap-2">
                    {summary.regions.map((item) => (
                      <span key={item.region} className="rounded-full border border-surface-200 bg-white px-2 py-0.5">{item.region} ({item.count})</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {candidates.length > 0 && (
            <div className="rounded-8 border border-surface-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-surface-100 border-b border-surface-200 flex items-center gap-3 text-xs text-surface-500">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedKeys.length === candidates.filter((item) => item.valid !== false).length}
                    onChange={(e) => {
                      const selectable = candidates.filter((item) => item.valid !== false).map((item) => item.key);
                      if (e.target.checked) setSelectedKeys(selectable);
                      else setSelectedKeys([]);
                    }}
                  />
                  全选
                </label>
                <span>已选 {selectedKeys.length} / {candidates.length}</span>
              </div>
              <div className="max-h-[280px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-white sticky top-0 border-b border-surface-100">
                    <tr className="text-surface-400">
                      <th className="text-left px-3 py-2">选择</th>
                      <th className="text-left px-3 py-2">名称</th>
                      <th className="text-left px-3 py-2">地区/分类</th>
                      <th className="text-left px-3 py-2">CPU</th>
                      <th className="text-left px-3 py-2">配置</th>
                      <th className="text-left px-3 py-2">价格</th>
                      <th className="text-left px-3 py-2">校验结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((item) => (
                      <tr key={item.key} className={`border-b border-surface-50 last:border-b-0 ${item.valid === false ? 'bg-semantic-danger-light/60' : ''}`}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedKeys.includes(item.key)}
                            disabled={item.valid === false}
                            onChange={(e) => {
                              setSelectedKeys((prev) => {
                                if (e.target.checked) return prev.includes(item.key) ? prev : [...prev, item.key];
                                return prev.filter((key) => key !== item.key);
                              });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-surface-600">{item.name}</td>
                        <td className="px-3 py-2 text-surface-400">{item.region} / {item.category}</td>
                        <td className="px-3 py-2 text-surface-400">{item.isDualCPU ? '双路' : '单路'} {item.cpuModel}</td>
                        <td className="px-3 py-2 text-surface-400">{item.memory} / {item.storage} / {item.bandwidth}</td>
                        <td className="px-3 py-2 text-surface-600">¥{item.originalPrice}</td>
                        <td className="px-3 py-2 text-xs">
                          {item.valid === false ? (
                            <span className="text-semantic-danger">{(item.errors || []).join('；')}</span>
                          ) : (
                            <span className="text-semantic-success">通过</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-surface-100">
          <button onClick={handleClose} className="btn-secondary btn-sm">取消</button>
          <button
            onClick={submitCandidates}
            disabled={submitting || selectedKeys.length === 0 || candidates.length === 0}
            className="btn-primary btn-sm disabled:opacity-50"
          >
            {submitting ? '导入中...' : `确认新增 ${selectedKeys.length} 个商品`}
          </button>
        </div>
      </div>
    </div>
  );
}
