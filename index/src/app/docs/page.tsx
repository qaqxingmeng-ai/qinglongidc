'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { useSiteMeta } from '@/components/SiteMetaProvider';

interface Category {
  id: string;
  name: string;
  slug: string;
  children?: Category[];
}

interface Article {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  category?: Category;
  viewCount: number;
  helpfulCount: number;
  updatedAt: string;
}

export default function DocsPage() {
  const { siteMeta } = useSiteMeta();
  const [categories, setCategories] = useState<Category[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [activeCat, setActiveCat] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch('/api/docs/categories').then(r => r.json()).then(j => {
      if (j.success) setCategories(j.data.categories ?? []);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: '30' });
    if (activeCat) params.set('category', activeCat);
    if (query) params.set('q', query);
    apiFetch(`/api/docs/articles?${params}`).then(r => r.json()).then(j => {
      if (j.success) { setArticles(j.data.articles ?? []); setTotal(j.data.total ?? 0); }
      setLoading(false);
    });
  }, [activeCat, query]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(search);
    setActiveCat('');
  };

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Header */}
      <div className="bg-white border-b border-surface-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-surface-600 font-semibold text-sm">{siteMeta.siteName}</Link>
          <Link href="/dashboard" className="text-sm text-surface-400 hover:text-surface-500">控制台</Link>
        </div>
      </div>

      {/* Hero */}
      <div className="bg-white border-b border-surface-100 px-6 py-12">
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <h1 className="text-2xl font-semibold text-surface-600">帮助中心</h1>
          <p className="text-surface-400 text-sm">查阅文档、常见问题与使用指南</p>
          <form onSubmit={handleSearch} className="flex gap-2 max-w-md mx-auto">
            <input
              type="text"
              placeholder="搜索文章..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 border border-surface-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
            />
            <button type="submit" className="px-4 py-2 bg-surface-800 text-white text-sm rounded-lg hover:bg-surface-700">搜索</button>
          </form>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 flex gap-8">
        {/* Sidebar categories */}
        <aside className="w-52 shrink-0">
          <nav className="space-y-1">
            <button
              onClick={() => { setActiveCat(''); setQuery(''); setSearch(''); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeCat === '' && !query ? 'bg-surface-800 text-white' : 'text-surface-500 hover:bg-surface-100'}`}
            >
              全部文章
            </button>
            {categories.map((c) => (
              <div key={c.id}>
                <button
                  onClick={() => { setActiveCat(c.slug); setQuery(''); setSearch(''); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeCat === c.slug ? 'bg-surface-800 text-white' : 'text-surface-500 hover:bg-surface-100'}`}
                >
                  {c.name}
                </button>
                {c.children && c.children.length > 0 && (
                  <div className="ml-3 space-y-0.5 mt-0.5">
                    {c.children.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => { setActiveCat(child.slug); setQuery(''); setSearch(''); }}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${activeCat === child.slug ? 'bg-surface-200 text-surface-600 font-medium' : 'text-surface-400 hover:bg-surface-100'}`}
                      >
                        {child.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Article list */}
        <main className="flex-1 min-w-0">
          {query && (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-surface-500">搜索：<strong>{query}</strong></span>
              <button onClick={() => { setQuery(''); setSearch(''); }} className="text-xs text-surface-400 hover:text-surface-500">清除</button>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-sm text-surface-400">加载中...</div>
          ) : articles.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-surface-400">
                {query ? `没有找到「${query}」相关文章` : '帮助中心正在建设中，暂无文章'}
              </p>
              <p className="mt-2 text-xs text-surface-400">
                如有疑问，可<Link href="/dashboard/tickets" className="text-brand-500 hover:underline">提交工单</Link>咨询
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-surface-400 mb-4">共 {total} 篇文章</p>
              <div className="space-y-3">
                {articles.map((a) => (
                  <Link
                    key={a.id}
                    href={`/docs/${a.slug}`}
                    className="block bg-white border border-surface-100 rounded-8 px-5 py-4 hover:border-surface-200 hover:shadow-card transition-all group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-surface-600 group-hover:text-brand-500 transition-colors truncate">
                          {a.title}
                        </h3>
                        {a.category && (
                          <span className="text-xs text-surface-400 mt-1 inline-block">{a.category.name}</span>
                        )}
                      </div>
                      <div className="text-xs text-surface-400 shrink-0 text-right">
                        <div>{a.viewCount} 次浏览</div>
                        {a.helpfulCount > 0 && <div className="text-green-500">{a.helpfulCount} 人觉得有用</div>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
