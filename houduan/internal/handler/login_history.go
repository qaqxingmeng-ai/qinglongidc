package handler

import (
	"math"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
)

// GET /api/dashboard/login-history
func LoginHistoryList(c *gin.Context) {
	userID := middleware.GetUserID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 20
	}

	var total int64
	database.DB.Model(&model.LoginHistory{}).Where("user_id = ?", userID).Count(&total)

	var records []model.LoginHistory
	database.DB.Where("user_id = ?", userID).
		Order("login_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&records)

	c.JSON(http.StatusOK, gin.H{
		"records":    records,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": int(math.Ceil(float64(total) / float64(pageSize))),
	})
}
