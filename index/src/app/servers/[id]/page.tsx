import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { AuthProvider } from '@/components/AuthProvider';
import ProductDetailClient from './ProductDetailClient';

const GO_BACKEND_URL = process.env.GO_BACKEND_URL || 'http://127.0.0.1:8080';
const INTERNAL_KEY = process.env.API_INTERNAL_KEY || '';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value || '';

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) requestHeaders['Cookie'] = `token=${token}`;
  if (INTERNAL_KEY) requestHeaders['X-Internal-Key'] = INTERNAL_KEY;

  const requestUrl = `${GO_BACKEND_URL}/api/products/${encodeURIComponent(id)}?track=0`;

  const res = await fetch(requestUrl, {
    headers: requestHeaders,
    cache: 'no-store',
  });

  if (!res.ok) {
    notFound();
  }

  const data = await res.json();
  const raw = data.data || data;

  // Backend returns { product: {...}, displayPrice, costPrice }
  // Flatten into a single ProductDetailPayload object — strip costPrice (sensitive)
  const product = raw.product
    ? { ...raw.product, displayPrice: raw.displayPrice }
    : { ...raw, costPrice: undefined };

  if (!product) {
    notFound();
  }

  return (
    <AuthProvider>
      <ProductDetailClient product={product} />
    </AuthProvider>
  );
}
