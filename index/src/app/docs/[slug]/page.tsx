'use client';

import { Fragment, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { useSiteMeta } from '@/components/SiteMetaProvider';

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  category?: { name: string; slug: string };
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  updatedAt: string;
}

function renderInline(text: string, keyPrefix: string) {
  const nodes: ReactNode[] = [];
  let index = 0;
  let tokenIndex = 0;

  while (index < text.length) {
    if (text.startsWith('**', index)) {
      const end = text.indexOf('**', index + 2);
      if (end !== -1) {
        nodes.push(
          <strong key={`${keyPrefix}-strong-${tokenIndex}`} className="font-semibold text-surface-600">
            {text.slice(index + 2, end)}
          </strong>,
        );
        index = end + 2;
        tokenIndex += 1;
        continue;
      }
    }

    if (text[index] === '`') {
      const end = text.indexOf('`', index + 1);
      if (end !== -1) {
        nodes.push(
          <code
            key={`${keyPrefix}-code-${tokenIndex}`}
            className="rounded bg-surface-100 px-1 py-0.5 font-mono text-sm text-surface-600"
          >
            {text.slice(index + 1, end)}
          </code>,
        );
        index = end + 1;
        tokenIndex += 1;
        continue;
      }
    }

    const nextStrong = text.indexOf('**', index + 1);
    const nextCode = text.indexOf('`', index + 1);
    const nextIndex = [nextStrong, nextCode].filter((value) => value !== -1).sort((a, b) => a - b)[0] ?? text.length;

    nodes.push(
      <Fragment key={`${keyPrefix}-text-${tokenIndex}`}>
        {text.slice(index, nextIndex)}
      </Fragment>,
    );
    index = nextIndex;
    tokenIndex += 1;
  }

  return nodes;
}

function renderMultilineText(lines: string[], keyPrefix: string) {
  return lines.map((line, index) => (
    <Fragment key={`${keyPrefix}-line-${index}`}>
      {renderInline(line, `${keyPrefix}-${index}`)}
      {index < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

function renderMarkdown(md: string) {
  const elements: ReactNode[] = [];
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const key = `paragraph-${elements.length}`;
    elements.push(
      <p key={key} className="mb-3 text-surface-500">
        {renderMultilineText(paragraph, key)}
      </p>,
    );
    paragraph = [];
  };

  const flushBullets = () => {
    if (bullets.length === 0) return;
    const key = `list-${elements.length}`;
    elements.push(
      <ul key={key} className="mb-3 space-y-1">
        {bullets.map((item, index) => (
          <li key={`${key}-${index}`} className="ml-4 list-disc text-surface-500">
            {renderInline(item, `${key}-${index}`)}
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed === '') {
      flushParagraph();
      flushBullets();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushBullets();

      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const key = `heading-${elements.length}`;

      if (level === 1) {
        elements.push(<h1 key={key} className="mb-4 mt-6 text-xl font-bold text-surface-600">{renderInline(content, key)}</h1>);
      } else if (level === 2) {
        elements.push(<h2 key={key} className="mb-3 mt-6 text-lg font-semibold text-surface-600">{renderInline(content, key)}</h2>);
      } else {
        elements.push(<h3 key={key} className="mb-2 mt-5 text-base font-semibold text-surface-600">{renderInline(content, key)}</h3>);
      }
      continue;
    }

    const bulletMatch = trimmed.match(/^- (.+)$/);
    if (bulletMatch) {
      flushParagraph();
      bullets.push(bulletMatch[1]);
      continue;
    }

    flushBullets();
    paragraph.push(line);
  }

  flushParagraph();
  flushBullets();

  return elements;
}

export default function DocArticlePage() {
  const { siteMeta } = useSiteMeta();
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<'helpful' | 'not_helpful' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch(`/api/docs/articles/${slug}`);
    const json = await res.json();
    if (json.success) {
      setArticle(json.data);
    } else {
      router.push('/docs');
    }
    setLoading(false);
  }, [slug, router]);

  useEffect(() => { load(); }, [load]);

  const submitFeedback = async (helpful: boolean) => {
    if (!article || feedback) return;
    await apiFetch(`/api/docs/articles/${article.id}/helpful`, {
      method: 'POST',
      body: JSON.stringify({ helpful }),
    });
    setFeedback(helpful ? 'helpful' : 'not_helpful');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <span className="text-sm text-surface-400">加载中...</span>
      </div>
    );
  }

  if (!article) return null;

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Header */}
      <div className="bg-white border-b border-surface-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-2 text-sm text-surface-400">
          <Link href="/" className="text-surface-600 font-semibold hover:text-surface-500">{siteMeta.siteName}</Link>
          <span>/</span>
          <Link href="/docs" className="hover:text-surface-500">帮助中心</Link>
          {article.category && (
            <>
              <span>/</span>
              <Link href={`/docs?category=${article.category.slug}`} className="hover:text-surface-500">
                {article.category.name}
              </Link>
            </>
          )}
          <span>/</span>
          <span className="text-surface-500">{article.title}</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">
        <article className="bg-white border border-surface-100 rounded-8 p-8">
          <h1 className="text-2xl font-semibold text-surface-600 mb-2">{article.title}</h1>
          <div className="flex items-center gap-4 text-xs text-surface-400 mb-8 pb-6 border-b border-surface-100">
            {article.category && (
              <span className="px-2 py-1 bg-surface-50 rounded text-surface-400">{article.category.name}</span>
            )}
            <span>{article.viewCount} 次浏览</span>
            <span>更新于 {new Date(article.updatedAt).toLocaleDateString('zh-CN')}</span>
          </div>

          <div className="prose prose-sm max-w-none space-y-3 text-surface-500 leading-relaxed">
            {renderMarkdown(article.content)}
          </div>

          {/* Feedback */}
          <div className="mt-10 pt-6 border-t border-surface-100">
            {feedback ? (
              <p className="text-sm text-semantic-success text-center">感谢您的反馈！</p>
            ) : (
              <div className="text-center space-y-3">
                <p className="text-sm text-surface-400">这篇文章对您有帮助吗？</p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => submitFeedback(true)}
                    className="px-4 py-2 border border-surface-200 rounded-lg text-sm text-surface-500 hover:border-green-300 hover:text-semantic-success hover:bg-semantic-success-light transition-colors"
                  >
                    有帮助 ({article.helpfulCount})
                  </button>
                  <button
                    onClick={() => submitFeedback(false)}
                    className="px-4 py-2 border border-surface-200 rounded-lg text-sm text-surface-500 hover:border-red-200 hover:text-semantic-danger hover:bg-semantic-danger-light transition-colors"
                  >
                    没帮助 ({article.notHelpfulCount})
                  </button>
                </div>
              </div>
            )}
          </div>
        </article>

        <div className="mt-6 text-center">
          <Link href="/docs" className="text-sm text-surface-400 hover:text-surface-500">
            返回帮助中心
          </Link>
        </div>
      </div>
    </div>
  );
}
