package handler

import (
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type AgentHandler struct{}

func NewAgentHandler() *AgentHandler {
	return &AgentHandler{}
}

// GET /api/agent/stats
func (h *AgentHandler) Stats(c *gin.Context) {
	agentID := middleware.GetUserID(c)

	var userCount int64
	database.DB.Model(&model.User{}).Where("agent_id = ?", agentID).Count(&userCount)

	var orderCount int64
	database.DB.Model(&model.Order{}).
		Where("user_id IN (?)", database.DB.Model(&model.User{}).Select("id").Where("agent_id = ?", agentID)).
		Count(&orderCount)

	var totalRevenue float64
	database.DB.Model(&model.Transaction{}).
		Where("user_id IN (?) AND type = ?",
			database.DB.Model(&model.User{}).Select("id").Where("agent_id = ?", agentID),
			"PURCHASE").
		Select("COALESCE(SUM(ABS(amount)), 0)").Scan(&totalRevenue)

	var ticketCount int64
	database.DB.Model(&model.Ticket{}).Where("agent_id = ?", agentID).Count(&ticketCount)

	c.JSON(http.StatusOK, gin.H{
		"userCount":    userCount,
		"orderCount":   orderCount,
		"totalRevenue": totalRevenue,
		"ticketCount":  ticketCount,
	})
}

// GET /api/agent/users
func (h *AgentHandler) Users(c *gin.Context) {
	agentID := middleware.GetUserID(c)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 20
	}

	query := database.DB.Model(&model.User{}).Where("agent_id = ?", agentID)

	if search := c.Query("search"); search != "" {
		s := "%" + search + "%"
		query = query.Where("name ILIKE ? OR email ILIKE ?", s, s)
	}

	var total int64
	query.Count(&total)

	var users []model.User
	query.Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&users)

	// Sanitize output
	type UserResponse struct {
		ID              string    `json:"id"`
		NumericID       int       `json:"numericId"`
		Email           string    `json:"email"`
		Name            string    `json:"name"`
		Level           string    `json:"level"`
		Balance         float64   `json:"balance"`
		HasIdentityCode bool      `json:"hasIdentityCode"`
		CreatedAt       time.Time `json:"createdAt"`
	}
	items := make([]UserResponse, 0, len(users))
	for _, u := range users {
		items = append(items, UserResponse{
			ID:              u.ID,
			NumericID:       u.NumericID,
			Email:           u.Email,
			Name:            u.Name,
			Level:           u.Level,
			Balance:         u.Balance,
			HasIdentityCode: u.IdentityCode != nil && strings.TrimSpace(*u.IdentityCode) != "",
			CreatedAt:       u.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"users":      items,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// POST /api/agent/users
func (h *AgentHandler) CreateUser(c *gin.Context) {
	agentID := middleware.GetUserID(c)

	// Check if agent can create users
	var agent model.User
	if err := database.DB.First(&agent, "id = ?", agentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	if !service.CanCreateSubUser(agent.Level) {
		c.JSON(http.StatusForbidden, gin.H{"error": "当前等级无法创建下级用户"})
		return
	}

	var req struct {
		Email        string `json:"email" binding:"required,email"`
		Password     string `json:"password" binding:"required,min=8"`
		Name         string `json:"name" binding:"required"`
		Level        string `json:"level"`
		IdentityCode string `json:"identityCode"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写完整信息"})
		return
	}
	if msg := validatePasswordStrength(req.Password); msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))

	// Validate level
	level := "GUEST"
	if req.Level != "" {
		validLevel := false
		for _, l := range service.CreatableLevels {
			if l == req.Level {
				validLevel = true
				break
			}
		}
		if validLevel {
			level = req.Level
		}
	}

	// Check email
	var count int64
	database.DB.Model(&model.User{}).Where("email = ?", email).Count(&count)
	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "邮箱已被注册"})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "密码处理失败"})
		return
	}

	user := model.User{
		ID:        service.GenerateID(),
		Email:     email,
		Password:  string(hashedPassword),
		Name:      strings.TrimSpace(req.Name),
		Role:      "USER",
		Level:     level,
		AgentID:   &agentID,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if req.IdentityCode != "" {
		hashed, err := service.HashIdentityCode(req.IdentityCode)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "身份码处理失败"})
			return
		}
		user.IdentityCode = &hashed
	}

	// Use transaction with advisory lock to atomically assign numeric ID
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("SELECT pg_advisory_xact_lock(1)").Error; err != nil {
			return err
		}
		var maxNumericID int
		if err := tx.Raw("SELECT COALESCE(MAX(numeric_id), 9999) FROM users").Scan(&maxNumericID).Error; err != nil {
			return err
		}
		user.NumericID = maxNumericID + 1
		return tx.Create(&user).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建用户失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":    user.ID,
		"email": user.Email,
		"name":  user.Name,
		"level": user.Level,
	})
}

// GET /api/agent/users/:id
func (h *AgentHandler) UserDetail(c *gin.Context) {
	agentID := middleware.GetUserID(c)
	userID := c.Param("id")

	var user model.User
	if err := database.DB.Where("id = ? AND agent_id = ?", userID, agentID).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	var serverCount int64
	database.DB.Model(&model.ServerInstance{}).Where("user_id = ?", userID).Count(&serverCount)

	var orderCount int64
	database.DB.Model(&model.Order{}).Where("user_id = ?", userID).Count(&orderCount)

	var ticketCount int64
	database.DB.Model(&model.Ticket{}).Where("user_id = ?", userID).Count(&ticketCount)

	var totalSpend float64
	database.DB.Model(&model.Order{}).
		Where("user_id = ? AND status IN ?", userID, []string{"PAID", "COMPLETED"}).
		Select("COALESCE(SUM(total_price), 0)").
		Scan(&totalSpend)

	var servers []model.ServerInstance
	database.DB.Where("user_id = ?", userID).
		Preload("Product").
		Order("created_at DESC").
		Limit(50).
		Find(&servers)

	serverItems := make([]gin.H, 0, len(servers))
	for _, s := range servers {
		var productName *string
		if s.Product.ID != "" {
			name := s.Product.Name
			productName = &name
		}
		serverItems = append(serverItems, gin.H{
			"id":         s.ID,
			"ip":         s.IP,
			"status":     s.Status,
			"expireDate": s.ExpireDate,
			"productName": productName,
		})
	}

	var orders []model.Order
	database.DB.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(50).
		Find(&orders)

	orderItems := make([]gin.H, 0, len(orders))
	for _, o := range orders {
		orderItems = append(orderItems, gin.H{
			"id":         o.ID,
			"orderNo":    o.OrderNo,
			"totalPrice": o.TotalPrice,
			"status":     o.Status,
			"createdAt":  o.CreatedAt,
		})
	}

	var tickets []model.Ticket
	database.DB.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(50).
		Find(&tickets)

	ticketItems := make([]gin.H, 0, len(tickets))
	for _, t := range tickets {
		ticketItems = append(ticketItems, gin.H{
			"id":        t.ID,
			"ticketNo":  t.TicketNo,
			"subject":   t.Subject,
			"status":    t.Status,
			"category":  t.Category,
			"createdAt": t.CreatedAt,
		})
	}

	var logs []model.UserLog
	database.DB.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(100).
		Find(&logs)

	logItems := make([]gin.H, 0, len(logs))
	for _, l := range logs {
		logItems = append(logItems, gin.H{
			"id":        l.ID,
			"event":     l.Event,
			"meta":      l.Meta,
			"ip":        l.IP,
			"createdAt": l.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"id":              user.ID,
		"numericId":       user.NumericID,
		"email":           user.Email,
		"name":            user.Name,
		"phone":           user.Phone,
		"role":            user.Role,
		"level":           user.Level,
		"inviteCode":      user.InviteCode,
		"identityCode":    nil,
		"hasIdentityCode": user.IdentityCode != nil && strings.TrimSpace(*user.IdentityCode) != "",
		"createdAt":       user.CreatedAt,
		"updatedAt":       user.UpdatedAt,
		"servers":         serverItems,
		"orders":          orderItems,
		"tickets":         ticketItems,
		"logs":            logItems,
		"stats": gin.H{
			"totalSpend":  totalSpend,
			"serverCount": serverCount,
			"orderCount":  orderCount,
			"ticketCount": ticketCount,
		},
	})
}

// PUT /api/agent/users/:id
func (h *AgentHandler) UpdateUser(c *gin.Context) {
	agentID := middleware.GetUserID(c)
	userID := c.Param("id")

	var user model.User
	if err := database.DB.Where("id = ? AND agent_id = ?", userID, agentID).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	var req struct {
		Name         *string `json:"name"`
		Level        *string `json:"level"`
		IdentityCode *string `json:"identityCode"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	updates := map[string]interface{}{"updated_at": time.Now()}
	if req.Name != nil {
		updates["name"] = strings.TrimSpace(*req.Name)
	}
	if req.Level != nil {
		valid := false
		for _, l := range service.CreatableLevels {
			if l == *req.Level {
				valid = true
				break
			}
		}
		if valid {
			updates["level"] = *req.Level
		}
	}
	if req.IdentityCode != nil {
		trimmed := strings.TrimSpace(*req.IdentityCode)
		if trimmed == "" {
			updates["identity_code"] = nil
		} else {
			hashed, err := service.HashIdentityCode(trimmed)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "身份码处理失败"})
				return
			}
			updates["identity_code"] = hashed
		}
	}

	database.DB.Model(&model.User{}).Where("id = ?", userID).Updates(updates)

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GET /api/agent/orders
func (h *AgentHandler) Orders(c *gin.Context) {
	agentID := middleware.GetUserID(c)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 20
	}

	subQuery := database.DB.Model(&model.User{}).Select("id").Where("agent_id = ?", agentID)
	query := database.DB.Model(&model.Order{}).Where("user_id IN (?)", subQuery)

	if status := strings.TrimSpace(c.Query("status")); status != "" {
		query = query.Where("status = ?", strings.ToUpper(status))
	}
	if q := strings.TrimSpace(c.Query("q")); q != "" {
		pattern := "%" + q + "%"
		matchedUsers := database.DB.Model(&model.User{}).
			Select("id").
			Where("agent_id = ? AND (name ILIKE ? OR email ILIKE ?)", agentID, pattern, pattern)
		matchedOrdersByProduct := database.DB.Model(&model.OrderItem{}).
			Select("order_items.order_id").
			Joins("JOIN products ON products.id = order_items.product_id").
			Where("products.name ILIKE ?", pattern)

		query = query.Where(
			"order_no ILIKE ? OR user_id IN (?) OR id IN (?)",
			pattern,
			matchedUsers,
			matchedOrdersByProduct,
		)
	}

	var total int64
	query.Count(&total)

	var orders []model.Order
	query.
		Preload("User").Preload("Items").Preload("Items.Product").
		Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&orders)

	c.JSON(http.StatusOK, gin.H{
		"orders":     orders,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// GET /api/agent/finance
func (h *AgentHandler) Finance(c *gin.Context) {
	agentID := middleware.GetUserID(c)

	subQuery := database.DB.Model(&model.User{}).Select("id").Where("agent_id = ?", agentID)

	var totalRevenue float64
	database.DB.Model(&model.Transaction{}).
		Where("user_id IN (?) AND type = ?", subQuery, "PURCHASE").
		Select("COALESCE(SUM(ABS(amount)), 0)").Scan(&totalRevenue)

	var totalRecharge float64
	database.DB.Model(&model.Transaction{}).
		Where("user_id IN (?) AND type = ?", subQuery, "RECHARGE").
		Select("COALESCE(SUM(amount), 0)").Scan(&totalRecharge)

	c.JSON(http.StatusOK, gin.H{
		"totalRevenue":  totalRevenue,
		"totalRecharge": totalRecharge,
	})
}

// GET /api/agent/logs
func (h *AgentHandler) Logs(c *gin.Context) {
	agentID := middleware.GetUserID(c)
	scope := strings.ToLower(strings.TrimSpace(c.DefaultQuery("scope", "self")))

	var logs []model.UserLog
	query := database.DB.Model(&model.UserLog{})
	if scope == "subordinates" {
		subQuery := database.DB.Model(&model.User{}).Select("id").Where("agent_id = ?", agentID)
		query = query.Where("user_id IN (?)", subQuery)
	} else {
		query = query.Where("user_id = ?", agentID)
	}

	query.
		Order("created_at DESC").
		Limit(100).
		Find(&logs)

	c.JSON(http.StatusOK, gin.H{"logs": logs})
}

// GET /api/agent/commissions
// Lists commissions for the calling agent, paginated
func (h *AgentHandler) Commissions(c *gin.Context) {
	agentID := middleware.GetUserID(c)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.Commission{}).Where("agent_id = ?", agentID)
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}

	var total int64
	query.Count(&total)

	var items []model.Commission
	query.Preload("Order").Preload("Order.User").
		Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&items)

	// Summary totals
	type Summary struct {
		Frozen    float64
		Available float64
		Settled   float64
		Total     float64
	}
	var summary Summary
	database.DB.Model(&model.Commission{}).
		Where("agent_id = ? AND status = ?", agentID, "FROZEN").
		Select("COALESCE(SUM(amount), 0)").Scan(&summary.Frozen)
	database.DB.Model(&model.Commission{}).
		Where("agent_id = ? AND status = ?", agentID, "AVAILABLE").
		Select("COALESCE(SUM(amount), 0)").Scan(&summary.Available)
	database.DB.Model(&model.Commission{}).
		Where("agent_id = ? AND status = ?", agentID, "SETTLED").
		Select("COALESCE(SUM(amount), 0)").Scan(&summary.Settled)
	summary.Total = summary.Frozen + summary.Available + summary.Settled

	c.JSON(http.StatusOK, gin.H{
		"commissions": items,
		"total":       total,
		"page":        page,
		"pageSize":    pageSize,
		"totalPages":  int(math.Ceil(float64(total) / float64(pageSize))),
		"summary": gin.H{
			"frozen":    summary.Frozen,
			"available": summary.Available,
			"settled":   summary.Settled,
			"total":     summary.Total,
		},
	})
}

// GET /api/agent/promo
// Returns promo link stats and click data
func (h *AgentHandler) PromoStats(c *gin.Context) {
	agentID := middleware.GetUserID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	var agent model.User
	if err := database.DB.First(&agent, "id = ?", agentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	inviteCode := ""
	if agent.InviteCode != nil {
		inviteCode = *agent.InviteCode
	}

	// Click stats - last 30 days
	thirtyDaysAgo := time.Now().AddDate(0, 0, -30).Format("2006-01-02")

	var pvTotal int64
	database.DB.Model(&model.PromoClick{}).
		Where("agent_id = ? AND date >= ?", agentID, thirtyDaysAgo).
		Count(&pvTotal)

	var uvTotal int64
	database.DB.Model(&model.PromoClick{}).
		Where("agent_id = ? AND date >= ? AND is_unique = true", agentID, thirtyDaysAgo).
		Count(&uvTotal)

	// Daily breakdown for the last 14 days
	type DailyStats struct {
		Date string `json:"date"`
		PV   int64  `json:"pv"`
		UV   int64  `json:"uv"`
	}
	var dailyRows []struct {
		Date    string
		PVCount int64
		UVCount int64
	}
	database.DB.Raw(`
		SELECT date,
			COUNT(*) as pv_count,
			COUNT(*) FILTER (WHERE is_unique = true) as uv_count
		FROM promo_clicks
		WHERE agent_id = ? AND date >= ?
		GROUP BY date
		ORDER BY date DESC
		LIMIT 14
	`, agentID, time.Now().AddDate(0, 0, -14).Format("2006-01-02")).Scan(&dailyRows)

	daily := make([]DailyStats, 0, len(dailyRows))
	for _, r := range dailyRows {
		daily = append(daily, DailyStats{Date: r.Date, PV: r.PVCount, UV: r.UVCount})
	}

	// Referral conversion funnel
	var registeredCount int64
	database.DB.Model(&model.User{}).Where("agent_id = ?", agentID).Count(&registeredCount)

	var paidUserCount int64
	database.DB.Raw(`
		SELECT COUNT(DISTINCT user_id) FROM orders
		WHERE user_id IN (SELECT id FROM users WHERE agent_id = ?)
		AND status = 'PAID'
	`, agentID).Scan(&paidUserCount)

	monthStart := time.Now().In(time.Local)
	monthStart = time.Date(monthStart.Year(), monthStart.Month(), 1, 0, 0, 0, 0, monthStart.Location())
	nextMonth := monthStart.AddDate(0, 1, 0)

	// Monthly leaderboard (Top 20): invite count + reward amount
	var leaderboardRows []struct {
		AgentID      string
		AgentName    string
		InviteCount  int64
		RewardAmount float64
	}
	database.DB.Raw(`
		SELECT
			a.id AS agent_id,
			a.name AS agent_name,
			COUNT(DISTINCT u.id) AS invite_count,
			COALESCE(SUM(c.amount), 0) AS reward_amount
		FROM users a
		LEFT JOIN users u ON u.agent_id = a.id AND u.created_at >= ? AND u.created_at < ?
		LEFT JOIN commissions c ON c.agent_id = a.id AND c.created_at >= ? AND c.created_at < ?
		WHERE a.role IN ('AGENT', 'ADMIN')
		GROUP BY a.id, a.name
		HAVING COUNT(DISTINCT u.id) > 0 OR COALESCE(SUM(c.amount), 0) > 0
		ORDER BY reward_amount DESC, invite_count DESC, a.id ASC
		LIMIT 20
	`, monthStart, nextMonth, monthStart, nextMonth).Scan(&leaderboardRows)

	leaderboard := make([]gin.H, 0, len(leaderboardRows))
	for i, row := range leaderboardRows {
		leaderboard = append(leaderboard, gin.H{
			"rank":         i + 1,
			"agentId":      row.AgentID,
			"agentName":    row.AgentName,
			"inviteCount":  row.InviteCount,
			"rewardAmount": row.RewardAmount,
		})
	}

	var currentRank int64
	database.DB.Raw(`
		SELECT rank_pos FROM (
			SELECT
				a.id,
				ROW_NUMBER() OVER (
					ORDER BY COALESCE(SUM(c.amount), 0) DESC, COUNT(DISTINCT u.id) DESC, a.id ASC
				) AS rank_pos
			FROM users a
			LEFT JOIN users u ON u.agent_id = a.id AND u.created_at >= ? AND u.created_at < ?
			LEFT JOIN commissions c ON c.agent_id = a.id AND c.created_at >= ? AND c.created_at < ?
			WHERE a.role IN ('AGENT', 'ADMIN')
			GROUP BY a.id
		) ranked
		WHERE id = ?
	`, monthStart, nextMonth, monthStart, nextMonth, agentID).Scan(&currentRank)

	top3Bonus := 0
	if currentRank == 1 {
		top3Bonus = 200
	} else if currentRank == 2 {
		top3Bonus = 100
	} else if currentRank == 3 {
		top3Bonus = 50
	}

	// Invite records for current agent
	var inviteTotal int64
	database.DB.Model(&model.User{}).Where("agent_id = ?", agentID).Count(&inviteTotal)

	var inviteRows []struct {
		UserID       string
		Name         string
		Email        string
		CreatedAt    time.Time
		FirstPaidAt  *time.Time
		RewardAmount float64
	}
	database.DB.Raw(`
		SELECT
			u.id AS user_id,
			u.name,
			u.email,
			u.created_at,
			MIN(CASE WHEN o.status = 'PAID' THEN o.created_at END) AS first_paid_at,
			COALESCE(SUM(c.amount), 0) AS reward_amount
		FROM users u
		LEFT JOIN orders o ON o.user_id = u.id
		LEFT JOIN commissions c ON c.agent_id = ? AND c.user_id = u.id
		WHERE u.agent_id = ?
		GROUP BY u.id, u.name, u.email, u.created_at
		ORDER BY u.created_at DESC
		LIMIT ? OFFSET ?
	`, agentID, agentID, pageSize, (page-1)*pageSize).Scan(&inviteRows)

	inviteRecords := make([]gin.H, 0, len(inviteRows))
	for _, row := range inviteRows {
		inviteRecords = append(inviteRecords, gin.H{
			"userId":       row.UserID,
			"name":         row.Name,
			"email":        row.Email,
			"registeredAt": row.CreatedAt,
			"firstPaidAt":  row.FirstPaidAt,
			"rewardAmount": row.RewardAmount,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"inviteCode":       inviteCode,
		"pvTotal":          pvTotal,
		"uvTotal":          uvTotal,
		"daily":            daily,
		"registeredCount":  registeredCount,
		"paidUserCount":    paidUserCount,
		"leaderboard":      leaderboard,
		"currentRank":      currentRank,
		"top3BonusPoints":  top3Bonus,
		"inviteRecords":    inviteRecords,
		"inviteTotal":      inviteTotal,
		"invitePage":       page,
		"invitePageSize":   pageSize,
		"inviteTotalPages": int(math.Ceil(float64(inviteTotal) / float64(pageSize))),
	})
}

// GET /api/ref/:code  (no auth required - track referral click)
func (h *AgentHandler) TrackRef(c *gin.Context) {
	code := c.Param("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid code"})
		return
	}

	var agent model.User
	if err := database.DB.First(&agent, "invite_code = ?", code).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	visitorKey := middleware.ClientNetworkKey(c)
	today := time.Now().Format("2006-01-02")

	// Check if already clicked from this visitor key today (for UV)
	var existCount int64
	database.DB.Model(&model.PromoClick{}).
		Where("agent_id = ? AND ip = ? AND date = ?", agent.ID, visitorKey, today).
		Count(&existCount)

	click := model.PromoClick{
		ID:         service.GenerateID(),
		AgentID:    agent.ID,
		VisitorKey: visitorKey,
		Date:       today,
		IsUnique:   existCount == 0,
		CreatedAt:  time.Now(),
	}
	database.DB.Create(&click)

	redirectTo := "/register?ref=" + code
	if strings.EqualFold(strings.TrimSpace(c.Query("format")), "json") || strings.Contains(strings.ToLower(c.GetHeader("Accept")), "application/json") {
		c.JSON(http.StatusOK, gin.H{
			"success":    true,
			"redirectTo": redirectTo,
		})
		return
	}

	c.Redirect(http.StatusFound, redirectTo)
}

// GET /api/agent/commissions/summary  (for agent dashboard widget)
func (h *AgentHandler) CommissionSummary(c *gin.Context) {
	agentID := middleware.GetUserID(c)

	var frozen, available, settled float64
	database.DB.Model(&model.Commission{}).
		Where("agent_id = ? AND status = ?", agentID, "FROZEN").
		Select("COALESCE(SUM(amount), 0)").Scan(&frozen)
	database.DB.Model(&model.Commission{}).
		Where("agent_id = ? AND status = ?", agentID, "AVAILABLE").
		Select("COALESCE(SUM(amount), 0)").Scan(&available)
	database.DB.Model(&model.Commission{}).
		Where("agent_id = ? AND status = ?", agentID, "SETTLED").
		Select("COALESCE(SUM(amount), 0)").Scan(&settled)

	// Monthly breakdown last 6 months
	type MonthData struct {
		Month  string  `json:"month"`
		Amount float64 `json:"amount"`
	}
	var monthly []struct {
		Month  string
		Amount float64
	}
	database.DB.Raw(`
		SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COALESCE(SUM(amount), 0) as amount
		FROM commissions
		WHERE agent_id = ? AND status = 'SETTLED'
		GROUP BY month
		ORDER BY month DESC
		LIMIT 6
	`, agentID).Scan(&monthly)

	monthData := make([]MonthData, 0, len(monthly))
	for _, m := range monthly {
		monthData = append(monthData, MonthData{Month: m.Month, Amount: m.Amount})
	}

	c.JSON(http.StatusOK, gin.H{
		"frozen":    frozen,
		"available": available,
		"settled":   settled,
		"total":     frozen + available + settled,
		"monthly":   monthData,
	})
}

// GET /api/agent/commission/available
// Returns the withdrawable commission amount after subtracting pending requests.
func (h *AgentHandler) CommissionAvailable(c *gin.Context) {
	agentID := middleware.GetUserID(c)

	var frozen, availableBase, settled float64
	database.DB.Model(&model.Commission{}).
		Where("agent_id = ? AND status = ?", agentID, "FROZEN").
		Select("COALESCE(SUM(amount), 0)").Scan(&frozen)
	database.DB.Model(&model.Commission{}).
		Where("agent_id = ? AND status = ?", agentID, "AVAILABLE").
		Select("COALESCE(SUM(amount), 0)").Scan(&availableBase)
	database.DB.Model(&model.Commission{}).
		Where("agent_id = ? AND status = ?", agentID, "SETTLED").
		Select("COALESCE(SUM(amount), 0)").Scan(&settled)

	var pendingWithdraw float64
	database.DB.Model(&model.CommissionWithdrawal{}).
		Where("agent_id = ? AND status IN (?)", agentID, []string{"PENDING", "APPROVED"}).
		Select("COALESCE(SUM(amount), 0)").Scan(&pendingWithdraw)

	available := availableBase - pendingWithdraw
	if available < 0 {
		available = 0
	}

	c.JSON(http.StatusOK, gin.H{
		"success":              true,
		"frozen":          frozen,
		"availableBase":   availableBase,
		"settled":         settled,
		"pendingWithdraw": pendingWithdraw,
		"available":       available,
	})
}

// POST /api/agent/commission/withdraw
// Body: { "amount": 100.00 }
func (h *AgentHandler) CommissionWithdraw(c *gin.Context) {
	agentID := middleware.GetUserID(c)

	var req struct {
		Amount float64 `json:"amount" binding:"required,gt=0"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var (
		w           model.CommissionWithdrawal
		errTooLarge = errors.New("申请金额超过可提现余额")
	)

	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		var availableRows []model.Commission
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Select("id, amount").
			Where("agent_id = ? AND status = ?", agentID, "AVAILABLE").
			Find(&availableRows).Error; err != nil {
			return err
		}
		availableBase := 0.0
		for _, row := range availableRows {
			availableBase += row.Amount
		}

		var pendingRows []model.CommissionWithdrawal
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Select("id, amount").
			Where("agent_id = ? AND status IN (?)", agentID, []string{"PENDING", "APPROVED"}).
			Find(&pendingRows).Error; err != nil {
			return err
		}
		pendingWithdraw := 0.0
		for _, row := range pendingRows {
			pendingWithdraw += row.Amount
		}

		available := availableBase - pendingWithdraw
		if req.Amount > available {
			return errTooLarge
		}

		now := time.Now()
		w = model.CommissionWithdrawal{
			ID:        service.GenerateID(),
			AgentID:   agentID,
			Amount:    req.Amount,
			Status:    "PENDING",
			CreatedAt: now,
			UpdatedAt: now,
		}
		return tx.Create(&w).Error
	}); err != nil {
		if errors.Is(err, errTooLarge) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "提交失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "withdrawal": w})
}

// GET /api/agent/commission/withdrawals?page=&status=
func (h *AgentHandler) CommissionWithdrawals(c *gin.Context) {
	agentID := middleware.GetUserID(c)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.CommissionWithdrawal{}).Where("agent_id = ?", agentID)
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}

	var total int64
	query.Count(&total)

	var items []model.CommissionWithdrawal
	query.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&items)

	c.JSON(http.StatusOK, gin.H{
		"success":          true,
		"withdrawals": items,
		"total":       total,
		"page":        page,
		"pageSize":    pageSize,
		"totalPages":  int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// GET /api/agent/performance
func (h *AgentHandler) PerformanceDashboard(c *gin.Context) {
	agentID := middleware.GetUserID(c)

	// ---- User growth: last 30 days (daily new subordinates) ----
	type DailyCount struct {
		Day   string `json:"day"`
		Count int64  `json:"count"`
	}
	var userGrowth []DailyCount
	database.DB.Raw(`
		SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS count
		FROM users
		WHERE agent_id = ? AND created_at >= NOW() - INTERVAL '30 days'
		GROUP BY day ORDER BY day
	`, agentID).Scan(&userGrowth)
	if userGrowth == nil {
		userGrowth = []DailyCount{}
	}

	// ---- Commission trend: last 6 months (monthly total) ----
	type MonthlyAmount struct {
		Month  string  `json:"month"`
		Amount float64 `json:"amount"`
	}
	var commissionTrend []MonthlyAmount
	database.DB.Raw(`
		SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COALESCE(SUM(amount), 0) AS amount
		FROM commissions
		WHERE agent_id = ? AND created_at >= NOW() - INTERVAL '6 months'
		GROUP BY month ORDER BY month
	`, agentID).Scan(&commissionTrend)
	if commissionTrend == nil {
		commissionTrend = []MonthlyAmount{}
	}

	// ---- Funnel: promo clicks -> registrations -> first order -> repeat order ----
	var promoClicks int64
	database.DB.Model(&model.PromoClick{}).Where("agent_id = ?", agentID).Count(&promoClicks)

	var registrations int64
	database.DB.Model(&model.User{}).Where("agent_id = ?", agentID).Count(&registrations)

	// Users under this agent who have at least 1 order
	var firstBuyers int64
	database.DB.Raw(`
		SELECT COUNT(DISTINCT user_id) FROM orders
		WHERE user_id IN (SELECT id FROM users WHERE agent_id = ?)
		AND status != 'CANCELLED'
	`, agentID).Scan(&firstBuyers)

	// Users with >= 2 orders
	var repeatBuyers int64
	database.DB.Raw(`
		SELECT COUNT(*) FROM (
			SELECT user_id FROM orders
			WHERE user_id IN (SELECT id FROM users WHERE agent_id = ?)
			AND status != 'CANCELLED'
			GROUP BY user_id HAVING COUNT(*) >= 2
		) t
	`, agentID).Scan(&repeatBuyers)

	funnel := []gin.H{
		{"label": "推广点击", "count": promoClicks},
		{"label": "注册用户", "count": registrations},
		{"label": "首次下单", "count": firstBuyers},
		{"label": "复购用户", "count": repeatBuyers},
	}

	// ---- Rank percentile: percent of agents this agent outperforms by total settled commission ----
	type AgentTotal struct {
		AgentID string  `json:"agentId"`
		Total   float64 `json:"total"`
	}
	var myTotal float64
	database.DB.Raw(`
		SELECT COALESCE(SUM(amount), 0) FROM commissions WHERE agent_id = ? AND status = 'SETTLED'
	`, agentID).Scan(&myTotal)

	var totalAgents int64
	database.DB.Raw(`SELECT COUNT(DISTINCT agent_id) FROM commissions WHERE status = 'SETTLED'`).Scan(&totalAgents)

	var lowerCount int64
	database.DB.Raw(`
		SELECT COUNT(*) FROM (
			SELECT agent_id, SUM(amount) AS total
			FROM commissions WHERE status = 'SETTLED'
			GROUP BY agent_id
		) t WHERE t.total < ?
	`, myTotal).Scan(&lowerCount)

	var rankPercentile float64
	if totalAgents > 0 {
		rankPercentile = math.Round(float64(lowerCount)/float64(totalAgents)*100*10) / 10
	}

	c.JSON(http.StatusOK, gin.H{
		"success":                true,
		"userGrowth":        userGrowth,
		"commissionTrend":   commissionTrend,
		"funnel":            funnel,
		"rankPercentile":    rankPercentile,
		"myTotalCommission": myTotal,
	})
}
