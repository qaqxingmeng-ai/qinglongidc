package handler

import (
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

// GET /api/dashboard/points
func PointsInfo(c *gin.Context) {
	userID := middleware.GetUserID(c)
	up := service.GetOrInitPoints(database.DB, userID)
	c.JSON(http.StatusOK, gin.H{"points": up})
}

// POST /api/dashboard/checkin
func Checkin(c *gin.Context) {
	userID := middleware.GetUserID(c)
	pts, err := service.Checkin(database.DB, userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	up := service.GetOrInitPoints(database.DB, userID)
	c.JSON(http.StatusOK, gin.H{
		"earned":  pts,
		"message": "签到成功，获得 " + strconv.Itoa(pts) + " 积分",
		"points":  up,
	})
}

// GET /api/dashboard/points/history
func PointsHistory(c *gin.Context) {
	userID := middleware.GetUserID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.PointsTransaction{}).Where("user_id = ?", userID)
	if txType := c.Query("type"); txType != "" {
		query = query.Where("type = ?", txType)
	}

	var total int64
	query.Count(&total)

	var records []model.PointsTransaction
	query.Order("created_at DESC").
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

// GET /api/dashboard/checkin/calendar?month=2026-04
func CheckinCalendar(c *gin.Context) {
	userID := middleware.GetUserID(c)
	monthStr := c.DefaultQuery("month", time.Now().Format("2006-01"))
	t, err := time.Parse("2006-01", monthStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month"})
		return
	}
	start := t
	end := t.AddDate(0, 1, 0)

	var records []model.PointsTransaction
	database.DB.Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ?",
		userID, "CHECKIN", start, end).
		Order("created_at ASC").
		Find(&records)

	days := make([]string, 0, len(records))
	for _, r := range records {
		days = append(days, r.CreatedAt.Format("2006-01-02"))
	}

	up := service.GetOrInitPoints(database.DB, userID)
	c.JSON(http.StatusOK, gin.H{
		"checkedDays":   days,
		"streak":        up.CheckinStreak,
		"lastCheckinAt": up.LastCheckinAt,
	})
}

// GET /api/dashboard/points/shop - List coupons available for points redemption
func PointsShop(c *gin.Context) {
	userID := middleware.GetUserID(c)
	now := time.Now()

	var coupons []model.Coupon
	database.DB.
		Where("is_active = ? AND points_required > 0 AND start_at <= ? AND end_at >= ?", true, now, now).
		Order("created_at DESC").
		Find(&coupons)

	up := service.GetOrInitPoints(database.DB, userID)

	type CouponResp struct {
		model.Coupon
		CanRedeem bool `json:"canRedeem"`
	}
	var resp []CouponResp
	for _, cp := range coupons {
		cr := CouponResp{Coupon: cp}
		cr.CanRedeem = up.Points >= cp.PointsRequired && (cp.TotalCount <= 0 || cp.UsedCount < cp.TotalCount)
		resp = append(resp, cr)
	}

	c.JSON(http.StatusOK, gin.H{
		"coupons": resp,
		"userPoints": up.Points,
	})
}

// POST /api/dashboard/points/redeem - Redeem a coupon using points
func PointsRedeem(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var req struct {
		CouponID string `json:"couponId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	// Execute in a transaction
	txErr := database.DB.Transaction(func(tx *gorm.DB) error {
		return service.RedeemCoupon(tx, userID, req.CouponID)
	})

	if txErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "兑换失败，请重试"})
		return
	}

	up := service.GetOrInitPoints(database.DB, userID)
	c.JSON(http.StatusOK, gin.H{
		"message": "兑换成功",
		"points":  up,
	})
}
