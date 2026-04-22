'use client';

import { useEffect, useState, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { PageHeader, Panel, useToast } from '@/components/admin/layout';

interface ProductAIScore {
  productId: string;
  productName: string;
  score: number;
  verdict: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

export default function ProductsAIPage() {
  const toast = useToast();
  const [scoring, setScoring] = useState(false);
  const [results, setResults] = useState<ProductAIScore[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const runBatchScore = async () => {
    setScoring(true);
    try {
      const res = await apiFetch('/api/admin/products/ai-score', { method: 'POST' });
      const json = await res.json();
      if (json.success && json.data?.results) {
        setResults(json.data.results);
        toast.success(`已完成 ${json.data.results.length} 个商品评分`);
      } else {
        toast.error(json.message || 'AI 评分失败');
      }
    } catch {
      toast.error('请求失败');
    }
    setScoring(false);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);
    try {
      const res = await apiFetch('/api/admin/products/ai-chat-simple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });
      const json = await res.json();
      if (json.success && json.data?.reply) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: json.data.reply }]);
      } else {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: '抱歉，AI 暂时无法回复。' }]);
      }
    } catch {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: '请求出错，请稍后重试。' }]);
    }
    setChatLoading(false);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const verdictColor = (v: string) => {
    if (v === 'excellent') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if (v === 'good') return 'bg-blue-50 text-blue-700 border border-blue-200';
    if (v === 'average') return 'bg-amber-50 text-amber-700 border border-amber-200';
    return 'bg-red-50 text-red-700 border border-red-200';
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI 商品助手"
        subtitle="使用 AI 批量评分商品竞争力，或与 AI 对话获取选品建议。"
        actions={
          <button
            onClick={runBatchScore}
            disabled={scoring}
            className="rounded-6 bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
          >
            {scoring ? '评分中...' : '批量 AI 评分'}
          </button>
        }
      />

      {results.length > 0 && (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100 text-left text-xs font-medium text-surface-400 uppercase tracking-wider">
                <th className="px-4 py-3">商品</th>
                <th className="px-4 py-3">评分</th>
                <th className="px-4 py-3">评级</th>
                <th className="px-4 py-3">优势</th>
                <th className="px-4 py-3">劣势</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.productId} className="border-b border-surface-50 hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-surface-600">{r.productName}</td>
                  <td className="px-4 py-3">
                    <span className="text-lg font-bold text-brand-500">{r.score}</span>
                    <span className="text-xs text-surface-400">/100</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-4 px-2 py-0.5 text-xs font-medium ${verdictColor(r.verdict)}`}>{r.verdict}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-surface-500 max-w-[200px]">{r.strengths.join('、')}</td>
                  <td className="px-4 py-3 text-xs text-surface-500 max-w-[200px]">{r.weaknesses.join('、')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Panel>
        <h3 className="mb-3 text-sm font-semibold text-surface-600">AI 对话助手</h3>
        <div className="flex flex-col rounded-6 border border-surface-200 bg-surface-50" style={{ height: 360 }}>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <p className="text-xs text-surface-400 text-center pt-8">输入问题开始对话，例如：{"\"当前哪些商品定价偏高？\""}</p>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-6 px-3 py-2 text-sm ${m.role === 'user' ? 'bg-brand-500 text-white' : 'bg-white text-surface-600 border border-surface-200'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="rounded-6 bg-white px-3 py-2 text-sm text-surface-400 border border-surface-200">思考中...</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="flex items-center gap-2 border-t border-surface-200 px-3 py-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
              placeholder="输入问题..."
              className="flex-1 rounded-6 border border-surface-200 px-3 py-1.5 text-sm text-surface-600 placeholder:text-surface-300 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 transition-colors"
            />
            <button
              onClick={sendChat}
              disabled={chatLoading || !chatInput.trim()}
              className="rounded-6 bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              发送
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
