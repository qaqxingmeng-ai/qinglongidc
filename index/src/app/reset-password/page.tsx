'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

type Step = 'email' | 'code' | 'done';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(typeof data.error === 'string' ? data.error : data.error?.message || '发送失败');
        return;
      }
      setStep('code');
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), code: code.trim(), password }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(typeof data.error === 'string' ? data.error : data.error?.message || '重置失败');
        return;
      }
      setStep('done');
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 px-4">
      <div className="w-full max-w-md bg-white rounded-8 shadow-lg p-8">
        <h1 className="text-2xl font-semibold mb-2">重置密码</h1>

        {step === 'email' && (
          <>
            <p className="text-sm text-surface-400 mb-6">输入账号邮箱，我们将发送验证码</p>
            {error && <div className="mb-4 p-3 bg-semantic-danger-light text-semantic-danger text-sm rounded-8">{error}</div>}
            <form onSubmit={handleSendCode} className="space-y-4">
              <div>
                <label className="label">邮箱</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
                {loading ? '发送中...' : '发送验证码'}
              </button>
            </form>
          </>
        )}

        {step === 'code' && (
          <>
            <p className="text-sm text-surface-400 mb-6">验证码已发送至 {email}，5 分钟内有效</p>
            {error && <div className="mb-4 p-3 bg-semantic-danger-light text-semantic-danger text-sm rounded-8">{error}</div>}
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="label">验证码</label>
                <input
                  className="input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">新密码</label>
                <input
                  className="input"
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <p className="mt-1 text-xs text-surface-400">至少 8 位，包含字母和数字</p>
              </div>
              <div>
                <label className="label">确认新密码</label>
                <input
                  className="input"
                  type="password"
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
                {loading ? '提交中...' : '重置密码'}
              </button>
            </form>
            <button
              type="button"
              className="mt-4 text-sm text-surface-400 hover:text-surface-500 w-full text-center"
              onClick={() => { setStep('email'); setError(''); }}
            >
              重新发送
            </button>
          </>
        )}

        {step === 'done' && (
          <div className="text-center py-6">
            <p className="text-semantic-success font-medium mb-4">密码重置成功</p>
            <button
              onClick={() => router.push('/')}
              className="btn-primary"
            >
              返回登录
            </button>
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-surface-400 hover:text-surface-500"
          >
            返回
          </button>
        </div>
      </div>
    </div>
  );
}
