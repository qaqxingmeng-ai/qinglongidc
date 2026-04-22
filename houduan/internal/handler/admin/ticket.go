package admin

import (
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type TicketHandler struct{}

func NewTicketHandler() *TicketHandler {
	return &TicketHandler{}
}

// GET /api/admin/tickets
func (h *TicketHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.Ticket{})

	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	if category := c.Query("category"); category != "" {
		query = query.Where("category = ?", category)
	}
	if priority := c.Query("priority"); priority != "" {
		query = query.Where("priority = ?", priority)
	}
	if ticketType := c.Query("type"); ticketType != "" {
		query = query.Where("type = ?", ticketType)
	}
	if userID := c.Query("userId"); userID != "" {
		query = query.Where("user_id = ?", userID)
	}
	if search := strings.TrimSpace(c.Query("search")); search != "" {
		pattern := "%" + search + "%"
		matchedUsers := database.DB.Model(&model.User{}).
			Select("id").
			Where("name ILIKE ? OR email ILIKE ?", pattern, pattern)
		query = query.Where(
			"ticket_no ILIKE ? OR subject ILIKE ? OR user_id IN (?)",
			pattern,
			pattern,
			matchedUsers,
		)
	}

	var total int64
	query.Count(&total)

	var tickets []model.Ticket
	query.Preload("User").Preload("Messages").
		Order("CASE WHEN priority = 'URGENT' THEN 0 WHEN priority = 'HIGH' THEN 1 ELSE 2 END, updated_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&tickets)

	ids := make([]string, 0, len(tickets))
	for _, t := range tickets {
		ids = append(ids, t.ID)
	}

	classificationMap := map[string]model.AITicketClassification{}
	if len(ids) > 0 {
		var cls []model.AITicketClassification
		database.DB.Where("ticket_id IN ?", ids).Find(&cls)
		for _, cItem := range cls {
			classificationMap[cItem.TicketID] = cItem
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"tickets":         tickets,
		"classifications": classificationMap,
		"total":           total,
		"page":            page,
		"pageSize":        pageSize,
		"totalPages":      int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// PATCH /api/admin/tickets/:id/status
func (h *TicketHandler) UpdateStatus(c *gin.Context) {
	id := c.Param("id")
	adminID := middleware.GetUserID(c)

	var req struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供状态"})
		return
	}

	valid := map[string]bool{"OPEN": true, "PROCESSING": true, "RESOLVED": true, "CLOSED": true}
	if !valid[req.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的工单状态"})
		return
	}

	var ticket model.Ticket
	if err := database.DB.First(&ticket, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "工单不存在"})
		return
	}

	now := time.Now()
	database.DB.Model(&ticket).Updates(map[string]interface{}{
		"status":     req.Status,
		"updated_at": now,
	})

	detail := "管理员更新工单状态为 " + req.Status
	database.DB.Create(&model.UserLog{
		ID:     service.GenerateID(),
		UserID: adminID,
		Event:  "ADMIN_TICKET_STATUS",
		Detail: &detail,
	})

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// PATCH /api/admin/tickets/:id/priority
func (h *TicketHandler) UpdatePriority(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		Priority string `json:"priority" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供优先级"})
		return
	}

	valid := map[string]bool{"LOW": true, "NORMAL": true, "HIGH": true, "URGENT": true}
	if !valid[req.Priority] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的优先级"})
		return
	}

	database.DB.Model(&model.Ticket{}).Where("id = ?", id).
		Updates(map[string]interface{}{
			"priority":   req.Priority,
			"updated_at": time.Now(),
		})

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GET /api/admin/tickets/stats
func (h *TicketHandler) Stats(c *gin.Context) {
	var openCount int64
	database.DB.Model(&model.Ticket{}).Where("status = ?", "OPEN").Count(&openCount)

	var processingCount int64
	database.DB.Model(&model.Ticket{}).Where("status = ?", "PROCESSING").Count(&processingCount)

	var resolvedCount int64
	database.DB.Model(&model.Ticket{}).Where("status = ?", "RESOLVED").Count(&resolvedCount)

	var urgentCount int64
	database.DB.Model(&model.Ticket{}).Where("priority = ? AND status IN ?", "URGENT", []string{"OPEN", "PROCESSING"}).Count(&urgentCount)

	c.JSON(http.StatusOK, gin.H{
		"open":       openCount,
		"processing": processingCount,
		"resolved":   resolvedCount,
		"urgent":     urgentCount,
	})
}

// GET /api/admin/tickets/:id/classification
func (h *TicketHandler) GetClassification(c *gin.Context) {
	id := c.Param("id")
	var cls model.AITicketClassification
	if err := database.DB.Where("ticket_id = ?", id).First(&cls).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": true, "classification": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "classification": cls})
}

// POST /api/admin/tickets/:id/classification/accept
func (h *TicketHandler) AcceptClassification(c *gin.Context) {
	id := c.Param("id")
	adminID := middleware.GetUserID(c)

	var req struct {
		AcceptAll bool   `json:"acceptAll"`
		Type      string `json:"type"`
		Category  string `json:"category"`
		Priority  string `json:"priority"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效请求"})
		return
	}

	var cls model.AITicketClassification
	if err := database.DB.Where("ticket_id = ?", id).First(&cls).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "分类记录不存在"})
		return
	}

	now := time.Now()
	accepted := true

	finalType := cls.SuggestedType
	finalCategory := cls.SuggestedCategory
	finalPriority := cls.SuggestedPriority
	if !req.AcceptAll {
		if req.Type != "" {
			finalType = req.Type
		}
		if req.Category != "" {
			finalCategory = req.Category
		}
		if req.Priority != "" {
			finalPriority = req.Priority
		}
	}

	database.DB.Model(&cls).Updates(map[string]interface{}{
		"accepted":       accepted,
		"final_type":     finalType,
		"final_category": finalCategory,
		"final_priority": finalPriority,
		"accepted_by":    adminID,
		"accepted_at":    now,
		"updated_at":     now,
	})

	database.DB.Model(&model.Ticket{}).Where("id = ?", id).Updates(map[string]interface{}{
		"type":       finalType,
		"category":   finalCategory,
		"priority":   finalPriority,
		"updated_at": now,
	})

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GET /api/admin/tickets/classification-stats
func (h *TicketHandler) ClassificationStats(c *gin.Context) {
	var total int64
	database.DB.Model(&model.AITicketClassification{}).Count(&total)

	var accepted int64
	database.DB.Model(&model.AITicketClassification{}).Where("accepted = ?", true).Count(&accepted)

	var exactMatch int64
	database.DB.Raw(`
		SELECT COUNT(*) FROM ai_ticket_classifications
		WHERE accepted = true
		AND final_type = suggested_type
		AND final_category = suggested_category
		AND final_priority = suggested_priority
	`).Scan(&exactMatch)

	acceptRate := 0.0
	matchRate := 0.0
	if total > 0 {
		acceptRate = float64(accepted) / float64(total) * 100
	}
	if accepted > 0 {
		matchRate = float64(exactMatch) / float64(accepted) * 100
	}

	_ = service.GenerateID

	c.JSON(http.StatusOK, gin.H{
		"success":         true,
		"total":      total,
		"accepted":   accepted,
		"exactMatch": exactMatch,
		"acceptRate": math.Round(acceptRate*10) / 10,
		"matchRate":  math.Round(matchRate*10) / 10,
	})
}
