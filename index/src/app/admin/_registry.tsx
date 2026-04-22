'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

type AdminPageComponent = ComponentType<object>;

/**
 * Admin page registry.
 * Maps admin paths to lazily-loaded page components.
 * All pages are 'use client', so dynamic() works without ssr:false needed.
 */

// Static pages
const pages: Record<string, AdminPageComponent> = {
  '/admin': dynamic(() => import('./page')),
  '/admin/realtime': dynamic(() => import('./realtime/page')),
  '/admin/analytics': dynamic(() => import('./analytics/page')),
  '/admin/reports': dynamic(() => import('./reports/page')),
  '/admin/nps': dynamic(() => import('./nps/page')),

  '/admin/users': dynamic(() => import('./users/page')),
  '/admin/login-history': dynamic(() => import('./login-history/page')),
  '/admin/points': dynamic(() => import('./points/page')),

  '/admin/products': dynamic(() => import('./products/page')),
  '/admin/products/ai': dynamic(() => import('./products/ai/page')),
  '/admin/products/settings': dynamic(() => import('./products/settings/page')),
  '/admin/products/analytics': dynamic(() => import('./products/analytics/page')),
  '/admin/cpus': dynamic(() => import('./cpus/page')),
  '/admin/regions': dynamic(() => import('./regions/page')),
  '/admin/suppliers': dynamic(() => import('./suppliers/page')),
  '/admin/pricing': dynamic(() => import('./pricing/page')),

  '/admin/servers': dynamic(() => import('./servers/page')),
  '/admin/servers/calendar': dynamic(() => import('./servers/calendar/page')),
  '/admin/servers/renewal': dynamic(() => import('./servers/renewal/page')),

  '/admin/orders': dynamic(() => import('./orders/page')),
  '/admin/reviews': dynamic(() => import('./reviews/page')),
  '/admin/finance': dynamic(() => import('./finance/page')),
  '/admin/finance/transactions': dynamic(() => import('./finance/transactions/page')),
  '/admin/finance/balance': dynamic(() => import('./finance/balance/page')),
  '/admin/finance/trends': dynamic(() => import('./finance/trends/page')),
  '/admin/finance/top-users': dynamic(() => import('./finance/top-users/page')),

  '/admin/tickets': dynamic(() => import('./tickets/page')),
  '/admin/tickets/ai': dynamic(() => import('./tickets/ai/page')),
  '/admin/ticket-ratings': dynamic(() => import('./ticket-ratings/page')),
  '/admin/sla': dynamic(() => import('./sla/page')),
  '/admin/sla/violations': dynamic(() => import('./sla/violations/page')),

  '/admin/agent-commission': dynamic(() => import('./agent-commission/page')),
  '/admin/agent-commission/withdrawals': dynamic(() => import('./agent-commission/withdrawals/page')),

  '/admin/announcements': dynamic(() => import('./announcements/page')),
  '/admin/notifications': dynamic(() => import('./notifications/page')),
  '/admin/article-categories': dynamic(() => import('./article-categories/page')),
  '/admin/articles': dynamic(() => import('./articles/page')),
  '/admin/coupons': dynamic(() => import('./coupons/page')),
  '/admin/email-templates': dynamic(() => import('./email-templates/page')),

  '/admin/settings': dynamic(() => import('./settings/page')),
  '/admin/settings/email-templates': dynamic(() => import('./settings/email-templates/page')),
  '/admin/logs': dynamic(() => import('./logs/page')),
  '/admin/cron-logs': dynamic(() => import('./cron-logs/page')),
  '/admin/anomalies': dynamic(() => import('./anomalies/page')),
  '/admin/api-usage': dynamic(() => import('./api-usage/page')),
  '/admin/backups': dynamic(() => import('./backups/page')),
  '/admin/bulk': dynamic(() => import('./bulk/page')),
  '/admin/export': dynamic(() => import('./export/page')),
  '/admin/security': dynamic(() => import('./security/page')),
};

// Dynamic route patterns (order matters: more specific first)
const dynamicPatterns: Array<{
  pattern: RegExp;
  load: AdminPageComponent;
  paramName: string;
}> = [
  {
    pattern: /^\/admin\/users\/([^/]+)$/,
    load: dynamic(() => import('./users/[id]/page')),
    paramName: 'id',
  },
  {
    pattern: /^\/admin\/tickets\/([^/]+)$/,
    load: dynamic(() => import('./tickets/[id]/page')),
    paramName: 'id',
  },
];

export interface ResolvedPage {
  Component: AdminPageComponent;
  params: Record<string, string>;
}

/**
 * Resolve a path to a page component + params.
 * Returns null if no match found.
 */
export function resolveAdminPage(path: string): ResolvedPage | null {
  // Strip query/hash
  const clean = path.split('?')[0].split('#')[0].replace(/\/$/, '') || '/admin';

  // Static match
  const StaticComp = pages[clean];
  if (StaticComp) return { Component: StaticComp, params: {} };

  // Dynamic match
  for (const { pattern, load, paramName } of dynamicPatterns) {
    const m = clean.match(pattern);
    if (m) {
      // Don't match known static sub-paths (e.g., /admin/tickets/ai)
      if (pages[clean]) return { Component: pages[clean], params: {} };
      return { Component: load, params: { [paramName]: m[1] } };
    }
  }

  return null;
}
