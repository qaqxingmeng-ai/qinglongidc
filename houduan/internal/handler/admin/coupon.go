package admin

import (
	"crypto/rand"
	"encoding/json"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type CouponHandler struct{}

func NewCouponHandler() *CouponHandler {
	return &CouponHandler{}
}

// GET /api/admin/coupons
func (h *CouponHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := database.DB.Model(&model.Coupon{})
	if t := c.Query("type"); t != "" {
		q = q.Where("type = ?", t)
	}
	if active := c.Query("isActive"); active != "" {
		q = q.Where("is_active = ?", active == "true")
	}
	if search := c.Query("search"); search != "" {
		like := "%" + search + "%"
		q = q.Where("code LIKE ? OR name LIKE ?", like, like)
	}

	var total int64
	q.Count(&total)

	var coupons []model.Coupon
	q.Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&coupons)

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
		"coupons": coupons,
		"total":   total,
		"page":    page,
	}})
}

// POST /api/admin/coupons
func (h *CouponHandler) Create(c *gin.Context) {
	adminID := middleware.GetUserID(c)

	var req struct {
		Code           string  `json:"code" binding:"required"`
		Name           string  `json:"name" binding:"required"`
		Type           string  `json:"type" binding:"required"`
		Value          float64 `json:"value" binding:"required"`
		MinOrderAmount float64 `json:"minOrderAmount"`
		MaxDiscount    float64 `json:"maxDiscount"`
		StartAt        string  `json:"startAt" binding:"required"`
		EndAt          string  `json:"endAt" binding:"required"`
		TotalCount     int     `json:"totalCount"`
		PerUserLimit   int     `json:"perUserLimit"`
		Scope          string  `json:"scope"`
		ScopeIds       []string `json:"scopeIds"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if req.Type != "PERCENTAGE" && req.Type != "FIXED" && req.Type != "RENEWAL" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "优惠类型无效"})
		return
	}
	if req.Type == "PERCENTAGE" && (req.Value <= 0 || req.Value >= 1) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "折扣率须在 0.01 ~ 0.99 之间"})
		return
	}
	startAt, err1 := time.Parse(time.RFC3339, req.StartAt)
	endAt, err2 := time.Parse(time.RFC3339, req.EndAt)
	if err1 != nil || err2 != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "时间格式错误，请使用 RFC3339"})
		return
	}
	scope := req.Scope
	if scope == "" {
		scope = "ALL"
	}
	if scope != "ALL" && scope != "REGION" && scope != "PRODUCT" && scope != "FIRST_ORDER" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "适用范围无效"})
		return
	}
	totalCount := req.TotalCount
	if totalCount == 0 {
		totalCount = -1
	}
	perUserLimit := req.PerUserLimit
	if perUserLimit < 1 {
		perUserLimit = 1
	}
	scopeIdsJSON := "[]"
	if len(req.ScopeIds) > 0 {
		b, _ := json.Marshal(req.ScopeIds)
		scopeIdsJSON = string(b)
	}

	// Ensure code is uppercase
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	var existing model.Coupon
	if err := database.DB.First(&existing, "code = ?", code).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "优惠码已存在"})
		return
	}

	coupon := model.Coupon{
		ID:             service.GenerateID(),
		Code:           code,
		Name:           req.Name,
		Type:           req.Type,
		Value:          req.Value,
		MinOrderAmount: req.MinOrderAmount,
		MaxDiscount:    req.MaxDiscount,
		StartAt:        startAt,
		EndAt:          endAt,
		TotalCount:     totalCount,
		PerUserLimit:   perUserLimit,
		IsActive:       true,
		Scope:          scope,
		ScopeIds:       scopeIdsJSON,
		CreatedBy:      adminID,
	}
	if err := database.DB.Create(&coupon).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": coupon})
}

// PUT /api/admin/coupons/:id
func (h *CouponHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var coupon model.Coupon
	if err := database.DB.First(&coupon, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "优惠券不存在"})
		return
	}

	var req struct {
		Name           *string  `json:"name"`
		Type           *string  `json:"type"`
		Value          *float64 `json:"value"`
		MinOrderAmount *float64 `json:"minOrderAmount"`
		MaxDiscount    *float64 `json:"maxDiscount"`
		StartAt        *string  `json:"startAt"`
		EndAt          *string  `json:"endAt"`
		TotalCount     *int     `json:"totalCount"`
		PerUserLimit   *int     `json:"perUserLimit"`
		Scope          *string  `json:"scope"`
		ScopeIds       []string `json:"scopeIds"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Type != nil {
		updates["type"] = *req.Type
	}
	if req.Value != nil {
		updates["value"] = *req.Value
	}
	if req.MinOrderAmount != nil {
		updates["min_order_amount"] = *req.MinOrderAmount
	}
	if req.MaxDiscount != nil {
		updates["max_discount"] = *req.MaxDiscount
	}
	if req.StartAt != nil {
		t, err := time.Parse(time.RFC3339, *req.StartAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "startAt 格式错误"})
			return
		}
		updates["start_at"] = t
	}
	if req.EndAt != nil {
		t, err := time.Parse(time.RFC3339, *req.EndAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "endAt 格式错误"})
			return
		}
		updates["end_at"] = t
	}
	if req.TotalCount != nil {
		updates["total_count"] = *req.TotalCount
	}
	if req.PerUserLimit != nil {
		updates["per_user_limit"] = *req.PerUserLimit
	}
	if req.Scope != nil {
		updates["scope"] = *req.Scope
	}
	if req.ScopeIds != nil {
		b, _ := json.Marshal(req.ScopeIds)
		updates["scope_ids"] = string(b)
	}
	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无更新内容"})
		return
	}
	database.DB.Model(&coupon).Updates(updates)
	database.DB.First(&coupon, "id = ?", id)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": coupon})
}

// PATCH /api/admin/coupons/:id/toggle
func (h *CouponHandler) Toggle(c *gin.Context) {
	id := c.Param("id")
	var coupon model.Coupon
	if err := database.DB.First(&coupon, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "优惠券不存在"})
		return
	}
	newState := !coupon.IsActive
	database.DB.Model(&coupon).Update("is_active", newState)
	// If deactivating, expire all UNUSED user coupons for this coupon
	if !newState {
		database.DB.Model(&model.UserCoupon{}).
			Where("coupon_id = ? AND status = ?", id, "UNUSED").
			Update("status", "EXPIRED")
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"isActive": newState}})
}

// DELETE /api/admin/coupons/:id
func (h *CouponHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	var coupon model.Coupon
	if err := database.DB.First(&coupon, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "优惠券不存在"})
		return
	}
	// Only allow delete if no one has redeemed it
	var usedCount int64
	database.DB.Model(&model.UserCoupon{}).Where("coupon_id = ? AND status = ?", id, "USED").Count(&usedCount)
	if usedCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "该优惠券已有使用记录，无法删除"})
		return
	}
	database.DB.Where("coupon_id = ?", id).Delete(&model.UserCoupon{})
	database.DB.Delete(&coupon)
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /api/admin/coupons/:id/generate-codes
func (h *CouponHandler) GenerateCodes(c *gin.Context) {
	id := c.Param("id")
	var template model.Coupon
	if err := database.DB.First(&template, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "优惠券不存在"})
		return
	}
	adminID := middleware.GetUserID(c)

	var req struct {
		Count  int    `json:"count" binding:"required,min=1,max=500"`
		Prefix string `json:"prefix"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误，count 须在 1~500 之间"})
		return
	}

	prefix := strings.ToUpper(strings.TrimSpace(req.Prefix))
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

	var created []model.Coupon
	maxAttempts := req.Count * 20
	attempts := 0
	for len(created) < req.Count && attempts < maxAttempts {
		attempts++
		suffix := make([]byte, 8)
		for i := range suffix {
			n, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "生成优惠码失败"})
				return
			}
			suffix[i] = charset[n.Int64()]
		}
		code := prefix + string(suffix)
		var exists model.Coupon
		if err := database.DB.Select("id").First(&exists, "code = ?", code).Error; err == nil {
			continue // collision, retry
		}
		coupon := model.Coupon{
			ID:             service.GenerateID(),
			Code:           code,
			Name:           template.Name,
			Type:           template.Type,
			Value:          template.Value,
			MinOrderAmount: template.MinOrderAmount,
			MaxDiscount:    template.MaxDiscount,
			StartAt:        template.StartAt,
			EndAt:          template.EndAt,
			TotalCount:     1,
			PerUserLimit:   1,
			IsActive:       true,
			Scope:          template.Scope,
			ScopeIds:       template.ScopeIds,
			CreatedBy:      adminID,
		}
		if err := database.DB.Create(&coupon).Error; err == nil {
			created = append(created, coupon)
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
		"created": len(created),
		"codes":   created,
	}})
}

// GET /api/admin/coupons/:id/usage
func (h *CouponHandler) GetUsage(c *gin.Context) {
	id := c.Param("id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	var coupon model.Coupon
	if err := database.DB.First(&coupon, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "优惠券不存在"})
		return
	}

	var total int64
	database.DB.Model(&model.UserCoupon{}).Where("coupon_id = ?", id).Count(&total)

	var records []model.UserCoupon
	database.DB.Where("coupon_id = ?", id).
		Preload("User").
		Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&records)

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
		"coupon":  coupon,
		"records": records,
		"total":   total,
		"page":    page,
	}})
}
