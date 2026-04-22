'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getFavorites, removeFavorite, type ProductFavorite } from '@/lib/favorites';
import { formatCurrency } from '@/lib/catalog';

export default function FavoritesPage() {
  const [items, setItems] = useState<ProductFavorite[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);

  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFavorites(page, pageSize);
      setItems(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  function toggleSelect(productId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((f) => f.productId)));
    }
  }

  async function handleRemoveSelected() {
    if (selected.size === 0) return;
    setRemoving(true);
    try {
      await Promise.all(Array.from(selected).map((pid) => removeFavorite(pid)));
      setSelected(new Set());
      await load();
    } catch {
      // silent
    } finally {
      setRemoving(false);
    }
  }

  async function handleRemoveSingle(productId: string) {
    setRemoving(true);
    try {
      await removeFavorite(productId);
      await load();
    } catch {
      // silent
    } finally {
      setRemoving(false);
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-surface-600">我的收藏</h1>
          <p className="text-sm text-surface-400 mt-1">{total}/50 个收藏</p>
        </div>
        {selected.size > 0 && (
          <button
            type="button"
            disabled={removing}
            onClick={handleRemoveSelected}
            className="px-4 py-2 rounded-8 bg-semantic-danger-light border border-red-200 text-semantic-danger text-sm font-medium transition hover:bg-red-100 disabled:opacity-60"
          >
            取消收藏 ({selected.size})
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-surface-400 text-sm">加载中...</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-surface-400 text-sm">暂无收藏产品</p>
          <Link
            href="/servers"
            className="inline-block mt-4 px-4 py-2 rounded-8 border border-surface-200 text-surface-500 text-sm transition hover:border-surface-300"
          >
            前往浏览产品
          </Link>
        </div>
      ) : (
        <>
          <div className="rounded-8 border border-surface-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.size === items.length && items.length > 0}
                      onChange={toggleAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-surface-400">产品</th>
                  <th className="px-4 py-3 text-left font-medium text-surface-400">地区</th>
                  <th className="px-4 py-3 text-left font-medium text-surface-400">月付价格</th>
                  <th className="px-4 py-3 text-left font-medium text-surface-400">收藏时间</th>
                  <th className="px-4 py-3 text-left font-medium text-surface-400">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((fav) => (
                  <tr key={fav.id} className="border-t border-surface-100 hover:bg-surface-50 transition">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(fav.productId)}
                        onChange={() => toggleSelect(fav.productId)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/servers/${fav.productId}`}
                        className="font-medium text-surface-600 hover:text-surface-500 transition"
                      >
                        {fav.product?.name ?? fav.productId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-surface-400">{fav.product?.region ?? '--'}</td>
                    <td className="px-4 py-3 font-medium text-surface-600">
                      {fav.product ? `¥${formatCurrency(fav.product.price)}/月` : '--'}
                    </td>
                    <td className="px-4 py-3 text-surface-400 text-xs">
                      {new Date(fav.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={removing}
                        onClick={() => handleRemoveSingle(fav.productId)}
                        className="text-xs text-surface-400 hover:text-semantic-danger transition disabled:opacity-60"
                      >
                        取消
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-surface-200 text-sm text-surface-500 disabled:opacity-40 hover:border-surface-300 transition"
              >
                上一页
              </button>
              <span className="text-sm text-surface-400">{page} / {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-surface-200 text-sm text-surface-500 disabled:opacity-40 hover:border-surface-300 transition"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
