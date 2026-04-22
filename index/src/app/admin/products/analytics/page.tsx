'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api-client';

interface ProductHotRow {
  productId: string;
  productName: string;
  region: string;
  viewCount: number;
  orderCount: number;
  revenue: number;
  hotScore: number;
  isZeroView: boolean;
}

function AdminProductAnalyticsInner() {
  const { user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<ProductHotRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('hotScore');
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  useEffect(() => {
    if (user && user.role !== 'ADMIN') router.push('/');
  }, [user, router]);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/admin/analytics/products?page=${page}&pageSize=${pageSize}&sortBy=${sortBy}`, { method: 'GET' })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setRows((json.data as { data: ProductHotRow[]; total: number }).data);
          setTotal((json.data as { data: ProductHotRow[]; total: number }).total);
        }
      })
      .finally(() => setLoading(false));
  }, [page, sortBy]);

  const totalPages = Math.ceil(total / pageSize);

  const sortOptions = [
    { value: 'hotScore', label: '综合热度' },
    { value: 'views', label: '浏览量' },
    { value: 'orders', label: '订单量' },
    { value: 'revenue', label: '收入' },
  ];

  return (
    <div className="admin-page animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-surface-600">产品热度分析</h1>
          <p className="text-xs text-surface-400 mt-0.5">浏览量基于近 30 天；综合热度 = 浏览量 × 1 + 订单量 × 5 + 收入 × 0.01</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-surface-400">排序：</span>
          <div className="flex gap-1 bg-surface-100 rounded-lg p-1">
            {sortOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setSortBy(opt.value); setPage(1); }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  sortBy === opt.value ? 'bg-white text-surface-600 shadow-card' : 'text-surface-400 hover:text-surface-500'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-surface-400 py-8">加载中...</div>
      ) : (
        <div className="bg-white border border-surface-100 rounded-8 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-xs">
            <thead className="bg-surface-50">
              <tr>
                <th className="text-left px-4 py-3 text-surface-400 font-medium">排名</th>
                <th className="text-left px-4 py-3 text-surface-400 font-medium">产品</th>
                <th className="text-left px-4 py-3 text-surface-400 font-medium">地区</th>
                <th className="text-right px-4 py-3 text-surface-400 font-medium">30日浏览量</th>
                <th className="text-right px-4 py-3 text-surface-400 font-medium">订单量</th>
                <th className="text-right px-4 py-3 text-surface-400 font-medium">总收入</th>
                <th className="text-right px-4 py-3 text-surface-400 font-medium">热度分</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.productId} className="border-t border-surface-50 hover:bg-surface-50">
                  <td className="px-4 py-3 text-surface-400">{(page - 1) * pageSize + i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/products`}
                        className="text-surface-600 font-medium hover:text-brand-500 max-w-[200px] truncate block"
                        title={row.productName}
                      >
                        {row.productName}
                      </Link>
                      {row.isZeroView && (
                        <span className="px-1.5 py-0.5 bg-orange-50 text-semantic-warning rounded text-[10px] shrink-0">冷门</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-surface-400">{row.region}</td>
                  <td className="px-4 py-3 text-right text-surface-500">{row.viewCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-surface-500">{row.orderCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-semantic-success">¥{row.revenue.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-semibold text-brand-500">{Math.round(row.hotScore).toLocaleString()}</span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-surface-400">暂无数据</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-surface-400">
          <span>共 {total} 个产品</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-2 py-1 border border-surface-200 rounded hover:bg-surface-50 disabled:opacity-40"
            >
              上一页
            </button>
            <span>{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-2 py-1 border border-surface-200 rounded hover:bg-surface-50 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminProductAnalyticsPage() {
  return (
    <AuthProvider>
      <AdminProductAnalyticsInner />
    </AuthProvider>
  );
}
