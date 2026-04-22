'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { apiFetch, isApiSuccess, pickApiData, extractApiError } from '@/lib/api-client';
import { DEFAULT_SCORING_PROMPT, mergeScoringPrompt } from '@/lib/scoring-rules';
import { DEFAULT_SCORE_WEIGHTS, SCORE_DIMENSIONS, readScoreMap, sumScoreFields, type ScoreMap } from '@/lib/scoring';

interface PricingLevelRule {
  level: string;
  label: string;
  markup: number;
  markupPercent: number;
  retailRatePercent: number;
}

interface PricingConfig {
  rounding: { threshold: number; smallStep: number; largeStep: number };
  levels: PricingLevelRule[];
}

type PricingApiPayload = PricingConfig & {
  partnerMarkup?: number;
  vipTopMarkup?: number;
  vipMarkup?: number;
  guestMarkup?: number;
  roundingThreshold?: number;
  roundingSmallStep?: number;
  roundingLargeStep?: number;
};

type ProductScoreWeights = ScoreMap;

interface ProductItem {
  id: string;
  name: string;
  region: string;
  status: string;
  category: string;
  cpuDisplay: string | null;
  memory: string;
  bandwidth: string;
  scoreNetwork: number;
  scoreCpuSingle: number;
  scoreMemory: number;
  scoreStorage: number;
}

interface AiSuggestion {
  productId: string;
  scoreCpuSingle?: number;
  success?: boolean;
  [key: string]: unknown;
}

type Tab = 'pricing' | 'scores' | 'aiconfig' | 'aichat';

const TAB_LIST: { key: Tab; label: string; desc: string }[] = [
  { key: 'pricing', label: '\u5B9A\u4EF7\u89C4\u5219', desc: '\u7B49\u7EA7\u52A0\u4EF7\u4E0E\u53D6\u6574\u7B56\u7565' },
  { key: 'scores', label: '\u8BC4\u5206\u7EF4\u5EA6', desc: '\u6743\u91CD\u4E0E\u8BC4\u5206\u6807\u51C6' },
  { key: 'aiconfig', label: 'AI \u914D\u7F6E', desc: '\u63A5\u53E3\u3001\u6A21\u578B\u4E0E\u63D0\u793A\u8BCD' },
  { key: 'aichat', label: 'AI \u8BC4\u5206', desc: '\u5206\u7C7B\u975E\u786C\u4EF6\u8BC4\u5206 + \u786C\u4EF6\u81EA\u52A8\u8BC4\u5206' },
];

const emptyPricingForm = {
  PARTNER: '20',
  VIP_TOP: '40',
  VIP: '50',
  GUEST: '100',
  roundingThreshold: '600',
  roundingSmallStep: '10',
  roundingLargeStep: '50',
};

const CORE_SCORE_FIELDS = new Set(['scoreNetwork', 'scoreCpuSingle', 'scoreMemory', 'scoreStorage']);
const CORE_SCORE_DIMENSIONS = SCORE_DIMENSIONS.filter((dimension) => CORE_SCORE_FIELDS.has(dimension.field));
const HARDWARE_DIM_FIELDS = new Set(['scoreCpuSingle']);

const NON_HARDWARE_DIMS = [
  {
    key: 'scoreNetwork',
    label: '网络质量',
    keywordOptions: ['BGP', 'CN2', '三网回程', '大带宽', '低丢包'],
    keywordPlaceholder: '补充关键词：如 国际链路、千兆、10G',
    dataPlaceholder: '分类数据：三网稳定性、带宽能力、回程质量、丢包率表现',
  },
];;

const AI_PROVIDER_PRESETS = [
  {
    key: 'custom',
    label: '自定义',
    baseUrl: '',
    model: '',
    apiKey: '',
  },
  {
    key: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.4',
    apiKey: '',
  },
  {
    key: 'deepseek-official',
    label: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: '',
  },
  {
    key: 'volcengine-deepseek-3-2',
    label: '火山引擎 DeepSeek 3.2',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'deepseek-v3-2-251201',
    apiKey: '2c88c374-7daf-4abe-b00f-9de2d5239b51',
  },
] as const;

function normalizePricingConfig(raw: PricingApiPayload | null | undefined): PricingConfig | null {
  if (!raw || typeof raw !== 'object') return null;

  const rounding = raw.rounding && typeof raw.rounding === 'object'
    ? {
        threshold: Number(raw.rounding.threshold) || Number(raw.roundingThreshold) || 600,
        smallStep: Number(raw.rounding.smallStep) || Number(raw.roundingSmallStep) || 10,
        largeStep: Number(raw.rounding.largeStep) || Number(raw.roundingLargeStep) || 50,
      }
    : {
        threshold: Number(raw.roundingThreshold) || 600,
        smallStep: Number(raw.roundingSmallStep) || 10,
        largeStep: Number(raw.roundingLargeStep) || 50,
      };

  const fallbackLevels: PricingLevelRule[] = [
    { level: 'PARTNER', label: '合伙人', markup: Number(raw.partnerMarkup) || 0.2, markupPercent: (Number(raw.partnerMarkup) || 0.2) * 100, retailRatePercent: (1 + (Number(raw.partnerMarkup) || 0.2)) * 100 },
    { level: 'VIP_TOP', label: 'SVIP', markup: Number(raw.vipTopMarkup) || 0.4, markupPercent: (Number(raw.vipTopMarkup) || 0.4) * 100, retailRatePercent: (1 + (Number(raw.vipTopMarkup) || 0.4)) * 100 },
    { level: 'VIP', label: 'VIP', markup: Number(raw.vipMarkup) || 0.5, markupPercent: (Number(raw.vipMarkup) || 0.5) * 100, retailRatePercent: (1 + (Number(raw.vipMarkup) || 0.5)) * 100 },
    { level: 'GUEST', label: '访客价', markup: Number(raw.guestMarkup) || 1, markupPercent: (Number(raw.guestMarkup) || 1) * 100, retailRatePercent: (1 + (Number(raw.guestMarkup) || 1)) * 100 },
  ];

  const levels = Array.isArray(raw.levels) && raw.levels.length > 0
    ? raw.levels.map((item) => ({
        level: String(item.level ?? ''),
        label: String(item.label ?? item.level ?? ''),
        markup: Number(item.markup) || 0,
        markupPercent: Number(item.markupPercent) || (Number(item.markup) || 0) * 100,
        retailRatePercent: Number(item.retailRatePercent) || (1 + (Number(item.markup) || 0)) * 100,
      }))
    : fallbackLevels;

  return { rounding, levels };
}

export default function AdminProductSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('pricing');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [pricingConfig, setPricingConfig] = useState<PricingConfig | null>(null);
  const [pricingForm, setPricingForm] = useState(emptyPricingForm);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [pricingSaving, setPricingSaving] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [tagLibraryText, setTagLibraryText] = useState('');
  const scoreWeights: ProductScoreWeights = DEFAULT_SCORE_WEIGHTS;
  const [scoringPromptText, setScoringPromptText] = useState(DEFAULT_SCORING_PROMPT);
  const [globalSaving, setGlobalSaving] = useState(false);

  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiProvider, setAiProvider] = useState<string>('custom');
  const [aiWizardPrompt, setAiWizardPrompt] = useState('');
  const [aiConfigSaving, setAiConfigSaving] = useState(false);

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [lastScoredIds, setLastScoredIds] = useState<string[]>([]);
  const [aiSearch, setAiSearch] = useState('');
  const [nhInputs, setNhInputs] = useState<Record<string, { keywordOptions: string[]; customKeywords: string; data: string }>>({
    scoreNetwork: { keywordOptions: [], customKeywords: '', data: '' },
    scoreDefense: { keywordOptions: [], customKeywords: '', data: '' },
  });
  const [nhResult, setNhResult] = useState<Record<string, number> | null>(null);
  const [nhNotes, setNhNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const syncPricingForm = (config: PricingConfig | null) => {
    if (!config) return;
    const find = (level: string, fallback: string) => {
      const rule = config.levels.find((r) => r.level === level);
      return rule ? String(rule.markupPercent) : fallback;
    };
    setPricingForm({
      PARTNER: find('PARTNER', '20'),
      VIP_TOP: find('VIP_TOP', '40'),
      VIP: find('VIP', '50'),
      GUEST: find('GUEST', '100'),
      roundingThreshold: String(config.rounding.threshold),
      roundingSmallStep: String(config.rounding.smallStep),
      roundingLargeStep: String(config.rounding.largeStep),
    });
  };

  useEffect(() => {
    apiFetch('/api/admin/pricing', { method: 'GET' })
      .then((r) => r.json())
      .then((j) => {
        if (!isApiSuccess(j)) return;
        const data = normalizePricingConfig(pickApiData<PricingApiPayload>(j));
        if (!data) return;
        setPricingConfig(data);
        syncPricingForm(data);
      })
      .catch(() => {});

    apiFetch('/api/admin/settings', { method: 'GET' })
      .then((r) => r.json())
      .then((j) => {
        if (!isApiSuccess(j)) return;
        const d = pickApiData<Record<string, unknown>>(j) || {};
        if (typeof d.productTagLibrary === 'string') setTagLibraryText(d.productTagLibrary);
        if (typeof d.aiScoringPrompt === 'string') {
          setScoringPromptText(mergeScoringPrompt(d.aiScoringPrompt));
        } else {
          setScoringPromptText(DEFAULT_SCORING_PROMPT);
        }
        if (typeof d.aiBaseUrl === 'string') setAiBaseUrl(d.aiBaseUrl);
        if (typeof d.aiModel === 'string') setAiModel(d.aiModel);
        if (typeof d.aiApiKey === 'string') setAiApiKey(d.aiApiKey);
        if (typeof d.aiProvider === 'string') setAiProvider(d.aiProvider);
        if (typeof d.aiWizardPrompt === 'string') setAiWizardPrompt(d.aiWizardPrompt);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === 'aichat' && products.length === 0 && !productsLoading) {
      setProductsLoading(true);
      apiFetch('/api/admin/products?limit=1000', { method: 'GET' })
        .then((r) => r.json())
        .then((j) => {
          const raw = pickApiData<unknown>(j, ['products']);
          const list = Array.isArray(raw)
            ? raw
            : (raw && typeof raw === 'object' && Array.isArray((raw as { products?: unknown[] }).products)
              ? (raw as { products: unknown[] }).products
              : []);
          if (isApiSuccess(j) && list.length > 0) {
            setProducts(list.map((p: Record<string, unknown>) => ({
              id: String(p.id ?? ''), name: String(p.name ?? ''), region: String(p.region ?? ''), status: String(p.status ?? ''),
              category: String(p.category ?? ''), cpuDisplay: typeof p.cpuDisplay === 'string' ? p.cpuDisplay : null, memory: String(p.memory ?? ''),
              bandwidth: String(p.bandwidth ?? ''),
              ...readScoreMap(p, 0),
            })));
          }
        })
        .catch(() => {})
        .finally(() => setProductsLoading(false));
    }
  }, [activeTab, products.length, productsLoading]);

  const toggleNhKeyword = (dimKey: string, keyword: string) => {
    setNhInputs((prev) => {
      const current = prev[dimKey] || { keywordOptions: [], customKeywords: '', data: '' };
      const exists = current.keywordOptions.includes(keyword);
      return {
        ...prev,
        [dimKey]: {
          ...current,
          keywordOptions: exists
            ? current.keywordOptions.filter((k) => k !== keyword)
            : [...current.keywordOptions, keyword],
        },
      };
    });
  };

  const categoryLabel = '当前选中商品';

  const performUnifiedScore = async () => {
    const missing = NON_HARDWARE_DIMS.filter((d) => !(nhInputs[d.key]?.data || '').trim()).map((d) => d.label);
    if (missing.length > 0) {
      setMessage({ type: 'error', text: `请先补全非硬件分类数据：${missing.join('、')}` });
      return;
    }
    const scopedIds = selectedIds.filter((id) => products.some((item) => item.id === id));
    if (scopedIds.length === 0) {
      setMessage({ type: 'error', text: '请先勾选要评分的商品' });
      return;
    }
    setLastScoredIds(scopedIds);

    setAiLoading(true);
    setMessage(null);
    setNhResult(null);
    setNhNotes('');
    setAiSuggestions([]);
    setConfirmed(false);

    try {
      // Step 1: Non-hardware category scoring
      const lines = NON_HARDWARE_DIMS.map((d) => {
        const item = nhInputs[d.key];
        const mergedKeywords = [
          ...(item?.keywordOptions || []),
          ...String(item?.customKeywords || '')
            .split(/[,\uFF0C\n\s]+/)
            .map((s) => s.trim())
            .filter(Boolean),
        ];
        return [
          `- \u7EF4\u5EA6\uFF1A${d.label}`,
          `  \u5173\u952E\u8BCD\uFF1A${mergedKeywords.length > 0 ? mergedKeywords.join('\u3001') : '\u672A\u63D0\u4F9B'}`,
          `  \u5206\u7C7B\u6570\u636E\uFF1A${item?.data?.trim() || '\u672A\u63D0\u4F9B'}`,
        ].join('\n');
      }).join('\n');
      const nhPrompt = `\u8BF7\u6839\u636E\u4EE5\u4E0B\u6570\u636E\uFF0C\u4E3A${categoryLabel}\u8FDB\u884C\u5206\u7C7B\u7EDF\u4E00\u8BC4\u5206\uFF08\u4EC5 2 \u4E2A\u7EF4\u5EA6\uFF0C0-10\u5206\uFF09\u3002\n\n${lines}\n\n\u8BC4\u5206\u53C2\u8003\u6807\u51C6\uFF08\u8282\u9009\uFF09\uFF1A\n${scoringPromptText.slice(0, 600)}\n\n\u8981\u6C42\uFF1A\n1. \u4EC5\u8F93\u51FA\u7F51\u7EDC\u8D28\u91CF(scoreNetwork)\u4E0E\u9632\u5FA1\u80FD\u529B(scoreDefense)\u4E24\u9879\u3002\n2. \u5FC5\u987B\u7ED3\u5408\u201C\u5173\u952E\u8BCD + \u5206\u7C7B\u6570\u636E\u201D\u5224\u65AD\uFF0C\u4E0D\u8981\u8131\u79BB\u8F93\u5165\u6570\u636E\u3002\n3. scoreNotes \u53EA\u5305\u542B network \u4E0E defense \u4E24\u4E2A\u5B57\u6BB5\uFF0C\u5E76\u7ED9\u51FA\u8BE6\u7EC6\u4F9D\u636E\u3002\n4. \u6700\u540E\u5FC5\u987B\u7ED9\u51FA summary \u5B57\u6BB5\u3002\n5. \u53EA\u8FD4\u56DE JSON\uFF0C\u4E0D\u8981\u4EFB\u4F55\u5176\u4ED6\u6587\u5B57\u6216\u4EE3\u7801\u5757\u6807\u8BB0\u3002\n\n\u8FD4\u56DE\u683C\u5F0F\uFF1A\n{"scoreNetwork":0,"scoreDefense":0,"scoreNotes":{"network":"\u4F9D\u636E","defense":"\u4F9D\u636E"},"summary":"\u6700\u7EC8\u603B\u7ED3"}`;
      const nhRes = await apiFetch('/api/admin/products/ai-chat-simple', {
        method: 'POST',
        body: JSON.stringify({ prompt: nhPrompt }),
      });
      const nhJson = await nhRes.json();
      if (!nhJson.success) throw new Error(extractApiError(nhJson.error, '\u975E\u786C\u4EF6\u8BC4\u5206\u5931\u8D25'));
      let nhReply: string = nhJson?.data?.reply || nhJson?.reply || '';
      // Strip markdown code fences if present
      nhReply = nhReply.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
      const nhMatch = nhReply.match(/\{[\s\S]*\}/);
      if (!nhMatch) throw new Error('AI \u975E\u786C\u4EF6\u8BC4\u5206\u672A\u8FD4\u56DE JSON\uFF0C\u539F\u59CB\u56DE\u590D\uFF1A' + nhReply.slice(0, 200));
      const nhParsed = JSON.parse(nhMatch[0]);
      const nhScores: Record<string, number> = {};
      const nhScoreNotes: Record<string, string> = {};
      const noteKeyMap: Record<string, string> = {
        scoreNetwork: 'network',
        scoreDefense: 'defense',
      };
      for (const d of NON_HARDWARE_DIMS) {
        nhScores[d.key] = Number(nhParsed[d.key] ?? 0);
        nhScoreNotes[d.key] = nhParsed.scoreNotes?.[noteKeyMap[d.key] || d.key] || '';
      }
      setNhResult(nhScores);
      setNhNotes(
        (nhParsed.summary ? '\u603B\u7ED3\uFF1A' + nhParsed.summary : '') +
        (Object.values(nhScoreNotes).some(Boolean) ? '\n\n\u5355\u9879\u4F9D\u636E\uFF1A\n' + NON_HARDWARE_DIMS.map(d => `${d.label}\uFF1A${nhScoreNotes[d.key] || '--'}`).join('\n') : '')
      );

      // Step 2: Hardware per-product scoring
      const hwRes = await apiFetch('/api/admin/products/ai-score', {
        method: 'POST',
        body: JSON.stringify({
          productIds: scopedIds,
          scoringPrompt: scoringPromptText,
          scoreWeights,
        }),
      });
      const hwJson = await hwRes.json();
      if (!hwJson.success) throw new Error(extractApiError(hwJson.error, '\u786C\u4EF6\u8BC4\u5206\u5931\u8D25'));
      setAiSuggestions(hwJson.data?.suggestions || []);
      setMessage({ type: 'success', text: `AI 已完成当前选中商品的全量评分（非硬件统一 + 硬件逐商品），请确认` });
    } catch (e) {
      setMessage({ type: 'error', text: (e instanceof Error ? e.message : 'AI \u8BC4\u5206\u5931\u8D25') });
    } finally {
      setAiLoading(false);
    }
  };

  const saveUnifiedResults = async () => {
    if (!nhResult || aiSuggestions.length === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      const fallbackTargetIds = Array.from(new Set(aiSuggestions.map((s: AiSuggestion) => String(s.productId))));
      const targetIds = (lastScoredIds.length > 0 ? lastScoredIds : fallbackTargetIds)
        .filter((id) => products.some((item) => String(item.id) === String(id)));
      if (targetIds.length === 0) {
        throw new Error('当前没有可保存的评分结果，请重新执行 AI 评分');
      }

      const hwMap = new Map(aiSuggestions.map((s: AiSuggestion) => [String(s.productId), s]));
      const suggestions = targetIds.map((id) => {
        const hw = hwMap.get(String(id));
        return {
          productId: id,
          scoreNetwork: nhResult.scoreNetwork,
          scoreLatency: 0,
          scoreDelivery: 0,
          scoreDefense: nhResult.scoreDefense,
          scoreSupport: 0,
          scorePlatformBonus: 0,
          scoreCpuSingle: Number(hw?.scoreCpuSingle ?? 0),
          scoreCpuMulti: Number(hw?.scoreCpuMulti ?? 0),
          scoreMemory: 0,
          scoreStorage: 0,
        };
      });
      const res = await apiFetch('/api/admin/products/ai-score-save', {
        method: 'POST',
        body: JSON.stringify({ suggestions }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(extractApiError(json.error, '\u4FDD\u5B58\u5931\u8D25'));
      const successCount = Array.isArray(json.data?.results)
        ? json.data.results.filter((r: { success?: unknown }) => Boolean(r?.success)).length
        : suggestions.length;
      if (successCount <= 0) {
        throw new Error('评分保存失败：未成功写入任何商品');
      }
      setMessage({ type: 'success', text: `已保存 ${successCount} 个商品评分（分类2维 + 硬件逐商品）` });
      setNhResult(null);
      setNhNotes('');
      setAiSuggestions([]);
      setLastScoredIds([]);
      setConfirmed(false);
      // Reload products
      const reloadRes = await apiFetch('/api/admin/products?limit=1000', { method: 'GET' });
      const reloadJson = await reloadRes.json();
      const list = reloadJson.data?.products ?? (Array.isArray(reloadJson.data) ? reloadJson.data : []);
      if (reloadJson.success && list.length > 0) {
        setProducts(list.map((p: Record<string, unknown>) => ({
          id: String(p.id ?? ''), name: String(p.name ?? ''), region: String(p.region ?? ''), status: String(p.status ?? ''),
          category: String(p.category ?? ''), cpuDisplay: typeof p.cpuDisplay === 'string' ? p.cpuDisplay : null, memory: String(p.memory ?? ''),
          bandwidth: String(p.bandwidth ?? ''),
          ...readScoreMap(p, 0),
        })));
      }
    } catch (e) {
      setMessage({ type: 'error', text: (e instanceof Error ? e.message : '\u4FDD\u5B58\u5931\u8D25') });
    } finally {
      setSaving(false);
    }
  };

  const savePricing = async () => {
    setPricingSaving(true);
    setMessage(null);
    try {
      const payload = {
        markups: {
          PARTNER: Number(pricingForm.PARTNER) / 100,
          VIP_TOP: Number(pricingForm.VIP_TOP) / 100,
          VIP: Number(pricingForm.VIP) / 100,
          GUEST: Number(pricingForm.GUEST) / 100,
        },
        roundingThreshold: Number(pricingForm.roundingThreshold),
        roundingSmallStep: Number(pricingForm.roundingSmallStep),
        roundingLargeStep: Number(pricingForm.roundingLargeStep),
      };
      const res = await apiFetch('/api/admin/pricing', { method: 'PUT', body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.success) throw new Error(extractApiError(json.error, '\u4FDD\u5B58\u5931\u8D25'));
      const nextConfig = normalizePricingConfig(pickApiData<PricingApiPayload>(json));
      if (nextConfig) {
        setPricingConfig(nextConfig);
        syncPricingForm(nextConfig);
      }
      setShowPricingModal(false);
      setMessage({ type: 'success', text: '\u7B49\u7EA7\u5B9A\u4EF7\u89C4\u5219\u5DF2\u66F4\u65B0\u5E76\u5B9E\u65F6\u751F\u6548' });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : '\u4FDD\u5B58\u5931\u8D25' });
    } finally {
      setPricingSaving(false);
    }
  };

  const saveScoreConfig = async () => {
    setGlobalSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          productScoreWeights: DEFAULT_SCORE_WEIGHTS,
          aiScoringPrompt: scoringPromptText,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(extractApiError(json.error, '\u4FDD\u5B58\u5931\u8D25'));
      setMessage({ type: 'success', text: '\u8BC4\u5206\u914D\u7F6E\u5DF2\u4FDD\u5B58' });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : '\u4FDD\u5B58\u5931\u8D25' });
    } finally {
      setGlobalSaving(false);
    }
  };

  const saveAiConfig = async () => {
    setAiConfigSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          aiBaseUrl: aiBaseUrl.trim(),
          aiModel: aiModel.trim(),
          aiApiKey: aiApiKey.trim(),
          aiProvider,
          aiWizardPrompt: aiWizardPrompt,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(extractApiError(json.error, '\u4FDD\u5B58\u5931\u8D25'));
      setMessage({ type: 'success', text: 'AI \u914D\u7F6E\u5DF2\u4FDD\u5B58' });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : '\u4FDD\u5B58\u5931\u8D25' });
    } finally {
      setAiConfigSaving(false);
    }
  };


  const filteredProducts = useMemo(() => {
    if (!aiSearch.trim()) return products;
    const q = aiSearch.toLowerCase();
    return products.filter(
      (p) => (p.name || '').toLowerCase().includes(q)
        || (p.region || '').toLowerCase().includes(q)
        || (p.cpuDisplay || '').toLowerCase().includes(q)
    );
  }, [products, aiSearch]);

  const productsByRegion = useMemo(() => {
    const map = new Map<string, ProductItem[]>();
    filteredProducts.forEach((p) => {
      const list = map.get(p.region) || [];
      list.push(p);
      map.set(p.region, list);
    });
    // Keep backend order: do not re-sort regions in frontend.
    return Array.from(map.entries());
  }, [filteredProducts]);

  const productDisplayOrderIds = useMemo(
    () => productsByRegion.flatMap(([, items]) => items.map((item) => item.id)),
    [productsByRegion]
  );

  const orderedAiSuggestions = useMemo(() => {
    const orderMap = new Map<string, number>();
    productDisplayOrderIds.forEach((id, index) => {
      orderMap.set(String(id), index);
    });
    const selectedOrderMap = new Map<string, number>();
    selectedIds.forEach((id, index) => {
      selectedOrderMap.set(String(id), index);
    });
    return [...aiSuggestions].sort((a: AiSuggestion, b: AiSuggestion) => {
      const aKey = String(a.productId);
      const bKey = String(b.productId);
      const aIndex = orderMap.get(aKey) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = orderMap.get(bKey) ?? Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;

      const aSelectedIndex = selectedOrderMap.get(aKey) ?? Number.MAX_SAFE_INTEGER;
      const bSelectedIndex = selectedOrderMap.get(bKey) ?? Number.MAX_SAFE_INTEGER;
      if (aSelectedIndex !== bSelectedIndex) return aSelectedIndex - bSelectedIndex;

      return aKey.localeCompare(bKey);
    });
  }, [aiSuggestions, productDisplayOrderIds, selectedIds]);

  const allFilteredIds = filteredProducts.map((p) => p.id);
  const allSelected = filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.includes(p.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const scoreTotal = (p: ProductItem) => sumScoreFields(p);

  const weightTotal = CORE_SCORE_DIMENSIONS.reduce((sum, dimension) => sum + Number(scoreWeights[dimension.field] || 0), 0);
  const maxWeightTotal = CORE_SCORE_DIMENSIONS.length * 10;

  return (
    <div className="admin-page w-full">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="page-title">商品全局设置</h1>
          <p className="text-xs text-surface-400">集中管理定价、标签、AI 智能、展示偏好等商品配置。</p>
        </div>
        <Link href="/admin/products" className="btn-secondary btn-sm">返回商品列表</Link>
      </div>

      {message && (
        <div className={`mb-4 rounded-8 px-4 py-2.5 text-sm ${message.type === 'success' ? 'bg-semantic-success-light text-semantic-success-dark' : 'bg-semantic-danger-light text-semantic-danger'}`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 rounded-8 bg-surface-100 p-1">
        {TAB_LIST.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setMessage(null); }}
            className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
              activeTab === tab.key
                ? 'bg-white text-surface-600 shadow-card'
                : 'text-surface-400 hover:text-surface-500'
            }`}
          >
            <span className="block">{tab.label}</span>
            <span className="block text-xs font-normal mt-0.5 opacity-70">{tab.desc}</span>
          </button>
        ))}
      </div>

      {/* Tab: Pricing */}
      {activeTab === 'pricing' && (
        <div className="admin-page animate-fade-in-up">
          {!pricingConfig ? (
            <div className="card py-8 text-center text-sm text-surface-400">加载中...</div>
          ) : (
            <>
              <div className="card py-4 px-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-surface-400">Pricing Core</p>
                    <h2 className="mt-1 text-lg font-semibold text-surface-600">等级定价规则</h2>
                    <p className="mt-1 text-xs text-surface-400">按会员等级定义加价比例，更新后立即重算全部商品展示价格。</p>
                  </div>
                  <button onClick={() => { syncPricingForm(pricingConfig); setShowPricingModal(true); }} className="btn-primary btn-sm">编辑规则</button>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-4 mt-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                    {pricingConfig.levels.map((item) => (
                      <div key={item.level} className="rounded-8 border border-surface-200 bg-surface-50 px-4 py-3">
                        <p className="text-xs text-surface-400">{item.label}</p>
                        <p className="mt-2 text-xl font-semibold text-surface-600">+{item.markupPercent}%</p>
                        <p className="mt-1 text-[11px] text-surface-400">约等于源价 {item.retailRatePercent}%</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-8 border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-500">
                    <p className="font-medium text-surface-600 mb-2">取整规则</p>
                    <p>{pricingConfig.rounding.threshold} 以内取整到 {pricingConfig.rounding.smallStep}</p>
                    <p className="mt-1">超过 {pricingConfig.rounding.threshold} 取整到 {pricingConfig.rounding.largeStep}</p>
                  </div>
                </div>
              </div>

              <div className="card py-4 px-4">
                <p className="text-xs uppercase tracking-[0.18em] text-surface-400">Price Preview</p>
                <h2 className="mt-1 text-lg font-semibold text-surface-600">价格模拟</h2>
                <p className="mt-1 text-xs text-surface-400">输入源站价格，预览各等级最终售价。</p>
                <PriceSimulator config={pricingConfig} />
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Scores */}
      {activeTab === 'scores' && (
        <div className="admin-page animate-fade-in-up">
          <div className="card py-4 px-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-surface-400">Score Weights</p>
              <h2 className="mt-1 text-lg font-semibold text-surface-600">评分权重</h2>
              <p className="mt-1 text-xs text-surface-400">评分权重已锁定为核心4维（网络、防御、CPU单核、CPU多核），仅用于展示，不可手动调整。</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mt-3">
              {CORE_SCORE_DIMENSIONS.map((dimension) => (
                <div key={dimension.field}>
                  <label className="label">{dimension.label}</label>
                  <input
                    className="input bg-surface-50 text-surface-400 cursor-not-allowed"
                    type="number"
                    min={0}
                    max={100}
                    value={scoreWeights[dimension.field]}
                    readOnly
                    disabled
                  />
                </div>
              ))}
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2 text-xs text-surface-400 mb-1.5">
                <span>权重分布</span>
                <span className={`ml-auto font-medium ${weightTotal === maxWeightTotal ? 'text-semantic-success' : 'text-semantic-danger'}`}>
                  {weightTotal}/{maxWeightTotal}
                </span>
              </div>
              <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-100">
                {CORE_SCORE_DIMENSIONS.map((dimension) => {
                  const w = Number(scoreWeights[dimension.field]);
                  if (w <= 0) return null;
                  return <div key={dimension.field} style={{ width: `${w}%`, backgroundColor: dimension.color }} className="transition-all duration-300" />;
                })}
              </div>
              <div className="flex gap-3 mt-1.5 flex-wrap">
                {CORE_SCORE_DIMENSIONS.map((dimension) => (
                  <span key={dimension.field} className="flex items-center gap-1 text-xs text-surface-400">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: dimension.color }} />
                    {dimension.label} {scoreWeights[dimension.field]}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="card py-4 px-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-surface-400">Scoring Criteria</p>
              <h2 className="mt-1 text-lg font-semibold text-surface-600">评分标准提示词</h2>
              <p className="mt-1 text-xs text-surface-400">这里用于补充核心4维评分与需求匹配约束（如多IP、大带宽）的细则。</p>
            </div>
            <textarea
              className="input min-h-[140px] mt-3 font-mono text-xs leading-6"
              value={scoringPromptText}
              onChange={(e) => setScoringPromptText(e.target.value)}
              placeholder={'例如：\n- 仅对网络/防御/CPU单核/CPU多核打分\n- 站群多IP需求未命中时不优先\n- 带宽需求必须满足描述，不作为额外加分'}
            />
            <div className="mt-2 rounded-8 border border-surface-200 bg-surface-50 px-3 py-2 text-[11px] leading-5 text-surface-400">
              默认规则模板已改为核心4维评分，你可以继续补充多IP与带宽匹配约束。
            </div>
            <div className="flex justify-end mt-3">
              <button onClick={saveScoreConfig} disabled={globalSaving} className="btn-primary btn-sm disabled:opacity-50">
                {globalSaving ? '保存中...' : '保存评分配置'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: AI Config */}
      {activeTab === 'aiconfig' && (
        <div className="admin-page animate-fade-in-up">
          <div className="card py-4 px-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-surface-400">AI Connection</p>
              <h2 className="mt-1 text-lg font-semibold text-surface-600">AI 接口配置</h2>
              <p className="mt-1 text-xs text-surface-400">可选择平台预设（含火山 DeepSeek 3.2），也可手动填写 OpenAI 兼容接口地址、模型和密钥。</p>
            </div>
            <div className="mt-3 rounded-8 border border-surface-200 bg-surface-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-medium text-surface-500">平台预设</label>
                <select
                  className="input h-9 text-xs w-auto"
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value)}
                >
                  {AI_PROVIDER_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    const preset = AI_PROVIDER_PRESETS.find((p) => p.key === aiProvider);
                    if (!preset || preset.key === 'custom') return;
                    setAiBaseUrl(preset.baseUrl);
                    setAiModel(preset.model);
                    if (preset.apiKey) setAiApiKey(preset.apiKey);
                  }}
                >
                  应用预设
                </button>
              </div>
              <p className="mt-2 text-[11px] text-surface-400">选择后点击“应用预设”，会自动填充 Base URL、模型和密钥（若预设包含密钥）。</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div className="md:col-span-2">
                <label className="label">API 接口地址 (Base URL)</label>
                <input
                  className="input"
                  value={aiBaseUrl}
                  onChange={(e) => setAiBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div>
                <label className="label">模型名称</label>
                <input
                  className="input"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder="gpt-4o"
                />
              </div>
              <div>
                <label className="label">API Key</label>
                <input
                  className="input"
                  type="password"
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                  placeholder="sk-..."
                />
              </div>
            </div>
          </div>

          <div className="card py-4 px-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-surface-400">AI Wizard Prompt</p>
              <h2 className="mt-1 text-lg font-semibold text-surface-600">智能推荐提示词</h2>
              <p className="mt-1 text-xs text-surface-400">前台 AI 选型推荐时使用的系统提示词，可自定义 AI 的角色和回复风格。</p>
            </div>
            <textarea
              className="input min-h-[140px] mt-3 font-mono text-xs leading-6"
              value={aiWizardPrompt}
              onChange={(e) => setAiWizardPrompt(e.target.value)}
              placeholder="你是一个专业服务器选型顾问，根据用户需求推荐最合适的服务器配置..."
            />
            <div className="flex justify-end mt-3">
              <button onClick={saveAiConfig} disabled={aiConfigSaving} className="btn-primary btn-sm disabled:opacity-50">
                {aiConfigSaving ? '保存中...' : '保存 AI 配置'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: AI Scoring */}
      {activeTab === 'aichat' && (
        <div className="admin-page animate-fade-in-up">
          {/* Section 1: Product list (top) */}
          <div className="card py-4 px-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-surface-600">商品列表</h2>
                <p className="mt-1 text-xs text-surface-400">勾选要评分的商品。非硬件评分统一生成，硬件评分逐商品独立。</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <input
                className="input h-9 max-w-[260px]"
                placeholder="搜索商品名、地区、CPU..."
                value={aiSearch}
                onChange={(e) => setAiSearch(e.target.value)}
              />
              <button onClick={toggleSelectAll} className="btn-secondary btn-sm">
                {allSelected ? '取消全选' : '全选当前'}
              </button>
              <button
                onClick={() => {
                  const noScoreIds = filteredProducts.filter((p) => scoreTotal(p) === 0).map((p) => p.id);
                  setSelectedIds((prev) => Array.from(new Set([...prev, ...noScoreIds])));
                }}
                className="btn-secondary btn-sm"
              >
                选未评分
              </button>
              <span className="ml-auto text-xs text-surface-400">
                当前列表 {filteredProducts.length} 个 | 已选 {selectedIds.filter((id) => filteredProducts.some((p) => p.id === id)).length} 个
              </span>
            </div>
            {productsLoading ? (
              <div className="py-6 text-center text-sm text-surface-400">加载商品列表...</div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto rounded-8 border border-surface-200">
                {productsByRegion.map(([region, items]) => {
                  const regionIds = items.map((p) => p.id);
                  const regionAllSelected = regionIds.every((id) => selectedIds.includes(id));
                  return (
                    <div key={region}>
                      <div className="sticky top-0 z-10 flex items-center gap-2 bg-surface-50 px-3 py-2 border-b border-surface-100">
                        <input
                          type="checkbox"
                          checked={regionAllSelected}
                          onChange={() => {
                            if (regionAllSelected) {
                              setSelectedIds((pp) => pp.filter((id) => !regionIds.includes(id)));
                            } else {
                              setSelectedIds((pp) => Array.from(new Set([...pp, ...regionIds])));
                            }
                          }}
                          className="accent-blue-600"
                        />
                        <span className="text-xs font-semibold text-surface-500">{region}</span>
                        <span className="text-xs text-surface-400">{items.length} 个商品</span>
                      </div>
                      {items.map((p) => (
                        <label key={p.id} className="flex items-center gap-3 px-3 py-2 border-b border-surface-50 hover:bg-semantic-info-light/30 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(p.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedIds((prev) => [...prev, p.id]);
                              else setSelectedIds((prev) => prev.filter((id) => id !== p.id));
                            }}
                            className="accent-blue-600"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-surface-600 truncate">{p.name}</p>
                            <p className="text-xs text-surface-400 mt-0.5">
                              {p.cpuDisplay || '--'} / {p.memory} / {p.bandwidth}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0 max-w-[520px]">
                            {scoreTotal(p) > 0 ? (
                              <>
                                <div className="flex flex-wrap justify-end gap-1">
                                  {CORE_SCORE_DIMENSIONS.map((dimension) => (
                                    <span
                                      key={dimension.field}
                                      className="text-xs px-1.5 py-0.5 rounded"
                                      style={{ backgroundColor: `${dimension.color}1a`, color: dimension.color }}
                                    >
                                      {dimension.label} {Number(p[dimension.field] ?? 0)}
                                    </span>
                                  ))}
                                </div>
                                <span className="text-xs text-surface-500">综合参考分 {Number(scoreTotal(p).toFixed(1))}</span>
                              </>
                            ) : (
                              <span className="text-xs bg-surface-100 text-surface-400 px-1.5 py-0.5 rounded">未评分</span>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <div className="py-8 text-center text-sm text-surface-400">
                    {products.length === 0 ? '暂无商品' : '没有匹配的商品'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Non-hardware dimension inputs (middle) */}
          <div className="card py-4 px-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-surface-600">非硬件维度信息（{categoryLabel} - 分类统一）</h2>
              <p className="mt-1 text-xs text-surface-400">
                以下 2 项分类维度（网络/防御）将统一覆盖到上方已勾选商品，硬件维度由 AI 对每个商品逐个独立评分。
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {NON_HARDWARE_DIMS.map((d) => (
                <div key={d.key} className="rounded-8 border border-surface-200 bg-surface-50/60 p-3">
                  <label className="label">{d.label}</label>
                  <p className="text-[11px] text-surface-400 mb-1.5">关键词选项框（可多选）</p>
                  <div className="flex flex-wrap gap-1.5">
                    {d.keywordOptions.map((kw) => {
                      const active = (nhInputs[d.key]?.keywordOptions || []).includes(kw);
                      return (
                        <button
                          key={kw}
                          type="button"
                          onClick={() => toggleNhKeyword(d.key, kw)}
                          className={`text-[11px] rounded-full border px-2 py-0.5 transition ${
                            active
                              ? 'border-blue-300 bg-semantic-info-light text-brand-600'
                              : 'border-surface-200 bg-white text-surface-500 hover:border-surface-300'
                          }`}
                        >
                          {kw}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    className="input h-9 text-xs mt-2"
                    placeholder={d.keywordPlaceholder}
                    value={nhInputs[d.key]?.customKeywords || ''}
                    onChange={(e) => setNhInputs((p) => ({
                      ...p,
                      [d.key]: {
                        ...(p[d.key] || { keywordOptions: [], customKeywords: '', data: '' }),
                        customKeywords: e.target.value,
                      },
                    }))}
                  />
                  <textarea
                    className="input min-h-[68px] text-xs leading-relaxed mt-2"
                    placeholder={d.dataPlaceholder}
                    value={nhInputs[d.key]?.data || ''}
                    onChange={(e) => setNhInputs((p) => ({
                      ...p,
                      [d.key]: {
                        ...(p[d.key] || { keywordOptions: [], customKeywords: '', data: '' }),
                        data: e.target.value,
                      },
                    }))}
                  />
                </div>
              ))}
            </div>

            {/* Action button inside the card */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={performUnifiedScore}
                disabled={aiLoading || selectedIds.filter((id) => filteredProducts.some((p) => p.id === id)).length === 0}
                className="btn-primary disabled:opacity-50"
              >
                {aiLoading ? 'AI 全量评分中...' : `一键 AI 评分「${categoryLabel}」`}
              </button>
              <span className="text-xs text-surface-400">
                分类统一（网络/防御）+ 硬件逐产品，共 {selectedIds.filter((id) => filteredProducts.some((p) => p.id === id)).length} 个商品
              </span>
            </div>
          </div>

          {/* Section 3: Results (bottom) */}
          {(nhResult || aiSuggestions.length > 0) && (
            <div className="card py-4 px-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-surface-600">AI 评分结果</h2>
                <div className="flex gap-2">
                  <button onClick={() => { setNhResult(null); setNhNotes(''); setAiSuggestions([]); setConfirmed(false); }} className="btn-secondary btn-sm" disabled={saving}>丢弃</button>
                  <button onClick={saveUnifiedResults} disabled={saving || !confirmed} className="btn-primary btn-sm disabled:opacity-50">
                    {saving ? '保存中...' : '一键应用全部评分'}
                  </button>
                </div>
              </div>

              {/* Non-hardware unified scores */}
              {nhResult && (
                <div className="rounded-8 border border-blue-100 bg-semantic-info-light/40 p-3">
                  <p className="text-xs font-medium text-surface-500 mb-2">分类统一分（网络/防御）</p>
                  <div className="flex flex-wrap gap-2">
                    {NON_HARDWARE_DIMS.map((d) => (
                      <span key={d.key} className="text-[11px] bg-white border border-surface-200 rounded-full px-2.5 py-1 text-surface-500">
                        {d.label} <span className="font-semibold text-brand-600">{nhResult[d.key] ?? '--'}</span>
                      </span>
                    ))}
                  </div>
                  {nhNotes && (
                    <p className="mt-2 text-[11px] text-surface-400 leading-relaxed">{nhNotes}</p>
                  )}
                </div>
              )}

              {/* Per-product hardware scores */}
              {orderedAiSuggestions.length > 0 && (
                <div className="rounded-8 border border-surface-200 bg-surface-50 p-3">
                  <p className="text-xs font-medium text-surface-500 mb-2">硬件维度（逐产品独立评分）</p>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {orderedAiSuggestions.map((s: AiSuggestion) => {
                      const prod = products.find((p) => p.id === s.productId);
                      return (
                        <div key={s.productId} className="rounded-8 border border-white bg-white p-3">
                          <p className="text-xs font-medium text-surface-600 mb-1">{prod?.name || s.productId}</p>
                          <p className="text-xs text-surface-400 mb-2">{prod?.cpuDisplay || '--'} / {prod?.memory} / {prod?.bandwidth}</p>
                          <div className="flex flex-wrap gap-1">
                            {SCORE_DIMENSIONS.filter((dimension) => HARDWARE_DIM_FIELDS.has(dimension.field)).map((dimension) => (
                              <span key={dimension.field} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${dimension.color}1a`, color: dimension.color }}>
                                {dimension.label} {Number(s[dimension.field] ?? 0)}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Confirm checkbox */}
              <label className="flex items-center gap-2 text-xs text-surface-500">
                <input
                  type="checkbox"
                  className="accent-blue-600"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                我已确认全部评分结果，可执行一键应用
              </label>
            </div>
          )}
        </div>
      )}

      {/* Pricing Edit Modal */}
      {showPricingModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 modal-overlay"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowPricingModal(false); }}
        >
          <div className="w-full max-w-xl max-h-[90vh] flex flex-col modal-panel">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
              <h2 className="text-base font-semibold text-surface-600">编辑等级定价规则</h2>
              <button onClick={() => setShowPricingModal(false)} className="text-surface-400 hover:text-surface-500 text-xl leading-none">&times;</button>
            </div>
            <div className="overflow-y-auto px-6 py-5 flex-1 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {([
                  ['PARTNER', '合伙人'],
                  ['VIP_TOP', 'SVIP'],
                  ['VIP', 'VIP'],
                  ['GUEST', '访客价'],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <label className="label">{label} 加价比例 (%)</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={500}
                      step={1}
                      value={pricingForm[key]}
                      onChange={(e) => setPricingForm((p) => ({ ...p, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="label">取整阈值</label>
                  <input className="input" type="number" min={1} value={pricingForm.roundingThreshold}
                    onChange={(e) => setPricingForm((p) => ({ ...p, roundingThreshold: e.target.value }))} />
                </div>
                <div>
                  <label className="label">阈值内步长</label>
                  <input className="input" type="number" min={1} value={pricingForm.roundingSmallStep}
                    onChange={(e) => setPricingForm((p) => ({ ...p, roundingSmallStep: e.target.value }))} />
                </div>
                <div>
                  <label className="label">阈值外步长</label>
                  <input className="input" type="number" min={1} value={pricingForm.roundingLargeStep}
                    onChange={(e) => setPricingForm((p) => ({ ...p, roundingLargeStep: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-surface-100">
              <button onClick={() => setShowPricingModal(false)} className="btn-secondary btn-sm">取消</button>
              <button onClick={savePricing} disabled={pricingSaving} className="btn-primary btn-sm disabled:opacity-50">
                {pricingSaving ? '保存中...' : '保存规则'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub Components ───────────────────────────────────────────────────

function PriceSimulator({ config }: { config: PricingConfig }) {
  const [cost, setCost] = useState('500');
  const costNum = Number(cost);

  const calcPrice = (markup: number) => {
    const raw = costNum * (1 + markup);
    const { threshold, smallStep, largeStep } = config.rounding;
    const step = raw <= threshold ? smallStep : largeStep;
    return Math.ceil(raw / step) * step;
  };

  if (!costNum || costNum <= 0) {
    return (
      <div className="mt-3">
        <label className="label">源站价格</label>
        <input className="input max-w-[200px]" type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} />
      </div>
    );
  }

  return (
    <div className="mt-3">
      <label className="label">源站价格</label>
      <input className="input max-w-[200px] mb-3" type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {config.levels.map((lv) => (
          <div key={lv.level} className="rounded-8 border border-surface-200 bg-surface-50 px-3 py-2">
            <p className="text-xs text-surface-400 uppercase">{lv.label}</p>
            <p className="text-lg font-semibold text-surface-600">{calcPrice(lv.markup)}</p>
            <p className="text-xs text-surface-500">+{lv.markupPercent}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}
