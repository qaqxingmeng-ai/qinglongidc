package admin

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

type UserHandler struct{}

func NewUserHandler() *UserHandler {
	return &UserHandler{}
}

// GET /api/admin/users
func (h *UserHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.User{})

	if role := c.Query("role"); role != "" {
		query = query.Where("role = ?", role)
	}
	if level := c.Query("level"); level != "" {
		query = query.Where("level = ?", level)
	}
	if search := c.Query("search"); search != "" {
		s := "%" + search + "%"
		query = query.Where("name ILIKE ? OR email ILIKE ? OR CAST(numeric_id AS TEXT) ILIKE ?", s, s, s)
	}
	if agentID := c.Query("agentId"); agentID != "" {
		query = query.Where("agent_id = ?", agentID)
	}

	var total int64
	query.Count(&total)

	var users []model.User
	query.Preload("Agent").
		Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&users)

	// Strip passwords; expose only a presence flag for identity code.
	type SafeUser struct {
		model.User
		Password         string `json:"password,omitempty"`
		HasIdentityCode  bool   `json:"hasIdentityCode"`
	}
	items := make([]SafeUser, 0, len(users))
	for _, u := range users {
		has := u.IdentityCode != nil && strings.TrimSpace(*u.IdentityCode) != ""
		u.Password = ""
		items = append(items, SafeUser{User: u, HasIdentityCode: has})
	}

	c.JSON(http.StatusOK, gin.H{
		"users":      items,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// GET /api/admin/users/:id
func (h *UserHandler) Detail(c *gin.Context) {
	id := c.Param("id")

	var user model.User
	if err := database.DB.Preload("Agent").First(&user, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	user.Password = ""

	// Counts
	var serverCount, orderCount, ticketCount int64
	database.DB.Model(&model.ServerInstance{}).Where("user_id = ?", id).Count(&serverCount)
	database.DB.Model(&model.Order{}).Where("user_id = ?", id).Count(&orderCount)
	database.DB.Model(&model.Ticket{}).Where("user_id = ?", id).Count(&ticketCount)

	// 总消费：已完成订单净额（扣去退款类暂未处理，前端仅展示口径值）
	var totalSpend float64
	database.DB.Model(&model.Order{}).
		Where("user_id = ? AND status IN ?", id, []string{"ACTIVE", "COMPLETED", "PROCESSING"}).
		Select("COALESCE(SUM(total_price),0)").Row().Scan(&totalSpend)

	// 近 50 条订单
	var orders []model.Order
	database.DB.Where("user_id = ?", id).
		Order("created_at DESC").Limit(50).Find(&orders)
	orderList := make([]gin.H, 0, len(orders))
	for _, o := range orders {
		orderList = append(orderList, gin.H{
			"id":         o.ID,
			"orderNo":    o.OrderNo,
			"totalPrice": o.TotalPrice,
			"status":     o.Status,
			"createdAt":  o.CreatedAt,
		})
	}

	// 近 50 台服务器
	var servers []model.ServerInstance
	database.DB.Preload("Product").Where("user_id = ?", id).
		Order("created_at DESC").Limit(50).Find(&servers)
	serverList := make([]gin.H, 0, len(servers))
	for _, s := range servers {
		var productName *string
		if s.Product.Name != "" {
			n := s.Product.Name
			productName = &n
		}
		serverList = append(serverList, gin.H{
			"id":          s.ID,
			"ip":          s.IP,
			"status":      s.Status,
			"expireDate":  s.ExpireDate,
			"productName": productName,
		})
	}

	// 近 50 条工单
	var tickets []model.Ticket
	database.DB.Where("user_id = ?", id).
		Order("created_at DESC").Limit(50).Find(&tickets)
	ticketList := make([]gin.H, 0, len(tickets))
	for _, t := range tickets {
		ticketList = append(ticketList, gin.H{
			"id":        t.ID,
			"ticketNo":  t.TicketNo,
			"subject":   t.Subject,
			"status":    t.Status,
			"category":  t.Category,
			"createdAt": t.CreatedAt,
		})
	}

	// 近 100 条日志
	var logs []model.UserLog
	database.DB.Where("user_id = ?", id).
		Order("created_at DESC").Limit(100).Find(&logs)
	logList := make([]gin.H, 0, len(logs))
	for _, l := range logs {
		logList = append(logList, gin.H{
			"id":        l.ID,
			"event":     l.Event,
			"meta":      l.Meta,
			"ip":        l.IP,
			"createdAt": l.CreatedAt,
		})
	}

	var agentName *string
	if user.Agent != nil && user.Agent.Name != "" {
		n := user.Agent.Name
		agentName = &n
	}
	hasIdentityCode := user.IdentityCode != nil && strings.TrimSpace(*user.IdentityCode) != ""

	c.JSON(http.StatusOK, gin.H{
		"id":           user.ID,
		"numericId":    user.NumericID,
		"name":         user.Name,
		"email":        user.Email,
		"phone":        user.Phone,
		"identityCode": nil, // 已哈希存储，不回传明文
		"role":         user.Role,
		"level":        user.Level,
		"inviteCode":   user.InviteCode,
		"agentName":    agentName,
		"createdAt":    user.CreatedAt,
		"stats": gin.H{
			"totalSpend":  totalSpend,
			"serverCount": serverCount,
			"orderCount":  orderCount,
			"ticketCount": ticketCount,
		},
		"servers":         serverList,
		"orders":          orderList,
		"tickets":         ticketList,
		"logs":            logList,
		"hasIdentityCode": hasIdentityCode,
	})
}

// POST /api/admin/users
func (h *UserHandler) Create(c *gin.Context) {
	var req struct {
		Email        string  `json:"email" binding:"required,email"`
		Password     string  `json:"password" binding:"required,min=8"`
		Name         string  `json:"name" binding:"required"`
		Role         string  `json:"role"`
		Level        string  `json:"level"`
		Balance      float64 `json:"balance"`
		IdentityCode string  `json:"identityCode"`
		AgentID      string  `json:"agentId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写完整信息"})
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))

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
		Level:     "GUEST",
		Balance:   req.Balance,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if req.Role != "" {
		user.Role = req.Role
	}
	if req.Level != "" {
		user.Level = req.Level
	}
	if strings.TrimSpace(req.IdentityCode) != "" {
		hashed, err := service.HashIdentityCode(req.IdentityCode)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "身份码处理失败"})
			return
		}
		user.IdentityCode = &hashed
	}
	if req.AgentID != "" {
		user.AgentID = &req.AgentID
	}
	inviteCode := service.GenerateInviteCode()
	user.InviteCode = &inviteCode

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
	user.Password = ""

	c.JSON(http.StatusOK, user)
}

// PUT /api/admin/users/:id
func (h *UserHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var user model.User
	if err := database.DB.First(&user, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	var req struct {
		Name         *string  `json:"name"`
		Role         *string  `json:"role"`
		Level        *string  `json:"level"`
		Email        *string  `json:"email"`
		Phone        *string  `json:"phone"`
		IdentityCode *string  `json:"identityCode"`
		Balance      *float64 `json:"balance"`
		AgentID      *string  `json:"agentId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求"})
		return
	}

	updates := map[string]interface{}{"updated_at": time.Now()}

	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Role != nil {
		validRoles := map[string]bool{"USER": true, "AGENT": true, "ADMIN": true, "DELETED": true}
		if !validRoles[*req.Role] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的角色值"})
			return
		}
		updates["role"] = *req.Role
	}
	if req.Level != nil {
		updates["level"] = *req.Level
	}
	if req.Email != nil {
		email := strings.ToLower(strings.TrimSpace(*req.Email))
		var count int64
		database.DB.Model(&model.User{}).Where("email = ? AND id != ?", email, id).Count(&count)
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "邮箱已被使用"})
			return
		}
		updates["email"] = email
	}
	if req.Phone != nil {
		updates["phone"] = *req.Phone
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
	if req.AgentID != nil {
		if *req.AgentID == "" {
			updates["agent_id"] = nil
		} else {
			updates["agent_id"] = *req.AgentID
		}
	}
	if req.Balance != nil {
		if *req.Balance < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "余额不能为负"})
			return
		}
		adminID := middleware.GetUserID(c)
		nextBalance := *req.Balance
		if err := database.DB.Transaction(func(tx *gorm.DB) error {
			var locked model.User
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&locked, "id = ?", id).Error; err != nil {
				return err
			}

			txUpdates := map[string]interface{}{}
			for k, v := range updates {
				txUpdates[k] = v
			}
			txUpdates["balance"] = nextBalance

			if err := tx.Model(&locked).Updates(txUpdates).Error; err != nil {
				return err
			}

			diff := nextBalance - locked.Balance
			if diff == 0 {
				return nil
			}

			return tx.Create(&model.Transaction{
				ID:            service.GenerateID(),
				UserID:        id,
				Type:          "ADMIN_ADJUST",
				Amount:        diff,
				BalanceBefore: locked.Balance,
				BalanceAfter:  nextBalance,
				OperatorID:    &adminID,
				CreatedAt:     time.Now(),
			}).Error
		}); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true})
		return
	}

	database.DB.Model(&user).Updates(updates)
	// Reload so the response reflects the saved state
	database.DB.Preload("Agent").First(&user, "id = ?", id)
	user.Password = ""
	c.JSON(http.StatusOK, user)
}

// DELETE /api/admin/users/:id
func (h *UserHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	// Soft delete - mark as deleted
	database.DB.Model(&model.User{}).Where("id = ?", id).
		Updates(map[string]interface{}{
			"role":       "DELETED",
			"updated_at": time.Now(),
		})

	// Invalidate all active sessions so existing JWTs are rejected
	database.DB.Model(&model.UserSession{}).
		Where("user_id = ? AND is_active = ?", id, true).
		Updates(map[string]interface{}{"is_active": false, "updated_at": time.Now()})

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /api/admin/users/:id/reset-password
func (h *UserHandler) ResetPassword(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		NewPassword string `json:"newPassword" binding:"required,min=8"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "密码至少8个字符"})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "密码处理失败"})
		return
	}
	database.DB.Model(&model.User{}).Where("id = ?", id).
		Updates(map[string]interface{}{
			"password":   string(hashedPassword),
			"updated_at": time.Now(),
		})

	// Invalidate all sessions for the target user
	database.DB.Model(&model.UserSession{}).
		Where("user_id = ? AND is_active = ?", id, true).
		Updates(map[string]interface{}{"is_active": false, "updated_at": time.Now()})

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /api/admin/users/batch
func (h *UserHandler) BatchUpdate(c *gin.Context) {
	var req struct {
		IDs     []string               `json:"ids" binding:"required"`
		Updates map[string]interface{} `json:"updates" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求"})
		return
	}

	// Whitelist allowed fields to prevent arbitrary column updates
	allowed := map[string]bool{"level": true, "role": true, "name": true, "phone": true, "agent_id": true}
	safe := map[string]interface{}{"updated_at": time.Now()}
	for k, v := range req.Updates {
		if allowed[k] {
			safe[k] = v
		}
	}

	database.DB.Model(&model.User{}).Where("id IN ?", req.IDs).Updates(safe)
	c.JSON(http.StatusOK, gin.H{"success": true, "count": len(req.IDs)})
}

// GET /api/admin/users/:id/level-history
func (h *UserHandler) LevelHistory(c *gin.Context) {
	userID := c.Param("id")
	var history []model.LevelHistory
	database.DB.Where("user_id = ?", userID).
		Order("changed_at DESC").
		Find(&history)
	c.JSON(http.StatusOK, gin.H{"data": history})
}
