package admin

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

type AnalyticsHandler struct{}

func NewAnalyticsHandler() *AnalyticsHandler { return &AnalyticsHandler{} }

// GET /api/admin/analytics?period=daily|weekly|monthly&days=30
func (h *AnalyticsHandler) Overview(c *gin.Context) {
	period := c.DefaultQuery("period", "daily")
	daysStr := c.DefaultQuery("days", "30")
	days, _ := strconv.Atoi(daysStr)
	if days < 7 {
		days = 7
	}
	if days > 365 {
		days = 365
	}

	// ---- User growth ----
	type GrowthPoint struct {
		Date  string `json:"date"`
		Count int64  `json:"count"`
	}
	var userGrowth []GrowthPoint

	startDate := time.Now().AddDate(0, 0, -days).Truncate(24 * time.Hour)

	switch period {
	case "weekly":
		database.DB.Raw(`
			SELECT TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD') AS date,
			       COUNT(*) AS count
			FROM users
			WHERE created_at >= ?
			GROUP BY DATE_TRUNC('week', created_at)
			ORDER BY date`, startDate).Scan(&userGrowth)
	case "monthly":
		database.DB.Raw(`
			SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS date,
			       COUNT(*) AS count
			FROM users
			WHERE created_at >= ?
			GROUP BY DATE_TRUNC('month', created_at)
			ORDER BY date`, startDate).Scan(&userGrowth)
	default: // daily
		database.DB.Raw(`
			SELECT TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS date,
			       COUNT(*) AS count
			FROM users
			WHERE created_at >= ?
			GROUP BY DATE_TRUNC('day', created_at)
			ORDER BY date`, startDate).Scan(&userGrowth)
	}
	if userGrowth == nil {
		userGrowth = []GrowthPoint{}
	}

	// ---- Product sales TOP10 ----
	type ProductSaleRow struct {
		ProductID   string  `json:"productId"`
		ProductName string  `json:"productName"`
		Region      string  `json:"region"`
		OrderCount  int64   `json:"orderCount"`
		Revenue     float64 `json:"revenue"`
	}
	var productSales []ProductSaleRow
	database.DB.Raw(`
		SELECT oi.product_id,
		       p.name  AS product_name,
		       p.region,
		       COUNT(DISTINCT oi.order_id) AS order_count,
		       COALESCE(SUM(oi.price), 0) AS revenue
		FROM order_items oi
		JOIN products p ON p.id = oi.product_id
		GROUP BY oi.product_id, p.name, p.region
		ORDER BY revenue DESC
		LIMIT 10
	`).Scan(&productSales)
	if productSales == nil {
		productSales = []ProductSaleRow{}
	}

	// ---- Region revenue distribution ----
	type RegionRevRow struct {
		Region     string  `json:"region"`
		Revenue    float64 `json:"revenue"`
		OrderCount int64   `json:"orderCount"`
	}
	var regionRevenue []RegionRevRow
	database.DB.Raw(`
		SELECT p.region,
		       COALESCE(SUM(oi.price), 0) AS revenue,
		       COUNT(DISTINCT oi.order_id) AS order_count
		FROM order_items oi
		JOIN products p ON p.id = oi.product_id
		GROUP BY p.region
		ORDER BY revenue DESC
	`).Scan(&regionRevenue)
	if regionRevenue == nil {
		regionRevenue = []RegionRevRow{}
	}

	// ---- Agent contribution ranking ----
	type AgentRow struct {
		AgentID   string  `json:"agentId"`
		AgentName string  `json:"agentName"`
		UserCount int64   `json:"userCount"`
		Revenue   float64 `json:"revenue"`
	}
	var agentContrib []AgentRow
	database.DB.Raw(`
		SELECT a.id AS agent_id,
		       a.name AS agent_name,
		       COUNT(DISTINCT u.id) AS user_count,
		       COALESCE(SUM(ABS(t.amount)), 0) AS revenue
		FROM users a
		LEFT JOIN users u ON u.agent_id = a.id
		LEFT JOIN transactions t ON t.user_id = u.id AND t.type = 'PURCHASE'
		WHERE a.role = 'AGENT'
		GROUP BY a.id, a.name
		ORDER BY revenue DESC
		LIMIT 20
	`).Scan(&agentContrib)
	if agentContrib == nil {
		agentContrib = []AgentRow{}
	}

	// ---- Revenue trend (same period as userGrowth) ----
	type RevPoint struct {
		Date    string  `json:"date"`
		Revenue float64 `json:"revenue"`
		Orders  int64   `json:"orders"`
	}
	var revTrend []RevPoint

	switch period {
	case "weekly":
		database.DB.Raw(`
			SELECT TO_CHAR(DATE_TRUNC('week', t.created_at), 'YYYY-MM-DD') AS date,
			       COALESCE(SUM(ABS(t.amount)), 0) AS revenue,
			       (SELECT COUNT(*) FROM orders o WHERE DATE_TRUNC('week', o.created_at) = DATE_TRUNC('week', t.created_at)) AS orders
			FROM transactions t
			WHERE t.type = 'PURCHASE' AND t.created_at >= ?
			GROUP BY DATE_TRUNC('week', t.created_at)
			ORDER BY date`, startDate).Scan(&revTrend)
	case "monthly":
		database.DB.Raw(`
			SELECT TO_CHAR(DATE_TRUNC('month', t.created_at), 'YYYY-MM') AS date,
			       COALESCE(SUM(ABS(t.amount)), 0) AS revenue,
			       (SELECT COUNT(*) FROM orders o WHERE DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', t.created_at)) AS orders
			FROM transactions t
			WHERE t.type = 'PURCHASE' AND t.created_at >= ?
			GROUP BY DATE_TRUNC('month', t.created_at)
			ORDER BY date`, startDate).Scan(&revTrend)
	default:
		database.DB.Raw(`
			SELECT TO_CHAR(DATE_TRUNC('day', t.created_at), 'YYYY-MM-DD') AS date,
			       COALESCE(SUM(ABS(t.amount)), 0) AS revenue,
			       (SELECT COUNT(*) FROM orders o WHERE DATE_TRUNC('day', o.created_at) = DATE_TRUNC('day', t.created_at)) AS orders
			FROM transactions t
			WHERE t.type = 'PURCHASE' AND t.created_at >= ?
			GROUP BY DATE_TRUNC('day', t.created_at)
			ORDER BY date`, startDate).Scan(&revTrend)
	}
	if revTrend == nil {
		revTrend = []RevPoint{}
	}

	// ---- Real-time stats ----
	today := time.Now().Truncate(24 * time.Hour)
	var todayUsers, todayOrders int64
	var todayRevenue float64
	var openTickets int64
	database.DB.Model(&model.User{}).Where("created_at >= ?", today).Count(&todayUsers)
	database.DB.Model(&model.Order{}).Where("created_at >= ?", today).Count(&todayOrders)
	database.DB.Model(&model.Transaction{}).
		Where("type = ? AND created_at >= ?", "PURCHASE", today).
		Select("COALESCE(SUM(ABS(amount)), 0)").Scan(&todayRevenue)
	database.DB.Model(&model.Ticket{}).Where("status IN ?", []string{"OPEN", "PROCESSING"}).Count(&openTickets)

	c.JSON(http.StatusOK, gin.H{
		"userGrowth":    userGrowth,
		"revenueTrend":  revTrend,
		"productSales":  productSales,
		"regionRevenue": regionRevenue,
		"agentContrib":  agentContrib,
		"realtime": gin.H{
			"todayUsers":   todayUsers,
			"todayOrders":  todayOrders,
			"todayRevenue": todayRevenue,
			"openTickets":  openTickets,
		},
	})
}

// GET /api/admin/analytics/products?page=1&pageSize=20&sortBy=views|orders|revenue|hotScore
func (h *AnalyticsHandler) Products(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	sortBy := c.DefaultQuery("sortBy", "hotScore")
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	validSorts := map[string]string{
		"views":    "view_count",
		"orders":   "order_count",
		"revenue":  "revenue",
		"hotScore": "hot_score",
	}
	orderCol, ok := validSorts[sortBy]
	if !ok {
		orderCol = "hot_score"
	}

	type ProductHotRow struct {
		ProductID   string  `json:"productId"`
		ProductName string  `json:"productName"`
		Region      string  `json:"region"`
		ViewCount   int64   `json:"viewCount"`
		OrderCount  int64   `json:"orderCount"`
		Revenue     float64 `json:"revenue"`
		HotScore    float64 `json:"hotScore"`
		IsZeroView  bool    `json:"isZeroView"`
	}
	var rows []ProductHotRow
	var total int64

	database.DB.Raw(`
		SELECT p.id AS product_id,
		       p.name AS product_name,
		       p.region,
		       COALESCE(pv.view_count, 0) AS view_count,
		       COALESCE(oi.order_count, 0) AS order_count,
		       COALESCE(oi.revenue, 0) AS revenue,
		       COALESCE(pv.view_count, 0) * 1.0
		         + COALESCE(oi.order_count, 0) * 5.0
		         + COALESCE(oi.revenue, 0) * 0.01
		         AS hot_score,
		       (COALESCE(pv.view_count, 0) = 0) AS is_zero_view
		FROM products p
		LEFT JOIN (
			SELECT product_id, COUNT(*) AS view_count
			FROM product_views
			WHERE viewed_at >= NOW() - INTERVAL '30 days'
			GROUP BY product_id
		) pv ON pv.product_id = p.id
		LEFT JOIN (
			SELECT product_id, COUNT(*) AS order_count, SUM(price * quantity * period) AS revenue
			FROM order_items
			GROUP BY product_id
		) oi ON oi.product_id = p.id
		WHERE p.status = 'ACTIVE'
		ORDER BY `+orderCol+` DESC
		LIMIT ? OFFSET ?
	`, pageSize, (page-1)*pageSize).Scan(&rows)

	database.DB.Raw(`SELECT COUNT(*) FROM products WHERE status = 'ACTIVE'`).Scan(&total)

	if rows == nil {
		rows = []ProductHotRow{}
	}

	c.JSON(http.StatusOK, gin.H{
		"data":     rows,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}
