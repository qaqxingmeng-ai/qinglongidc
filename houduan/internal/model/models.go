package model

import (
	"time"
)

// ==================== User ====================

type User struct {
	ID           string    `gorm:"primaryKey;size:30" json:"id"`
	NumericID    int       `gorm:"uniqueIndex;not null;default:0" json:"numericId"`
	Email        string    `gorm:"uniqueIndex;size:255;not null" json:"email"`
	Password     string    `gorm:"not null" json:"-"`
	Name         string    `gorm:"size:100;not null" json:"name"`
	Phone        *string   `gorm:"size:50" json:"phone,omitempty"`
	Role         string    `gorm:"size:20;not null;default:USER;index" json:"role"`
	Level        string    `gorm:"size:20;not null;default:GUEST" json:"level"`
	Balance      float64   `gorm:"not null;default:0" json:"balance"`
	InviteCode   *string   `gorm:"uniqueIndex;size:20" json:"inviteCode,omitempty"`
	// IdentityCode 统一以 bcrypt 哈希存储；永不输出到 API，响应请使用 hasIdentityCode。
	IdentityCode *string   `gorm:"size:255" json:"-"`
	AgentID      *string   `gorm:"size:30;index" json:"agentId,omitempty"`
	Agent        *User     `gorm:"foreignKey:AgentID" json:"agent,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`

	SubUsers     []User           `gorm:"foreignKey:AgentID" json:"subUsers,omitempty"`
	Servers      []ServerInstance `gorm:"foreignKey:UserID" json:"servers,omitempty"`
	Orders       []Order          `gorm:"foreignKey:UserID" json:"orders,omitempty"`
	Tickets      []Ticket         `gorm:"foreignKey:UserID" json:"tickets,omitempty"`
	AISessions   []AISession      `gorm:"foreignKey:UserID" json:"aiSessions,omitempty"`
	Logs         []UserLog        `gorm:"foreignKey:UserID" json:"logs,omitempty"`
	Transactions []Transaction    `gorm:"foreignKey:UserID" json:"transactions,omitempty"`
	Sessions     []UserSession    `gorm:"foreignKey:UserID" json:"sessions,omitempty"`
}

// ==================== CPU ====================

type CPU struct {
	ID          string    `gorm:"primaryKey;size:30" json:"id"`
	Model       string    `gorm:"uniqueIndex;size:200;not null" json:"model"`
	Cores       int       `gorm:"not null" json:"cores"`
	Threads     int       `gorm:"not null" json:"threads"`
	Frequency   string    `gorm:"size:50;not null" json:"frequency"`
	Benchmark   int       `gorm:"not null" json:"benchmark"`
	Tags        string    `gorm:"type:text;not null;default:''" json:"tags"`
	Description *string   `gorm:"type:text" json:"description,omitempty"`
	Source      string    `gorm:"size:50;not null;default:e81.cn" json:"source"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`

	Products []Product `gorm:"foreignKey:CPUID" json:"products,omitempty"`
}

// ==================== Product ====================

type Product struct {
	ID       string `gorm:"primaryKey;size:30" json:"id"`
	Name     string `gorm:"size:255;not null" json:"name"`
	Category string `gorm:"size:50;not null;default:dedicated" json:"category"`
	Region   string `gorm:"size:100;not null;index" json:"region"`
	Status   string `gorm:"size:20;not null;default:ACTIVE;index" json:"status"`

	// CPU
	CPUID      string `gorm:"size:30;not null;index" json:"cpuId"`
	CPU        CPU    `gorm:"foreignKey:CPUID" json:"cpu,omitempty"`
	CPUDisplay string `gorm:"size:255;not null;default:''" json:"cpuDisplay"`
	IsDualCPU  bool   `gorm:"not null;default:false" json:"isDualCPU"`
	CPUCount   int    `gorm:"not null;default:1" json:"cpuCount"`

	// Hardware
	Memory          string `gorm:"size:100;not null" json:"memory"`
	Storage         string `gorm:"size:200;not null" json:"storage"`
	Bandwidth       string `gorm:"size:100;not null" json:"bandwidth"`
	IPLabel         string `gorm:"size:100;not null;default:''" json:"ipLabel"`
	ProtectionLabel string `gorm:"size:100;not null;default:''" json:"protectionLabel"`

	// Price
	OriginalPrice float64 `gorm:"not null" json:"originalPrice"`
	CostPrice     float64 `gorm:"not null" json:"-"`
	Supplier      string  `gorm:"size:100;not null;default:''" json:"-"`

	// Scores (0-100)
	ScoreNetwork       int        `gorm:"not null;default:0" json:"scoreNetwork"`
	ScoreCPUSingle     int        `gorm:"not null;default:0" json:"scoreCpuSingle"`
	ScoreCPUMulti      int        `gorm:"not null;default:0" json:"scoreCpuMulti"`
	ScoreMemory        int        `gorm:"not null;default:0" json:"scoreMemory"`
	ScoreStorage       int        `gorm:"not null;default:0" json:"scoreStorage"`
	ScoreLatency       int        `gorm:"not null;default:0" json:"scoreLatency"`
	ScoreDelivery      int        `gorm:"not null;default:0" json:"scoreDelivery"`
	ScoreDefense       int        `gorm:"not null;default:0" json:"scoreDefense"`
	ScoreSupport       int        `gorm:"not null;default:0" json:"scoreSupport"`
	ScorePlatformBonus int        `gorm:"not null;default:0" json:"scorePlatformBonus"`
	ScoreNotes         string     `gorm:"type:text;not null;default:'{}'" json:"scoreNotes"`
	ScoreUpdatedAt     *time.Time `json:"scoreUpdatedAt,omitempty"`

	// AI
	AIDescription *string `gorm:"type:text" json:"aiDescription,omitempty"`
	AISuitableFor *string `gorm:"type:text" json:"aiSuitableFor,omitempty"`

	// Stats
	ClickCount int `gorm:"not null;default:0" json:"clickCount"`
	OrderCount int `gorm:"not null;default:0" json:"orderCount"`
	SortOrder  int `gorm:"not null;default:0;index" json:"sortOrder"`

	// Stock (-1 = unlimited)
	Stock      int `gorm:"not null;default:-1" json:"stock"`
	StockAlert int `gorm:"not null;default:0" json:"stockAlert"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	OrderItems []OrderItem       `gorm:"foreignKey:ProductID" json:"orderItems,omitempty"`
	Instances  []ServerInstance  `gorm:"foreignKey:ProductID" json:"instances,omitempty"`
	Favorites  []ProductFavorite `gorm:"foreignKey:ProductID" json:"favorites,omitempty"`
}

// ==================== ProductFavorite ====================

const MaxFavoritesPerUser = 50

type ProductFavorite struct {
	ID        string    `gorm:"primaryKey;size:30" json:"id"`
	UserID    string    `gorm:"size:30;not null;index:idx_fav_user_product,unique;index" json:"userId"`
	User      User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	ProductID string    `gorm:"size:30;not null;index:idx_fav_user_product,unique;index" json:"productId"`
	Product   Product   `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// ==================== RegionInfo ====================

type RegionInfo struct {
	Region      string    `gorm:"primaryKey;size:100" json:"region"`
	Description string    `gorm:"type:text;not null;default:''" json:"description"`
	SortOrder   int       `gorm:"not null;default:0" json:"sortOrder"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// ==================== PricingConfig ====================

type PricingConfig struct {
	ID                string    `gorm:"primaryKey;size:30;default:default" json:"id"`
	PartnerMarkup     float64   `gorm:"not null;default:0.20" json:"partnerMarkup"`
	VIPTopMarkup      float64   `gorm:"not null;default:0.40" json:"vipTopMarkup"`
	VIPMarkup         float64   `gorm:"not null;default:0.50" json:"vipMarkup"`
	GuestMarkup       float64   `gorm:"not null;default:1.00" json:"guestMarkup"`
	RoundingThreshold int       `gorm:"not null;default:600" json:"roundingThreshold"`
	RoundingSmallStep int       `gorm:"not null;default:10" json:"roundingSmallStep"`
	RoundingLargeStep int       `gorm:"not null;default:50" json:"roundingLargeStep"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

// ==================== Coupon ====================

type Coupon struct {
	ID             string    `gorm:"primaryKey;size:30" json:"id"`
	Code           string    `gorm:"uniqueIndex;size:50;not null" json:"code"`
	Name           string    `gorm:"size:100;not null" json:"name"`
	Type           string    `gorm:"size:20;not null" json:"type"` // PERCENTAGE / FIXED / RENEWAL
	Value          float64   `gorm:"not null" json:"value"`        // 0.1 = 10% off, or fixed amount
	MinOrderAmount float64   `gorm:"not null;default:0" json:"minOrderAmount"`
	MaxDiscount    float64   `gorm:"not null;default:0" json:"maxDiscount"` // 0 = no cap
	StartAt        time.Time `json:"startAt"`
	EndAt          time.Time `json:"endAt"`
	TotalCount     int       `gorm:"not null;default:-1" json:"totalCount"` // -1 = unlimited
	UsedCount      int       `gorm:"not null;default:0" json:"usedCount"`
	PerUserLimit   int       `gorm:"not null;default:1" json:"perUserLimit"`
	IsActive       bool      `gorm:"not null;default:true" json:"isActive"`
	Scope          string    `gorm:"size:20;not null;default:'ALL'" json:"scope"`     // ALL / REGION / PRODUCT / FIRST_ORDER
	ScopeIds       string    `gorm:"type:text;not null;default:'[]'" json:"scopeIds"` // JSON array
	PointsRequired int       `gorm:"not null;default:0" json:"pointsRequired"`        // 0 = not for points redemption, >0 = points needed to redeem
	CreatedBy      string    `gorm:"size:30;not null" json:"createdBy"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type UserCoupon struct {
	ID        string     `gorm:"primaryKey;size:30" json:"id"`
	UserID    string     `gorm:"size:30;not null;index:idx_uc_user_coupon,priority:1;index:idx_user_coupons_user_coupon_status,priority:1" json:"userId"`
	User      User       `gorm:"foreignKey:UserID" json:"user,omitempty"`
	CouponID  string     `gorm:"size:30;not null;index:idx_uc_user_coupon,priority:2;index:idx_user_coupons_coupon_status,priority:1;index:idx_user_coupons_user_coupon_status,priority:2" json:"couponId"`
	Coupon    Coupon     `gorm:"foreignKey:CouponID" json:"coupon,omitempty"`
	Status    string     `gorm:"size:20;not null;default:'UNUSED';index;index:idx_user_coupons_coupon_status,priority:2;index:idx_user_coupons_user_coupon_status,priority:3" json:"status"` // UNUSED / USED / EXPIRED
	UsedAt    *time.Time `json:"usedAt,omitempty"`
	OrderID   *string    `gorm:"size:30" json:"orderId,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

// ==================== Order ====================

type Order struct {
	ID              string    `gorm:"primaryKey;size:30" json:"id"`
	OrderNo         string    `gorm:"uniqueIndex;size:50;not null" json:"orderNo"`
	UserID          string    `gorm:"size:30;not null;index" json:"userId"`
	IdempotencyKey  *string   `gorm:"size:80;index:idx_orders_user_idempotency_key,priority:2" json:"-"`
	User            User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Status          string    `gorm:"size:20;not null;default:PENDING;index" json:"status"`
	TotalPrice      float64   `gorm:"not null" json:"totalPrice"`
	DiscountAmount  float64   `gorm:"not null;default:0" json:"discountAmount"`
	PointsUsed      int       `gorm:"not null;default:0" json:"pointsUsed"`
	CouponID        *string   `gorm:"size:30" json:"couponId,omitempty"`
	Note            *string   `gorm:"type:text" json:"note,omitempty"`
	RenewalServerID *string   `gorm:"size:30;index" json:"renewalServerId,omitempty"`
	RenewalPeriod   int       `gorm:"not null;default:0" json:"renewalPeriod"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`

	Items   []OrderItem `gorm:"foreignKey:OrderID;constraint:OnDelete:CASCADE" json:"items,omitempty"`
	Tickets []Ticket    `gorm:"foreignKey:OrderID" json:"tickets,omitempty"`
}

type OrderItem struct {
	ID        string  `gorm:"primaryKey;size:30" json:"id"`
	OrderID   string  `gorm:"size:30;not null;index" json:"orderId"`
	Order     Order   `gorm:"foreignKey:OrderID" json:"order,omitempty"`
	ProductID string  `gorm:"size:30;not null" json:"productId"`
	Product   Product `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	Quantity  int     `gorm:"not null;default:1" json:"quantity"`
	Period    int     `gorm:"not null;default:1" json:"period"`
	Price     float64 `gorm:"not null" json:"price"`
}

// ==================== ServerInstance ====================

type ServerInstance struct {
	ID             string      `gorm:"primaryKey;size:30" json:"id"`
	UserID         string      `gorm:"size:30;not null;index" json:"userId"`
	User           User        `gorm:"foreignKey:UserID" json:"user,omitempty"`
	OrderID        *string     `gorm:"size:30;index" json:"orderId,omitempty"`
	ProductID      string      `gorm:"size:30;not null" json:"productId"`
	Product        Product     `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	Hostname       *string     `gorm:"size:100" json:"hostname,omitempty"`
	IP             *string     `gorm:"size:50" json:"ip,omitempty"`
	Status         string      `gorm:"size:20;not null;default:PENDING;index" json:"status"`
	Config         string      `gorm:"type:text;not null" json:"config"`
	RenewalHistory string      `gorm:"type:text;not null;default:'[]'" json:"renewalHistory"`
	UserNote       *string     `gorm:"type:text" json:"userNote,omitempty"`
	AdminNote      *string     `gorm:"type:text" json:"adminNote,omitempty"`
	AutoRenew      bool        `gorm:"not null;default:false" json:"autoRenew"`
	StartDate      *time.Time  `json:"startDate,omitempty"`
	ExpireDate     *time.Time  `json:"expireDate,omitempty"`
	CreatedAt      time.Time   `json:"createdAt"`
	UpdatedAt      time.Time   `json:"updatedAt"`
	Tags           []ServerTag `gorm:"many2many:server_tag_relations;joinForeignKey:ServerID;JoinReferences:TagID" json:"tags,omitempty"`
}

// ==================== ServerTag ====================

type ServerTag struct {
	ID        string    `gorm:"primaryKey;size:30" json:"id"`
	UserID    string    `gorm:"size:30;not null;index" json:"userId"`
	User      User      `gorm:"foreignKey:UserID" json:"-"`
	Name      string    `gorm:"size:50;not null" json:"name"`
	Color     string    `gorm:"size:20;not null;default:blue" json:"color"`
	SortOrder int       `gorm:"not null;default:0" json:"sortOrder"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	Servers []ServerInstance `gorm:"many2many:server_tag_relations;joinForeignKey:TagID;JoinReferences:ServerID" json:"-"`
}

type ServerTagRelation struct {
	ServerID  string    `gorm:"primaryKey;size:30;index" json:"serverId"`
	TagID     string    `gorm:"primaryKey;size:30;index" json:"tagId"`
	CreatedAt time.Time `json:"createdAt"`
}

// ==================== Ticket ====================

type Ticket struct {
	ID                string     `gorm:"primaryKey;size:30" json:"id"`
	TicketNo          string     `gorm:"uniqueIndex;size:50;not null" json:"ticketNo"`
	UserID            string     `gorm:"size:30;not null;index" json:"userId"`
	User              User       `gorm:"foreignKey:UserID" json:"user,omitempty"`
	AgentID           *string    `gorm:"size:30;index" json:"agentId,omitempty"`
	Agent             *User      `gorm:"foreignKey:AgentID" json:"agent,omitempty"`
	AssignedAdminID   *string    `gorm:"size:30;index" json:"assignedAdminId,omitempty"`
	AssignedAdmin     *User      `gorm:"foreignKey:AssignedAdminID" json:"assignedAdmin,omitempty"`
	OrderID           *string    `gorm:"size:30;index" json:"orderId,omitempty"`
	Order             *Order     `gorm:"foreignKey:OrderID" json:"order,omitempty"`
	Type              string     `gorm:"size:20;not null" json:"type"`
	Category          string     `gorm:"size:20;not null;default:GENERAL;index" json:"category"`
	Subject           string     `gorm:"size:255;not null" json:"subject"`
	Status            string     `gorm:"size:20;not null;default:OPEN;index" json:"status"`
	Priority          string     `gorm:"size:20;not null;default:NORMAL" json:"priority"`
	RoutedAt          *time.Time `json:"routedAt,omitempty"`
	FirstResponseAt   *time.Time `json:"firstResponseAt,omitempty"`
	EscalatedAt2h     *time.Time `json:"escalatedAt2h,omitempty"`
	EscalatedAt8h     *time.Time `json:"escalatedAt8h,omitempty"`
	RelatedProductIDs *string    `gorm:"type:text" json:"relatedProductIds,omitempty"`
	OnBehalfUserID    *string    `gorm:"size:30" json:"onBehalfUserId,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`

	Messages []TicketMessage `gorm:"foreignKey:TicketID;constraint:OnDelete:CASCADE" json:"messages,omitempty"`
}

type TicketMessage struct {
	ID        string    `gorm:"primaryKey;size:30" json:"id"`
	TicketID  string    `gorm:"size:30;not null;index" json:"ticketId"`
	Ticket    Ticket    `gorm:"foreignKey:TicketID" json:"ticket,omitempty"`
	Sender    string    `gorm:"size:30;not null" json:"sender"`
	Role      string    `gorm:"size:20;not null" json:"role"`
	Content   string    `gorm:"type:text;not null" json:"content"`
	CreatedAt time.Time `json:"createdAt"`
}

// ==================== AI Session ====================

type AISession struct {
	ID        string    `gorm:"primaryKey;size:30" json:"id"`
	UserID    *string   `gorm:"size:30;index" json:"userId,omitempty"`
	User      *User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Status    string    `gorm:"size:20;not null;default:ACTIVE" json:"status"`
	Result    *string   `gorm:"type:text" json:"result,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	Messages []AIMessage `gorm:"foreignKey:SessionID;constraint:OnDelete:CASCADE" json:"messages,omitempty"`
}

type AIMessage struct {
	ID        string    `gorm:"primaryKey;size:30" json:"id"`
	SessionID string    `gorm:"size:30;not null;index" json:"sessionId"`
	Session   AISession `gorm:"foreignKey:SessionID" json:"session,omitempty"`
	Role      string    `gorm:"size:20;not null" json:"role"`
	Content   string    `gorm:"type:text;not null" json:"content"`
	CreatedAt time.Time `json:"createdAt"`
}

// ==================== Transaction ====================

type Transaction struct {
	ID              string    `gorm:"primaryKey;size:30" json:"id"`
	UserID          string    `gorm:"size:30;not null;index" json:"userId"`
	User            User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Type            string    `gorm:"size:30;not null;index" json:"type"`
	Amount          float64   `gorm:"not null" json:"amount"`
	BalanceBefore   float64   `gorm:"not null" json:"balanceBefore"`
	BalanceAfter    float64   `gorm:"not null" json:"balanceAfter"`
	Note            *string   `gorm:"type:text" json:"note,omitempty"`
	RelatedOrderID  *string   `gorm:"size:30;index" json:"relatedOrderId,omitempty"`
	RelatedServerID *string   `gorm:"size:30" json:"relatedServerId,omitempty"`
	OperatorID      *string   `gorm:"size:30" json:"operatorId,omitempty"`
	CreatedAt       time.Time `gorm:"index" json:"createdAt"`
}

// ==================== EmailVerification ====================

type EmailVerification struct {
	ID        string    `gorm:"primaryKey;size:30" json:"id"`
	Email     string    `gorm:"size:255;not null;index" json:"email"`
	Code      string    `gorm:"size:10;not null" json:"code"`
	Used      bool      `gorm:"not null;default:false" json:"used"`
	ExpiresAt time.Time `gorm:"not null" json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
}

// ==================== ProductView ====================

// Source: LIST / DETAIL / AI / SEARCH
type ProductView struct {
	ID        string    `gorm:"primaryKey;size:30" json:"id"`
	ProductID string    `gorm:"size:30;not null;index" json:"productId"`
	Product   Product   `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	UserID    *string   `gorm:"size:30;index" json:"userId,omitempty"`
	ViewedAt  time.Time `gorm:"index" json:"viewedAt"`
	Source    string    `gorm:"size:20;not null;default:'DETAIL'" json:"source"`
}

// ==================== Analytics ====================

type Analytics struct {
	ID        string    `gorm:"primaryKey;size:30" json:"id"`
	Event     string    `gorm:"size:50;not null;index" json:"event"`
	Target    *string   `gorm:"size:100" json:"target,omitempty"`
	Meta      *string   `gorm:"type:text" json:"meta,omitempty"`
	UserID    *string   `gorm:"size:30" json:"userId,omitempty"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

// ==================== UserLog ====================

type UserLog struct {
	ID        string    `gorm:"primaryKey;size:30" json:"id"`
	UserID    string    `gorm:"size:30;not null;index" json:"userId"`
	User      User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Event     string    `gorm:"size:50;not null;index" json:"event"`
	TargetID  *string   `gorm:"size:100" json:"targetId,omitempty"`
	Detail    *string   `gorm:"type:text" json:"detail,omitempty"`
	Meta      *string   `gorm:"type:text" json:"meta,omitempty"`
	IP        *string   `gorm:"size:50" json:"ip,omitempty"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

// ==================== SystemSetting ====================

type SystemSetting struct {
	Key       string    `gorm:"primaryKey;size:100" json:"key"`
	Value     string    `gorm:"type:text;not null;default:''" json:"value"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// ==================== Notification ====================

type Notification struct {
	ID          string    `gorm:"primaryKey;size:30" json:"id"`
	UserID      string    `gorm:"size:30;not null;index" json:"userId"`
	User        User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Type        string    `gorm:"size:50;not null;index" json:"type"`
	Title       string    `gorm:"size:255;not null" json:"title"`
	Content     string    `gorm:"type:text;not null;default:''" json:"content"`
	IsRead      bool      `gorm:"not null;default:false;index" json:"isRead"`
	RelatedID   *string   `gorm:"size:100" json:"relatedId,omitempty"`
	RelatedType *string   `gorm:"size:50" json:"relatedType,omitempty"`
	CreatedAt   time.Time `gorm:"index" json:"createdAt"`
}

type NotificationPreference struct {
	UserID             string    `gorm:"primaryKey;size:30" json:"userId"`
	User               User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	BrowserPushEnabled bool      `gorm:"not null;default:false" json:"browserPushEnabled"`
	TicketReplyPush    bool      `gorm:"not null;default:true" json:"ticketReplyPush"`
	ServerExpiryPush   bool      `gorm:"not null;default:true" json:"serverExpiryPush"`
	BalanceChangePush  bool      `gorm:"not null;default:true" json:"balanceChangePush"`
	SecurityAlertPush  bool      `gorm:"not null;default:true" json:"securityAlertPush"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

type NotificationSubscription struct {
	ID         string     `gorm:"primaryKey;size:30" json:"id"`
	UserID     string     `gorm:"size:30;not null;index" json:"userId"`
	User       User       `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Endpoint   string     `gorm:"type:text;not null;uniqueIndex" json:"endpoint"`
	P256DH     string     `gorm:"column:p256dh;type:text;not null" json:"p256dh"`
	Auth       string     `gorm:"column:auth;type:text;not null" json:"auth"`
	UserAgent  *string    `gorm:"size:255" json:"userAgent,omitempty"`
	LastSeenAt *time.Time `json:"lastSeenAt,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

// ==================== Announcement ====================

// Type: BANNER / POPUP / MAINTENANCE / CHANGELOG
// Priority: LOW / NORMAL / HIGH / URGENT
type Announcement struct {
	ID        string     `gorm:"primaryKey;size:30" json:"id"`
	Title     string     `gorm:"size:255;not null" json:"title"`
	Content   string     `gorm:"type:text;not null;default:''" json:"content"`
	Type      string     `gorm:"size:30;not null;default:BANNER;index" json:"type"`
	Priority  string     `gorm:"size:20;not null;default:NORMAL" json:"priority"`
	StartAt   *time.Time `gorm:"index" json:"startAt,omitempty"`
	EndAt     *time.Time `json:"endAt,omitempty"`
	IsActive  bool       `gorm:"not null;default:false;index" json:"isActive"`
	CreatedBy string     `gorm:"size:30;not null" json:"createdBy"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

// ==================== OrderReview ====================

type OrderReview struct {
	ID        string    `gorm:"primaryKey;size:30" json:"id"`
	OrderID   string    `gorm:"uniqueIndex;size:30;not null" json:"orderId"`
	Order     Order     `gorm:"foreignKey:OrderID" json:"order,omitempty"`
	UserID    string    `gorm:"size:30;not null;index" json:"userId"`
	User      User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Rating    int       `gorm:"not null" json:"rating"`
	Content   *string   `gorm:"type:text" json:"content,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// ==================== CronLog ====================

type CronLog struct {
	ID          string    `gorm:"primaryKey;size:30" json:"id"`
	Job         string    `gorm:"size:50;not null;index" json:"job"`
	Status      string    `gorm:"size:20;not null;default:SUCCESS" json:"status"`
	Detail      string    `gorm:"type:text;not null;default:''" json:"detail"`
	ProcessedAt time.Time `gorm:"index" json:"processedAt"`
}

// ==================== TicketRating ====================

// 工单满意度评价 (1-5 星)
type TicketRating struct {
	ID        string    `gorm:"primaryKey;size:30" json:"id"`
	TicketID  string    `gorm:"uniqueIndex;size:30;not null" json:"ticketId"`
	Ticket    Ticket    `gorm:"foreignKey:TicketID" json:"ticket,omitempty"`
	UserID    string    `gorm:"size:30;not null;index" json:"userId"`
	User      User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Rating    int       `gorm:"not null" json:"rating"` // 1-5
	Feedback  *string   `gorm:"type:text" json:"feedback,omitempty"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

// ==================== BackupRecord ====================

// Status: RUNNING / SUCCESS / FAILED
type BackupRecord struct {
	ID        string    `gorm:"primaryKey;size:30" json:"id"`
	Filename  string    `gorm:"size:200;not null" json:"filename"`
	FilePath  string    `gorm:"size:500;not null" json:"filePath"`
	SizeBytes int64     `gorm:"not null;default:0" json:"sizeBytes"`
	Status    string    `gorm:"size:20;not null;default:RUNNING;index" json:"status"`
	ErrorMsg  *string   `gorm:"type:text" json:"errorMsg,omitempty"`
	Trigger   string    `gorm:"size:20;not null;default:MANUAL" json:"trigger"` // MANUAL / AUTO
	CreatedBy *string   `gorm:"size:30" json:"createdBy,omitempty"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

// ==================== LevelHistory ====================

type LevelHistory struct {
	ID        string `gorm:"primaryKey;size:30" json:"id"`
	UserID    string `gorm:"size:30;not null;index" json:"userId"`
	User      User   `gorm:"foreignKey:UserID" json:"user,omitempty"`
	FromLevel string `gorm:"size:20;not null" json:"fromLevel"`
	ToLevel   string `gorm:"size:20;not null" json:"toLevel"`
	Reason    string `gorm:"size:200;not null;default:''" json:"reason"`
	// nil = system (auto), non-nil = admin operator
	OperatorID *string   `gorm:"size:30" json:"operatorId,omitempty"`
	ChangedAt  time.Time `gorm:"index" json:"changedAt"`
}

// ==================== Supplier ====================

type Supplier struct {
	ID           string    `gorm:"primaryKey;size:30" json:"id"`
	Name         string    `gorm:"uniqueIndex;size:100;not null" json:"name"`
	ContactName  *string   `gorm:"size:100" json:"contactName,omitempty"`
	ContactPhone *string   `gorm:"size:50" json:"contactPhone,omitempty"`
	ContactEmail *string   `gorm:"size:200" json:"contactEmail,omitempty"`
	Website      *string   `gorm:"size:300" json:"website,omitempty"`
	Notes        *string   `gorm:"type:text" json:"notes,omitempty"`
	IsActive     bool      `gorm:"not null;default:true;index" json:"isActive"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// ==================== EmailTemplate ====================

// Type: REGISTER_VERIFY / TICKET_NOTIFY / SERVER_EXPIRY / BALANCE_CHANGE / ORDER_CONFIRM / SECURITY_ALERT / PASSWORD_RESET
type EmailTemplate struct {
	ID           string    `gorm:"primaryKey;size:30" json:"id"`
	Type         string    `gorm:"uniqueIndex;size:50;not null" json:"type"`
	Name         string    `gorm:"size:100;not null" json:"name"`
	Subject      string    `gorm:"size:200;not null" json:"subject"`
	BodyMarkdown string    `gorm:"type:text;not null" json:"bodyMarkdown"`
	Variables    string    `gorm:"type:text;not null;default:'[]'" json:"variables"` // JSON array of available variable names
	UpdatedBy    *string   `gorm:"size:30" json:"updatedBy,omitempty"`
	UpdatedAt    time.Time `json:"updatedAt"`
	CreatedAt    time.Time `json:"createdAt"`
}

// ==================== ArticleCategory ====================

type ArticleCategory struct {
	ID        string    `gorm:"primaryKey;size:30" json:"id"`
	Name      string    `gorm:"size:100;not null" json:"name"`
	Slug      string    `gorm:"uniqueIndex;size:100;not null" json:"slug"`
	SortOrder int       `gorm:"not null;default:0" json:"sortOrder"`
	ParentID  *string   `gorm:"size:30;index" json:"parentId,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	Children []ArticleCategory `gorm:"foreignKey:ParentID" json:"children,omitempty"`
	Articles []Article         `gorm:"foreignKey:CategoryID" json:"articles,omitempty"`
}

// ==================== Article ====================

type Article struct {
	ID              string          `gorm:"primaryKey;size:30" json:"id"`
	Title           string          `gorm:"size:200;not null;index" json:"title"`
	Slug            string          `gorm:"uniqueIndex;size:200;not null" json:"slug"`
	Content         string          `gorm:"type:text;not null" json:"content"` // Markdown
	CategoryID      string          `gorm:"size:30;not null;index" json:"categoryId"`
	Category        ArticleCategory `gorm:"foreignKey:CategoryID" json:"category,omitempty"`
	Tags            string          `gorm:"type:text;not null;default:'[]'" json:"tags"` // JSON array
	ViewCount       int             `gorm:"not null;default:0" json:"viewCount"`
	HelpfulCount    int             `gorm:"not null;default:0" json:"helpfulCount"`
	NotHelpfulCount int             `gorm:"not null;default:0" json:"notHelpfulCount"`
	IsPublished     bool            `gorm:"not null;default:false;index" json:"isPublished"`
	SortOrder       int             `gorm:"not null;default:0" json:"sortOrder"`
	CreatedBy       string          `gorm:"size:30;not null" json:"createdBy"`
	CreatedAt       time.Time       `gorm:"index" json:"createdAt"`
	UpdatedAt       time.Time       `json:"updatedAt"`
}

// ==================== NpsResponse ====================

type NpsResponse struct {
	ID        string    `gorm:"primaryKey;size:30" json:"id"`
	UserID    string    `gorm:"size:30;not null;index" json:"userId"`
	User      User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Score     int       `gorm:"not null" json:"score"` // 0-10
	Reason    *string   `gorm:"type:text" json:"reason,omitempty"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

// ==================== LoginHistory ====================

// isSuccessful=false when password wrong / account locked
type LoginHistory struct {
	ID           string    `gorm:"primaryKey;size:30" json:"id"`
	UserID       *string   `gorm:"size:30;index" json:"userId,omitempty"` // nil if user not found
	Email        string    `gorm:"size:255;not null;index" json:"email"`
	IP           string    `gorm:"size:50;not null" json:"ip"`
	UserAgent    string    `gorm:"size:500;not null;default:''" json:"userAgent"`
	IsSuccessful bool      `gorm:"not null;default:false" json:"isSuccessful"`
	FailReason   *string   `gorm:"size:200" json:"failReason,omitempty"`
	LoginAt      time.Time `gorm:"index" json:"loginAt"`
}

// ==================== UserSession ====================

type UserSession struct {
	ID           string    `gorm:"primaryKey;size:30" json:"id"`
	UserID       string    `gorm:"size:30;not null;index" json:"userId"`
	User         User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	DeviceID     string    `gorm:"size:80;not null;default:'';index" json:"deviceId"`
	JWTID        string    `gorm:"size:80;not null;index" json:"jwtId"`
	IP           string    `gorm:"size:64;not null;default:''" json:"ip"`
	UserAgent    string    `gorm:"size:500;not null;default:''" json:"userAgent"`
	LastActiveAt time.Time `gorm:"index" json:"lastActiveAt"`
	ExpiresAt    time.Time `gorm:"index" json:"expiresAt"`
	IsActive     bool      `gorm:"not null;default:true;index" json:"isActive"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// ==================== UserPoints ====================

type UserPoints struct {
	ID            string     `gorm:"primaryKey;size:30" json:"id"`
	UserID        string     `gorm:"uniqueIndex;size:30;not null" json:"userId"`
	User          User       `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Points        int        `gorm:"not null;default:0" json:"points"`      // current usable
	TotalEarned   int        `gorm:"not null;default:0" json:"totalEarned"` // cumulative earned
	TotalSpent    int        `gorm:"not null;default:0" json:"totalSpent"`  // cumulative spent
	CheckinStreak int        `gorm:"not null;default:0" json:"checkinStreak"`
	LastCheckinAt *time.Time `json:"lastCheckinAt,omitempty"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

// ==================== PointsTransaction ====================

// type: PURCHASE_EARN / CHECKIN / BIND_PHONE / ENABLE_2FA / REDEEM / EXPIRE / ADMIN_ADJUST
type PointsTransaction struct {
	ID        string     `gorm:"primaryKey;size:30" json:"id"`
	UserID    string     `gorm:"size:30;not null;index" json:"userId"`
	User      User       `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Type      string     `gorm:"size:30;not null;index" json:"type"`
	Points    int        `gorm:"not null" json:"points"` // positive=earn, negative=spend/expire
	RelatedID *string    `gorm:"size:30" json:"relatedId,omitempty"`
	Note      string     `gorm:"size:200;not null;default:''" json:"note"`
	ExpireAt  *time.Time `json:"expireAt,omitempty"`
	CreatedAt time.Time  `gorm:"index" json:"createdAt"`
}

// ==================== ApiToken ====================

// Scope: READ / READWRITE
type ApiToken struct {
	ID          string     `gorm:"primaryKey;size:30" json:"id"`
	UserID      string     `gorm:"size:30;not null;index" json:"userId"`
	User        User       `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Name        string     `gorm:"size:100;not null" json:"name"`
	TokenHash   string     `gorm:"size:64;not null;uniqueIndex" json:"-"`
	TokenSuffix string     `gorm:"size:8;not null" json:"tokenSuffix"` // last 8 chars for display
	Scope       string     `gorm:"size:20;not null;default:READ" json:"scope"`
	DailyLimit  int        `gorm:"not null;default:1000" json:"dailyLimit"`
	ExpiresAt   *time.Time `json:"expiresAt,omitempty"`
	LastUsedAt  *time.Time `json:"lastUsedAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
}

// ==================== ApiTokenUsageLog ====================

type ApiTokenUsageLog struct {
	ID         string    `gorm:"primaryKey;size:30" json:"id"`
	TokenID    string    `gorm:"size:30;not null;index" json:"tokenId"`
	Token      ApiToken  `gorm:"foreignKey:TokenID" json:"token,omitempty"`
	UserID     string    `gorm:"size:30;not null;index" json:"userId"`
	Method     string    `gorm:"size:10;not null;index" json:"method"`
	Path       string    `gorm:"size:255;not null;index" json:"path"`
	StatusCode int       `gorm:"not null;index" json:"statusCode"`
	DurationMs int       `gorm:"not null" json:"durationMs"`
	IP         string    `gorm:"size:64" json:"ip,omitempty"`
	UserAgent  string    `gorm:"size:255" json:"userAgent,omitempty"`
	CreatedAt  time.Time `gorm:"index" json:"createdAt"`
}

// ==================== InviteRewardLog ====================

// RewardType: INVITEE_REGISTER / INVITER_FIRST_PAID
type InviteRewardLog struct {
	ID         string    `gorm:"primaryKey;size:30" json:"id"`
	RewardType string    `gorm:"size:30;not null;index:idx_invite_reward_once,priority:1" json:"rewardType"`
	InviterID  *string   `gorm:"size:30;index" json:"inviterId,omitempty"`
	InviteeID  string    `gorm:"size:30;not null;index:idx_invite_reward_once,priority:2" json:"inviteeId"`
	OrderID    *string   `gorm:"size:30;index" json:"orderId,omitempty"`
	Amount     float64   `gorm:"not null" json:"amount"`
	MonthKey   string    `gorm:"size:7;not null;index" json:"monthKey"` // YYYY-MM
	CreatedAt  time.Time `gorm:"index" json:"createdAt"`
}

// ==================== Commission ====================

// Status: FROZEN / AVAILABLE / SETTLED / CANCELLED
// FROZEN = within freeze window, AVAILABLE = can withdraw, SETTLED = paid out
// Commission = order sell-price(USER level) minus agent-level price
type Commission struct {
	ID          string     `gorm:"primaryKey;size:30" json:"id"`
	AgentID     string     `gorm:"size:30;not null;index" json:"agentId"`
	Agent       User       `gorm:"foreignKey:AgentID" json:"agent,omitempty"`
	OrderID     string     `gorm:"size:30;not null;uniqueIndex" json:"orderId"`
	Order       Order      `gorm:"foreignKey:OrderID" json:"order,omitempty"`
	UserID      string     `gorm:"size:30;not null;index" json:"userId"` // buyer
	Amount      float64    `gorm:"not null" json:"amount"`
	Status      string     `gorm:"size:20;not null;default:FROZEN;index" json:"status"`
	SettledAt   *time.Time `json:"settledAt,omitempty"`
	FreezeUntil time.Time  `gorm:"not null" json:"freezeUntil"` // auto-settle after this
	CreatedAt   time.Time  `gorm:"index" json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

// ==================== CommissionWithdrawal ====================

// Status: PENDING / APPROVED / REJECTED / SETTLED
type CommissionWithdrawal struct {
	ID         string     `gorm:"primaryKey;size:30" json:"id"`
	AgentID    string     `gorm:"size:30;not null;index" json:"agentId"`
	Agent      User       `gorm:"foreignKey:AgentID" json:"agent,omitempty"`
	Amount     float64    `gorm:"not null" json:"amount"`
	Status     string     `gorm:"size:20;not null;default:PENDING;index" json:"status"`
	AdminNote  *string    `gorm:"type:text" json:"adminNote,omitempty"`
	ReviewedAt *time.Time `json:"reviewedAt,omitempty"`
	SettledAt  *time.Time `json:"settledAt,omitempty"`
	CreatedAt  time.Time  `gorm:"index" json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

// ==================== PromoClick ====================

// Track referral link clicks: UV / PV per day per agent
type PromoClick struct {
	ID        string    `gorm:"primaryKey;size:30" json:"id"`
	AgentID   string    `gorm:"size:30;not null;index" json:"agentId"`
	Agent     User      `gorm:"foreignKey:AgentID" json:"agent,omitempty"`
	VisitorKey string   `gorm:"column:ip;size:50;not null" json:"visitorKey"`
	Date      string    `gorm:"size:10;not null;index" json:"date"`     // YYYY-MM-DD
	IsUnique  bool      `gorm:"not null;default:false" json:"isUnique"` // first click from this visitor key on this day
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

// ==================== AITicketFeedback ====================

// Action: adopted / modified / ignored
type AITicketFeedback struct {
	ID         string    `gorm:"primaryKey;size:30" json:"id"`
	TicketID   string    `gorm:"size:30;not null;index" json:"ticketId"`
	AdminID    string    `gorm:"size:30;not null;index" json:"adminId"`
	Suggestion string    `gorm:"type:text;not null" json:"suggestion"`
	Action     string    `gorm:"size:20;not null" json:"action"`
	CreatedAt  time.Time `gorm:"index" json:"createdAt"`
}

// ==================== AnomalyAlert ====================

// Type: REVENUE_ANOMALY / TICKET_SPIKE / USER_CHURN_RISK / SUSPICIOUS_RECHARGE
// Status: OPEN / RESOLVED
type AnomalyAlert struct {
	ID         string     `gorm:"primaryKey;size:30" json:"id"`
	Type       string     `gorm:"size:40;not null;index" json:"type"`
	Title      string     `gorm:"size:200;not null" json:"title"`
	Detail     string     `gorm:"type:text" json:"detail"`
	Status     string     `gorm:"size:20;not null;default:OPEN;index" json:"status"`
	RelatedID  *string    `gorm:"size:30" json:"relatedId,omitempty"`
	ResolvedBy *string    `gorm:"size:30" json:"resolvedBy,omitempty"`
	ResolvedAt *time.Time `json:"resolvedAt,omitempty"`
	CreatedAt  time.Time  `gorm:"index" json:"createdAt"`
}

// ==================== AITicketClassification ====================

// Status: PENDING (AI not done) / DONE / ERROR
type AITicketClassification struct {
	ID                string     `gorm:"primaryKey;size:30" json:"id"`
	TicketID          string     `gorm:"size:30;not null;uniqueIndex" json:"ticketId"`
	SuggestedType     string     `gorm:"size:20" json:"suggestedType"`
	SuggestedCategory string     `gorm:"size:20" json:"suggestedCategory"`
	SuggestedPriority string     `gorm:"size:20" json:"suggestedPriority"`
	Reason            string     `gorm:"type:text" json:"reason"`
	Accepted          *bool      `json:"accepted,omitempty"`
	FinalType         *string    `gorm:"size:20" json:"finalType,omitempty"`
	FinalCategory     *string    `gorm:"size:20" json:"finalCategory,omitempty"`
	FinalPriority     *string    `gorm:"size:20" json:"finalPriority,omitempty"`
	AcceptedBy        *string    `gorm:"size:30" json:"acceptedBy,omitempty"`
	AcceptedAt        *time.Time `json:"acceptedAt,omitempty"`
	CreatedAt         time.Time  `gorm:"index" json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
}

// ==================== SLAConfig ====================

// Region/Supplier can be empty string to represent global default policy.
type SLAConfig struct {
	ID                     string    `gorm:"primaryKey;size:30" json:"id"`
	Region                 string    `gorm:"size:100;not null;default:'';index:idx_sla_config_scope,priority:1" json:"region"`
	Supplier               string    `gorm:"size:100;not null;default:'';index:idx_sla_config_scope,priority:2" json:"supplier"`
	AvailabilityTarget     float64   `gorm:"not null;default:99.9" json:"availabilityTarget"`
	FirstResponseTargetMin int       `gorm:"not null;default:30" json:"firstResponseTargetMin"`
	RecoveryTargetMin      int       `gorm:"not null;default:240" json:"recoveryTargetMin"`
	CompensationMultiplier float64   `gorm:"not null;default:1.5" json:"compensationMultiplier"`
	CreatedAt              time.Time `json:"createdAt"`
	UpdatedAt              time.Time `json:"updatedAt"`
}

// ==================== SLAViolation ====================

// Type: FIRST_RESPONSE / RECOVERY / AVAILABILITY
// Source: MANUAL / AUTO
// Status: OPEN / CONFIRMED / WAIVED
type SLAViolation struct {
	ID                 string     `gorm:"primaryKey;size:30" json:"id"`
	Type               string     `gorm:"size:30;not null;index" json:"type"`
	Source             string     `gorm:"size:20;not null;default:MANUAL;index" json:"source"`
	Status             string     `gorm:"size:20;not null;default:OPEN;index" json:"status"`
	Region             string     `gorm:"size:100;not null;default:'';index" json:"region"`
	Supplier           string     `gorm:"size:100;not null;default:'';index" json:"supplier"`
	TicketID           *string    `gorm:"size:30;index" json:"ticketId,omitempty"`
	ServerID           *string    `gorm:"size:30;index" json:"serverId,omitempty"`
	OrderID            *string    `gorm:"size:30;index" json:"orderId,omitempty"`
	OccurredAt         time.Time  `gorm:"index" json:"occurredAt"`
	DetectedAt         time.Time  `gorm:"index" json:"detectedAt"`
	DurationMinutes    int        `gorm:"not null;default:0" json:"durationMinutes"`
	TargetMinutes      int        `gorm:"not null;default:0" json:"targetMinutes"`
	CompensationAmount float64    `gorm:"not null;default:0" json:"compensationAmount"`
	CompensationDays   int        `gorm:"not null;default:0" json:"compensationDays"`
	Note               *string    `gorm:"type:text" json:"note,omitempty"`
	CreatedBy          *string    `gorm:"size:30" json:"createdBy,omitempty"`
	ResolvedBy         *string    `gorm:"size:30" json:"resolvedBy,omitempty"`
	ResolvedAt         *time.Time `json:"resolvedAt,omitempty"`
	CreatedAt          time.Time  `gorm:"index" json:"createdAt"`
	UpdatedAt          time.Time  `json:"updatedAt"`
}
