package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type TicketHandler struct {
	emailService *service.EmailService
	adminEmail   string
	aiClient     *service.AIClient
}

func NewTicketHandler(emailService *service.EmailService, adminEmail string, aiClient *service.AIClient) *TicketHandler {
	return &TicketHandler{emailService: emailService, adminEmail: adminEmail, aiClient: aiClient}
}

func agentSubUserQuery(agentID string) *gorm.DB {
	return database.DB.Model(&model.User{}).Select("id").Where("agent_id = ?", agentID)
}

func applyTicketScope(query *gorm.DB, role, userID string) *gorm.DB {
	switch role {
	case "ADMIN":
		return query
	case "AGENT":
		return query.Where("agent_id = ? OR user_id = ? OR user_id IN (?)", userID, userID, agentSubUserQuery(userID))
	default:
		return query.Where("user_id = ?", userID)
	}
}

// GET /api/tickets
func (h *TicketHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	role := middleware.GetUserRole(c)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 10
	}

	query := applyTicketScope(database.DB.Model(&model.Ticket{}), role, userID)

	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	if category := c.Query("category"); category != "" {
		query = query.Where("category = ?", category)
	}
	if ticketType := c.Query("type"); ticketType != "" {
		query = query.Where("type = ?", ticketType)
	}

	var total int64
	query.Count(&total)

	var tickets []model.Ticket
	query.Preload("User").Preload("Messages").
		Order("updated_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&tickets)

	c.JSON(http.StatusOK, gin.H{
		"tickets":    tickets,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// POST /api/tickets
func (h *TicketHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	role := middleware.GetUserRole(c)

	var req struct {
		Type              string   `json:"type" binding:"required"`
		Category          string   `json:"category"`
		Subject           string   `json:"subject" binding:"required"`
		Content           string   `json:"content" binding:"required"`
		RelatedProductIDs []string `json:"relatedProductIds"`
		OnBehalfUserID    string   `json:"onBehalfUserId"`
		OrderID           string   `json:"orderId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写完整工单信息"})
		return
	}

	ticketUserID := userID
	var ticketAgentID *string
	if req.OnBehalfUserID != "" {
		switch role {
		case "AGENT":
			var subUser model.User
			if err := database.DB.Select("id").Where("id = ? AND agent_id = ?", req.OnBehalfUserID, userID).First(&subUser).Error; err != nil {
				c.JSON(http.StatusForbidden, gin.H{"error": "只能为自己的下级用户创建工单"})
				return
			}
			ticketUserID = subUser.ID
			ticketAgentID = &userID
		case "ADMIN":
			var targetUser model.User
			if err := database.DB.Select("id").First(&targetUser, "id = ?", req.OnBehalfUserID).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "目标用户不存在"})
				return
			}
			ticketUserID = targetUser.ID
		default:
			c.JSON(http.StatusForbidden, gin.H{"error": "权限不足"})
			return
		}
	}

	// Type-specific validation
	if req.Type == "AFTERSALE" && len(req.RelatedProductIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "售后工单必须选择关联产品"})
		return
	}
	if req.Type == "FINANCE" && req.OrderID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "财务工单必须选择关联账单"})
		return
	}

	// 售前工单防刷：只限"同时不超过 1 个进行中"。取消此前 1 小时硬拉闸限制，
	// 正常咨询流程中用户可能刚关闭上一单立刻想到新问题，不应再让等一小时。
	if req.Type == "PRESALE" {
		var openCount int64
		database.DB.Model(&model.Ticket{}).
			Where("user_id = ? AND type = ? AND status IN ?", ticketUserID, "PRESALE", []string{"OPEN", "PROCESSING"}).
			Count(&openCount)
		if openCount > 0 {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "您已有一个售前工单正在处理中"})
			return
		}
	}

	ticketID := service.GenerateID()
	randBytes := make([]byte, 3)
	rand.Read(randBytes)
	ticket := model.Ticket{
		ID:        ticketID,
		TicketNo:  "TK" + time.Now().Format("20060102150405") + strings.ToUpper(hex.EncodeToString(randBytes)),
		UserID:    ticketUserID,
		Type:      req.Type,
		Category:  req.Category,
		Subject:   req.Subject,
		Status:    "OPEN",
		Priority:  "NORMAL",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	// Auto-elevate priority based on member level
	var ticketUser model.User
	if err := database.DB.Select("level").First(&ticketUser, "id = ?", ticketUserID).Error; err == nil {
		if ticketUser.Level == "VIP_TOP" || ticketUser.Level == "PARTNER" {
			ticket.Priority = "HIGH"
		}
	}

	if ticket.Category == "" {
		ticket.Category = "GENERAL"
	}

	if ticketAgentID != nil {
		ticket.AgentID = ticketAgentID
	}

	if req.OrderID != "" {
		ticket.OrderID = &req.OrderID
	}

	if len(req.RelatedProductIDs) > 0 {
		jsonData, _ := json.Marshal(req.RelatedProductIDs)
		s := string(jsonData)
		ticket.RelatedProductIDs = &s
	}

	// Create ticket + first message in transaction
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&ticket).Error; err != nil {
			return err
		}

		message := model.TicketMessage{
			ID:        service.GenerateID(),
			TicketID:  ticketID,
			Sender:    userID,
			Role:      role,
			Content:   req.Content,
			CreatedAt: time.Now(),
		}
		if err := tx.Create(&message).Error; err != nil {
			return err
		}

		// Log
		return tx.Create(&model.UserLog{
			ID:        service.GenerateID(),
			UserID:    userID,
			Event:     "TICKET_CREATE",
			TargetID:  &ticketID,
			CreatedAt: time.Now(),
		}).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建工单失败"})
		return
	}

	go service.AutoRouteTicket(ticketID, req.Content)

	// Notify admin via email
	if h.adminEmail != "" {
		go h.emailService.SendTicketNotification(h.adminEmail, ticket.TicketNo, ticket.Subject, req.Content)
	}

	// AI auto-classification (async)
	if h.aiClient != nil {
		capturedID := ticketID
		capturedSubject := req.Subject
		capturedContent := req.Content
		go func() {
			ctx := context.Background()
			raw, err := h.aiClient.ClassifyTicket(ctx, capturedSubject, capturedContent)
			cls := model.AITicketClassification{
				ID:       service.GenerateID(),
				TicketID: capturedID,
			}
			if err == nil {
				var parsed struct {
					Type     string `json:"type"`
					Category string `json:"category"`
					Priority string `json:"priority"`
					Reason   string `json:"reason"`
				}
				// Strip markdown code fences if present
				clean := strings.TrimSpace(raw)
				if strings.HasPrefix(clean, "```") {
					lines := strings.Split(clean, "\n")
					if len(lines) > 2 {
						clean = strings.Join(lines[1:len(lines)-1], "\n")
					}
				}
				if jsonErr := json.Unmarshal([]byte(clean), &parsed); jsonErr == nil {
					cls.SuggestedType = parsed.Type
					cls.SuggestedCategory = parsed.Category
					cls.SuggestedPriority = parsed.Priority
					cls.Reason = parsed.Reason
				}
			}
			database.DB.Create(&cls)
		}()
	}

	c.JSON(http.StatusOK, ticket)
}

// GET /api/tickets/:id
func (h *TicketHandler) Detail(c *gin.Context) {
	userID := middleware.GetUserID(c)
	role := middleware.GetUserRole(c)
	id := c.Param("id")

	var ticket model.Ticket
	query := applyTicketScope(database.DB.Preload("Messages").Preload("User"), role, userID).Where("id = ?", id)

	if err := query.First(&ticket).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "工单不存在"})
		return
	}

	c.JSON(http.StatusOK, ticket)
}

// POST /api/tickets/:id  (combined reply + status update)
func (h *TicketHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	role := middleware.GetUserRole(c)
	id := c.Param("id")

	var req struct {
		Content string `json:"content"`
		Status  string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if req.Content == "" && req.Status == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供回复内容或状态"})
		return
	}

	// Verify access
	var ticket model.Ticket
	query := applyTicketScope(database.DB.Model(&model.Ticket{}), role, userID).Where("id = ?", id)
	if err := query.First(&ticket).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "工单不存在"})
		return
	}

	tx := database.DB.Begin()

	// Add reply message if content provided
	if req.Content != "" {
		if ticket.Status == "CLOSED" {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "工单已关闭"})
			return
		}

		message := model.TicketMessage{
			ID:        service.GenerateID(),
			TicketID:  id,
			Sender:    userID,
			Role:      role,
			Content:   req.Content,
			CreatedAt: time.Now(),
		}
		tx.Create(&message)

		tx.Create(&model.UserLog{
			ID:        service.GenerateID(),
			UserID:    userID,
			Event:     "TICKET_REPLY",
			TargetID:  &id,
			CreatedAt: time.Now(),
		})
	}

	// Update status
	newStatus := ticket.Status
	if req.Status != "" {
		validStatuses := map[string]bool{"OPEN": true, "PROCESSING": true, "RESOLVED": true, "CLOSED": true}
		if !validStatuses[req.Status] {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的状态"})
			return
		}
		if role == "USER" && req.Status != "OPEN" && req.Status != "CLOSED" {
			tx.Rollback()
			c.JSON(http.StatusForbidden, gin.H{"error": "权限不足"})
			return
		}
		newStatus = req.Status
	} else if req.Content != "" && (role == "ADMIN" || role == "AGENT") {
		newStatus = "PROCESSING"
	}

	updateMap := map[string]interface{}{
		"status":     newStatus,
		"updated_at": time.Now(),
	}
	if req.Content != "" && (role == "ADMIN" || role == "AGENT") {
		if ticket.FirstResponseAt == nil {
			updateMap["first_response_at"] = time.Now()
		}
		if ticket.AssignedAdminID == nil && role == "ADMIN" {
			updateMap["assigned_admin_id"] = userID
		}
	}
	tx.Model(&model.Ticket{}).Where("id = ?", id).Updates(updateMap)

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}

	if req.Content != "" && (role == "ADMIN" || role == "AGENT") {
		tid := ticket.ID
		ttype := "ticket"
		_, _ = service.CreateNotification(
			ticket.UserID,
			"TICKET_REPLY",
			"工单有新回复",
			"工单 #"+ticket.TicketNo+" 收到新的处理回复，请及时查看。",
			&tid,
			&ttype,
		)
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /api/tickets/:id/messages
func (h *TicketHandler) Reply(c *gin.Context) {
	userID := middleware.GetUserID(c)
	role := middleware.GetUserRole(c)
	id := c.Param("id")

	var req struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入回复内容"})
		return
	}

	// Verify access
	var ticket model.Ticket
	query := applyTicketScope(database.DB.Model(&model.Ticket{}), role, userID).Where("id = ?", id)
	if err := query.First(&ticket).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "工单不存在"})
		return
	}

	if ticket.Status == "CLOSED" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "工单已关闭"})
		return
	}

	message := model.TicketMessage{
		ID:        service.GenerateID(),
		TicketID:  id,
		Sender:    userID,
		Role:      role,
		Content:   req.Content,
		CreatedAt: time.Now(),
	}

	database.DB.Create(&message)

	// Update ticket status
	newStatus := ticket.Status
	if role == "ADMIN" || role == "AGENT" {
		newStatus = "PROCESSING"
	}
	updateMap := map[string]interface{}{
		"status":     newStatus,
		"updated_at": time.Now(),
	}
	if role == "ADMIN" || role == "AGENT" {
		if ticket.FirstResponseAt == nil {
			updateMap["first_response_at"] = time.Now()
		}
		if ticket.AssignedAdminID == nil && role == "ADMIN" {
			updateMap["assigned_admin_id"] = userID
		}
	}
	database.DB.Model(&model.Ticket{}).Where("id = ?", id).Updates(updateMap)

	// Log
	database.DB.Create(&model.UserLog{
		ID:        service.GenerateID(),
		UserID:    userID,
		Event:     "TICKET_REPLY",
		TargetID:  &id,
		CreatedAt: time.Now(),
	})

	// Email notification: admin/agent reply -> notify user; user reply -> notify admin
	go func() {
		if role == "ADMIN" || role == "AGENT" {
			var owner model.User
			if err := database.DB.First(&owner, "id = ?", ticket.UserID).Error; err == nil && owner.Email != "" {
				h.emailService.SendTicketNotification(owner.Email, ticket.TicketNo, "工单有新回复", req.Content)
			}
		} else if h.adminEmail != "" {
			h.emailService.SendTicketNotification(h.adminEmail, ticket.TicketNo, "用户追加回复", req.Content)
		}
	}()

	if role == "ADMIN" || role == "AGENT" {
		tid := ticket.ID
		ttype := "ticket"
		_, _ = service.CreateNotification(
			ticket.UserID,
			"TICKET_REPLY",
			"工单有新回复",
			"工单 #"+ticket.TicketNo+" 收到新的处理回复，请及时查看。",
			&tid,
			&ttype,
		)
	}

	c.JSON(http.StatusOK, message)
}

// PATCH /api/tickets/:id/status
func (h *TicketHandler) UpdateStatus(c *gin.Context) {
	userID := middleware.GetUserID(c)
	role := middleware.GetUserRole(c)
	id := c.Param("id")

	var req struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供状态"})
		return
	}

	validStatuses := map[string]bool{"OPEN": true, "PROCESSING": true, "RESOLVED": true, "CLOSED": true}
	if !validStatuses[req.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的状态"})
		return
	}

	query := applyTicketScope(database.DB.Model(&model.Ticket{}), role, userID).Where("id = ?", id)
	if role != "ADMIN" && role != "AGENT" {
		// Users can only reopen or close
		if req.Status != "OPEN" && req.Status != "CLOSED" {
			c.JSON(http.StatusForbidden, gin.H{"error": "权限不足"})
			return
		}
	}

	result := query.Updates(map[string]interface{}{
		"status":     req.Status,
		"updated_at": time.Now(),
	})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "工单不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
