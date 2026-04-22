const trimSlash = (value: string) => value.replace(/\/+$/, '');

export function getRealtimeBaseUrl(): string {
  const explicit = trimSlash(process.env.NEXT_PUBLIC_WS_BASE_URL || '');
  if (explicit) return explicit;

  const apiBase = trimSlash(process.env.NEXT_PUBLIC_API_BASE_URL || '');
  if (apiBase) {
    return apiBase.replace(/^http/i, apiBase.startsWith('https://') ? 'wss' : 'ws');
  }

  if (typeof window === 'undefined') return '';

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (window.location.port === '3000') {
    return `${protocol}//${window.location.hostname}:8080`;
  }
  return `${protocol}//${window.location.host}`;
}

export function buildRealtimeWsUrl(token: string): string {
  const base = getRealtimeBaseUrl();
  return `${trimSlash(base)}/ws?token=${encodeURIComponent(token)}`;
}
