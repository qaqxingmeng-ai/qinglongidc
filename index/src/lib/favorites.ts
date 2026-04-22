import { apiFetch } from '@/lib/api-client';

export interface FavoriteProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  region: string;
  cpu: string;
  memory: number;
  disk: number;
  bandwidth: number;
  stock: number;
  isActive: boolean;
  createdAt: string;
}

export interface ProductFavorite {
  id: string;
  userId: string;
  productId: string;
  product: FavoriteProduct;
  createdAt: string;
}

export interface FavoritesResponse {
  data: ProductFavorite[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CheckFavoriteResponse {
  isFavorited: boolean;
  favoritedAt?: string;
}

export async function getFavorites(page = 1, pageSize = 20): Promise<FavoritesResponse> {
  const res = await apiFetch(`/api/dashboard/favorites?page=${page}&pageSize=${pageSize}`);
  const json = await res.json();
  if (!json.success) throw new Error(typeof json.error === 'string' ? json.error : json.error?.message || '获取收藏列表失败');
  return json.data ?? json;
}

export async function addFavorite(productId: string): Promise<ProductFavorite> {
  const res = await apiFetch('/api/dashboard/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId }),
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(typeof json.error === 'string' ? json.error : json.error?.message || '收藏失败');
  }
  return json.data;
}

export async function removeFavorite(productId: string): Promise<void> {
  const res = await apiFetch(`/api/dashboard/favorites/${productId}`, { method: 'DELETE' });
  const json = await res.json();
  if (!json.success) {
    throw new Error(typeof json.error === 'string' ? json.error : json.error?.message || '取消收藏失败');
  }
}

export async function checkFavorite(productId: string): Promise<CheckFavoriteResponse> {
  const res = await apiFetch(`/api/dashboard/favorites/${productId}/check`);
  const json = await res.json();
  if (!json.success) return { isFavorited: false };
  return json.data ?? json;
}
