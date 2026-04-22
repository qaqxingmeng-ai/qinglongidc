package admin

import (
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type AnnouncementHandler struct{}

func NewAnnouncementHandler() *AnnouncementHandler {
	return &AnnouncementHandler{}
}

// GET /api/admin/announcements
func (h *AnnouncementHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.Announcement{})
	if t := c.Query("type"); t != "" {
		query = query.Where("type = ?", t)
	}
	if active := c.Query("isActive"); active != "" {
		v, _ := strconv.ParseBool(active)
		query = query.Where("is_active = ?", v)
	}

	var total int64
	query.Count(&total)

	var items []model.Announcement
	query.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&items)

	c.JSON(http.StatusOK, gin.H{
		"items":      items,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// POST /api/admin/announcements
func (h *AnnouncementHandler) Create(c *gin.Context) {
	adminID := middleware.GetUserID(c)

	var req struct {
		Title    string     `json:"title" binding:"required,max=255"`
		Content  string     `json:"content"`
		Type     string     `json:"type" binding:"required,oneof=BANNER POPUP MAINTENANCE CHANGELOG"`
		Priority string     `json:"priority"`
		StartAt  *time.Time `json:"startAt"`
		EndAt    *time.Time `json:"endAt"`
		IsActive bool       `json:"isActive"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}

	priority := req.Priority
	if priority == "" {
		priority = "NORMAL"
	}

	a := model.Announcement{
		ID:        service.GenerateID(),
		Title:     req.Title,
		Content:   req.Content,
		Type:      req.Type,
		Priority:  priority,
		StartAt:   req.StartAt,
		EndAt:     req.EndAt,
		IsActive:  req.IsActive,
		CreatedBy: adminID,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := database.DB.Create(&a).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建失败"})
		return
	}
	c.JSON(http.StatusOK, a)
}

// PUT /api/admin/announcements/:id
func (h *AnnouncementHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var a model.Announcement
	if err := database.DB.First(&a, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "公告不存在"})
		return
	}

	var req struct {
		Title    *string    `json:"title"`
		Content  *string    `json:"content"`
		Type     *string    `json:"type"`
		Priority *string    `json:"priority"`
		StartAt  *time.Time `json:"startAt"`
		EndAt    *time.Time `json:"endAt"`
		IsActive *bool      `json:"isActive"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	updates := map[string]interface{}{"updated_at": time.Now()}
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.Content != nil {
		updates["content"] = *req.Content
	}
	if req.Type != nil {
		updates["type"] = *req.Type
	}
	if req.Priority != nil {
		updates["priority"] = *req.Priority
	}
	if req.StartAt != nil {
		updates["start_at"] = req.StartAt
	}
	if req.EndAt != nil {
		updates["end_at"] = req.EndAt
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}

	database.DB.Model(&a).Updates(updates)
	database.DB.First(&a, "id = ?", id)
	c.JSON(http.StatusOK, a)
}

// PATCH /api/admin/announcements/:id/toggle
func (h *AnnouncementHandler) Toggle(c *gin.Context) {
	id := c.Param("id")

	var a model.Announcement
	if err := database.DB.First(&a, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "公告不存在"})
		return
	}

	database.DB.Model(&a).Updates(map[string]interface{}{
		"is_active":  !a.IsActive,
		"updated_at": time.Now(),
	})
	c.JSON(http.StatusOK, gin.H{"success": true, "isActive": !a.IsActive})
}

// DELETE /api/admin/announcements/:id
func (h *AnnouncementHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	result := database.DB.Delete(&model.Announcement{}, "id = ?", id)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "公告不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GET /api/admin/cron-logs
func (h *AnnouncementHandler) CronLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}

	query := database.DB.Model(&model.CronLog{})
	if job := c.Query("job"); job != "" {
		query = query.Where("job = ?", job)
	}

	var total int64
	query.Count(&total)

	var logs []model.CronLog
	query.Order("processed_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&logs)

	c.JSON(http.StatusOK, gin.H{
		"items":    logs,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}
