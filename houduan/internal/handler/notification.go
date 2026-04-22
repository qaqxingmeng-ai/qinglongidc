package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type NotificationHandler struct{}

// GET /api/dashboard/notifications
func (h *NotificationHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.Notification{}).Where("user_id = ?", userID)

	if notifType := c.Query("type"); notifType != "" {
		query = query.Where("type = ?", notifType)
	}
	if isRead := c.Query("isRead"); isRead != "" {
		val, _ := strconv.ParseBool(isRead)
		query = query.Where("is_read = ?", val)
	}

	var total int64
	query.Count(&total)

	var notifications []model.Notification
	query.Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&notifications)

	// unread count
	var unreadCount int64
	database.DB.Model(&model.Notification{}).Where("user_id = ? AND is_read = false", userID).Count(&unreadCount)

	c.JSON(http.StatusOK, gin.H{
		"items":       notifications,
		"total":       total,
		"unreadCount": unreadCount,
	})
}

// POST /api/dashboard/notifications/read-all
func (h *NotificationHandler) ReadAll(c *gin.Context) {
	userID := middleware.GetUserID(c)
	database.DB.Model(&model.Notification{}).Where("user_id = ? AND is_read = false", userID).Update("is_read", true)
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// PATCH /api/dashboard/notifications/:id/read
func (h *NotificationHandler) MarkRead(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")
	result := database.DB.Model(&model.Notification{}).
		Where("id = ? AND user_id = ?", id, userID).
		Update("is_read", true)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "通知不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GET /api/dashboard/notifications/unread-count
func (h *NotificationHandler) UnreadCount(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var count int64
	database.DB.Model(&model.Notification{}).Where("user_id = ? AND is_read = false", userID).Count(&count)
	c.JSON(http.StatusOK, gin.H{"count": count})
}

// SendNotification creates a notification record. Used internally by other handlers.
func SendNotification(userID, notifType, title, content string, relatedID, relatedType *string) {
	_, _ = service.CreateNotification(userID, notifType, title, content, relatedID, relatedType)
}
