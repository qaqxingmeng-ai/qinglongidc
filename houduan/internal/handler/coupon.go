package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type CouponHandler struct{}

var errPerUserCouponLimitReached = errors.New("per-user coupon limit reached")

func NewCouponHandler() *CouponHandler {
	return &CouponHandler{}
}

func countUserCouponClaims(tx *gorm.DB, userID, couponID string) (int64, error) {
	var count int64
	if err := tx.Model(&model.UserCoupon{}).
		Where("user_id = ? AND coupon_id = ?", userID, couponID).
		Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

// GET /api/dashboard/coupons?status=UNUSED|USED|EXPIRED&page=1
func (h *CouponHandler) GetMyCoupons(c *gin.Context) {
	userID := middleware.GetUserID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := database.DB.Model(&model.UserCoupon{}).Where("user_id = ?", userID)
	if status := c.Query("status"); status != "" {
		q = q.Where("status = ?", status)
	}

	var total int64
	q.Count(&total)

	var userCoupons []model.UserCoupon
	q.Preload("Coupon").
		Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&userCoupons)

	// Lazily mark expired coupons in response
	now := time.Now()
	for i := range userCoupons {
		if userCoupons[i].Status == "UNUSED" && userCoupons[i].Coupon.EndAt.Before(now) {
			userCoupons[i].Status = "EXPIRED"
			database.DB.Model(&userCoupons[i]).Update("status", "EXPIRED")
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
		"coupons": userCoupons,
		"total":   total,
		"page":    page,
	}})
}

// POST /api/dashboard/coupons/redeem
// Body: { "code": "SUMMER2024" }
func (h *CouponHandler) Redeem(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入兑换码"})
		return
	}

	code := strings.ToUpper(strings.TrimSpace(req.Code))
	now := time.Now()

	var coupon model.Coupon
	if err := database.DB.First(&coupon, "code = ?", code).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "兑换码不存在"})
		return
	}
	if !coupon.IsActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该优惠券已停用"})
		return
	}
	if now.Before(coupon.StartAt) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该优惠券尚未生效"})
		return
	}
	if now.After(coupon.EndAt) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该优惠券已过期"})
		return
	}
	if coupon.TotalCount != -1 && coupon.UsedCount >= coupon.TotalCount {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该优惠券已被领完"})
		return
	}

	// Check per-user limit
	userCount, err := countUserCouponClaims(database.DB, userID, coupon.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "领取失败，请重试"})
		return
	}
	if int(userCount) >= coupon.PerUserLimit {
		c.JSON(http.StatusConflict, gin.H{"error": "已达到该优惠券的个人领取上限"})
		return
	}

	var userCoupon model.UserCoupon
	txErr := database.DB.Transaction(func(tx *gorm.DB) error {
		// Re-check totalCount inside transaction
		var latestCoupon model.Coupon
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&latestCoupon, "id = ?", coupon.ID).Error; err != nil {
			return err
		}
		if latestCoupon.TotalCount != -1 && latestCoupon.UsedCount >= latestCoupon.TotalCount {
			return gorm.ErrRecordNotFound
		}
		claimCount, err := countUserCouponClaims(tx, userID, coupon.ID)
		if err != nil {
			return err
		}
		if int(claimCount) >= latestCoupon.PerUserLimit {
			return errPerUserCouponLimitReached
		}
		userCoupon = model.UserCoupon{
			ID:       service.GenerateID(),
			UserID:   userID,
			CouponID: coupon.ID,
			Status:   "UNUSED",
		}
		if err := tx.Create(&userCoupon).Error; err != nil {
			return err
		}
		if err := tx.Model(&latestCoupon).Update("used_count", latestCoupon.UsedCount+1).Error; err != nil {
			return err
		}
		return nil
	})
	if txErr == gorm.ErrRecordNotFound {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该优惠券已被领完"})
		return
	}
	if txErr == errPerUserCouponLimitReached {
		c.JSON(http.StatusConflict, gin.H{"error": "已达到该优惠券的个人领取上限"})
		return
	}
	if txErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "领取失败，请重试"})
		return
	}

	database.DB.Preload("Coupon").First(&userCoupon, "id = ?", userCoupon.ID)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": userCoupon})
}

// GET /api/dashboard/coupons/applicable?total=500&productIds=id1,id2
func (h *CouponHandler) GetApplicable(c *gin.Context) {
	userID := middleware.GetUserID(c)

	totalStr := c.Query("total")
	total, _ := strconv.ParseFloat(totalStr, 64)
	productIdsStr := c.Query("productIds")
	var productIds []string
	if productIdsStr != "" {
		productIds = strings.Split(productIdsStr, ",")
	}

	now := time.Now()

	// Load user's UNUSED coupons with their coupon data
	var userCoupons []model.UserCoupon
	database.DB.Where("user_id = ? AND status = ?", userID, "UNUSED").
		Preload("Coupon").
		Find(&userCoupons)

	// Load product regions if productIds provided
	regionsByProductID := map[string]string{}
	if len(productIds) > 0 {
		var products []model.Product
		database.DB.Select("id, region").Where("id IN ?", productIds).Find(&products)
		for _, p := range products {
			regionsByProductID[p.ID] = p.Region
		}
	}

	type ApplicableCoupon struct {
		model.UserCoupon
		Discount float64 `json:"discount"`
	}

	var result []ApplicableCoupon
	for _, uc := range userCoupons {
		cp := uc.Coupon
		// Validity checks
		if !cp.IsActive {
			continue
		}
		if now.Before(cp.StartAt) || now.After(cp.EndAt) {
			continue
		}
		if total > 0 && total < cp.MinOrderAmount {
			continue
		}

		// Scope checks
		switch cp.Scope {
		case "REGION":
			if len(productIds) == 0 {
				continue
			}
			var scopeIds []string
			if err := json.Unmarshal([]byte(cp.ScopeIds), &scopeIds); err != nil || len(scopeIds) == 0 {
				continue
			}
			allowed := map[string]bool{}
			for _, r := range scopeIds {
				allowed[r] = true
			}
			match := false
			for _, pid := range productIds {
				if allowed[regionsByProductID[pid]] {
					match = true
					break
				}
			}
			if !match {
				continue
			}
		case "PRODUCT":
			if len(productIds) == 0 {
				continue
			}
			var scopeIds []string
			if err := json.Unmarshal([]byte(cp.ScopeIds), &scopeIds); err != nil || len(scopeIds) == 0 {
				continue
			}
			allowed := map[string]bool{}
			for _, pid := range scopeIds {
				allowed[pid] = true
			}
			match := false
			for _, pid := range productIds {
				if allowed[pid] {
					match = true
					break
				}
			}
			if !match {
				continue
			}
		case "FIRST_ORDER":
			var paidOrders int64
			database.DB.Model(&model.Order{}).
				Where("user_id = ? AND status IN ?", userID, []string{"PAID", "COMPLETED"}).
				Count(&paidOrders)
			if paidOrders > 0 {
				continue
			}
		}

		// Calculate discount amount
		var discount float64
		switch cp.Type {
		case "PERCENTAGE":
			discount = total * cp.Value
		case "FIXED", "RENEWAL":
			discount = cp.Value
		}
		if cp.MaxDiscount > 0 && discount > cp.MaxDiscount {
			discount = cp.MaxDiscount
		}
		if discount > total {
			discount = total
		}

		result = append(result, ApplicableCoupon{
			UserCoupon: uc,
			Discount:   discount,
		})
	}

	// Sort by discount descending (inline bubble sort for small lists)
	for i := 0; i < len(result); i++ {
		for j := i + 1; j < len(result); j++ {
			if result[j].Discount > result[i].Discount {
				result[i], result[j] = result[j], result[i]
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
