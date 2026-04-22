'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

interface DailyStats {
  date: string;
  pv: number;
  uv: number;
}

interface PromoData {
  inviteCode: string;
  pvTotal: number;
  uvTotal: number;
  registeredCount: number;
  paidUserCount: number;
  daily: DailyStats[];
  leaderboard: Array<{
    rank: number;
    agentId: string;
    agentName: string;
    inviteCount: number;
    rewardAmount: number;
  }>;
  currentRank: number;
  top3BonusPoints: number;
  inviteRecords: Array<{
    userId: string;
    name: string;
    email: string;
    registeredAt: string;
    firstPaidAt?: string | null;
    rewardAmount: number;
  }>;
  inviteTotal: number;
  invitePage: number;
  invitePageSize: number;
  inviteTotalPages: number;
}

export default function PromoPage() {
  const [data, setData] = useState<PromoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [invitePage, setInvitePage] = useState(1);

  useEffect(() => {
    apiFetch(`/api/agent/promo?page=${invitePage}&pageSize=10`, { method: 'GET' })
      .then(r => r.json())
      .then(json => {
        if (json.success) setData(json.data);
      })
      .finally(() => setLoading(false));
  }, [invitePage]);

  const inviteLink = data?.inviteCode
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/ref/${data.inviteCode}`
    : '';

  const copyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) return <div className="text-surface-400 py-20 text-center">加载中...</div>;
  if (!data) return <div className="text-surface-400 py-20 text-center">加载失败</div>;

  const maxPV = Math.max(...data.daily.map(d => d.pv), 1);

  return (
    <div>
      <h1 className="section-title mb-6">推广工具</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Invite link card */}
        <div className="bg-white rounded-8 border border-surface-100 p-6">
          <p className="text-xs text-surface-400 mb-3">您的专属推广链接</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-surface-50 border border-surface-100 rounded-lg px-3 py-2 text-surface-500 truncate">
              {inviteLink || '未设置邀请码'}
            </code>
            <button
              onClick={copyLink}
              disabled={!inviteLink}
              className="text-xs px-4 py-2 rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 shrink-0"
            >
              {copied ? '已复制' : '复制'}
            </button>
          </div>
          {data.inviteCode && (
            <p className="text-xs text-surface-400 mt-2">邀请码: <span className="font-mono font-medium text-surface-500">{data.inviteCode}</span></p>
          )}
        </div>

        {/* Funnel card */}
        <div className="bg-white rounded-8 border border-surface-100 p-6">
          <p className="text-xs text-surface-400 mb-4">近 30 天转化漏斗</p>
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <p className="text-xl font-semibold text-surface-600">{data.pvTotal}</p>
              <p className="text-xs text-surface-400 mt-1">点击 PV</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold text-brand-500">{data.uvTotal}</p>
              <p className="text-xs text-surface-400 mt-1">访客 UV</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold text-semantic-success">{data.registeredCount}</p>
              <p className="text-xs text-surface-400 mt-1">注册用户</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold text-purple-600">{data.paidUserCount}</p>
              <p className="text-xs text-surface-400 mt-1">付费用户</p>
            </div>
          </div>
        </div>
      </div>

      {/* Daily stats bar chart */}
      <div className="bg-white rounded-8 border border-surface-100 p-6 mb-6">
        <p className="text-xs text-surface-400 mb-4">近 14 天每日点击</p>
        {data.daily.length === 0 ? (
          <p className="text-sm text-surface-400 text-center py-8">暂无数据</p>
        ) : (
          <div className="flex items-end gap-1.5 h-36">
            {[...data.daily].reverse().map(d => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div
                  className="w-full bg-blue-100 rounded-sm relative group"
                  style={{ height: `${Math.round((d.pv / maxPV) * 100)}%`, minHeight: '2px' }}
                >
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-semantic-info-light rounded-sm"
                    style={{ height: `${d.pv > 0 ? Math.max(Math.round((d.uv / d.pv) * 100), 10) : 0}%` }}
                  />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-surface-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                    PV {d.pv} / UV {d.uv}
                  </div>
                </div>
                <span className="text-xs text-surface-300" style={{ fontSize: '9px' }}>
                  {d.date.slice(5)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-xs text-surface-400"><span className="w-3 h-2 bg-blue-100 inline-block rounded-sm" />PV</span>
          <span className="flex items-center gap-1.5 text-xs text-surface-400"><span className="w-3 h-2 bg-semantic-info-light inline-block rounded-sm" />UV</span>
        </div>
      </div>

      {/* Promo materials placeholder */}
      <div className="bg-white rounded-8 border border-surface-100 p-6">
        <p className="text-xs text-surface-400 mb-4">推广素材</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: '横幅 800x200', ratio: '4/1' },
            { label: '方形 600x600', ratio: '1/1' },
            { label: '竖版 400x700', ratio: '4/7' },
          ].map(m => (
            <div
              key={m.label}
              className="border border-dashed border-surface-200 rounded-lg flex flex-col items-center justify-center gap-2 p-6 text-surface-300"
            >
              <span className="text-2xl">+</span>
              <span className="text-xs">{m.label}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-surface-300 mt-4">推广素材将由管理员上传，敬请期待</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-white rounded-8 border border-surface-100 p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-surface-400">月度邀请排行榜（TOP20）</p>
            <p className="text-xs text-brand-500">我的排名：#{data.currentRank || '-'}</p>
          </div>
          <div className="overflow-x-auto border border-surface-100 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-surface-400">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">排名</th>
                  <th className="px-3 py-2.5 text-left font-medium">渠道商</th>
                  <th className="px-3 py-2.5 text-left font-medium">邀请人数</th>
                  <th className="px-3 py-2.5 text-left font-medium">总奖励</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data.leaderboard || []).length === 0 ? (
                  <tr><td className="px-3 py-6 text-surface-400" colSpan={4}>本月暂无数据</td></tr>
                ) : (data.leaderboard || []).map((row) => (
                  <tr key={row.agentId}>
                    <td className="px-3 py-2.5 text-surface-500">#{row.rank}</td>
                    <td className="px-3 py-2.5 text-surface-500">{row.agentName}</td>
                    <td className="px-3 py-2.5 text-surface-600 font-medium">{row.inviteCount}</td>
                    <td className="px-3 py-2.5 text-surface-600 font-medium">¥{row.rewardAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-surface-400 mt-3">TOP3 额外积分奖励：第1名 200，第2名 100，第3名 50。您本月可得：{data.top3BonusPoints} 积分</p>
        </div>

        <div className="bg-white rounded-8 border border-surface-100 p-6">
          <p className="text-xs text-surface-400 mb-3">我邀请的用户记录</p>
          <div className="overflow-x-auto border border-surface-100 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-surface-400">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">用户</th>
                  <th className="px-3 py-2.5 text-left font-medium">注册时间</th>
                  <th className="px-3 py-2.5 text-left font-medium">首单时间</th>
                  <th className="px-3 py-2.5 text-left font-medium">奖励金额</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data.inviteRecords || []).length === 0 ? (
                  <tr><td className="px-3 py-6 text-surface-400" colSpan={4}>暂无邀请记录</td></tr>
                ) : (data.inviteRecords || []).map((row) => (
                  <tr key={row.userId}>
                    <td className="px-3 py-2.5 text-surface-500">
                      <p className="font-medium text-surface-600">{row.name}</p>
                      <p className="text-xs text-surface-400">{row.email}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-surface-500">{new Date(row.registeredAt).toLocaleString('zh-CN')}</td>
                    <td className="px-3 py-2.5 text-xs text-surface-500">{row.firstPaidAt ? new Date(row.firstPaidAt).toLocaleString('zh-CN') : '未首单'}</td>
                    <td className="px-3 py-2.5 text-surface-600 font-medium">¥{row.rewardAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3 text-xs text-surface-400">
            <span>共 {data.inviteTotal || 0} 人</span>
            <div className="flex items-center gap-2">
              <button
                className="px-2 py-1 border border-surface-200 rounded disabled:opacity-40"
                disabled={(data.invitePage || 1) <= 1}
                onClick={() => setInvitePage((p) => Math.max(1, p - 1))}
              >上一页</button>
              <span>{data.invitePage || 1} / {data.inviteTotalPages || 1}</span>
              <button
                className="px-2 py-1 border border-surface-200 rounded disabled:opacity-40"
                disabled={(data.invitePage || 1) >= (data.inviteTotalPages || 1)}
                onClick={() => setInvitePage((p) => p + 1)}
              >下一页</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
