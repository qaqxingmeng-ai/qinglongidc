export interface AdminDashboardData {
  summary: {
    totalUsers: number;
    totalProducts: number;
    totalOrders: number;
    totalServers: number;
    openTickets: number;
    totalAgents: number;
    pendingServers: number;
    aiSessionCount: number;
    aiConversionRate: string;
  };
  expiringServers: {
    id: string;
    ip: string | null;
    configSummary: string;
    expireDate: string | null;
    daysUntilExpire: number | null;
    user: { name: string };
    product: { name: string } | null;
  }[];
  topProducts: { id: string; name: string; clickCount: number; orderCount: number; region: string; cpuModel: string }[];
  recentOrders: {
    id: string;
    orderNo: string;
    status: string;
    totalPrice: number;
    createdAt: string;
    user: { name: string };
  }[];
  recentTickets: {
    id: string;
    ticketNo: string;
    subject: string;
    status: string;
    user: { name: string };
    order: { orderNo: string } | null;
  }[];
  orderStatusBuckets: { status: string; count: number }[];
  ticketStatusBuckets: { status: string; count: number }[];
  agentLeaderboard: { id: string; name: string; subUserCount: number; totalOrders: number; totalRevenue: number }[];
}

const EMPTY_SUMMARY: AdminDashboardData['summary'] = {
  totalUsers: 0,
  totalProducts: 0,
  totalOrders: 0,
  totalServers: 0,
  openTickets: 0,
  totalAgents: 0,
  pendingServers: 0,
  aiSessionCount: 0,
  aiConversionRate: '0%',
};

export const EMPTY_ADMIN_DASHBOARD_DATA: AdminDashboardData = {
  summary: EMPTY_SUMMARY,
  expiringServers: [],
  topProducts: [],
  recentOrders: [],
  recentTickets: [],
  orderStatusBuckets: [],
  ticketStatusBuckets: [],
  agentLeaderboard: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function unwrapDashboardPayload(raw: unknown): Record<string, unknown> | null {
  let current = raw;

  for (let depth = 0; depth < 3; depth += 1) {
    const record = asRecord(current);
    if (!record) return null;
    if (isRecord(record.summary)) return record;
    current = record.data;
  }

  return null;
}

export function normalizeAdminDashboardData(raw: unknown): AdminDashboardData {
  const payload = unwrapDashboardPayload(raw);
  if (!payload) return EMPTY_ADMIN_DASHBOARD_DATA;

  const summary = asRecord(payload.summary) ?? {};

  return {
    summary: {
      totalUsers: asNumber(summary.totalUsers),
      totalProducts: asNumber(summary.totalProducts),
      totalOrders: asNumber(summary.totalOrders),
      totalServers: asNumber(summary.totalServers),
      openTickets: asNumber(summary.openTickets),
      totalAgents: asNumber(summary.totalAgents),
      pendingServers: asNumber(summary.pendingServers),
      aiSessionCount: asNumber(summary.aiSessionCount),
      aiConversionRate: asString(summary.aiConversionRate, '0%'),
    },
    expiringServers: asRecordArray(payload.expiringServers).map((item) => {
      const user = asRecord(item.user) ?? {};
      const product = asRecord(item.product);
      return {
        id: asString(item.id),
        ip: asNullableString(item.ip),
        configSummary: asString(item.configSummary),
        expireDate: asNullableString(item.expireDate),
        daysUntilExpire: asNullableNumber(item.daysUntilExpire),
        user: { name: asString(user.name, '-') },
        product: product ? { name: asString(product.name, '-') } : null,
      };
    }),
    topProducts: asRecordArray(payload.topProducts).map((item) => ({
      id: asString(item.id),
      name: asString(item.name, '-'),
      clickCount: asNumber(item.clickCount),
      orderCount: asNumber(item.orderCount),
      region: asString(item.region),
      cpuModel: asString(item.cpuModel),
    })),
    recentOrders: asRecordArray(payload.recentOrders).map((item) => {
      const user = asRecord(item.user) ?? {};
      return {
        id: asString(item.id),
        orderNo: asString(item.orderNo, '-'),
        status: asString(item.status),
        totalPrice: asNumber(item.totalPrice),
        createdAt: asString(item.createdAt),
        user: { name: asString(user.name, '-') },
      };
    }),
    recentTickets: asRecordArray(payload.recentTickets).map((item) => {
      const user = asRecord(item.user) ?? {};
      const order = asRecord(item.order);
      return {
        id: asString(item.id),
        ticketNo: asString(item.ticketNo, '-'),
        subject: asString(item.subject, '-'),
        status: asString(item.status),
        user: { name: asString(user.name, '-') },
        order: order ? { orderNo: asString(order.orderNo, '-') } : null,
      };
    }),
    orderStatusBuckets: asRecordArray(payload.orderStatusBuckets).map((item) => ({
      status: asString(item.status),
      count: asNumber(item.count),
    })),
    ticketStatusBuckets: asRecordArray(payload.ticketStatusBuckets).map((item) => ({
      status: asString(item.status),
      count: asNumber(item.count),
    })),
    agentLeaderboard: asRecordArray(payload.agentLeaderboard).map((item) => ({
      id: asString(item.id),
      name: asString(item.name, '-'),
      subUserCount: asNumber(item.subUserCount),
      totalOrders: asNumber(item.totalOrders),
      totalRevenue: asNumber(item.totalRevenue),
    })),
  };
}
