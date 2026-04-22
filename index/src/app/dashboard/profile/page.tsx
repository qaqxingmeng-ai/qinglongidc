'use client';

import { useAuth } from '@/components/AuthProvider';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiFetch, extractApiError } from '@/lib/api-client';

interface ProfileData {
  id: string;
  numericId: number;
  email: string;
  name: string;
  role: string;
  level: string;
  phone: string | null;
  inviteCode: string | null;
  identityCode: string | null;
  agentId: string | null;
  agentName: string | null;
}

const levelLabels: Record<string, string> = {
  PARTNER: '合作商',
  VIP_TOP: '高级会员',
  VIP: '会员',
  GUEST: '普通用户',
};

const roleLabels: Record<string, string> = {
  ADMIN: '管理员',
  AGENT: '代理',
  USER: '用户',
};

export default function ProfilePage() {
  const { refresh } = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // profile form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  // email change form
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailCooldown, setEmailCooldown] = useState(0);

  useEffect(() => {
    apiFetch('/api/auth/me', { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setProfile(json.data);
          setName(json.data.name);
          setPhone(json.data.phone || '');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const saveProfile = async () => {
    setProfileMsg('');
    setProfileErr('');

    if (!name.trim()) {
      setProfileErr('名称不能为空');
      return;
    }

    setProfileSaving(true);
    try {
      const res = await apiFetch('/api/auth/me', {
        method: 'PUT',
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setProfileMsg('资料已更新');
        setProfile((prev) => prev ? { ...prev, name: json.data.name, phone: json.data.phone } : prev);
        await refresh();
      } else {
        setProfileErr(extractApiError(json.error, '更新失败'));
      }
    } catch {
      setProfileErr('网络错误');
    } finally {
      setProfileSaving(false);
    }
  };

  const changePassword = async () => {
    setPwdMsg('');
    setPwdErr('');

    if (!currentPassword) {
      setPwdErr('请输入当前密码');
      return;
    }
        if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
          setPwdErr('新密码至少8个字符，需同时包含字母和数字');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdErr('两次输入的新密码不一致');
      return;
    }

    setPwdSaving(true);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (json.success) {
        setPwdMsg('密码修改成功');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPwdErr(extractApiError(json.error, '修改失败'));
      }
    } catch {
      setPwdErr('网络错误');
    } finally {
      setPwdSaving(false);
    }
  };

  const sendEmailCode = async () => {
    if (emailCooldown > 0 || !newEmail.trim()) return;
    setEmailErr('');
    try {
      const res = await apiFetch('/api/auth/send-code', {
        method: 'POST',
        body: JSON.stringify({ email: newEmail.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setEmailCooldown(60);
        const timer = setInterval(() => {
          setEmailCooldown(prev => {
            if (prev <= 1) { clearInterval(timer); return 0; }
            return prev - 1;
          });
        }, 1000);
      } else {
        setEmailErr(extractApiError(json.error, '发送失败'));
      }
    } catch {
      setEmailErr('网络错误');
    }
  };

  const changeEmail = async () => {
    setEmailMsg('');
    setEmailErr('');
    if (!newEmail.trim()) { setEmailErr('请输入新邮箱'); return; }
    if (!emailCode.trim()) { setEmailErr('请输入验证码'); return; }

    setEmailSaving(true);
    try {
      const res = await apiFetch('/api/auth/change-email', {
        method: 'POST',
        body: JSON.stringify({ newEmail: newEmail.trim(), code: emailCode.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setEmailMsg('邮箱修改成功');
        setNewEmail('');
        setEmailCode('');
        setProfile(prev => prev ? { ...prev, email: newEmail.trim() } : prev);
        await refresh();
      } else {
        setEmailErr(extractApiError(json.error, '修改失败'));
      }
    } catch {
      setEmailErr('网络错误');
    } finally {
      setEmailSaving(false);
    }
  };

  if (loading) {
    return <div className="text-surface-400 py-20 text-center">加载中...</div>;
  }

  if (!profile) {
    return <div className="text-surface-400 py-20 text-center">无法加载用户信息</div>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="section-title mb-8">个人资料</h1>

      {/* Basic Info Card */}
      <div className="card mb-6">
        <h2 className="font-semibold text-surface-600 mb-6">基本信息</h2>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">客户编号</label>
              <input type="text" value={profile.numericId || '-'} disabled className="input bg-surface-50 text-surface-400 cursor-not-allowed font-mono" />
            </div>
            <div>
              <label className="label">邮箱</label>
              <input type="email" value={profile.email} disabled className="input bg-surface-50 text-surface-400 cursor-not-allowed" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">角色</label>
              <input type="text" value={roleLabels[profile.role] || profile.role} disabled className="input bg-surface-50 text-surface-400 cursor-not-allowed" />
            </div>
            <div>
              <label className="label">等级</label>
              <input type="text" value={levelLabels[profile.level] || profile.level} disabled className="input bg-surface-50 text-surface-400 cursor-not-allowed" />
            </div>
          </div>

          {profile.identityCode && (
            <div>
              <label className="label">身份码</label>
              <input
                type="text"
                value={profile.identityCode}
                disabled
                title="请联系上级修改"
                className="input bg-surface-50 text-surface-400 cursor-not-allowed font-mono"
              />
            </div>
          )}

          <div>
            <label className="label">所属上级</label>
            <input
              type="text"
              value={profile.agentName || '平台直销'}
              disabled
              className="input bg-surface-50 text-surface-400 cursor-not-allowed"
            />
          </div>

          <hr className="border-surface-100" />

          <div>
            <label className="label">名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              maxLength={50}
            />
          </div>

          <div>
            <label className="label">手机号</label>
            {!phone.trim() && (
              <p className="mb-2 rounded-lg border border-amber-200 bg-semantic-warning-light px-3 py-2 text-xs text-semantic-warning-dark">
                绑定手机号后可购买服务器
              </p>
            )}
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input"
              placeholder="选填"
              maxLength={20}
            />
          </div>

          {profileErr && <p className="text-sm text-semantic-danger">{profileErr}</p>}
          {profileMsg && <p className="text-sm text-semantic-success">{profileMsg}</p>}

          <button onClick={saveProfile} disabled={profileSaving} className="btn-primary disabled:opacity-50">
            {profileSaving ? '保存中...' : '保存修改'}
          </button>
        </div>
      </div>

      {/* Password Card */}
      <div className="card">
        <h2 className="font-semibold text-surface-600 mb-6">修改密码</h2>

        <div className="space-y-5">
          <div>
            <label className="label">当前密码</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input"
              autoComplete="current-password"
            />
          </div>

          <div>
            <label className="label">新密码</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input"
              placeholder="至少8位，需含字母和数字"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="label">确认新密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input"
              autoComplete="new-password"
            />
          </div>

          {pwdErr && <p className="text-sm text-semantic-danger">{pwdErr}</p>}
          {pwdMsg && <p className="text-sm text-semantic-success">{pwdMsg}</p>}

          <button onClick={changePassword} disabled={pwdSaving} className="btn-primary disabled:opacity-50">
            {pwdSaving ? '修改中...' : '修改密码'}
          </button>
        </div>
      </div>

      {/* Email Change Card */}
      <div className="card mt-6">
        <h2 className="font-semibold text-surface-600 mb-6">修改邮箱</h2>

        <div className="space-y-5">
          <div>
            <label className="label">新邮箱</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="input"
              placeholder="输入新邮箱地址"
            />
          </div>

          <div>
            <label className="label">验证码</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value)}
                className="input flex-1"
                placeholder="输入验证码"
                maxLength={6}
              />
              <button
                onClick={sendEmailCode}
                disabled={emailCooldown > 0 || !newEmail.trim()}
                className="btn-secondary shrink-0 disabled:opacity-50"
              >
                {emailCooldown > 0 ? `${emailCooldown}s` : '发送验证码'}
              </button>
            </div>
          </div>

          {emailErr && <p className="text-sm text-semantic-danger">{emailErr}</p>}
          {emailMsg && <p className="text-sm text-semantic-success">{emailMsg}</p>}

          <button onClick={changeEmail} disabled={emailSaving} className="btn-primary disabled:opacity-50">
            {emailSaving ? '修改中...' : '修改邮箱'}
          </button>
        </div>
      </div>

      <div className="card mt-6">
        <h2 className="mb-3 font-semibold text-surface-600">登录安全</h2>
        <p className="mb-4 text-sm text-surface-400">管理活跃登录会话，及时移除异常设备。</p>
        <div className="flex gap-3">
          <Link href="/dashboard/sessions" className="btn-secondary">
            会话管理
          </Link>
          <Link href="/dashboard/login-history" className="btn-secondary">
            登录历史
          </Link>
        </div>
      </div>
    </div>
  );
}
