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

type FinanceHandler struct{}

func NewFinanceHandler() *FinanceHandler {
	return &FinanceHandler{}
}

// GET /api/dashboard/finance
func (h *FinanceHandler) UserFinance(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var user model.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	// Summary stats
	var totalRecharge, totalSpend float64
	database.DB.Model(&model.Transaction{}).
		Where("user_id = ? AND type = ? AND amount > 0", userID, "RECHARGE").
		Select("COALESCE(SUM(amount), 0)").Scan(&totalRecharge)
	database.DB.Model(&model.Transaction{}).
		Where("user_id = ? AND amount < 0", userID).
		Select("COALESCE(SUM(amount), 0)").Scan(&totalSpend)

	c.JSON(http.StatusOK, gin.H{
		"balance":       user.Balance,
		"totalRecharge": totalRecharge,
		"totalSpend":    -totalSpend,
	})
}

// GET /api/dashboard/transactions
func (h *FinanceHandler) UserTransactions(c *gin.Context) {
	userID := middleware.GetUserID(c)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 20
	}

	query := database.DB.Model(&model.Transaction{}).Where("user_id = ?", userID)

	if txType := c.Query("type"); txType != "" {
		query = query.Where("type = ?", txType)
	}

	var total int64
	query.Count(&total)

	var transactions []model.Transaction
	query.Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&transactions)

	c.JSON(http.StatusOK, gin.H{
		"transactions": transactions,
		"total":        total,
		"page":         page,
		"pageSize":     pageSize,
		"totalPages":   int(math.Ceil(float64(total) / float64(pageSize))),
	})
}
