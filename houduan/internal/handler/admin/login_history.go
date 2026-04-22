package admin

import (
	"math"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

type LoginHistoryAdminHandler struct{}

func NewLoginHistoryAdminHandler() *LoginHistoryAdminHandler {
	return &LoginHistoryAdminHandler{}
}

// GET /api/admin/login-history
func (h *LoginHistoryAdminHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.LoginHistory{})

	if userID := c.Query("userId"); userID != "" {
		query = query.Where("user_id = ?", userID)
	}
	if email := c.Query("email"); email != "" {
		query = query.Where("email ILIKE ?", "%"+email+"%")
	}
	if ip := c.Query("ip"); ip != "" {
		query = query.Where("ip LIKE ?", ip+"%")
	}
	if success := c.Query("success"); success == "true" {
		query = query.Where("is_successful = true")
	} else if success == "false" {
		query = query.Where("is_successful = false")
	}

	var total int64
	query.Count(&total)

	var records []model.LoginHistory
	query.Order("login_at DESC").
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
