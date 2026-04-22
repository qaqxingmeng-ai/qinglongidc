'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '@/lib/api-client';
import { PageHeader, Panel, SkeletonTable, useToast } from '@/components/admin/layout';
import { easeOut } from '@/components/admin/motion';

interface PricingConfig {
  basePriceMultiplier: number;
  renewalDiscount: number;
  currencyPrecision: number;
  minOrderAmount: number;
  maxOrderAmount: number;
  taxRate: number;
  rules: PricingRule[];
}

interface PricingRule {
  id: string;
  name: string;
  type: string;
  value: number;
  enabled: boolean;
  priority: number;
}

export default function PricingPage() {
  const toast = useToast();
  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/pricing');
      const json = await res.json();
      if (json.success) setConfig(json.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/admin/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (json.success) toast.success('定价策略已更新');
      else toast.error(json.message || '保存失败');
    } catch {
      toast.error('请求失败');
    }
    setSaving(false);
  };

  if (loading || !config) {
    return (
      <div className="space-y-5">
        <PageHeader title="定价策略" subtitle="配置全局定价参数和计算规则。" />
        <SkeletonTable rows={4} columns={2} />
      </div>
    );
  }

  const field = (label: string, key: keyof Omit<PricingConfig, 'rules'>, suffix = '') => (
    <div className="flex items-center justify-between py-3 border-b border-surface-50">
      <span className="text-sm text-surface-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          step="any"
          value={config[key] as number}
          onChange={(e) => setConfig({ ...config, [key]: Number(e.target.value) })}
          className="w-32 rounded-6 border border-surface-200 px-3 py-1.5 text-sm text-right font-mono outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
        />
        {suffix && <span className="text-xs text-surface-400">{suffix}</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="定价策略"
        subtitle="配置全局定价参数和计算规则。"
        actions={
          <button onClick={handleSave} disabled={saving} className="rounded-6 bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors">
            {saving ? '保存中...' : '保存更改'}
          </button>
        }
      />

      <Panel>
        <h3 className="mb-2 text-sm font-semibold text-surface-600">基础参数</h3>
        {field('基价倍率', 'basePriceMultiplier', 'x')}
        {field('续费折扣', 'renewalDiscount', '%')}
        {field('货币精度', 'currencyPrecision', '位小数')}
        {field('最小订单金额', 'minOrderAmount', '¥')}
        {field('最大订单金额', 'maxOrderAmount', '¥')}
        {field('税率', 'taxRate', '%')}
      </Panel>

      {config.rules && config.rules.length > 0 && (
        <Panel className="overflow-x-auto">
          <h3 className="mb-3 text-sm font-semibold text-surface-600">定价规则</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100 text-left text-xs font-medium text-surface-400 uppercase tracking-wider">
                <th className="px-4 py-3">规则名称</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">值</th>
                <th className="px-4 py-3">优先级</th>
                <th className="px-4 py-3">状态</th>
              </tr>
            </thead>
            <tbody>
              {config.rules.map((rule, i) => (
                <motion.tr key={rule.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOut, delay: Math.min(i * 0.02, 0.2) }} className="border-b border-surface-50 hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-surface-600">{rule.name}</td>
                  <td className="px-4 py-3 text-surface-500">{rule.type}</td>
                  <td className="px-4 py-3 text-surface-500 font-mono">{rule.value}</td>
                  <td className="px-4 py-3 text-surface-500">{rule.priority}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-4 px-2 py-0.5 text-xs font-medium ${rule.enabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-surface-100 text-surface-400'}`}>
                      {rule.enabled ? '启用' : '禁用'}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
