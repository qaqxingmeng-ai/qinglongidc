'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

interface FinanceData {
  totalRevenue: number;
  totalRecharge: number;
}

export default function AgentFinancePage() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/agent/finance', { method: 'GET' })
      .then(r => r.json())
      .then(json => { if (json.success) setData(json.data); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-surface-400 py-20 text-center">加载中...</div>;
  if (!data) return <div className="text-surface-400 py-20 text-center">加载失败</div>;

  return (
    <div>
      <h1 className="section-title mb-6">财务中心</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-8 border border-surface-100 p-5">
          <p className="text-xs text-surface-400 mb-1">累计营收</p>
          <p className="text-xl font-semibold text-surface-600">¥{data.totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-8 border border-surface-100 p-5">
          <p className="text-xs text-surface-400 mb-1">累计充值</p>
          <p className="text-xl font-semibold text-brand-500">¥{data.totalRecharge.toLocaleString()}</p>
        </div>
      </div>
      <div className="text-sm text-surface-400 bg-white rounded-8 border border-surface-100 p-4">
        当前接口仅返回汇总数据，订单级明细将在后端扩展后展示。
      </div>
    </div>
  );
}
