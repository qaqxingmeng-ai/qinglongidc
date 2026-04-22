package admin

import (
	"math"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

type LogHandler struct{}

func NewLogHandler() *LogHandler {
	return &LogHandler{}
}

// GET /api/admin/logs
func (h *LogHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}

	query := database.DB.Model(&model.UserLog{})

	if event := c.Query("event"); event != "" {
		query = query.Where("event = ?", event)
	}
	if userID := c.Query("userId"); userID != "" {
		query = query.Where("user_id = ?", userID)
	}

	var total int64
	query.Count(&total)

	var logs []model.UserLog
	query.Preload("User").
		Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&logs)

	c.JSON(http.StatusOK, gin.H{
		"logs":       logs,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// GET /api/admin/logs/events
func (h *LogHandler) Events(c *gin.Context) {
	var events []string
	database.DB.Model(&model.UserLog{}).Distinct("event").Pluck("event", &events)
	c.JSON(http.StatusOK, gin.H{"events": events})
}
