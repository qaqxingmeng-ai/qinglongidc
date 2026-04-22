package handler

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type ServerTagHandler struct{}

var allowedTagColors = map[string]bool{
	"blue":   true,
	"green":  true,
	"red":    true,
	"orange": true,
	"purple": true,
	"cyan":   true,
	"gray":   true,
	"yellow": true,
}

func NewServerTagHandler() *ServerTagHandler {
	return &ServerTagHandler{}
}

// GET /api/dashboard/server-tags
func (h *ServerTagHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var tags []model.ServerTag
	database.DB.Where("user_id = ?", userID).Order("sort_order ASC, created_at ASC").Find(&tags)

	c.JSON(http.StatusOK, gin.H{"tags": tags})
}

// POST /api/dashboard/server-tags
func (h *ServerTagHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var req struct {
		Name      string `json:"name"`
		Color     string `json:"color"`
		SortOrder int    `json:"sortOrder"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if len(name) == 0 || len([]rune(name)) > 30 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "标签名称长度需在 1-30 之间"})
		return
	}

	color := strings.ToLower(strings.TrimSpace(req.Color))
	if !allowedTagColors[color] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "标签颜色不合法"})
		return
	}

	var dup int64
	database.DB.Model(&model.ServerTag{}).Where("user_id = ? AND name = ?", userID, name).Count(&dup)
	if dup > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "标签名称已存在"})
		return
	}

	tag := model.ServerTag{
		ID:        service.GenerateID(),
		UserID:    userID,
		Name:      name,
		Color:     color,
		SortOrder: req.SortOrder,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := database.DB.Create(&tag).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建标签失败"})
		return
	}

	c.JSON(http.StatusOK, tag)
}

// PUT /api/dashboard/server-tags/:id
func (h *ServerTagHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")

	var req struct {
		Name      string `json:"name"`
		Color     string `json:"color"`
		SortOrder int    `json:"sortOrder"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if len(name) == 0 || len([]rune(name)) > 30 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "标签名称长度需在 1-30 之间"})
		return
	}

	color := strings.ToLower(strings.TrimSpace(req.Color))
	if !allowedTagColors[color] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "标签颜色不合法"})
		return
	}

	var dup int64
	database.DB.Model(&model.ServerTag{}).
		Where("user_id = ? AND name = ? AND id <> ?", userID, name, id).
		Count(&dup)
	if dup > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "标签名称已存在"})
		return
	}

	result := database.DB.Model(&model.ServerTag{}).
		Where("id = ? AND user_id = ?", id, userID).
		Updates(map[string]interface{}{
			"name":       name,
			"color":      color,
			"sort_order": req.SortOrder,
			"updated_at": time.Now(),
		})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "标签不存在"})
		return
	}

	var tag model.ServerTag
	database.DB.Where("id = ?", id).First(&tag)
	c.JSON(http.StatusOK, tag)
}

// DELETE /api/dashboard/server-tags/:id
func (h *ServerTagHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")

	tx := database.DB.Begin()
	if err := tx.Where("server_id IN (SELECT id FROM server_instances WHERE user_id = ?) AND tag_id = ?", userID, id).
		Delete(&model.ServerTagRelation{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除标签失败"})
		return
	}

	result := tx.Where("id = ? AND user_id = ?", id, userID).Delete(&model.ServerTag{})
	if result.RowsAffected == 0 {
		tx.Rollback()
		c.JSON(http.StatusNotFound, gin.H{"error": "标签不存在"})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除标签失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// PUT /api/dashboard/servers/:id/tags
func (h *ServerTagHandler) SetServerTags(c *gin.Context) {
	userID := middleware.GetUserID(c)
	serverID := c.Param("id")

	var req struct {
		TagIDs []string `json:"tagIds"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if len(req.TagIDs) > 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "每台服务器最多 5 个标签"})
		return
	}

	var server model.ServerInstance
	if err := database.DB.Where("id = ? AND user_id = ?", serverID, userID).First(&server).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "服务器不存在"})
		return
	}

	normalized := make([]string, 0, len(req.TagIDs))
	seen := map[string]bool{}
	for _, id := range req.TagIDs {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		normalized = append(normalized, id)
	}

	if len(normalized) > 0 {
		var count int64
		database.DB.Model(&model.ServerTag{}).
			Where("user_id = ? AND id IN ?", userID, normalized).
			Count(&count)
		if int(count) != len(normalized) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "标签不存在或不属于当前用户"})
			return
		}
	}

	now := time.Now()
	tx := database.DB.Begin()
	if err := tx.Where("server_id = ?", serverID).Delete(&model.ServerTagRelation{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新标签失败"})
		return
	}
	for _, tagID := range normalized {
		relation := model.ServerTagRelation{ServerID: serverID, TagID: tagID, CreatedAt: now}
		if err := tx.Create(&relation).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "更新标签失败"})
			return
		}
	}
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新标签失败"})
		return
	}

	var tags []model.ServerTag
	if len(normalized) > 0 {
		database.DB.Where("user_id = ? AND id IN ?", userID, normalized).Find(&tags)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "tags": tags})
}

func ParseTagFilter(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := map[string]bool{}
	for _, p := range parts {
		id := strings.TrimSpace(p)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

func ParseTagMode(raw string) string {
	mode := strings.ToUpper(strings.TrimSpace(raw))
	if mode == "AND" {
		return "AND"
	}
	return "OR"
}
