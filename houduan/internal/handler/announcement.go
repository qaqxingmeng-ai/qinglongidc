package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

type AnnouncementHandler struct{}

func NewAnnouncementHandler() *AnnouncementHandler {
	return &AnnouncementHandler{}
}

// GET /api/announcements/active
// Returns active announcements filtered by type (optional query param).
// Respects startAt/endAt window. No auth required.
func (h *AnnouncementHandler) Active(c *gin.Context) {
	now := time.Now()

	query := database.DB.Model(&model.Announcement{}).
		Where("is_active = true").
		Where("(start_at IS NULL OR start_at <= ?)", now).
		Where("(end_at IS NULL OR end_at >= ?)", now)

	if t := c.Query("type"); t != "" {
		query = query.Where("type = ?", t)
	}

	var items []model.Announcement
	query.Order("priority DESC, created_at DESC").Limit(20).Find(&items)

	c.JSON(http.StatusOK, gin.H{"items": items})
}
