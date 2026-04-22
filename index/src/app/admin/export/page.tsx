'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api-client';
import { PageHeader, Panel, PanelGrid, PanelGridItem, useToast } from '@/components/admin/layout';

type ExportType = 'users' | 'orders' | 'servers' | 'transactions';

interface ExportConfig {
  key: ExportType;
  label: string;
  desc: string;
  filters: { key: string; label: string; type: 'date' | 'select' | 'text' | 'number'; options?: { value: string; label: string }[] }[];
}

const EXPORT_CONFIGS: ExportConfig[] = [
  {
    key: 'users',
    label: '用户数据',
    desc: '导出所有用户信息，支持脱敏处理',
    filters: [
      {
        key: 'desensitize',
        label: '脱敏处理',
        type: 'select',
        options: [
          { value: 'true', label: '是（邮箱/手机号脱敏）' },
          { value: 'false', label: '否（明文导出）' },
        ],
      },
    ],
  },
  {
    key: 'orders',
    label: '订单数据',
    desc: '导出订单列表，支持时间和状态筛选',
    filters: [
      { key: 'startDate', label: '开始日期', type: 'date' },
      { key: 'endDate', label: '结束日期', type: 'date' },
      {
        key: 'status',
        label: '订单状态',
        type: 'select',
        options: [
          { value: '', label: '全部' },
          { value: 'PENDING', label: 'PENDING' },
          { value: 'PAID', label: 'PAID' },
          { value: 'PROCESSING', label: 'PROCESSING' },
          { value: 'COMPLETED', label: 'COMPLETED' },
          { value: 'CANCELLED', label: 'CANCELLED' },
        ],
      },
    ],
  },
  {
    key: 'servers',
    label: '服务器数据',
    desc: '导出实例列表，支持状态筛选',
    filters: [
      {
        key: 'status',
        label: '服务器状态',
        type: 'select',
        options: [
          { value: '', label: '全部' },
          { value: 'ACTIVE', label: 'ACTIVE' },
          { value: 'EXPIRED', label: 'EXPIRED' },
          { value: 'ABNORMAL', label: 'ABNORMAL' },
          { value: 'SUSPENDED', label: 'SUSPENDED' },
          { value: 'PENDING', label: 'PENDING' },
        ],
      },
    ],
  },
  {
    key: 'transactions',
    label: '财务流水',
    desc: '导出交易记录，支持时间、类型、用户邮箱、金额区间筛选；超5000条自动异步导出',
    filters: [
      { key: 'startDate', label: '开始日期', type: 'date' },
      { key: 'endDate', label: '结束日期', type: 'date' },
      {
        key: 'type',
        label: '交易类型',
        type: 'select',
        options: [
          { value: '', label: '全部' },
          { value: 'PURCHASE', label: 'PURCHASE' },
          { value: 'RECHARGE', label: 'RECHARGE' },
          { value: 'RENEWAL', label: 'RENEWAL' },
          { value: 'REFUND', label: 'REFUND' },
          { value: 'ADMIN_RECHARGE', label: 'ADMIN_RECHARGE' },
          { value: 'ADMIN_DEDUCT', label: 'ADMIN_DEDUCT' },
        ],
      },
      { key: 'userEmail', label: '用户邮箱（模糊匹配）', type: 'text' },
      { key: 'minAmount', label: '最小金额', type: 'number' },
      { key: 'maxAmount', label: '最大金额', type: 'number' },
      {
        key: 'format',
        label: '导出格式',
        type: 'select',
        options: [
          { value: 'csv', label: 'CSV（Excel 可直接打开）' },
          { value: 'xlsx', label: 'XLSX（Excel 格式）' },
        ],
      },
    ],
  },
];

function ExportCard({ config }: { config: ExportConfig }) {
  const toast = useToast();
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ desensitize: 'true', format: 'csv' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadFilename, setDownloadFilename] = useState('');
  const [asyncTotal, setAsyncTotal] = useState<number | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setError('');
    setDownloadUrl('');
    setDownloadFilename('');
    setAsyncTotal(null);
    try {
      const params = new URLSearchParams();
      config.filters.forEach((f) => {
        const v = filterValues[f.key] ?? '';
        if (v) params.set(f.key, v);
      });
      const res = await apiFetch(`/api/admin/export/${config.key}?${params.toString()}`, { method: 'GET' });
      if (!res.ok) {
        setError('导出失败');
        toast.error('导出失败');
        return;
      }
      const contentType = res.headers.get('Content-Type') ?? '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        if (json.success && json.downloadUrl) {
          const normalizedUrl = String(json.downloadUrl);
          const isSafeUrl = normalizedUrl.startsWith('/') || normalizedUrl.startsWith(window.location.origin);
          if (!isSafeUrl) {
            setError('下载地址不安全，已阻止');
            toast.error('导出任务返回了不安全链接');
            return;
          }
          setDownloadUrl(normalizedUrl);
          setDownloadFilename(json.filename ?? 'export');
          setAsyncTotal(json.total ?? null);
          toast.success('导出任务已完成');
        } else {
          setError('导出任务失败');
          toast.error('导出任务失败');
        }
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const filename = disposition.match(/filename=([^\s;]+)/)?.[1] ?? `${config.key}_export.${filterValues.format ?? 'csv'}`;
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('文件已开始下载');
    } catch {
      setError('导出失败，请重试');
      toast.error('导出失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel title={config.label} description={config.desc}>
      <div className="space-y-3">
        {config.filters.map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-xs text-surface-400">{f.label}</label>
            {f.type === 'date' ? (
              <input type="date" value={filterValues[f.key] ?? ''} onChange={(e) => setFilterValues((prev) => ({ ...prev, [f.key]: e.target.value }))} className="input" />
            ) : f.type === 'text' ? (
              <input type="text" value={filterValues[f.key] ?? ''} onChange={(e) => setFilterValues((prev) => ({ ...prev, [f.key]: e.target.value }))} placeholder="输入搜索内容" className="input" />
            ) : f.type === 'number' ? (
              <input type="number" min={0} value={filterValues[f.key] ?? ''} onChange={(e) => setFilterValues((prev) => ({ ...prev, [f.key]: e.target.value }))} placeholder="0.00" className="input" />
            ) : (
              <select value={filterValues[f.key] ?? ''} onChange={(e) => setFilterValues((prev) => ({ ...prev, [f.key]: e.target.value }))} className="input">
                {f.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>

      <button disabled={loading} onClick={handleExport} className="mt-4 h-8 w-full rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
        {loading ? '导出中...' : `导出 ${(filterValues.format ?? 'CSV').toUpperCase()}`}
      </button>

      {error && <p className="mt-2 text-xs text-semantic-danger">{error}</p>}
      {downloadUrl && (
        <div className="mt-3 rounded-8 border border-semantic-success-light bg-semantic-success-light p-3">
          <p className="mb-1 text-xs font-medium text-semantic-success-dark">{asyncTotal !== null ? `共 ${asyncTotal} 条，` : ''}导出完成</p>
          <a href={downloadUrl} download={downloadFilename} className="text-xs font-medium text-semantic-success-dark underline">点击下载 {downloadFilename}</a>
        </div>
      )}
    </Panel>
  );
}

function AdminExportInner() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== 'ADMIN') router.push('/');
  }, [user, router]);

  return (
    <div className="space-y-5">
      <PageHeader title="数据导出" subtitle="支持 CSV / XLSX 导出，超过 5000 条自动异步并返回下载链接" />
      <PanelGrid className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {EXPORT_CONFIGS.map((cfg) => (
          <PanelGridItem key={cfg.key}>
            <ExportCard config={cfg} />
          </PanelGridItem>
        ))}
      </PanelGrid>
    </div>
  );
}

export default function AdminExportPage() {
  return (
    <AuthProvider>
      <AdminExportInner />
    </AuthProvider>
  );
}
