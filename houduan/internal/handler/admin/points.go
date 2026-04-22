package admin

import (
	"math"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type PointsAdminHandler struct{}

func NewPointsAdminHandler() *PointsAdminHandler {
	return &PointsAdminHandler{}
}

// GET /api/admin/points
func (h *PointsAdminHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.UserPoints{})
	if search := c.Query("search"); search != "" {
		s := "%" + search + "%"
		query = query.Joins("JOIN users ON users.id = user_points.user_id").
			Where("users.email ILIKE ? OR users.name ILIKE ?", s, s)
	}

	var total int64
	query.Count(&total)

	var records []model.UserPoints
	query.Preload("User").Order("points DESC").
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

// POST /api/admin/points/adjust
func (h *PointsAdminHandler) Adjust(c *gin.Context) {
	adminID := middleware.GetUserID(c)

	var req struct {
		UserID string `json:"userId" binding:"required"`
		Amount int    `json:"amount" binding:"required"`
		Note   string `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	note := req.Note
	if note == "" {
		note = "管理员调整"
	}

	if req.Amount > 0 {
		if err := service.EarnPoints(database.DB, req.UserID, req.Amount, "ADMIN_ADJUST", note, &adminID, nil); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "调整失败"})
			return
		}
	} else if req.Amount < 0 {
		if err := service.SpendPoints(database.DB, req.UserID, -req.Amount, note, &adminID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	up := service.GetOrInitPoints(database.DB, req.UserID)
	c.JSON(http.StatusOK, gin.H{"success": true, "points": up})
}
