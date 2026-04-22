'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, extractApiError } from '@/lib/api-client';
import { EmptyState, PageHeader, Panel, PanelGrid, PanelGridItem, SkeletonTable } from '@/components/admin/layout';

interface SecuritySettings {
  loginAttemptLimit: number;
  loginLockMinutes: number;
  passwordMinLength: number;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
  sessionTimeoutMinutes: number;
  singleSessionPerUser: boolean;
}

const DEFAULTS: SecuritySettings = {
  loginAttemptLimit: 5,
  loginLockMinutes: 15,
  passwordMinLength: 8,
  passwordRequireNumber: true,
  passwordRequireSymbol: false,
  sessionTimeoutMinutes: 720,
  singleSessionPerUser: false,
};

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-surface-400">{label}</label>
      <input
        className="input"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-surface-500">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded border-surface-300" />
      <span>{label}</span>
    </label>
  );
}

export default function AdminSecurityPage() {
  const [settings, setSettings] = useState<SecuritySettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    apiFetch('/api/admin/settings', { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setSettings({ ...DEFAULTS, ...(json.data || {}) });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!json.success) throw new Error(extractApiError(json.error, '保存失败'));
      setMsg({ type: 'success', text: '安全策略已保存' });
    } catch (e) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="安全中心"
        subtitle="管理登录限制、密码复杂度与会话策略"
        actions={<Link href="/admin/settings" className="text-xs text-brand-500 hover:underline">前往系统设置</Link>}
      />

      {loading ? (
        <SkeletonTable rows={6} columns={3} />
      ) : (
        <PanelGrid className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <PanelGridItem>
            <Panel title="登录策略" description="限制错误尝试并设定锁定时长。">
              <div className="space-y-3">
                <NumberField
                  label="最大失败次数"
                  value={settings.loginAttemptLimit}
                  min={1}
                  max={20}
                  onChange={(v) => setSettings((prev) => ({ ...prev, loginAttemptLimit: v }))}
                />
                <NumberField
                  label="锁定分钟数"
                  value={settings.loginLockMinutes}
                  min={1}
                  max={1440}
                  onChange={(v) => setSettings((prev) => ({ ...prev, loginLockMinutes: v }))}
                />
              </div>
            </Panel>
          </PanelGridItem>

          <PanelGridItem>
            <Panel title="密码策略" description="控制密码复杂度，降低弱口令风险。">
              <div className="space-y-3">
                <NumberField
                  label="最小长度"
                  value={settings.passwordMinLength}
                  min={6}
                  max={64}
                  onChange={(v) => setSettings((prev) => ({ ...prev, passwordMinLength: v }))}
                />
                <CheckField
                  label="必须包含数字"
                  checked={settings.passwordRequireNumber}
                  onChange={(v) => setSettings((prev) => ({ ...prev, passwordRequireNumber: v }))}
                />
                <CheckField
                  label="必须包含特殊字符"
                  checked={settings.passwordRequireSymbol}
                  onChange={(v) => setSettings((prev) => ({ ...prev, passwordRequireSymbol: v }))}
                />
              </div>
            </Panel>
          </PanelGridItem>

          <PanelGridItem>
            <Panel title="会话策略" description="控制会话有效期和并发登录。">
              <div className="space-y-3">
                <NumberField
                  label="会话超时（分钟）"
                  value={settings.sessionTimeoutMinutes}
                  min={10}
                  max={43200}
                  onChange={(v) => setSettings((prev) => ({ ...prev, sessionTimeoutMinutes: v }))}
                />
                <CheckField
                  label="启用单用户单会话"
                  checked={settings.singleSessionPerUser}
                  onChange={(v) => setSettings((prev) => ({ ...prev, singleSessionPerUser: v }))}
                />
              </div>
            </Panel>
          </PanelGridItem>
        </PanelGrid>
      )}

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-surface-400">当前为策略配置层，若需强制生效可继续接入登录鉴权与会话校验。</p>
          <div className="flex items-center gap-3">
            {msg && <span className={`text-sm ${msg.type === 'success' ? 'text-semantic-success' : 'text-semantic-danger'}`}>{msg.text}</span>}
            <button onClick={save} disabled={saving || loading} className="h-8 rounded-6 bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
              {saving ? '保存中...' : '保存安全策略'}
            </button>
          </div>
        </div>
      </Panel>

      {!loading && !settings && (
        <Panel>
          <EmptyState title="未读取到安全策略" description="请稍后重试" />
        </Panel>
      )}
    </div>
  );
}
