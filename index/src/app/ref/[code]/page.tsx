'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

export default function ReferralPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    apiFetch(`/api/ref/${encodeURIComponent(code)}?format=json`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        const redirectTo = typeof json?.redirectTo === 'string' ? json.redirectTo : `/register?ref=${encodeURIComponent(code)}`;
        router.replace(redirectTo);
      })
      .catch(() => {
        if (!cancelled) {
          router.replace(`/register?ref=${encodeURIComponent(code)}`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-surface-400">
      正在跳转...
    </div>
  );
}
