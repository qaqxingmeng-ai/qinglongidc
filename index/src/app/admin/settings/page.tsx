'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';
import { PageHeader, Panel, SkeletonTable, useToast } from '@/components/admin/layout';

interface Settings {
  [key: string]: string;
}

export default function AdminSettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Settings>({});

  useEffect(() => {
    apiFetch('/api/admin/settings', { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const s: Settings = {};
          const items = json.data;
          if (Array.isArray(items)) {
            items.forEach((item: { key: string; value: string }) => { s[item.key] = item.value; });
          } else if (items && typeof items === 'object') {
            Object.entries(items).forEach(([key, value]) => { s[key] = String(value); });
          }
          setSettings(s);
          setForm(s);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async (keys: string[]) => {
    setSaving(true);
    try {
      const updates = keys.map((key) => ({ key, value: form[key] ?? '' }));
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: updates }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('设置已保存');
        setSettings({ ...form });
      } else {
        toast.error('保存失败', json.error?.message || '保存失败');
      }
    } catch {
      toast.error('网络错误');
    }
    setSaving(false);
  };

  const updateField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return <SkeletonTable rows={8} columns={2} />;
  }

  const siteKeys = ['site_name', 'site_description', 'site_logo_url', 'site_favicon_url', 'site_keywords', 'contact_email', 'contact_telegram'];
  const aiKeys = ['openai_api_key', 'openai_base_url', 'openai_model', 'ai_system_prompt'];
  const smtpKeys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from'];
  const smsKeys = ['smsAppID', 'smsAppKey', 'smsSignature'];
  const wafKeys = ['waf_enabled', 'waf_max_requests_per_minute', 'admin_ip_whitelist'];
  const inviteKeys = ['invite_reward_enabled', 'invite_reward_amount', 'invitee_reward_amount'];

  return (
    <div className="space-y-5">
      <PageHeader title="系统设置" subtitle="管理站点品牌、AI 服务、邮件网关和安全策略" />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <SettingsSection
            title="站点信息"
            icon="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            keys={siteKeys}
            form={form}
            settings={settings}
            onUpdate={updateField}
            onSave={handleSave}
            saving={saving}
            secretKeys={[]}
          />

          <SettingsSection
            title="AI 配置"
            icon="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            keys={aiKeys}
            form={form}
            settings={settings}
            onUpdate={updateField}
            onSave={handleSave}
            saving={saving}
            secretKeys={['openai_api_key']}
          />

          <SettingsSection
            title="邮件 SMTP"
            icon="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            keys={smtpKeys}
            form={form}
            settings={settings}
            onUpdate={updateField}
            onSave={handleSave}
            saving={saving}
            secretKeys={['smtp_password']}
          />

          <SettingsSection
            title="短信服务 (赛邮)"
            icon="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
            keys={smsKeys}
            form={form}
            settings={settings}
            onUpdate={updateField}
            onSave={handleSave}
            saving={saving}
            secretKeys={['smsAppKey']}
          />

          <SettingsSection
            title="安全与 WAF"
            icon="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            keys={wafKeys}
            form={form}
            settings={settings}
            onUpdate={updateField}
            onSave={handleSave}
            saving={saving}
            secretKeys={[]}
          />

          <SettingsSection
            title="邀请奖励"
            icon="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"
            keys={inviteKeys}
            form={form}
            settings={settings}
            onUpdate={updateField}
            onSave={handleSave}
            saving={saving}
            secretKeys={[]}
          />
        </div>

        <div className="space-y-5">
          <Panel>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[13px] font-medium text-surface-600">
                <svg className="h-4 w-4 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                系统状态
              </div>
              {[
                { label: '站点名称', value: form.site_name || '-' },
                { label: 'WAF 防护', value: form.waf_enabled === 'true' ? '已开启' : '已关闭', ok: form.waf_enabled === 'true' },
                { label: 'AI 服务', value: form.openai_api_key ? '已配置' : '未配置', ok: !!form.openai_api_key },
                { label: '邮件服务', value: form.smtp_host ? '已配置' : '未配置', ok: !!form.smtp_host },
                { label: '短信服务', value: form.smsAppID ? '已配置' : '未配置', ok: !!form.smsAppID },
                { label: '邀请奖励', value: form.invite_reward_enabled === 'true' ? '已开启' : '已关闭', ok: form.invite_reward_enabled === 'true' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-[13px] text-surface-400">{item.label}</span>
                  <span className={`text-[13px] font-medium ${item.ok ? 'text-semantic-success' : 'text-surface-400'}`}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

const KEY_LABELS: Record<string, string> = {
  site_name: '站点名称',
  site_description: '站点描述',
  site_logo_url: 'Logo URL',
  site_favicon_url: 'Favicon URL',
  site_keywords: 'SEO 关键词',
  contact_email: '联系邮箱',
  contact_telegram: 'Telegram',
  openai_api_key: 'API Key',
  openai_base_url: 'API Base URL',
  openai_model: '模型名称',
  ai_system_prompt: '系统提示词',
  smtp_host: 'SMTP 主机',
  smtp_port: '端口',
  smtp_user: '用户名',
  smtp_password: '密码',
  smtp_from: '发件人地址',
  smsAppID: 'APP ID',
  smsAppKey: 'APP Key',
  smsSignature: '短信签名',
  waf_enabled: 'WAF 开关',
  waf_max_requests_per_minute: '每分钟最大请求',
  admin_ip_whitelist: '管理 IP 白名单',
  invite_reward_enabled: '邀请奖励开关',
  invite_reward_amount: '邀请人奖励(元)',
  invitee_reward_amount: '被邀请人奖励(元)',
};

const KEY_TYPES: Record<string, string> = {
  ai_system_prompt: 'textarea',
  admin_ip_whitelist: 'textarea',
  waf_enabled: 'select',
  invite_reward_enabled: 'select',
};

function SettingsSection({
  title, icon, keys, form, settings, onUpdate, onSave, saving, secretKeys,
}: {
  title: string;
  icon: string;
  keys: string[];
  form: Settings;
  settings: Settings;
  onUpdate: (key: string, value: string) => void;
  onSave: (keys: string[]) => void;
  saving: boolean;
  secretKeys: string[];
}) {
  const hasChanges = keys.some((k) => (form[k] ?? '') !== (settings[k] ?? ''));

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <div className="admin-panel-title">
          <svg className="h-4 w-4 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d={icon} />
          </svg>
          {title}
        </div>
        {hasChanges && (
          <button onClick={() => onSave(keys)} disabled={saving} className="btn-primary btn-sm">
            {saving ? '保存中...' : '保存'}
          </button>
        )}
      </div>
      <div className="admin-panel-body">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {keys.map((key) => {
            const type = KEY_TYPES[key];
            const isSecret = secretKeys.includes(key);
            const isChanged = (form[key] ?? '') !== (settings[key] ?? '');

            if (type === 'textarea') {
              return (
                <div key={key} className="sm:col-span-2 form-group">
                  <label className="label">{KEY_LABELS[key] || key}</label>
                  <textarea
                    className="input min-h-[80px]"
                    value={form[key] ?? ''}
                    onChange={(e) => onUpdate(key, e.target.value)}
                    rows={3}
                  />
                </div>
              );
            }

            if (type === 'select') {
              return (
                <div key={key} className="form-group">
                  <label className="label">{KEY_LABELS[key] || key}</label>
                  <select className="input" value={form[key] ?? ''} onChange={(e) => onUpdate(key, e.target.value)}>
                    <option value="true">开启</option>
                    <option value="false">关闭</option>
                  </select>
                </div>
              );
            }

            return (
              <div key={key} className="form-group">
                <label className="label flex items-center gap-1.5">
                  {KEY_LABELS[key] || key}
                  {isChanged && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
                </label>
                <input
                  className="input"
                  type={isSecret ? 'password' : 'text'}
                  value={form[key] ?? ''}
                  onChange={(e) => onUpdate(key, e.target.value)}
                  placeholder={`输入${KEY_LABELS[key] || key}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
