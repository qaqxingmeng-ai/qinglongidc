'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, extractApiError } from '@/lib/api-client';
import { useSiteMeta } from '@/components/SiteMetaProvider';

const AFF_KEY = 'aff_ref';

function buildLocalCaptcha() {
  const left = Math.floor(Math.random() * 8) + 2;
  const useAddition = Math.random() > 0.4;
  const right = useAddition
    ? Math.floor(Math.random() * 8) + 1
    : Math.floor(Math.random() * (left - 1)) + 1;

  return {
    question: `${left} ${useAddition ? '+' : '-'} ${right} = ?`,
    answer: String(useAddition ? left + right : left - right),
  };
}

interface AgentInfo {
  agentName: string;
  identityRequired: boolean;
}

export default function RegisterPage() {
  const router = useRouter();
  const { siteMeta } = useSiteMeta();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    emailCode: '',
    inviteCode: '',
    identityCode: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeCountdown, setCodeCountdown] = useState(0);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [agentVerifying, setAgentVerifying] = useState(false);
  const [captcha, setCaptcha] = useState(buildLocalCaptcha);
  const [captchaInput, setCaptchaInput] = useState('');

  // 从 URL 读取邀请码
  useEffect(() => {
    const saved = localStorage.getItem(AFF_KEY);
    if (!saved) return;
    setForm(prev => (prev.inviteCode ? prev : { ...prev, inviteCode: saved }));
  }, []);

  // 倒计时
  useEffect(() => {
    if (codeCountdown <= 0) return;
    const t = setTimeout(() => setCodeCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [codeCountdown]);

  // 验证邀请码 -> 查询代理商名称
  useEffect(() => {
    const code = form.inviteCode.trim();
    if (!code) {
      setAgentInfo(null);
      return;
    }
    const timer = setTimeout(async () => {
      setAgentVerifying(true);
      try {
        const res = await apiFetch(`/api/auth/verify-agent?code=${encodeURIComponent(code)}`, { method: 'GET' });
        const json = await res.json();
        if (json.success) {
          setAgentInfo(json.data);
        } else {
          setAgentInfo(null);
        }
      } catch {
        setAgentInfo(null);
      } finally {
        setAgentVerifying(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.inviteCode]);

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSendCode = async () => {
    if (!form.email) {
      setError('请先输入邮箱');
      return;
    }
    if (!captchaInput.trim()) {
      setError('请先输入本地验证码');
      return;
    }
    if (captchaInput.trim() !== captcha.answer) {
      setError('本地验证码错误，请重新输入');
      setCaptcha(buildLocalCaptcha());
      setCaptchaInput('');
      return;
    }
    setError('');
    try {
      const res = await apiFetch('/api/auth/send-code', {
        method: 'POST',
        body: JSON.stringify({ email: form.email }),
      });
      const json = await res.json();
      if (json.success) {
        setCodeSent(true);
        setCodeCountdown(60);
        setCaptcha(buildLocalCaptcha());
        setCaptchaInput('');
      } else {
        setError(typeof json.error === 'string' ? json.error : json.error?.message || '发送失败');
      }
    } catch {
      setError('网络错误');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('两次密码不一致');
      return;
    }

    if (form.password.length < 8 || !/[a-zA-Z]/.test(form.password) || !/\d/.test(form.password)) {
      setError('密码至少8位，需同时包含字母和数字');
      return;
    }
    if (!form.emailCode) {
      setError('请输入邮箱验证码');
      return;
    }

    if (form.inviteCode.trim()) {
      if (!agentInfo) {
        setError('请先确认邀请码有效');
        return;
      }
      if (agentInfo.identityRequired && !form.identityCode.trim()) {
        setError('请输入身份码，如未获取请联系上级合作商');
        return;
      }
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          phone: form.phone.trim() || undefined,
          code: form.emailCode.trim(),
          inviteCode: form.inviteCode.trim() || undefined,
          identityCode: form.identityCode.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        localStorage.removeItem(AFF_KEY);
        router.push('/dashboard');
        router.refresh();
      } else {
        setError(extractApiError(json.error, '注册失败'));
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/60 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block text-2xl font-bold text-surface-600 hover:text-brand-500 transition-colors">
            {siteMeta.siteName}
          </Link>
          <p className="text-surface-400 mt-2">创建你的账号</p>
        </div>

        <div className="bg-white rounded-8 shadow-xl border border-surface-100 p-8">
          {error && (
            <div className="mb-4 p-3 bg-semantic-danger-light text-semantic-danger text-sm rounded-8">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 姓名 */}
            <div>
              <label className="block text-sm font-medium text-surface-500 mb-1">姓名</label>
              <input
                className="w-full px-4 py-2.5 border border-surface-200 rounded-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                required
                placeholder="请输入姓名"
              />
            </div>

            {/* 邮箱 + 验证码 */}
            <div>
              <label className="block text-sm font-medium text-surface-500 mb-1">邮箱</label>
              <input
                className="w-full px-4 py-2.5 border border-surface-200 rounded-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                required
                placeholder="请输入邮箱"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-500 mb-1">本地验证码</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 px-4 py-2.5 border border-surface-200 rounded-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  type="text"
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value)}
                  placeholder="输入右侧结果"
                />
                <button
                  type="button"
                  onClick={() => { setCaptcha(buildLocalCaptcha()); setCaptchaInput(''); }}
                  className="px-4 py-2.5 bg-surface-50 text-surface-500 rounded-8 text-sm font-medium hover:bg-surface-100 transition-colors whitespace-nowrap"
                >
                  {captcha.question}
                </button>
              </div>
              <p className="mt-1 text-xs text-surface-400">需先完成本地验证码，才能发送邮箱验证码。</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-500 mb-1">邮箱验证码</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 px-4 py-2.5 border border-surface-200 rounded-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  type="text"
                  value={form.emailCode}
                  onChange={(e) => updateField('emailCode', e.target.value)}
                  required
                  placeholder="输入验证码"
                  maxLength={6}
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={codeCountdown > 0}
                  className="px-4 py-2.5 bg-semantic-info-light text-brand-500 rounded-8 text-sm font-medium hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {codeCountdown > 0 ? `${codeCountdown}s` : codeSent ? '重新发送' : '发送验证码'}
                </button>
              </div>
            </div>

            {/* 密码 */}
            <div>
              <label className="block text-sm font-medium text-surface-500 mb-1">密码</label>
              <input
                className="w-full px-4 py-2.5 border border-surface-200 rounded-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                type="password"
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                required
                minLength={8}
                placeholder="至少8位，需含字母和数字"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-500 mb-1">确认密码</label>
              <input
                className="w-full px-4 py-2.5 border border-surface-200 rounded-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => updateField('confirmPassword', e.target.value)}
                required
                minLength={8}
                placeholder="再次输入密码"
              />
            </div>

            {/* 手机 */}
            <div>
              <label className="block text-sm font-medium text-surface-500 mb-1">手机号 <span className="text-surface-400 font-normal">(选填)</span></label>
              <input
                className="w-full px-4 py-2.5 border border-surface-200 rounded-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                type="tel"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="请输入手机号"
              />
            </div>

            {/* 邀请码 */}
            <div>
              <label className="block text-sm font-medium text-surface-500 mb-1">邀请码 <span className="text-surface-400 font-normal">(选填)</span></label>
              <input
                className="w-full px-4 py-2.5 border border-surface-200 rounded-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                type="text"
                value={form.inviteCode}
                onChange={(e) => updateField('inviteCode', e.target.value)}
                placeholder="如有邀请码请填写"
              />
              {agentVerifying && (
                <p className="mt-1 text-xs text-surface-400">正在验证...</p>
              )}
              {!form.inviteCode.trim() && (
                <p className="mt-1 text-xs text-surface-400">不填写邀请码将按平台直销用户注册。</p>
              )}
              {agentInfo && (
                <div className="mt-2 rounded-8 border border-green-100 bg-semantic-success-light/70 p-3 text-xs text-semantic-success-dark space-y-1">
                  <p className="font-medium">已匹配合作商：{agentInfo.agentName}</p>
                  <p>{agentInfo.identityRequired ? '该合作商要求填写身份码完成注册。' : '该合作商未启用身份码校验，可直接完成注册。'}</p>
                </div>
              )}
              {form.inviteCode && !agentVerifying && !agentInfo && (
                <p className="mt-1 text-xs text-semantic-danger">邀请码无效</p>
              )}
            </div>

            {/* 身份码 */}
            <div>
              <label className="block text-sm font-medium text-surface-500 mb-1">
                身份码
                <span className="text-surface-400 font-normal">
                  {form.inviteCode.trim() && agentInfo?.identityRequired ? ' (必填)' : ' (选填，仅部分邀请码注册时生效)'}
                </span>
              </label>
              <input
                className="w-full px-4 py-2.5 border border-surface-200 rounded-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                type="text"
                value={form.identityCode}
                onChange={(e) => updateField('identityCode', e.target.value)}
                placeholder={form.inviteCode.trim() && agentInfo?.identityRequired ? '请输入上级提供的身份码' : '无校验需求时可留空'}
              />
              {form.inviteCode.trim() && agentInfo?.identityRequired && (
                <p className="mt-1 text-xs text-surface-400">未获取身份码时，请联系所属合作商获取。</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-brand-500 text-white rounded-8 font-medium text-sm hover:bg-brand-600 transition-colors disabled:opacity-50"
            >
              {loading ? '注册中...' : '注册'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-surface-400">
            已有账号?{' '}
            <Link href="/" className="text-brand-500 hover:underline">
              返回登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
