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

type FavoriteHandler struct{}

func NewFavoriteHandler() *FavoriteHandler {
	return &FavoriteHandler{}
}

// GET /api/dashboard/favorites
func (h *FavoriteHandler) GetFavorites(c *gin.Context) {
	userID := middleware.GetUserID(c)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	var total int64
	database.DB.Model(&model.ProductFavorite{}).Where("user_id = ?", userID).Count(&total)

	var favorites []model.ProductFavorite
	if err := database.DB.
		Preload("Product").
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&favorites).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":     favorites,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// POST /api/dashboard/favorites
func (h *FavoriteHandler) AddFavorite(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var req struct {
		ProductID string `json:"productId" binding:"required,max=30"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	// Verify product exists
	var product model.Product
	if err := database.DB.First(&product, "id = ?", req.ProductID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "产品不存在"})
		return
	}

	// Check count limit
	var count int64
	database.DB.Model(&model.ProductFavorite{}).Where("user_id = ?", userID).Count(&count)
	if count >= model.MaxFavoritesPerUser {
		c.JSON(http.StatusConflict, gin.H{"error": "收藏数量已达上限（50个）"})
		return
	}

	// Check already favorited
	var existing model.ProductFavorite
	if err := database.DB.Where("user_id = ? AND product_id = ?", userID, req.ProductID).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "已收藏该产品"})
		return
	}

	fav := model.ProductFavorite{
		ID:        service.GenerateID(),
		UserID:    userID,
		ProductID: req.ProductID,
	}
	if err := database.DB.Create(&fav).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "收藏失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": fav})
}

// DELETE /api/dashboard/favorites/:productId
func (h *FavoriteHandler) RemoveFavorite(c *gin.Context) {
	userID := middleware.GetUserID(c)
	productID := c.Param("productId")
	if len(productID) > 30 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	result := database.DB.Where("user_id = ? AND product_id = ?", userID, productID).Delete(&model.ProductFavorite{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "取消收藏失败"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "收藏记录不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": nil})
}

// GET /api/dashboard/favorites/:productId/check
func (h *FavoriteHandler) IsFavorite(c *gin.Context) {
	userID := middleware.GetUserID(c)
	productID := c.Param("productId")
	if len(productID) > 30 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var fav model.ProductFavorite
	err := database.DB.Where("user_id = ? AND product_id = ?", userID, productID).First(&fav).Error
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"isFavorited": false})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"isFavorited": true,
		"favoritedAt": fav.CreatedAt,
	})
}
