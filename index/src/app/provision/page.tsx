'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, Suspense } from 'react';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import Header from '@/components/Header';
import ShoppingCart from '@/components/ShoppingCart';
import { apiFetch } from '@/lib/api-client';

// ─────────────────────────── Types ───────────────────────────

type StepId = 1 | 2 | 3;

type ChatQA = { q: string; a: string[] };

type ChatMsg =
  | { role: 'ai'; content: string; options?: string[]; multiSelect?: boolean; typing: boolean }
  | { role: 'user'; content: string };

type WizardProduct = {
  id: string;
  name: string;
  region: string;
  bandwidth: string;
  memory: string;
  storage: string;
  displayPrice: number;
  cpuModel: string;
  totalBenchmark: number;
  isDualCPU: boolean;
  reason: string;
  suitableFor: string;
  advantages: string[];
  disadvantages: string[];
  totalScore: number | null;
};

type WizardResult = {
  analysis?: string;
  products: WizardProduct[];
  fallback: boolean;
};

type ChatReadyRequirements = {
  usage: string;
  cpuPreference: string;
  region: string;
  bandwidth: string;
  storage: string;
  budgetMin: number;
  budgetMax: number;
};

// ─────────────────────────── Category definitions ───────────────────────────

const CATEGORIES = [
  {
    id: 'website',
    label: '网站建设',
    desc: '企业官网、电商、门户',
    firstQ: '您要搭建什么类型的网站？',
    options: ['企业官网 / 展示站', '电商 / 在线商城', '内容 / 博客 / 论坛', 'SaaS / Web 应用'],
    multiSelect: false,
  },
  {
    id: 'app',
    label: '应用运行',
    desc: 'API 服务、后端、微服务',
    firstQ: '您的应用主要属于哪种类型？',
    options: ['Web API / REST 后端', '微服务 / 容器化部署', '中间件 / 消息队列', '移动端 / 小程序后端'],
    multiSelect: false,
  },
  {
    id: 'database',
    label: '数据存储',
    desc: '数据库、对象存储、备份',
    firstQ: '您主要使用哪类存储服务？',
    options: ['关系型数据库（MySQL/PG）', 'NoSQL（Redis / MongoDB）', '对象存储 / 文件服务', '数据仓库 / 大数据分析'],
    multiSelect: true,
  },
  {
    id: 'game',
    label: '游戏业务',
    desc: '开服、联机、游戏面板',
    firstQ: '您要部署的游戏服务器属于哪种类型？',
    options: ['FPS / MOBA 竞技类（CS2/LOL 类）', '沙盒 / RPG 类（Minecraft/ARK 类）', 'MMORPG / 大型多人游戏', '游戏面板 / 多开场景'],
    multiSelect: false,
  },
  {
    id: 'cloud',
    label: '云计算和虚拟化',
    desc: 'Proxmox、私有云、K8s',
    firstQ: '您的虚拟化 / 云计算场景是？',
    options: ['个人私有云（Proxmox/oVirt）', '企业虚拟化平台', 'Docker / Kubernetes 集群', 'VPS 转售 / 多租户平台'],
    multiSelect: false,
  },
  {
    id: 'ai',
    label: 'AI 和高性能计算',
    desc: '模型推理、训练、HPC',
    firstQ: '您的 AI / 计算业务场景是？',
    options: ['模型推理 / 在线 API 部署', '模型微调 / 训练任务', '大数据 / 科学计算', 'AI 开发 / 实验环境'],
    multiSelect: false,
  },
  {
    id: 'automation',
    label: '自动化和脚本',
    desc: '爬虫、工作流、批处理',
    firstQ: '您的自动化任务主要是哪类？',
    options: ['爬虫 / 数据采集', '定时任务 / 工作流调度', 'CI/CD / 自动化运维', '机器人 / 消息推送'],
    multiSelect: true,
  },
  {
    id: 'devtest',
    label: '测试和开发',
    desc: '开发机、测试环境、Demo',
    firstQ: '您的开发测试环境主要用途是？',
    options: ['个人开发机 / 日常编码', '团队协作 / 测试环境', '演示 / Demo 站点', '多项目并行开发'],
    multiSelect: false,
  },
  {
    id: 'stream',
    label: '直播和流媒体',
    desc: '推流、转码、视频服务',
    firstQ: '您的流媒体业务类型是？',
    options: ['直播推流 / 中转服务器', '视频点播 / 存储分发', '实时转码 / 音视频处理', 'RTMP / 流媒体服务器搭建'],
    multiSelect: false,
  },
  {
    id: 'security',
    label: '安全和防护',
    desc: '高防、流量清洗、护盾',
    firstQ: '您需要哪种安全防护场景？',
    options: ['DDoS 高防（游戏/大流量）', 'Web 应用防火墙（WAF）', '流量清洗 / 黑洞处理', '安全审计 / 日志服务'],
    multiSelect: false,
  },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

// ─────────────────────────── Icon components ───────────────────────────

function CategoryIcon({ id }: { id: CategoryId }) {
  const cls = 'h-6 w-6';
  switch (id) {
    case 'website':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case 'app':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case 'database':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
          <path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6" />
        </svg>
      );
    case 'game':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M6 12h4M8 10v4" />
          <circle cx="15" cy="11" r="1" fill="currentColor" />
          <circle cx="17" cy="13" r="1" fill="currentColor" />
          <path d="M2 9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1.5L20 17H4L2 10.5V9z" />
        </svg>
      );
    case 'cloud':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
        </svg>
      );
    case 'ai':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
        </svg>
      );
    case 'automation':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3z" />
          <path d="M12 8v4l3 3" />
        </svg>
      );
    case 'devtest':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
          <line x1="12" y1="2" x2="12" y2="22" />
        </svg>
      );
    case 'stream':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="3" fill="currentColor" />
          <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13" />
        </svg>
      );
    case 'security':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    default:
      return null;
  }
}

// ─────────────────────────── Small helpers ───────────────────────────

function fmt(price: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 0 }).format(price);
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color = score >= 75 ? 'text-brand-600 bg-blue-100' : score >= 50 ? 'text-brand-500 bg-semantic-info-light' : 'text-surface-400 bg-surface-100';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      核心匹配 {score}
    </span>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-surface-400"
          style={{ animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}

// ─────────────────────────── Step indicator ───────────────────────────

function StepBar({ step, category }: { step: StepId; category: string }) {
  const steps = ['选择业务', '需求确认', '推荐方案'];
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => {
        const idx = (i + 1) as StepId;
        const active = step === idx;
        const done = step > idx;
        return (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && <div className={`h-px w-8 ${done ? 'bg-brand-300' : 'bg-surface-200'}`} />}
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${active ? 'bg-[linear-gradient(135deg,#2f6dd6,#5293ff)] text-white shadow-card' : done ? 'bg-semantic-info-light text-brand-500' : 'text-surface-400'}`}>
              {done ? (
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 6l3 3 5-5" />
                </svg>
              ) : (
                <span>{idx}</span>
              )}
              <span>{label}</span>
            </div>
          </div>
        );
      })}
      {category && (
        <span className="ml-3 rounded-full bg-surface-100 px-3 py-1 text-xs text-surface-400">
          {category}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────── Main page logic ───────────────────────────

function ProvisionPageContent() {
  const { loading } = useAuth();
  const [step, setStep] = useState<StepId>(1);
  const [category, setCategory] = useState('');

  // Chat state
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [qaHistory, setQaHistory] = useState<ChatQA[]>([]);
  const [currentOptions, setCurrentOptions] = useState<string[]>([]);
  const [currentMultiSelect, setCurrentMultiSelect] = useState(false);
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Results state
  const [wizardResult, setWizardResult] = useState<WizardResult | null>(null);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [fallbackProducts, setFallbackProducts] = useState<WizardProduct[]>([]);

  // Load fallback products on mount for faster display when AI fails
  useEffect(() => {
    apiFetch('/api/ai/fallback-products').then(r => r.json()).then(j => {
      if (j.success && j.products) setFallbackProducts(j.products);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (step === 2) {
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [messages, step]);

  function selectCategory(cat: (typeof CATEGORIES)[number]) {
    setCategory(cat.label);
    setQaHistory([]);
    setSelectedChips([]);
    setCurrentOptions(cat.options as unknown as string[]);
    setCurrentMultiSelect(cat.multiSelect);
    setMessages([{ role: 'ai', content: cat.firstQ, options: cat.options as unknown as string[], multiSelect: cat.multiSelect, typing: true }]);
    setStep(2);
    setTimeout(() => {
      setMessages((prev) => prev.map((m) => ({ ...m, typing: false })));
    }, 900);
  }

  // Submit an answer (works for both single and multi-select)
  async function submitAnswer(answers: string[]) {
    if (answers.length === 0 || chatLoading) return;

    const lastAiMsg = [...messages].reverse().find((m) => m.role === 'ai');
    const q = lastAiMsg?.content || '';

    const newHistory: ChatQA[] = [...qaHistory, { q, a: answers }];
    setQaHistory(newHistory);
    setSelectedChips([]);
    setCurrentOptions([]);
    setChatLoading(true);

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: answers.join('、') },
      { role: 'ai', content: '', typing: true },
    ]);

    try {
      const res = await apiFetch('/api/ai/provision-chat', {
        method: 'POST',
        body: JSON.stringify({ category, history: newHistory }),
      });
      const json = (await res.json()) as { success: boolean; data?: { type: string; question?: string; options?: string[]; multiSelect?: boolean; analysis?: string; requirements?: ChatReadyRequirements } };

      if (!json.success || !json.data) throw new Error('api error');

      const data = json.data;
      setMessages((prev) => prev.filter((m) => !(m.role === 'ai' && m.typing)));

      if (data.type === 'question' && data.question) {
        const opts = data.options || [];
        const multi = data.multiSelect ?? false;
        setMessages((prev) => [...prev, { role: 'ai', content: data.question!, options: opts, multiSelect: multi, typing: false }]);
        setCurrentOptions(opts);
        setCurrentMultiSelect(multi);
      } else if (data.type === 'ready' && data.requirements) {
        setMessages((prev) => [...prev, { role: 'ai', content: '信息已收集完毕，正在为您匹配最合适的方案...', typing: false }]);
        await submitToWizard(data.requirements, data.analysis || '');
      }
    } catch {
      setMessages((prev) => prev.filter((m) => !(m.role === 'ai' && m.typing)));
      setMessages((prev) => [...prev, { role: 'ai', content: '抱歉，出现了网络错误，请稍后重试。', typing: false }]);
    } finally {
      setChatLoading(false);
    }
  }

  function toggleChip(opt: string) {
    setSelectedChips((prev) => (prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]));
  }

  async function submitToWizard(req: ChatReadyRequirements, analysis: string) {
    setWizardLoading(true);
    setStep(3);

    const budget =
      req.budgetMax >= 99999 ? '不限' : req.budgetMin > 0 ? `¥${req.budgetMin}-${req.budgetMax}/月` : `¥0-${req.budgetMax}/月`;

    try {
      const res = await apiFetch('/api/ai/wizard', {
        method: 'POST',
        body: JSON.stringify({
          usage: req.usage,
          budget,
          region: req.region,
          bandwidth: req.bandwidth,
          cpuPreference: req.cpuPreference,
          storage: req.storage,
        }),
      });
      const json = (await res.json()) as { success: boolean; data?: { analysis?: string; products: WizardProduct[]; fallback: boolean } };

      if (json.success && json.data) {
        // Keep backend order because backend already enforces budget-priority ranking.
        setWizardResult({ analysis: json.data.analysis || analysis, products: json.data.products || [], fallback: json.data.fallback });
      } else {
        setWizardResult({ analysis, products: [], fallback: true });
      }
    } catch {
      setWizardResult({ analysis, products: [], fallback: true });
    } finally {
      setWizardLoading(false);
    }
  }

  // ─────────── Render ───────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-100 border-t-blue-500" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4f8ff]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(98,151,255,0.18),transparent_30%),linear-gradient(180deg,#eef5ff_0%,#f7fbff_50%,#ffffff_100%)]" />
      <Header />
      <main className="relative z-10 mx-auto max-w-4xl px-4 pb-24 pt-10">
        {/* Step bar */}
        <div className="mb-8">
          <StepBar step={step} category={category} />
        </div>

        {/* ── Step 1: Category ── */}
        {step === 1 && (
          <div>
            <div className="mb-8">
              <h1 className="text-2xl font-bold tracking-tight text-surface-600">提交开通申请</h1>
              <p className="mt-1.5 text-sm text-surface-400">选择您最接近的业务方向，AI 将逐步确认需求后推荐最合适的方案。</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => selectCategory(cat)}
                  className="group flex flex-col items-start gap-3 rounded-8 border border-surface-200 bg-white p-4 text-left transition-all duration-150 hover:border-blue-400 hover:shadow-[0_4px_20px_rgba(47,109,214,0.12)] active:scale-[0.98]"
                >
                  <span className="text-surface-400 transition-colors group-hover:text-brand-500">
                    <CategoryIcon id={cat.id as CategoryId} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-surface-600">{cat.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-surface-400">{cat.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 2: Chat ── */}
        {step === 2 && (
          <div>
            <div className="mb-6 flex items-baseline justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-surface-600">需求确认</h1>
                <p className="mt-1 text-sm text-surface-400">回答几个问题，AI 将为您匹配最合适的配置方案。</p>
              </div>
              <button
                onClick={() => { setStep(1); setMessages([]); setQaHistory([]); }}
                className="text-xs text-surface-400 underline underline-offset-2 hover:text-surface-500"
              >
                重新选择业务
              </button>
            </div>

            {/* Chat feed — options render inline under last AI bubble */}
            <div className="mb-2 flex flex-col gap-4">
              {messages.map((msg, i) => {
                const isLastMsg = i === messages.length - 1;
                const showOptions = msg.role === 'ai' && !msg.typing && isLastMsg && currentOptions.length > 0 && !chatLoading;
                return (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'ai' ? (
                      <div className="flex max-w-[90%] gap-2.5">
                        {/* AI avatar */}
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#2f6dd6,#5293ff)]">
                          <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2l1.9 5.8H20l-4.9 3.6 1.9 5.8L12 13.6l-5 3.6 1.9-5.8L4 7.8h6.1L12 2z" />
                          </svg>
                        </div>
                        <div className="flex flex-col gap-3">
                          <div className="rounded-8 rounded-tl-sm border border-blue-100 bg-semantic-info-light/60 px-4 py-3 text-sm text-surface-600">
                            {msg.typing ? <TypingDots /> : msg.content}
                          </div>
                          {/* Inline option chips — only on last AI message */}
                          {showOptions && (
                            <div className="flex flex-col gap-3">
                              <div className="flex flex-wrap gap-2">
                                {currentOptions.map((opt) => {
                                  const sel = selectedChips.includes(opt);
                                  return (
                                    <button
                                      key={opt}
                                      onClick={() => {
                                        if (currentMultiSelect) {
                                          toggleChip(opt);
                                        } else {
                                          void submitAnswer([opt]);
                                        }
                                      }}
                                      className={`rounded-full border px-3.5 py-1.5 text-sm transition-all duration-150 ${
                                        sel
                                          ? 'border-blue-500 bg-[linear-gradient(135deg,#2f6dd6,#5293ff)] text-white shadow-[0_2px_10px_rgba(47,109,214,0.3)]'
                                          : 'border-surface-200 bg-white text-surface-500 hover:border-blue-300 hover:text-brand-500'
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  );
                                })}
                              </div>
                              {/* Multi-select confirm */}
                              {currentMultiSelect && selectedChips.length > 0 && (
                                <button
                                  onClick={() => void submitAnswer(selectedChips)}
                                  className="self-start rounded-full bg-[linear-gradient(135deg,#2f6dd6,#5293ff)] px-4 py-1.5 text-xs font-medium text-white shadow-[0_2px_10px_rgba(47,109,214,0.3)] transition-opacity hover:opacity-90"
                                >
                                  完成选择 ({selectedChips.length})
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-[70%] rounded-8 rounded-tr-sm bg-[linear-gradient(135deg,#2f6dd6,#5293ff)] px-4 py-2.5 text-sm text-white shadow-[0_4px_14px_rgba(47,109,214,0.18)]">
                        {msg.content}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
          </div>
        )}

        {/* ── Step 3: Results ── */}
        {step === 3 && (
          <div>
            <div className="mb-6 flex items-baseline justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-surface-600">推荐方案</h1>
                <p className="mt-1 text-sm text-surface-400">预算优先，按核心匹配度排序。</p>
              </div>
              <button
                onClick={() => { setStep(1); setMessages([]); setQaHistory([]); setWizardResult(null); }}
                className="text-xs text-surface-400 underline underline-offset-2 hover:text-surface-500"
              >
                重新选择
              </button>
            </div>

            <div className="mb-4 rounded-8 border border-surface-200 bg-surface-50/70 px-4 py-3 text-xs text-surface-400">
              核心评分维度：网络、防御、CPU 单核、CPU 多核。内存和硬盘仅在您明确提出需求时参与匹配。
            </div>

            {wizardLoading && (
              <div className="flex flex-col items-center gap-4 py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-100 border-t-blue-500" />
                <p className="text-sm text-surface-400">AI 正在按预算与核心维度匹配方案，请稍候...</p>
              </div>
            )}

            {!wizardLoading && wizardResult && (
              <div>
                {/* AI analysis */}
                {wizardResult.analysis && (
                <div className="mb-6 rounded-8 border border-blue-100 bg-semantic-info-light/60 p-4 text-sm leading-relaxed text-surface-500">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand-500">匹配说明</p>
                    {wizardResult.analysis}
                  </div>
                )}

                {wizardResult.products.length === 0 && (
                  <div>
                    {wizardResult.fallback && (
                      <div className="mb-5 flex items-start gap-3 rounded-8 border border-amber-100 bg-semantic-warning-light/70 p-4 text-sm text-semantic-warning-dark">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-semantic-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 9v4M12 17h.01" />
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        </svg>
                        <span>AI 暂时不可用，为您展示热门推荐方案，供参考选择。</span>
                      </div>
                    )}
                    {fallbackProducts.length > 0 ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {fallbackProducts.map((p, idx) => (
                          <div key={p.id} className="relative flex flex-col gap-3 rounded-8 border border-surface-200 bg-white p-5">
                            {idx === 0 && (
                              <span className="absolute right-4 top-4 rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-semibold text-surface-400">
                                热门推荐
                              </span>
                            )}
                            <div className="pr-16">
                              <p className="text-sm font-semibold text-surface-600">{p.name}</p>
                              <p className="mt-0.5 text-xs text-surface-400">{p.region}</p>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-400">
                              <span>{p.isDualCPU ? '双路 ' : ''}{p.cpuModel}</span>
                              <span>{p.memory}</span>
                              <span>{p.storage}</span>
                              <span>{p.bandwidth}</span>
                            </div>
                            <div className="flex items-center justify-end">
                              <span className="text-lg font-bold tabular-nums text-surface-600">{fmt(p.displayPrice)}<span className="text-xs font-normal text-surface-400">/月</span></span>
                            </div>
                            <div className="flex gap-2 pt-1">
                              <Link href={`/servers/${p.id}`} className="flex-1 rounded-8 border border-blue-200 py-2 text-center text-xs font-medium text-brand-500 hover:bg-semantic-info-light">查看详情</Link>
                              <Link href={`/servers/${p.id}`} className="flex-1 rounded-8 bg-[linear-gradient(135deg,#2f6dd6,#5293ff)] py-2 text-center text-xs font-medium text-white hover:opacity-90">立即开通</Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-8 border border-surface-200 py-16 text-center text-sm text-surface-400">
                        暂无匹配结果，请尝试调整需求后重新提交。
                      </div>
                    )}
                  </div>
                )}

                {/* Product grid */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {wizardResult.products.map((p, idx) => (
                    <div key={p.id} className="relative flex flex-col gap-3 rounded-8 border border-blue-100 bg-white p-5 transition-shadow hover:shadow-[0_4px_20px_rgba(47,109,214,0.1)]">
                      {idx === 0 && (
                        <span className="absolute right-4 top-4 rounded-full bg-semantic-info-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-500">
                          最佳匹配
                        </span>
                      )}
                      {/* Header */}
                      <div className="pr-16">
                        <p className="text-sm font-semibold text-surface-600">{p.name}</p>
                        <p className="mt-0.5 text-xs text-surface-400">{p.region}</p>
                      </div>

                      {/* Specs row */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-400">
                        <span>{p.isDualCPU ? '双路 ' : ''}{p.cpuModel}</span>
                        <span>{p.memory}</span>
                        <span>{p.storage}</span>
                        <span>{p.bandwidth}</span>
                      </div>

                      {/* Score + price */}
                      <div className="flex items-center justify-between">
                        <ScoreBadge score={p.totalScore} />
                        <span className="text-lg font-bold tabular-nums text-surface-600">{fmt(p.displayPrice)}<span className="text-xs font-normal text-surface-400">/月</span></span>
                      </div>

                      {/* Reason */}
                      {p.reason && (
                        <p className="text-xs leading-relaxed text-surface-400">{p.reason}</p>
                      )}

                      {/* Advantages */}
                      {p.advantages?.length > 0 && (
                        <ul className="flex flex-wrap gap-1.5">
                          {p.advantages.slice(0, 3).map((adv, j) => (
                            <li key={j} className="rounded-full bg-surface-100 px-2.5 py-0.5 text-[11px] text-surface-400">
                              {adv}
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* CTA */}
                      <div className="flex gap-2 pt-1">
                        <Link
                          href={`/servers/${p.id}`}
                          className="flex-1 rounded-8 border border-blue-200 py-2 text-center text-xs font-medium text-brand-500 transition-colors hover:border-blue-400 hover:bg-semantic-info-light"
                        >
                          查看详情
                        </Link>
                        <Link
                          href={`/servers/${p.id}`}
                          className="flex-1 rounded-8 bg-[linear-gradient(135deg,#2f6dd6,#5293ff)] py-2 text-center text-xs font-medium text-white shadow-[0_2px_10px_rgba(47,109,214,0.25)] transition-opacity hover:opacity-90"
                        >
                          立即开通
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <ShoppingCart />

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────── Export ───────────────────────────

export default function ProvisionPage() {
  return (
    <AuthProvider>
      <Suspense>
        <ProvisionPageContent />
      </Suspense>
    </AuthProvider>
  );
}
