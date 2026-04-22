package handler

import (
	"fmt"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type ServerHandler struct{}

func NewServerHandler() *ServerHandler {
	return &ServerHandler{}
}

// GET /api/dashboard/servers
func (h *ServerHandler) UserList(c *gin.Context) {
	userID := middleware.GetUserID(c)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 10
	}

	query := database.DB.Model(&model.ServerInstance{}).Where("user_id = ?", userID)

	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}

	tagIDs := ParseTagFilter(c.Query("tagIds"))
	tagMode := ParseTagMode(c.Query("tagMode"))
	if len(tagIDs) > 0 {
		tagQuery := database.DB.Table("server_tag_relations").
			Select("server_id").
			Where("tag_id IN ?", tagIDs).
			Group("server_id")
		if tagMode == "AND" {
			tagQuery = tagQuery.Having("COUNT(DISTINCT tag_id) = ?", len(tagIDs))
		}
		query = query.Where("id IN (?)", tagQuery)
	}

	var total int64
	query.Count(&total)

	var servers []model.ServerInstance
	query.Preload("Product").Preload("Product.CPU").Preload("Tags").
		Order("expire_date ASC NULLS LAST").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&servers)

	// Load user level + pricing for monthly price calculation
	var user model.User
	database.DB.Select("id, level").First(&user, "id = ?", userID)
	var pricingConfig model.PricingConfig
	if err := database.DB.First(&pricingConfig, "id = ?", "default").Error; err != nil {
		pricingConfig = service.DefaultPricingRules()
	}
	level := service.NormalizePriceLevel(user.Level)

	// Add status indicator (red/yellow/green/gray) + monthlyPrice
	type ServerResponse struct {
		model.ServerInstance
		StatusIndicator string  `json:"statusIndicator"`
		MonthlyPrice    float64 `json:"monthlyPrice"`
	}

	items := make([]ServerResponse, 0, len(servers))
	now := time.Now()
	for _, s := range servers {
		indicator := "gray" // PENDING/SUSPENDED
		switch s.Status {
		case "ACTIVE":
			if s.ExpireDate != nil {
				daysLeft := s.ExpireDate.Sub(now).Hours() / 24
				if daysLeft <= 7 {
					indicator = "yellow"
				} else {
					indicator = "green"
				}
			} else {
				indicator = "green"
			}
		case "EXPIRED":
			indicator = "red"
		}
		mp := 0.0
		if s.Product.ID != "" {
			mp = service.CalculatePrice(s.Product.OriginalPrice, level, pricingConfig)
		}
		items = append(items, ServerResponse{
			ServerInstance:  s,
			StatusIndicator: indicator,
			MonthlyPrice:    mp,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"servers":    items,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// GET /api/dashboard/servers/:id
func (h *ServerHandler) UserDetail(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")

	var server model.ServerInstance
	if err := database.DB.Preload("Product").Preload("Product.CPU").Preload("Tags").
		Where("id = ? AND user_id = ?", id, userID).First(&server).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "服务器不存在"})
		return
	}

	c.JSON(http.StatusOK, server)
}

// GET /api/dashboard/servers/calendar
func (h *ServerHandler) Calendar(c *gin.Context) {
	userID := middleware.GetUserID(c)

	month := c.DefaultQuery("month", time.Now().Format("2006-01"))
	monthStart, err := time.ParseInLocation("2006-01", month, time.Local)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "month 参数格式错误，应为 YYYY-MM"})
		return
	}
	monthEnd := monthStart.AddDate(0, 1, 0)

	type calendarServer struct {
		ID              string     `json:"id"`
		IP              *string    `json:"ip,omitempty"`
		Status          string     `json:"status"`
		UserNote        *string    `json:"userNote,omitempty"`
		ExpireDate      *time.Time `json:"expireDate,omitempty"`
		DaysUntilExpire int        `json:"daysUntilExpire"`
		Product         struct {
			Name   string `json:"name"`
			Region string `json:"region"`
		} `json:"product"`
	}

	type calendarDay struct {
		Date  string `json:"date"`
		Count int    `json:"count"`
		Level string `json:"level"`
	}

	var rows []model.ServerInstance
	if err := database.DB.
		Preload("Product").
		Where("user_id = ? AND expire_date IS NOT NULL AND expire_date >= ? AND expire_date < ?", userID, monthStart, monthEnd).
		Order("expire_date ASC").
		Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}

	selectedDate := c.Query("date")
	selectedTime := time.Time{}
	hasSelectedDate := false
	if selectedDate != "" {
		selectedTime, err = time.ParseInLocation("2006-01-02", selectedDate, time.Local)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "date 参数格式错误，应为 YYYY-MM-DD"})
			return
		}
		hasSelectedDate = true
	}

	now := time.Now()
	dayMap := map[string]*calendarDay{}
	list := make([]calendarServer, 0)

	for _, row := range rows {
		if row.ExpireDate == nil {
			continue
		}
		key := row.ExpireDate.Format("2006-01-02")
		days := int(row.ExpireDate.Sub(now).Hours() / 24)
		level := "green"
		if days < 0 {
			level = "gray"
		} else if days <= 7 {
			level = "red"
		} else if days <= 30 {
			level = "orange"
		}

		if dayMap[key] == nil {
			dayMap[key] = &calendarDay{Date: key, Count: 0, Level: level}
		}
		dayMap[key].Count++
		if severityRank(level) > severityRank(dayMap[key].Level) {
			dayMap[key].Level = level
		}

		if hasSelectedDate {
			if row.ExpireDate.Year() != selectedTime.Year() || row.ExpireDate.Month() != selectedTime.Month() || row.ExpireDate.Day() != selectedTime.Day() {
				continue
			}
		}

		item := calendarServer{
			ID:              row.ID,
			IP:              row.IP,
			Status:          row.Status,
			UserNote:        row.UserNote,
			ExpireDate:      row.ExpireDate,
			DaysUntilExpire: days,
		}
		item.Product.Name = row.Product.Name
		item.Product.Region = row.Product.Region
		list = append(list, item)
	}

	calendar := make([]calendarDay, 0, len(dayMap))
	for _, day := range dayMap {
		calendar = append(calendar, *day)
	}

	c.JSON(http.StatusOK, gin.H{
		"month":    month,
		"calendar": calendar,
		"servers":  list,
	})
}

// PUT /api/dashboard/servers/:id/note
func (h *ServerHandler) UpdateUserNote(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")

	var req struct {
		UserNote string `json:"userNote"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求"})
		return
	}

	result := database.DB.Model(&model.ServerInstance{}).
		Where("id = ? AND user_id = ?", id, userID).
		Update("user_note", req.UserNote)

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "服务器不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GET /api/dashboard/servers/expiring-soon
func (h *ServerHandler) ExpiringSoon(c *gin.Context) {
	userID := middleware.GetUserID(c)

	days := 7
	if d, err := strconv.Atoi(c.DefaultQuery("days", "7")); err == nil && d >= 1 && d <= 30 {
		days = d
	}

	now := time.Now()
	deadline := now.AddDate(0, 0, days)

	var servers []model.ServerInstance
	if err := database.DB.Preload("Product").
		Where("user_id = ? AND status = 'ACTIVE' AND expire_date IS NOT NULL AND expire_date <= ?", userID, deadline).
		Order("expire_date ASC").
		Find(&servers).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}

	type item struct {
		ID          string     `json:"id"`
		IP          *string    `json:"ip"`
		UserNote    *string    `json:"userNote"`
		ExpireDate  *time.Time `json:"expireDate"`
		DaysLeft    int        `json:"daysLeft"`
		ProductName string     `json:"productName"`
		Region      string     `json:"region"`
		MonthlyPrice float64   `json:"monthlyPrice"`
	}

	// Fetch user level for price calculation
	var user model.User
	database.DB.Select("level").First(&user, "id = ?", userID)
	var pricingConfig model.PricingConfig
	if err := database.DB.First(&pricingConfig, "id = ?", "default").Error; err != nil {
		pricingConfig = service.DefaultPricingRules()
	}
	level := service.NormalizePriceLevel(user.Level)

	result := make([]item, 0, len(servers))
	for _, s := range servers {
		daysLeft := 0
		if s.ExpireDate != nil {
			daysLeft = int(s.ExpireDate.Sub(now).Hours() / 24)
		}
		monthlyPrice := service.CalculatePrice(s.Product.OriginalPrice, level, pricingConfig)
		result = append(result, item{
			ID:           s.ID,
			IP:           s.IP,
			UserNote:     s.UserNote,
			ExpireDate:   s.ExpireDate,
			DaysLeft:     daysLeft,
			ProductName:  s.Product.Name,
			Region:       s.Product.Region,
			MonthlyPrice: monthlyPrice,
		})
	}

	c.JSON(http.StatusOK, gin.H{"data": result, "total": len(result)})
}

// POST /api/dashboard/servers/batch-renew
func (h *ServerHandler) BatchRenew(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var req struct {
		ServerIDs []string `json:"serverIds" binding:"required,min=1,max=20"`
		Period    int      `json:"period" binding:"required,min=1,max=36"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误：serverIds 不能为空，period 范围 1-36"})
		return
	}

	// Dedup serverIds
	seen := map[string]bool{}
	deduped := make([]string, 0, len(req.ServerIDs))
	for _, sid := range req.ServerIDs {
		if !seen[sid] {
			seen[sid] = true
			deduped = append(deduped, sid)
		}
	}
	req.ServerIDs = deduped

	var user model.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	var pricingConfig model.PricingConfig
	if err := database.DB.First(&pricingConfig, "id = ?", "default").Error; err != nil {
		pricingConfig = service.DefaultPricingRules()
	}
	level := service.NormalizePriceLevel(user.Level)

	// Load all servers and verify ownership
	var servers []model.ServerInstance
	database.DB.Preload("Product").
		Where("id IN ? AND user_id = ?", req.ServerIDs, userID).
		Find(&servers)

	type renewResult struct {
		ID          string  `json:"id"`
		ProductName string  `json:"productName"`
		Success     bool    `json:"success"`
		Reason      string  `json:"reason,omitempty"`
		Cost        float64 `json:"cost"`
	}

	serverMap := map[string]model.ServerInstance{}
	for _, s := range servers {
		serverMap[s.ID] = s
	}

	results := make([]renewResult, 0, len(req.ServerIDs))
	successCount := 0
	failCount := 0

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "事务启动失败"})
		return
	}

	// Lock user row for balance updates
	var lockedUser model.User
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&lockedUser, "id = ?", userID).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取用户信息失败"})
		return
	}

	currentBalance := lockedUser.Balance
	now := time.Now()

	for _, sid := range req.ServerIDs {
		s, ok := serverMap[sid]
		if !ok {
			results = append(results, renewResult{ID: sid, Success: false, Reason: "服务器不存在"})
			failCount++
			continue
		}
		monthlyPrice := service.CalculatePrice(s.Product.OriginalPrice, level, pricingConfig)
		cost := monthlyPrice * float64(req.Period)

		if currentBalance < cost {
			results = append(results, renewResult{
				ID: sid, ProductName: s.Product.Name,
				Success: false, Reason: "余额不足", Cost: cost,
			})
			failCount++
			continue
		}

		balanceBefore := currentBalance
		currentBalance -= cost
		balanceAfter := currentBalance

		// Update user balance
		if err := tx.Model(&model.User{}).Where("id = ?", userID).
			Update("balance", balanceAfter).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "扣款失败"})
			return
		}

		// Extend expire date
		newExpire := now.AddDate(0, req.Period, 0)
		if s.ExpireDate != nil && s.ExpireDate.After(now) {
			newExpire = s.ExpireDate.AddDate(0, req.Period, 0)
		}
		tx.Model(&model.ServerInstance{}).Where("id = ?", sid).Updates(map[string]interface{}{
			"expire_date": newExpire,
			"status":      "ACTIVE",
			"updated_at":  now,
		})

		// Transaction record
		note := "批量续费"
		tx.Create(&model.Transaction{
			ID:              service.GenerateID(),
			UserID:          userID,
			Type:            "RENEWAL",
			Amount:          -cost,
			BalanceBefore:   balanceBefore,
			BalanceAfter:    balanceAfter,
			Note:            &note,
			RelatedServerID: &sid,
			CreatedAt:       now,
		})

		// User log
		sidCopy := sid
		tx.Create(&model.UserLog{
			ID:        service.GenerateID(),
			UserID:    userID,
			Event:     "SERVER_RENEW",
			TargetID:  &sidCopy,
			CreatedAt: now,
		})

		results = append(results, renewResult{
			ID: sid, ProductName: s.Product.Name,
			Success: true, Cost: cost,
		})
		successCount++
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "提交失败"})
		return
	}

	// Send notification if any succeeded
	if successCount > 0 {
		SendNotification(userID, "SYSTEM",
			"批量续费完成",
			fmt.Sprintf("成功续费 %d 台服务器，扣款完成，余额剩余 %.2f 元。", successCount, currentBalance),
			nil, nil,
		)
	}

	c.JSON(http.StatusOK, gin.H{
		"results":      results,
		"successCount": successCount,
		"failCount":    failCount,
		"balance":      currentBalance,
	})
}

// POST /api/dashboard/servers/:id/renew
func (h *ServerHandler) Renew(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")

	var req struct {
		Period int    `json:"period" binding:"required,min=1"`
		Mode   string `json:"mode"` // "balance" (default) or "invoice"
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择续费时长"})
		return
	}
	if req.Mode == "" {
		req.Mode = "balance"
	}
	if req.Mode != "balance" && req.Mode != "invoice" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的支付方式"})
		return
	}

	var server model.ServerInstance
	if err := database.DB.Preload("Product").
		Where("id = ? AND user_id = ?", id, userID).First(&server).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "服务器不存在"})
		return
	}
	if server.Status == "PENDING" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "待开通服务器暂不支持续费"})
		return
	}

	var user model.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	var pricingConfig model.PricingConfig
	if err := database.DB.First(&pricingConfig, "id = ?", "default").Error; err != nil {
		pricingConfig = service.DefaultPricingRules()
	}

	level := service.NormalizePriceLevel(user.Level)
	monthlyPrice := service.CalculatePrice(server.Product.OriginalPrice, level, pricingConfig)

	// Read period discount rates from SystemSettings
	discountRate := 1.0
	getRenewalDiscount := func(key string, def float64) float64 {
		var s model.SystemSetting
		if err := database.DB.First(&s, "key = ?", key).Error; err != nil {
			return def
		}
		if f, err := strconv.ParseFloat(s.Value, 64); err == nil && f > 0 && f <= 1 {
			return f
		}
		return def
	}
	switch {
	case req.Period >= 12:
		discountRate = getRenewalDiscount("renewal_discount_annual", 0.85)
	case req.Period >= 6:
		discountRate = getRenewalDiscount("renewal_discount_semi", 0.90)
	case req.Period >= 3:
		discountRate = getRenewalDiscount("renewal_discount_quarter", 0.95)
	}

	totalPrice := math.Round(monthlyPrice*float64(req.Period)*discountRate*100) / 100

	if req.Mode == "invoice" {
		// Create a PENDING order as an invoice (admin confirms payment manually)
		orderNo := fmt.Sprintf("RNW%d%04d", time.Now().Unix(), req.Period)
		note := fmt.Sprintf("续费账单：%s，%d 个月", server.Product.Name, req.Period)
		serverID := id
		order := model.Order{
			ID:              service.GenerateID(),
			OrderNo:         orderNo,
			UserID:          userID,
			Status:          "PENDING",
			TotalPrice:      totalPrice,
			Note:            &note,
			RenewalServerID: &serverID,
			RenewalPeriod:   req.Period,
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		}
		if err := database.DB.Create(&order).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "创建账单失败"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success":    true,
			"mode":       "invoice",
			"orderNo":    orderNo,
			"totalPrice": totalPrice,
			"message":    "账单已创建，等待管理员确认收款后自动延长到期日",
		})
		return
	}

	// balance mode
	var (
		balanceAfter float64
		newExpire    time.Time
	)
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		var lockedUser model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&lockedUser, "id = ?", userID).Error; err != nil {
			return fmt.Errorf("用户不存在")
		}
		var lockedServer model.ServerInstance
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Preload("Product").
			First(&lockedServer, "id = ? AND user_id = ?", id, userID).Error; err != nil {
			return fmt.Errorf("服务器不存在")
		}
		if lockedServer.Status == "PENDING" {
			return fmt.Errorf("待开通服务器暂不支持续费")
		}

		lockedLevel := service.NormalizePriceLevel(lockedUser.Level)
		lockedMonthlyPrice := service.CalculatePrice(lockedServer.Product.OriginalPrice, lockedLevel, pricingConfig)
		lockedTotalPrice := math.Round(lockedMonthlyPrice*float64(req.Period)*discountRate*100) / 100
		if lockedUser.Balance < lockedTotalPrice {
			return fmt.Errorf("余额不足")
		}

		now := time.Now()
		newExpire = now.AddDate(0, req.Period, 0)
		if lockedServer.ExpireDate != nil && lockedServer.ExpireDate.After(now) {
			newExpire = lockedServer.ExpireDate.AddDate(0, req.Period, 0)
		}

		balanceBefore := service.RoundMoney(lockedUser.Balance)
		balanceAfter = service.RoundMoney(balanceBefore - lockedTotalPrice)
		if err := tx.Model(&model.User{}).
			Where("id = ?", userID).
			Update("balance", balanceAfter).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.ServerInstance{}).Where("id = ?", id).Updates(map[string]interface{}{
			"expire_date": newExpire,
			"status":      "ACTIVE",
			"updated_at":  now,
		}).Error; err != nil {
			return err
		}

		note := "续费服务器"
		serverID := id
		if err := tx.Create(&model.Transaction{
			ID:              service.GenerateID(),
			UserID:          userID,
			Type:            "RENEWAL",
			Amount:          service.RoundMoney(-lockedTotalPrice),
			BalanceBefore:   balanceBefore,
			BalanceAfter:    balanceAfter,
			Note:            &note,
			RelatedServerID: &serverID,
			CreatedAt:       now,
		}).Error; err != nil {
			return err
		}

		return tx.Create(&model.UserLog{
			ID:        service.GenerateID(),
			UserID:    userID,
			Event:     "SERVER_RENEW",
			TargetID:  &id,
			CreatedAt: now,
		}).Error
	}); err != nil {
		if err.Error() == "余额不足" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":    "余额不足",
				"balance":  user.Balance,
				"required": totalPrice,
			})
			return
		}
		if err.Error() == "服务器不存在" {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		if err.Error() == "待开通服务器暂不支持续费" {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "续费失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"mode":       "balance",
		"newExpire":  newExpire,
		"balance":    balanceAfter,
		"totalPrice": totalPrice,
	})
}

// PATCH /dashboard/servers/:id/auto-renew
func (h *ServerHandler) ToggleAutoRenew(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")

	var req struct {
		AutoRenew bool `json:"autoRenew"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	result := database.DB.Model(&model.ServerInstance{}).
		Where("id = ? AND user_id = ?", id, userID).
		Updates(map[string]interface{}{
			"auto_renew": req.AutoRenew,
			"updated_at": time.Now(),
		})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "服务器不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "autoRenew": req.AutoRenew})
}

func severityRank(level string) int {
	switch level {
	case "red":
		return 4
	case "orange":
		return 3
	case "green":
		return 2
	case "gray":
		return 1
	default:
		return 0
	}
}
