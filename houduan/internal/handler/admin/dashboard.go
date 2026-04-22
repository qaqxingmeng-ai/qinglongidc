package admin

import (
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

type DashboardHandler struct{}

func NewDashboardHandler() *DashboardHandler {
	return &DashboardHandler{}
}

// GET /api/admin/dashboard
func (h *DashboardHandler) Stats(c *gin.Context) {
	// ── Summary counts ──────────────────────────────────────────────────────
	var totalUsers int64
	database.DB.Model(&model.User{}).Where("role = ?", "USER").Count(&totalUsers)

	var totalAgents int64
	database.DB.Model(&model.User{}).Where("role = ?", "AGENT").Count(&totalAgents)

	var totalProducts int64
	database.DB.Model(&model.Product{}).Where("status = ?", "ACTIVE").Count(&totalProducts)

	var totalOrders int64
	database.DB.Model(&model.Order{}).Count(&totalOrders)

	var totalServers int64
	database.DB.Model(&model.ServerInstance{}).Count(&totalServers)

	var pendingServers int64
	database.DB.Model(&model.ServerInstance{}).Where("status = ?", "PENDING").Count(&pendingServers)

	var openTickets int64
	database.DB.Model(&model.Ticket{}).Where("status IN ?", []string{"OPEN", "PROCESSING"}).Count(&openTickets)

	var aiSessionCount int64
	database.DB.Model(&model.AISession{}).Count(&aiSessionCount)

	// AI conversion rate: sessions that have a non-null result / total sessions
	var convertedSessions int64
	database.DB.Model(&model.AISession{}).Where("result IS NOT NULL").Count(&convertedSessions)
	aiConversionRate := "0%"
	if aiSessionCount > 0 {
		rate := float64(convertedSessions) / float64(aiSessionCount) * 100
		aiConversionRate = fmt.Sprintf("%.1f%%", math.Round(rate*10)/10)
	}

	// ── Order status buckets ─────────────────────────────────────────────────
	type statusCount struct {
		Status string
		Count  int64
	}
	var orderBuckets []statusCount
	database.DB.Model(&model.Order{}).
		Select("status, count(*) as count").
		Group("status").
		Scan(&orderBuckets)

	var ticketBuckets []statusCount
	database.DB.Model(&model.Ticket{}).
		Select("status, count(*) as count").
		Group("status").
		Scan(&ticketBuckets)

	// ── Expiring servers (within 7 days) ─────────────────────────────────────
	sevenDays := time.Now().AddDate(0, 0, 7)
	type expiringRow struct {
		ID             string
		IP             *string
		Config         string
		ExpireDate     *time.Time
		UserName       string
		ProductName    *string
		ProductDisplay string
	}
	var expiringRows []expiringRow
	database.DB.Table("server_instances si").
		Select("si.id, si.ip, si.config, si.expire_date, u.name as user_name, p.name as product_name, p.cpu_display as product_display").
		Joins("LEFT JOIN users u ON u.id = si.user_id").
		Joins("LEFT JOIN products p ON p.id = si.product_id").
		Where("si.status = ? AND si.expire_date IS NOT NULL AND si.expire_date <= ?", "ACTIVE", sevenDays).
		Order("si.expire_date ASC").
		Limit(20).
		Scan(&expiringRows)

	type expiringSrv struct {
		ID             string      `json:"id"`
		IP             *string     `json:"ip"`
		ConfigSummary  string      `json:"configSummary"`
		ExpireDate     *time.Time  `json:"expireDate"`
		DaysUntilExpire *int       `json:"daysUntilExpire"`
		User           struct{ Name string `json:"name"` } `json:"user"`
		Product        *struct{ Name string `json:"name"` } `json:"product"`
	}
	expiringList := make([]expiringSrv, 0, len(expiringRows))
	now := time.Now()
	for _, r := range expiringRows {
		s := expiringSrv{
			ID:            r.ID,
			IP:            r.IP,
			ConfigSummary: r.ProductDisplay,
		}
		s.User.Name = r.UserName
		if r.ProductName != nil {
			s.Product = &struct{ Name string `json:"name"` }{Name: *r.ProductName}
		}
		if r.ExpireDate != nil {
			s.ExpireDate = r.ExpireDate
			days := int(math.Round(r.ExpireDate.Sub(now).Hours() / 24))
			s.DaysUntilExpire = &days
		}
		expiringList = append(expiringList, s)
	}

	// ── Top products ──────────────────────────────────────────────────────────
	type topProduct struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		ClickCount int    `json:"clickCount"`
		OrderCount int    `json:"orderCount"`
		Region     string `json:"region"`
		CPUModel   string `json:"cpuModel"`
	}
	var topProducts []topProduct
	database.DB.Table("products p").
		Select("p.id, p.name, p.click_count, p.order_count, p.region, p.cpu_display as cpu_model").
		Where("p.status = ?", "ACTIVE").
		Order("p.click_count DESC").
		Limit(10).
		Scan(&topProducts)
	if topProducts == nil {
		topProducts = []topProduct{}
	}

	// ── Recent orders ──────────────────────────────────────────────────────────
	type recentOrder struct {
		ID         string    `json:"id"`
		OrderNo    string    `json:"orderNo"`
		Status     string    `json:"status"`
		TotalPrice float64   `json:"totalPrice"`
		CreatedAt  time.Time `json:"createdAt"`
		UserName   string    `json:"-"`
	}
	var recentOrderRows []recentOrder
	database.DB.Table("orders o").
		Select("o.id, o.order_no, o.status, o.total_price, o.created_at, u.name as user_name").
		Joins("LEFT JOIN users u ON u.id = o.user_id").
		Order("o.created_at DESC").
		Limit(10).
		Scan(&recentOrderRows)

	type recentOrderOut struct {
		ID         string    `json:"id"`
		OrderNo    string    `json:"orderNo"`
		Status     string    `json:"status"`
		TotalPrice float64   `json:"totalPrice"`
		CreatedAt  time.Time `json:"createdAt"`
		User       struct{ Name string `json:"name"` } `json:"user"`
	}
	recentOrders := make([]recentOrderOut, 0, len(recentOrderRows))
	for _, r := range recentOrderRows {
		o := recentOrderOut{ID: r.ID, OrderNo: r.OrderNo, Status: r.Status, TotalPrice: r.TotalPrice, CreatedAt: r.CreatedAt}
		o.User.Name = r.UserName
		recentOrders = append(recentOrders, o)
	}

	// ── Recent tickets ──────────────────────────────────────────────────────────
	type recentTicketRow struct {
		ID       string  `json:"id"`
		TicketNo string  `json:"ticketNo"`
		Subject  string  `json:"subject"`
		Status   string  `json:"status"`
		UserName string  `json:"-"`
		OrderNo  *string `json:"-"`
	}
	var recentTicketRows []recentTicketRow
	database.DB.Table("tickets t").
		Select("t.id, t.ticket_no, t.subject, t.status, u.name as user_name, o.order_no as order_no").
		Joins("LEFT JOIN users u ON u.id = t.user_id").
		Joins("LEFT JOIN orders o ON o.id = t.order_id").
		Order("t.created_at DESC").
		Limit(10).
		Scan(&recentTicketRows)

	type recentTicketOut struct {
		ID       string                        `json:"id"`
		TicketNo string                        `json:"ticketNo"`
		Subject  string                        `json:"subject"`
		Status   string                        `json:"status"`
		User     struct{ Name string `json:"name"` } `json:"user"`
		Order    *struct{ OrderNo string `json:"orderNo"` } `json:"order"`
	}
	recentTickets := make([]recentTicketOut, 0, len(recentTicketRows))
	for _, r := range recentTicketRows {
		t := recentTicketOut{ID: r.ID, TicketNo: r.TicketNo, Subject: r.Subject, Status: r.Status}
		t.User.Name = r.UserName
		if r.OrderNo != nil {
			t.Order = &struct{ OrderNo string `json:"orderNo"` }{OrderNo: *r.OrderNo}
		}
		recentTickets = append(recentTickets, t)
	}

	// ── Agent leaderboard ──────────────────────────────────────────────────────
	type agentRow struct {
		ID           string  `json:"id"`
		Name         string  `json:"name"`
		SubUserCount int64   `json:"subUserCount"`
		TotalOrders  int64   `json:"totalOrders"`
		TotalRevenue float64 `json:"totalRevenue"`
	}
	var agentLeaderboard []agentRow
	database.DB.Table("users a").
		Select(`a.id, a.name,
			COUNT(DISTINCT su.id) as sub_user_count,
			COUNT(DISTINCT o.id) as total_orders,
			COALESCE(SUM(CASE WHEN t.amount < 0 AND t.type IN ('PURCHASE','RENEWAL','RENEW') THEN ABS(t.amount) ELSE 0 END), 0) as total_revenue`).
		Joins("LEFT JOIN users su ON su.agent_id = a.id").
		Joins("LEFT JOIN orders o ON o.user_id = su.id").
		Joins("LEFT JOIN transactions t ON t.user_id = su.id").
		Where("a.role = ?", "AGENT").
		Group("a.id, a.name").
		Order("total_revenue DESC").
		Limit(10).
		Scan(&agentLeaderboard)
	if agentLeaderboard == nil {
		agentLeaderboard = []agentRow{}
	}

	// ── Assemble ─────────────────────────────────────────────────────────────
	type bucketOut struct {
		Status string `json:"status"`
		Count  int64  `json:"count"`
	}
	orderBucketsOut := make([]bucketOut, 0, len(orderBuckets))
	for _, b := range orderBuckets {
		orderBucketsOut = append(orderBucketsOut, bucketOut{Status: b.Status, Count: b.Count})
	}
	ticketBucketsOut := make([]bucketOut, 0, len(ticketBuckets))
	for _, b := range ticketBuckets {
		ticketBucketsOut = append(ticketBucketsOut, bucketOut{Status: b.Status, Count: b.Count})
	}

	c.JSON(http.StatusOK, gin.H{
		"summary": gin.H{
			"totalUsers":      totalUsers,
			"totalAgents":     totalAgents,
			"totalProducts":   totalProducts,
			"totalOrders":     totalOrders,
			"totalServers":    totalServers,
			"pendingServers":  pendingServers,
			"openTickets":     openTickets,
			"aiSessionCount":  aiSessionCount,
			"aiConversionRate": aiConversionRate,
		},
		"expiringServers":    expiringList,
		"topProducts":        topProducts,
		"recentOrders":       recentOrders,
		"recentTickets":      recentTickets,
		"orderStatusBuckets": orderBucketsOut,
		"ticketStatusBuckets": ticketBucketsOut,
		"agentLeaderboard":   agentLeaderboard,
	})
}

// GET /api/admin/dashboard/trends
func (h *DashboardHandler) Trends(c *gin.Context) {
	days := 30

	type DayStats struct {
		Date   string  `json:"date"`
		Orders int64   `json:"orders"`
		Users  int64   `json:"users"`
		Revenue float64 `json:"revenue"`
	}

	stats := make([]DayStats, 0, days)
	for i := days - 1; i >= 0; i-- {
		date := time.Now().AddDate(0, 0, -i).Truncate(24 * time.Hour)
		nextDate := date.AddDate(0, 0, 1)

		var orderCount int64
		database.DB.Model(&model.Order{}).Where("created_at >= ? AND created_at < ?", date, nextDate).Count(&orderCount)

		var userCount int64
		database.DB.Model(&model.User{}).Where("created_at >= ? AND created_at < ?", date, nextDate).Count(&userCount)

		var revenue float64
		database.DB.Model(&model.Transaction{}).
			Where("type = ? AND created_at >= ? AND created_at < ?", "PURCHASE", date, nextDate).
			Select("COALESCE(SUM(ABS(amount)), 0)").Scan(&revenue)

		stats = append(stats, DayStats{
			Date:    date.Format("2006-01-02"),
			Orders:  orderCount,
			Users:   userCount,
			Revenue: revenue,
		})
	}

	c.JSON(http.StatusOK, gin.H{"trends": stats})
}
