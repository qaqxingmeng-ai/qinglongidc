export interface CPUInfo {
  id: string;
  model: string;
  cores: number;
  threads: number;
  frequency: string;
  benchmark: number;
  tags: string;
  description?: string | null;
  source: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductInfo {
  id: string;
  name: string;
  category: string;
  region: string;
  status: string;
  cpuId: string;
  cpu?: CPUInfo;
  cpuDisplay: string;
  isDualCPU: boolean;
  cpuCount: number;
  totalBenchmark?: number;
  memory: string;
  storage: string;
  bandwidth: string;
  ipLabel: string;
  protectionLabel: string;
  originalPrice: number;
  costPrice: number;
  displayPrice?: number;
  supplier: string;
  scoreNetwork: number;
  scoreCpuSingle: number;
  scoreMemory: number;
  scoreStorage: number;
  scoreNotes: string;
  scoreUpdatedAt?: string | null;
  aiDescription?: string | null;
  aiSuitableFor?: string | null;
  clickCount: number;
  orderCount: number;
  sortOrder: number;
  stock: number;
  stockAlert: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ServerInstanceInfo {
  id: string;
  userId: string;
  orderId?: string | null;
  productId: string;
  product?: ProductInfo;
  hostname?: string | null;
  ip?: string | null;
  status: string;
  config: string;
  renewalHistory: string;
  userNote?: string | null;
  adminNote?: string | null;
  autoRenew: boolean;
  startDate?: string | null;
  expireDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  tags?: ServerTagInfo[];
}

export interface ServerTagInfo {
  id: string;
  userId: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TicketInfo {
  id: string;
  ticketNo: string;
  userId: string;
  agentId?: string | null;
  assignedAdminId?: string | null;
  orderId?: string | null;
  type: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  routedAt?: string | null;
  firstResponseAt?: string | null;
  escalatedAt2h?: string | null;
  escalatedAt8h?: string | null;
  relatedProductIds?: string | null;
  onBehalfUserId?: string | null;
  createdAt: string;
  updatedAt?: string;
  messages?: TicketMessageInfo[];
}

export interface TicketMessageInfo {
  id: string;
  ticketId: string;
  sender: string;
  role: string;
  content: string;
  createdAt: string;
}

export type UserRole = 'ADMIN' | 'AGENT' | 'USER';

export interface UserInfo {
  id: string;
  numericId: number;
  email: string;
  name: string;
  role: UserRole;
  level: string;
  balance: number;
  phone?: string | null;
  inviteCode?: string | null;
  agentId?: string | null;
  agentName?: string | null;
  agent?: UserInfo | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderInfo {
  id: string;
  orderNo: string;
  userId: string;
  status: string;
  totalPrice: number;
  discountAmount: number;
  pointsUsed: number;
  couponId?: string | null;
  note?: string | null;
  renewalServerId?: string | null;
  renewalPeriod: number;
  createdAt: string;
  updatedAt?: string;
  items?: OrderItemInfo[];
}

export interface OrderItemInfo {
  id: string;
  orderId: string;
  productId: string;
  product?: ProductInfo;
  quantity: number;
  period: number;
  price: number;
}

export interface TransactionInfo {
  id: string;
  userId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  note?: string | null;
  relatedOrderId?: string | null;
  relatedServerId?: string | null;
  operatorId?: string | null;
  createdAt: string;
}

export interface CouponInfo {
  id: string;
  code: string;
  name: string;
  type: string;
  value: number;
  minOrderAmount: number;
  maxDiscount: number;
  startAt: string;
  endAt: string;
  totalCount: number;
  usedCount: number;
  perUserLimit: number;
  isActive: boolean;
  scope: string;
  scopeIds: string;
  pointsRequired: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserCouponInfo {
  id: string;
  userId: string;
  couponId: string;
  coupon?: CouponInfo;
  status: string;
  usedAt?: string | null;
  orderId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationInfo {
  id: string;
  userId: string;
  type: string;
  title: string;
  content: string;
  isRead: boolean;
  relatedId?: string | null;
  relatedType?: string | null;
  createdAt: string;
}

export interface NotificationPreferenceInfo {
  userId: string;
  browserPushEnabled: boolean;
  ticketReplyPush: boolean;
  serverExpiryPush: boolean;
  balanceChangePush: boolean;
  securityAlertPush: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementInfo {
  id: string;
  title: string;
  content: string;
  type: string;
  priority: string;
  startAt?: string | null;
  endAt?: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserPointsInfo {
  id: string;
  userId: string;
  points: number;
  totalEarned: number;
  totalSpent: number;
  checkinStreak: number;
  lastCheckinAt?: string | null;
  updatedAt: string;
}

export interface PointsTransactionInfo {
  id: string;
  userId: string;
  type: string;
  points: number;
  relatedId?: string | null;
  note: string;
  expireAt?: string | null;
  createdAt: string;
}

export interface ApiTokenInfo {
  id: string;
  userId: string;
  name: string;
  tokenSuffix: string;
  scope: string;
  dailyLimit: number;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
}

export interface CommissionInfo {
  id: string;
  agentId: string;
  orderId: string;
  userId: string;
  amount: number;
  status: string;
  settledAt?: string | null;
  freezeUntil: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionWithdrawalInfo {
  id: string;
  agentId: string;
  amount: number;
  status: string;
  adminNote?: string | null;
  reviewedAt?: string | null;
  settledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SLAConfigInfo {
  id: string;
  region: string;
  supplier: string;
  availabilityTarget: number;
  firstResponseTargetMin: number;
  recoveryTargetMin: number;
  compensationMultiplier: number;
  createdAt: string;
  updatedAt: string;
}

export interface SLAViolationInfo {
  id: string;
  type: string;
  source: string;
  status: string;
  region: string;
  supplier: string;
  ticketId?: string | null;
  serverId?: string | null;
  orderId?: string | null;
  occurredAt: string;
  detectedAt: string;
  durationMinutes: number;
  targetMinutes: number;
  compensationAmount: number;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnomalyAlertInfo {
  id: string;
  type: string;
  title: string;
  detail: string;
  status: string;
  relatedId?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface LevelHistoryInfo {
  id: string;
  userId: string;
  fromLevel: string;
  toLevel: string;
  reason: string;
  operatorId?: string | null;
  changedAt: string;
}

export interface ProductDetailPayload {
  id: string;
  name: string;
  category: string;
  region: string;
  cpu?: CPUInfo;
  cpuId: string;
  cpuDisplay: string;
  isDualCPU: boolean;
  cpuCount: number;
  totalBenchmark: number;
  memory: string;
  storage: string;
  bandwidth: string;
  ipLabel: string;
  protectionLabel: string;
  displayPrice: number;
  originalPrice: number;
  costPrice: number;
  referencePrice: number;
  supplier: string;
  scoreNetwork: number;
  scoreCpuSingle: number;
  scoreCpuMulti: number;
  scoreMemory: number;
  scoreStorage: number;
  scoreLatency: number;
  scoreDelivery: number;
  scoreDefense: number;
  scoreSupport: number;
  scorePlatformBonus: number;
  scoreNotes: string;
  scoreUpdatedAt?: string | null;
  aiDescription?: string | null;
  aiSuitableFor?: string | null;
  clickCount: number;
  orderCount: number;
  sortOrder: number;
  stock: number;
  stockAlert: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ResolvedProductDetail extends Omit<ProductDetailPayload, 'cpu'> {
  cpu: Omit<CPUInfo, 'tags'> & { tags: string[] };
}
