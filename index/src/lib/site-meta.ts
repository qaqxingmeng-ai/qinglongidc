export type SiteMeta = {
  siteName?: string;
  siteSubtitle?: string;
};

export const SITE_META_UPDATED_EVENT = 'site-meta-updated';

export const DEFAULT_PUBLIC_SITE_META = {
  siteName: 'ServerAI',
  siteSubtitle: '智能服务器平台',
};

export const DEFAULT_ADMIN_SITE_META = {
  siteName: 'ServerAI',
  siteSubtitle: '智能服务器平台',
};

export function normalizeSiteMeta(siteMeta?: SiteMeta | null): SiteMeta {
  return {
    siteName: typeof siteMeta?.siteName === 'string' ? siteMeta.siteName.trim() : '',
    siteSubtitle: typeof siteMeta?.siteSubtitle === 'string' ? siteMeta.siteSubtitle.trim() : '',
  };
}

export function resolveSiteMeta(siteMeta?: SiteMeta | null, fallback = DEFAULT_PUBLIC_SITE_META) {
  const normalized = normalizeSiteMeta(siteMeta);

  return {
    siteName: normalized.siteName || fallback.siteName,
    siteSubtitle: normalized.siteSubtitle || fallback.siteSubtitle,
  };
}