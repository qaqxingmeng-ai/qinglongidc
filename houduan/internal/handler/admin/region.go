package admin

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

type RegionHandler struct{}

func NewRegionHandler() *RegionHandler {
	return &RegionHandler{}
}

// GET /api/admin/regions
func (h *RegionHandler) List(c *gin.Context) {
	var regions []model.RegionInfo
	database.DB.Order("sort_order ASC, region ASC").Find(&regions)
	c.JSON(http.StatusOK, regions)
}

// POST /api/admin/regions
func (h *RegionHandler) Create(c *gin.Context) {
	var req struct {
		Region      string `json:"region" binding:"required"`
		Description string `json:"description"`
		SortOrder   int    `json:"sortOrder"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "region 字段不能为空"})
		return
	}

	region := strings.TrimSpace(req.Region)
	if region == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "region 不能为空"})
		return
	}

	// Check duplicate
	var count int64
	database.DB.Model(&model.RegionInfo{}).Where("region = ?", region).Count(&count)
	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "该区域已存在"})
		return
	}

	r := model.RegionInfo{
		Region:      region,
		Description: strings.TrimSpace(req.Description),
		SortOrder:   req.SortOrder,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	if err := database.DB.Create(&r).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建失败"})
		return
	}

	c.JSON(http.StatusOK, r)
}

// PUT /api/admin/regions/:region
func (h *RegionHandler) Update(c *gin.Context) {
	regionKey := c.Param("region")

	var req struct {
		Description string `json:"description"`
		SortOrder   int    `json:"sortOrder"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式错误"})
		return
	}

	result := database.DB.Model(&model.RegionInfo{}).Where("region = ?", regionKey).Updates(map[string]interface{}{
		"description": strings.TrimSpace(req.Description),
		"sort_order":  req.SortOrder,
		"updated_at":  time.Now(),
	})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "区域不存在"})
		return
	}

	var updated model.RegionInfo
	database.DB.Where("region = ?", regionKey).First(&updated)
	c.JSON(http.StatusOK, updated)
}

// DELETE /api/admin/regions/:region
func (h *RegionHandler) Delete(c *gin.Context) {
	regionKey := c.Param("region")

	// Check for products using this region
	var productCount int64
	database.DB.Model(&model.Product{}).Where("region = ?", regionKey).Count(&productCount)
	if productCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "该区域下还有商品，无法删除"})
		return
	}

	result := database.DB.Where("region = ?", regionKey).Delete(&model.RegionInfo{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "区域不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
