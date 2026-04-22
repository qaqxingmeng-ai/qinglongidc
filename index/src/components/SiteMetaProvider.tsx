'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, isApiSuccess, pickApiData } from '@/lib/api-client';
import {
  DEFAULT_PUBLIC_SITE_META,
  SITE_META_UPDATED_EVENT,
  normalizeSiteMeta,
  resolveSiteMeta,
  type SiteMeta,
} from '@/lib/site-meta';
import type { ReactNode } from 'react';

type SiteMetaContextValue = {
  rawSiteMeta: SiteMeta;
  refreshSiteMeta: () => Promise<void>;
};

const SiteMetaContext = createContext<SiteMetaContextValue | null>(null);

export function SiteMetaProvider({ children }: { children: ReactNode }) {
  const [rawSiteMeta, setRawSiteMeta] = useState<SiteMeta>({});

  const refreshSiteMeta = async () => {
    try {
      const res = await apiFetch('/api/site-meta', { method: 'GET' });
      const json = await res.json();
      if (!isApiSuccess(json)) return;
      setRawSiteMeta(normalizeSiteMeta(pickApiData<SiteMeta>(json)));
    } catch {
      // Keep the current client value if the public site meta endpoint is temporarily unavailable.
    }
  };

  useEffect(() => {
    void refreshSiteMeta();

    const handleSiteMetaUpdated = (event: Event) => {
      const detail = (event as CustomEvent<SiteMeta>).detail;
      setRawSiteMeta(normalizeSiteMeta(detail));
    };

    window.addEventListener(SITE_META_UPDATED_EVENT, handleSiteMetaUpdated as EventListener);
    return () => {
      window.removeEventListener(SITE_META_UPDATED_EVENT, handleSiteMetaUpdated as EventListener);
    };
  }, []);

  const resolvedSiteMeta = useMemo(() => resolveSiteMeta(rawSiteMeta, DEFAULT_PUBLIC_SITE_META), [rawSiteMeta]);

  useEffect(() => {
    const nextTitle = resolvedSiteMeta.siteSubtitle
      ? `${resolvedSiteMeta.siteName} - ${resolvedSiteMeta.siteSubtitle}`
      : resolvedSiteMeta.siteName;

    if (!document.title || document.title.includes('AI Server Platform') || document.title.includes('ServerAI')) {
      document.title = nextTitle;
    }
  }, [resolvedSiteMeta.siteName, resolvedSiteMeta.siteSubtitle]);

  return (
    <SiteMetaContext.Provider value={{ rawSiteMeta, refreshSiteMeta }}>
      {children}
    </SiteMetaContext.Provider>
  );
}

export function useSiteMeta(fallback = DEFAULT_PUBLIC_SITE_META) {
  const context = useContext(SiteMetaContext);

  return {
    siteMeta: resolveSiteMeta(context?.rawSiteMeta, fallback),
    refreshSiteMeta: context?.refreshSiteMeta ?? (async () => {}),
  };
}