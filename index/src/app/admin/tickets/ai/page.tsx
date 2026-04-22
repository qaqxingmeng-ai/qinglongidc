'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { PageHeader, Panel } from '@/components/admin/layout';

export default function TicketsAIPage() {

  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);
    try {
      const res = await apiFetch('/api/admin/tickets/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });
      const json = await res.json();
      if (json.success && json.data?.reply) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: json.data.reply }]);
      } else {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: json.data?.reply || '抱歉，AI 暂时无法回复。' }]);
      }
    } catch {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: '请求出错，请稍后重试。' }]);
    }
    setChatLoading(false);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI 工单助手"
        subtitle="使用 AI 分析工单趋势，获取智能回复建议。"
      />

      <Panel>
        <h3 className="mb-3 text-sm font-semibold text-surface-600">智能对话</h3>
        <div className="flex flex-col rounded-6 border border-surface-200 bg-surface-50" style={{ height: 400 }}>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <p className="text-xs text-surface-400 text-center pt-12">
                与 AI 对话分析工单数据，例如：<br />
                {"\"最近一周工单量有什么趋势？\""}<br />
                {"\"哪些类型的工单最多？\""}<br />
                {"\"帮我草拟一个关于服务器故障的回复\""}
              </p>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-6 px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-brand-500 text-white' : 'bg-white text-surface-600 border border-surface-200'}`}>
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
