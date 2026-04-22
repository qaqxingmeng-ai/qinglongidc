package admin

import (
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"serverai-backend/internal/database"
	"serverai-backend/internal/handler"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type ServerHandler struct{}

func NewServerHandler() *ServerHandler {
	return &ServerHandler{}
}

// GET /api/admin/servers
func (h *ServerHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.ServerInstance{})

	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	if search := c.Query("search"); search != "" {
		s := "%" + search + "%"
		query = query.Where("hostname ILIKE ? OR ip ILIKE ?", s, s)
	}
	if userID := c.Query("userId"); userID != "" {
		query = query.Where("user_id = ?", userID)
	}

	var total int64
	query.Count(&total)

	var servers []model.ServerInstance
	query.Preload("User").Preload("Product").Preload("Product.CPU").
		Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&servers)

	c.JSON(http.StatusOK, gin.H{
		"servers":    servers,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// GET /api/admin/servers/:id
func (h *ServerHandler) Detail(c *gin.Context) {
	id := c.Param("id")

	var server model.ServerInstance
	if err := database.DB.Preload("User").Preload("Product").Preload("Product.CPU").
		First(&server, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "服务器不存在"})
		return
	}

	c.JSON(http.StatusOK, server)
}

// GET /api/admin/servers/calendar
func (h *ServerHandler) Calendar(c *gin.Context) {
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
		User            struct {
			Name  string `json:"name"`
			Email string `json:"email"`
		} `json:"user"`
		Product struct {
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
		Preload("User").
		Preload("Product").
		Where("expire_date IS NOT NULL AND expire_date >= ? AND expire_date < ?", monthStart, monthEnd).
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
		if adminSeverityRank(level) > adminSeverityRank(dayMap[key].Level) {
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
		item.User.Name = row.User.Name
		item.User.Email = row.User.Email
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

// POST /api/admin/servers
func (h *ServerHandler) Create(c *gin.Context) {
	adminID := middleware.GetUserID(c)

	var req struct {
		UserID     string                 `json:"userId" binding:"required"`
		ProductID  string                 `json:"productId" binding:"required"`
		IP         *string                `json:"ip"`
		Status     string                 `json:"status"`
		StartDate  *string                `json:"startDate"`
		ExpireDate *string                `json:"expireDate"`
		Config     map[string]interface{} `json:"config"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供必填字段"})
		return
	}

	var user model.User
	if err := database.DB.First(&user, "id = ?", req.UserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	var product model.Product
	if err := database.DB.First(&product, "id = ?", req.ProductID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "商品不存在"})
		return
	}

	status := req.Status
	if status == "" {
		status = "PENDING"
	}

	var startDate *time.Time
	if req.StartDate != nil && *req.StartDate != "" {
		t, err := time.Parse("2006-01-02", *req.StartDate)
		if err == nil {
			startDate = &t
		}
	}
	var expireDate *time.Time
	if req.ExpireDate != nil && *req.ExpireDate != "" {
		t, err := time.Parse("2006-01-02", *req.ExpireDate)
		if err == nil {
			expireDate = &t
		}
	}

	configJSON := "{}"
	if req.Config != nil {
		if b, err := json.Marshal(req.Config); err == nil {
			configJSON = string(b)
		}
	}

	server := model.ServerInstance{
		ID:         service.GenerateID(),
		UserID:     req.UserID,
		ProductID:  req.ProductID,
		IP:         req.IP,
		Status:     status,
		StartDate:  startDate,
		ExpireDate: expireDate,
		Config:     configJSON,
		CreatedAt:  time.Now(),
	}

	if err := database.DB.Create(&server).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建失败"})
		return
	}

	detail := "管理员手动开通服务器"
	database.DB.Create(&model.UserLog{
		ID:     service.GenerateID(),
		UserID: adminID,
		Event:  "ADMIN_SERVER_CREATE",
		Detail: &detail,
	})

	database.DB.Preload("User").Preload("Product").Preload("Product.CPU").First(&server, "id = ?", server.ID)
	c.JSON(http.StatusCreated, server)
}

// PUT /api/admin/servers/:id
func (h *ServerHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var server model.ServerInstance
	if err := database.DB.First(&server, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "服务器不存在"})
		return
	}

	var raw map[string]interface{}
	if err := c.ShouldBindJSON(&raw); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求"})
		return
	}

	allowed := map[string]bool{
		"ip": true, "hostname": true, "config": true, "status": true,
		"expire_date": true, "expireDate": true, "auto_renew": true, "autoRenew": true,
		"notes": true, "product_id": true, "productId": true,
	}
	filtered := map[string]interface{}{"updated_at": time.Now()}
	for k, v := range raw {
		if allowed[k] {
			filtered[k] = v
		}
	}
	database.DB.Model(&server).Updates(filtered)

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /api/admin/servers/:id/provision
func (h *ServerHandler) Provision(c *gin.Context) {
	id := c.Param("id")
	adminID := middleware.GetUserID(c)

	var req struct {
		IP       string `json:"ip" binding:"required"`
		Hostname string `json:"hostname"`
		Config   string `json:"config"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供IP地址"})
		return
	}

	now := time.Now()
	updates := map[string]interface{}{
		"ip":         req.IP,
		"status":     "ACTIVE",
		"start_date": now,
		"updated_at": now,
	}
	if req.Hostname != "" {
		updates["hostname"] = req.Hostname
	}
	if req.Config != "" {
		updates["config"] = req.Config
	}

	result := database.DB.Model(&model.ServerInstance{}).Where("id = ?", id).Updates(updates)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "服务器不存在"})
		return
	}

	// Log
	database.DB.Create(&model.UserLog{
		ID:        service.GenerateID(),
		UserID:    adminID,
		Event:     "ADMIN_SERVER_PROVISION",
		TargetID:  &id,
		CreatedAt: now,
	})

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /api/admin/servers/:id/transfer
func (h *ServerHandler) Transfer(c *gin.Context) {
	id := c.Param("id")
	adminID := middleware.GetUserID(c)

	var req struct {
		NewUserID string `json:"newUserId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请指定新用户"})
		return
	}

	// Load server
	var server model.ServerInstance
	if err := database.DB.Preload("User").First(&server, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "服务器不存在"})
		return
	}

	// Self-transfer check
	if server.UserID == req.NewUserID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不能过户给当前用户"})
		return
	}

	// Verify target user exists
	var targetUser model.User
	if err := database.DB.First(&targetUser, "id = ?", req.NewUserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "目标用户不存在"})
		return
	}

	// Target user must have a phone number bound
	if targetUser.Phone == nil || *targetUser.Phone == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "目标用户尚未绑定手机号，无法接受过户"})
		return
	}

	originalUser := server.User
	originalUserID := server.UserID
	hostname := ""
	if server.Hostname != nil {
		hostname = *server.Hostname
	}
	detail := "从 " + originalUser.Email + " 过户至 " + targetUser.Email

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		// Transfer ownership
		if err := tx.Model(&model.ServerInstance{}).Where("id = ?", id).
			Updates(map[string]interface{}{
				"user_id":    req.NewUserID,
				"updated_at": time.Now(),
			}).Error; err != nil {
			return err
		}

		now := time.Now()
		serverID := id
		outNote := "服务器 " + hostname + " 已过户给 " + targetUser.Email
		inNote := "服务器 " + hostname + " 已从 " + originalUser.Email + " 过户给您"

		// Log for original user
		tx.Create(&model.UserLog{
			ID:        service.GenerateID(),
			UserID:    originalUserID,
			Event:     "SERVER_TRANSFER_OUT",
			TargetID:  &serverID,
			Detail:    &outNote,
			CreatedAt: now,
		})
		// Log for target user
		tx.Create(&model.UserLog{
			ID:        service.GenerateID(),
			UserID:    req.NewUserID,
			Event:     "SERVER_TRANSFER_IN",
			TargetID:  &serverID,
			Detail:    &inNote,
			CreatedAt: now,
		})
		// Log for admin
		tx.Create(&model.UserLog{
			ID:        service.GenerateID(),
			UserID:    adminID,
			Event:     "ADMIN_SERVER_TRANSFER",
			TargetID:  &serverID,
			Detail:    &detail,
			CreatedAt: now,
		})
		// Transaction records for both users (amount=0, records transfer ownership change)
		outTxNote := "服务器 " + hostname + " 过户转出至 " + targetUser.Email
		inTxNote := "服务器 " + hostname + " 过户转入，原属 " + originalUser.Email
		tx.Create(&model.Transaction{
			ID:              service.GenerateID(),
			UserID:          originalUserID,
			Type:            "TRANSFER",
			Amount:          0,
			BalanceBefore:   0,
			BalanceAfter:    0,
			Note:            &outTxNote,
			RelatedServerID: &serverID,
			CreatedAt:       now,
		})
		tx.Create(&model.Transaction{
			ID:              service.GenerateID(),
			UserID:          req.NewUserID,
			Type:            "TRANSFER",
			Amount:          0,
			BalanceBefore:   0,
			BalanceAfter:    0,
			Note:            &inTxNote,
			RelatedServerID: &serverID,
			CreatedAt:       now,
		})
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "过户失败"})
		return
	}

	// Notifications (outside transaction - best effort)
	outContent := "您的服务器 " + hostname + " 已被过户给 " + targetUser.Email
	handler.SendNotification(originalUserID, "SERVER_TRANSFER", "服务器已过户", outContent, &id, nil)

	inContent := "服务器 " + hostname + "（原属 " + originalUser.Email + "）已过户给您"
	handler.SendNotification(req.NewUserID, "SERVER_TRANSFER", "收到服务器过户", inContent, &id, nil)

	c.JSON(http.StatusOK, gin.H{"success": true, "message": detail})
}

// PATCH /api/admin/servers/:id/status
func (h *ServerHandler) UpdateStatus(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供状态"})
		return
	}

	valid := map[string]bool{"PENDING": true, "ACTIVE": true, "SUSPENDED": true, "EXPIRED": true}
	if !valid[req.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的状态"})
		return
	}

	var server model.ServerInstance
	if err := database.DB.First(&server, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "服务器不存在"})
		return
	}

	database.DB.Model(&model.ServerInstance{}).Where("id = ?", id).
		Updates(map[string]interface{}{
			"status":     req.Status,
			"updated_at": time.Now(),
		})

	stype := "server"
	_, _ = service.CreateNotification(
		server.UserID,
		"SERVER_STATUS",
		"服务器状态更新",
		"您的服务器状态已更新为 "+req.Status,
		&id,
		&stype,
	)

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func stringPtr(s string) *string {
	return &s
}

// DELETE /api/admin/servers/:id
func (h *ServerHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	adminID := middleware.GetUserID(c)

	var server model.ServerInstance
	if err := database.DB.First(&server, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "服务器不存在"})
		return
	}

	tx := database.DB.Begin()

	// Delete related transactions
	tx.Where("related_server_id = ?", id).Delete(&model.Transaction{})

	// Delete the server instance
	if err := tx.Delete(&server).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除服务器失败"})
		return
	}

	// Log
	tx.Create(&model.UserLog{
		ID:        service.GenerateID(),
		UserID:    adminID,
		Event:     "ADMIN_SERVER_DELETE",
		TargetID:  &id,
		Detail:    stringPtr("删除服务器: " + id),
		CreatedAt: time.Now(),
	})

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除服务器失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /api/admin/servers/:id/renew
func (h *ServerHandler) Renew(c *gin.Context) {
	id := c.Param("id")
	adminID := middleware.GetUserID(c)

	var req struct {
		Period     int    `json:"period" binding:"required,min=1"`
		DeductType string `json:"deductType"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择续费时长"})
		return
	}

	var server model.ServerInstance
	if err := database.DB.First(&server, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "服务器不存在"})
		return
	}

	now := time.Now()
	newExpire := now.AddDate(0, req.Period, 0)
	if server.ExpireDate != nil && server.ExpireDate.After(now) {
		newExpire = server.ExpireDate.AddDate(0, req.Period, 0)
	}

	tx := database.DB.Begin()

	tx.Model(&model.ServerInstance{}).Where("id = ?", id).Updates(map[string]interface{}{
		"expire_date": newExpire,
		"status":      "ACTIVE",
		"updated_at":  now,
	})

	// If deductType == "balance", deduct from user balance
	if req.DeductType == "balance" {
		var user model.User
		if err := tx.First(&user, "id = ?", server.UserID).Error; err == nil {
			var pricingConfig model.PricingConfig
			if err := database.DB.First(&pricingConfig, "id = ?", "default").Error; err != nil {
				pricingConfig = service.DefaultPricingRules()
			}
			level := service.NormalizePriceLevel(user.Level)
			var product model.Product
			var monthlyPrice float64
			if err := database.DB.First(&product, "id = ?", server.ProductID).Error; err == nil {
				monthlyPrice = service.CalculatePrice(product.OriginalPrice, level, pricingConfig)
			}
			totalPrice := monthlyPrice * float64(req.Period)

			if user.Balance >= totalPrice {
				newBalance := service.RoundMoney(user.Balance - totalPrice)
				result := tx.Model(&model.User{}).
					Where("id = ? AND balance >= ?", server.UserID, totalPrice).
					Update("balance", newBalance)
				if result.RowsAffected > 0 {
					note := "管理员续费扣款"
					tx.Create(&model.Transaction{
						ID:              service.GenerateID(),
						UserID:          server.UserID,
						Type:            "RENEWAL",
						Amount:          service.RoundMoney(-totalPrice),
						BalanceBefore:   service.RoundMoney(user.Balance),
						BalanceAfter:    newBalance,
						Note:            &note,
						RelatedServerID: &id,
						OperatorID:      &adminID,
						CreatedAt:       now,
					})
				}
			}
		}
	} else {
		// Admin direct renew - create a transaction record without balance deduction
		note := "管理员直接续费"
		tx.Create(&model.Transaction{
			ID:              service.GenerateID(),
			UserID:          server.UserID,
			Type:            "ADMIN_RENEW",
			Amount:          0,
			BalanceBefore:   0,
			BalanceAfter:    0,
			Note:            &note,
			RelatedServerID: &id,
			OperatorID:      &adminID,
			CreatedAt:       now,
		})
	}

	tx.Create(&model.UserLog{
		ID:        service.GenerateID(),
		UserID:    adminID,
		Event:     "ADMIN_SERVER_RENEW",
		TargetID:  &id,
		CreatedAt: now,
	})

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "续费失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "newExpire": newExpire})
}

// PATCH /api/admin/servers/:id/auto-renew
func (h *ServerHandler) ToggleAutoRenew(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		AutoRenew bool `json:"autoRenew"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	result := database.DB.Model(&model.ServerInstance{}).
		Where("id = ?", id).
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

func adminSeverityRank(level string) int {
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
