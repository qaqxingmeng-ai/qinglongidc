package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
)

type DashboardHandler struct{}

func NewDashboardHandler() *DashboardHandler {
	return &DashboardHandler{}
}

// GET /api/dashboard/stats
func (h *DashboardHandler) Stats(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var user model.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	var serverCount int64
	database.DB.Model(&model.ServerInstance{}).Where("user_id = ?", userID).Count(&serverCount)

	var activeServerCount int64
	database.DB.Model(&model.ServerInstance{}).Where("user_id = ? AND status = ?", userID, "ACTIVE").Count(&activeServerCount)

	var orderCount int64
	database.DB.Model(&model.Order{}).Where("user_id = ?", userID).Count(&orderCount)

	var openTicketCount int64
	database.DB.Model(&model.Ticket{}).Where("user_id = ? AND status IN ?", userID, []string{"OPEN", "PROCESSING"}).Count(&openTicketCount)

	// Expiring soon servers (within 7 days)
	sevenDays := time.Now().AddDate(0, 0, 7)
	var expiringServers []model.ServerInstance
	database.DB.Where("user_id = ? AND status = ? AND expire_date <= ?", userID, "ACTIVE", sevenDays).
		Preload("Product").
		Find(&expiringServers)

	type expiringInfo struct {
		ID          string  `json:"id"`
		ProductName string  `json:"productName"`
		Region      string  `json:"region"`
		IP          *string `json:"ip"`
		ExpireDate  *string `json:"expireDate"`
		DaysLeft    *int    `json:"daysLeft"`
	}
	expiring := make([]expiringInfo, 0, len(expiringServers))
	now := time.Now()
	for _, s := range expiringServers {
		info := expiringInfo{
			ID: s.ID,
			IP: s.IP,
		}
		if s.Product.ID != "" {
			info.ProductName = s.Product.Name
			info.Region = s.Product.Region
		}
		if s.ExpireDate != nil {
			formatted := s.ExpireDate.Format("2006-01-02")
			info.ExpireDate = &formatted
			days := int(s.ExpireDate.Sub(now).Hours() / 24)
			info.DaysLeft = &days
		}
		expiring = append(expiring, info)
	}

	// Pending orders
	var pendingOrders int64
	database.DB.Model(&model.Order{}).Where("user_id = ? AND status = ?", userID, "PENDING").Count(&pendingOrders)

	// Total spend
	var totalSpend float64
	database.DB.Model(&model.Transaction{}).
		Where("user_id = ? AND type IN ? AND amount < 0", userID, []string{"PURCHASE", "RENEW", "RENEWAL"}).
		Select("COALESCE(SUM(ABS(amount)), 0)").Scan(&totalSpend)

	c.JSON(http.StatusOK, gin.H{
		"balance":       user.Balance,
		"serverCount":   serverCount,
		"activeServers": activeServerCount,
		"orderCount":    orderCount,
		"openTickets":   openTicketCount,
		"expiringSoon":  expiring,
		"pendingOrders": pendingOrders,
		"totalSpend":    totalSpend,
		"level":         user.Level,
		"role":          user.Role,
	})
}

// GET /api/dashboard/logs
func (h *DashboardHandler) UserLogs(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var logs []model.UserLog
	database.DB.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(50).
		Find(&logs)

	c.JSON(http.StatusOK, gin.H{"logs": logs})
}

// GET /api/dashboard/security
func (h *DashboardHandler) SecurityScore(c *gin.Context) {
	userID := middleware.GetUserID(c)
	score := 100

	var user model.User
	database.DB.First(&user, "id = ?", userID)

	// Deductions
	if user.Phone == nil || *user.Phone == "" {
		score -= 20 // No phone
	}
	// Check password age (simplistic: if never changed, deduct)
	var pwdChangeCount int64
	database.DB.Model(&model.UserLog{}).
		Where("user_id = ? AND event = ?", userID, "PASSWORD_CHANGE").
		Count(&pwdChangeCount)
	if pwdChangeCount == 0 {
		score -= 15 // Never changed password
	}
	// Check if email verified (always yes for registered users)
	// Deduct if no recent login in 30 days
	thirtyDaysAgo := time.Now().AddDate(0, 0, -30)
	var recentLoginCount int64
	database.DB.Model(&model.UserLog{}).
		Where("user_id = ? AND event = ? AND created_at > ?", userID, "LOGIN", thirtyDaysAgo).
		Count(&recentLoginCount)
	if recentLoginCount == 0 {
		score -= 10
	}

	if score < 0 {
		score = 0
	}

	c.JSON(http.StatusOK, gin.H{
		"score": score,
		"items": []gin.H{
			{"name": "手机号绑定", "done": user.Phone != nil && *user.Phone != "", "weight": 20},
			{"name": "修改过密码", "done": pwdChangeCount > 0, "weight": 15},
			{"name": "近期登录", "done": recentLoginCount > 0, "weight": 10},
			{"name": "邮箱验证", "done": true, "weight": 0},
		},
	})
}

// GET /api/dashboard/analytics/personal
func (h *DashboardHandler) PersonalAnalytics(c *gin.Context) {
	userID := middleware.GetUserID(c)
	now := time.Now()

	// ── 月度消费趋势（最近 6 个月）──────────────────────────────────────
	type monthlyRow struct {
		Month  string  `json:"month"`
		Amount float64 `json:"amount"`
	}

	// Build last-6-month buckets
	monthlyMap := make(map[string]float64)
	months := make([]string, 6)
	for i := 5; i >= 0; i-- {
		m := now.AddDate(0, -i, 0).Format("2006-01")
		months[5-i] = m
		monthlyMap[m] = 0
	}
	sixMonthsAgo := now.AddDate(0, -6, 0)

	type txRow struct {
		Month  string
		Amount float64
	}
	var txRows []txRow
	database.DB.Model(&model.Transaction{}).
		Select("TO_CHAR(created_at, 'YYYY-MM') AS month, SUM(ABS(amount)) AS amount").
		Where("user_id = ? AND type IN ? AND created_at >= ? AND amount < 0",
			userID, []string{"PURCHASE", "RENEW", "RENEWAL"}, sixMonthsAgo).
		Group("TO_CHAR(created_at, 'YYYY-MM')").
		Scan(&txRows)
	for _, r := range txRows {
		monthlyMap[r.Month] = r.Amount
	}
	monthlyTrend := make([]monthlyRow, 6)
	for i, m := range months {
		monthlyTrend[i] = monthlyRow{Month: m, Amount: monthlyMap[m]}
	}

	// Monthly average over months that had any spend
	var monthlyAvg float64
	activeMo := 0
	totalAll := 0.0
	for _, r := range monthlyTrend {
		if r.Amount > 0 {
			activeMo++
			totalAll += r.Amount
		}
	}
	if activeMo > 0 {
		monthlyAvg = totalAll / float64(activeMo)
	}

	// ── 消费总额（全量）────────────────────────────────────────────────
	var allTimeSpend float64
	database.DB.Model(&model.Transaction{}).
		Where("user_id = ? AND type IN ? AND amount < 0", userID, []string{"PURCHASE", "RENEW", "RENEWAL"}).
		Select("COALESCE(SUM(ABS(amount)), 0)").Scan(&allTimeSpend)

	// ── 按地区分布（续费走 server_instances → products）────────────────
	type regionRow struct {
		Region string  `json:"region"`
		Amount float64 `json:"amount"`
	}
	var byRegionRenew []regionRow
	database.DB.Table("transactions t").
		Select("p.region AS region, SUM(ABS(t.amount)) AS amount").
		Joins("JOIN server_instances si ON si.id = t.related_server_id").
		Joins("JOIN products p ON p.id = si.product_id").
		Where("t.user_id = ? AND t.type IN ? AND t.amount < 0", userID, []string{"RENEW", "RENEWAL"}).
		Group("p.region").
		Scan(&byRegionRenew)

	var byRegionPurchase []regionRow
	database.DB.Table("transactions t").
		Select("p.region AS region, SUM(oi.price) AS amount").
		Joins("JOIN orders o ON o.id = t.related_order_id").
		Joins("JOIN order_items oi ON oi.order_id = o.id").
		Joins("JOIN products p ON p.id = oi.product_id").
		Where("t.user_id = ? AND t.type = 'PURCHASE' AND t.amount < 0", userID).
		Group("p.region").
		Scan(&byRegionPurchase)

	regionMap := map[string]float64{}
	for _, r := range byRegionRenew {
		regionMap[r.Region] += r.Amount
	}
	for _, r := range byRegionPurchase {
		regionMap[r.Region] += r.Amount
	}
	byRegion := make([]regionRow, 0, len(regionMap))
	for region, amt := range regionMap {
		byRegion = append(byRegion, regionRow{Region: region, Amount: amt})
	}

	// ── 按产品分类（category）─────────────────────────────────────────
	type categoryRow struct {
		Category string  `json:"category"`
		Amount   float64 `json:"amount"`
	}
	var byCategoryRenew []categoryRow
	database.DB.Table("transactions t").
		Select("p.category AS category, SUM(ABS(t.amount)) AS amount").
		Joins("JOIN server_instances si ON si.id = t.related_server_id").
		Joins("JOIN products p ON p.id = si.product_id").
		Where("t.user_id = ? AND t.type IN ? AND t.amount < 0", userID, []string{"RENEW", "RENEWAL"}).
		Group("p.category").
		Scan(&byCategoryRenew)

	var byCategoryPurchase []categoryRow
	database.DB.Table("transactions t").
		Select("p.category AS category, SUM(oi.price) AS amount").
		Joins("JOIN orders o ON o.id = t.related_order_id").
		Joins("JOIN order_items oi ON oi.order_id = o.id").
		Joins("JOIN products p ON p.id = oi.product_id").
		Where("t.user_id = ? AND t.type = 'PURCHASE' AND t.amount < 0", userID).
		Group("p.category").
		Scan(&byCategoryPurchase)

	categoryMap := map[string]float64{}
	for _, r := range byCategoryRenew {
		categoryMap[r.Category] += r.Amount
	}
	for _, r := range byCategoryPurchase {
		categoryMap[r.Category] += r.Amount
	}
	byCategory := make([]categoryRow, 0, len(categoryMap))
	for cat, amt := range categoryMap {
		byCategory = append(byCategory, categoryRow{Category: cat, Amount: amt})
	}

	// ── 下一个到期服务器 ───────────────────────────────────────────────
	type nextExpiryInfo struct {
		ID          string     `json:"id"`
		ProductName string     `json:"productName"`
		Region      string     `json:"region"`
		IP          *string    `json:"ip"`
		ExpireDate  *time.Time `json:"expireDate"`
		DaysLeft    int        `json:"daysLeft"`
	}
	var nextServer model.ServerInstance
	var nextExpiry *nextExpiryInfo
	if err := database.DB.Preload("Product").
		Where("user_id = ? AND status = 'ACTIVE' AND expire_date IS NOT NULL AND expire_date > ?", userID, now).
		Order("expire_date ASC").First(&nextServer).Error; err == nil {
		daysLeft := int(nextServer.ExpireDate.Sub(now).Hours() / 24)
		nextExpiry = &nextExpiryInfo{
			ID:          nextServer.ID,
			IP:          nextServer.IP,
			ExpireDate:  nextServer.ExpireDate,
			DaysLeft:    daysLeft,
			ProductName: nextServer.Product.Name,
			Region:      nextServer.Product.Region,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"totalSpend":    allTimeSpend,
		"monthlyAvg":    monthlyAvg,
		"monthlyTrend":  monthlyTrend,
		"byRegion":      byRegion,
		"byCategory":    byCategory,
		"nextExpiry":    nextExpiry,
	})
}
