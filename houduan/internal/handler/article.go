package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

// GET /api/docs/categories
func DocCategoryList(c *gin.Context) {
	var cats []model.ArticleCategory
	database.DB.Where("parent_id IS NULL").
		Order("sort_order ASC, name ASC").
		Preload("Children").
		Find(&cats)
	c.JSON(http.StatusOK, gin.H{"categories": cats})
}

// GET /api/docs/articles
func DocArticleList(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 20
	}
	category := c.Query("category") // slug
	search := c.Query("q")

	q := database.DB.Model(&model.Article{}).Where("is_published = true")
	if category != "" {
		var cat model.ArticleCategory
		if err := database.DB.First(&cat, "slug = ?", category).Error; err == nil {
			q = q.Where("category_id = ?", cat.ID)
		}
	}
	if search != "" {
		q = q.Where("title ILIKE ? OR content ILIKE ?", "%"+search+"%", "%"+search+"%")
	}

	var total int64
	q.Count(&total)

	var articles []model.Article
	q.Select("id,title,slug,category_id,tags,view_count,helpful_count,not_helpful_count,sort_order,created_at,updated_at").
		Order("sort_order ASC, created_at DESC").
		Offset((page-1)*pageSize).Limit(pageSize).
		Preload("Category").
		Find(&articles)

	c.JSON(http.StatusOK, gin.H{"articles": articles, "total": total})
}

// GET /api/docs/articles/:slug
func DocArticleDetail(c *gin.Context) {
	slug := c.Param("slug")
	var article model.Article
	if err := database.DB.Where("slug = ? AND is_published = true", slug).
		Preload("Category").
		First(&article).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}

	viewCookieName := "doc_viewed_" + article.ID
	if _, err := c.Cookie(viewCookieName); err != nil {
		database.DB.Model(&model.Article{}).
			Where("id = ?", article.ID).
			UpdateColumn("view_count", gorm.Expr("view_count + ?", 1))
		article.ViewCount++
		c.SetCookie(viewCookieName, "1", 12*60*60, "/", "", true, true)
	}

	c.JSON(http.StatusOK, article)
}

// POST /api/docs/articles/:id/helpful
func DocArticleHelpful(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Helpful bool `json:"helpful"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var article model.Article
	if err := database.DB.First(&article, "id = ? AND is_published = true", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}
	voteCookieName := "doc_feedback_" + article.ID
	if _, err := c.Cookie(voteCookieName); err == nil {
		c.JSON(http.StatusOK, gin.H{"success": true, "duplicate": true})
		return
	}

	if req.Helpful {
		database.DB.Model(&model.Article{}).
			Where("id = ?", article.ID).
			UpdateColumn("helpful_count", gorm.Expr("helpful_count + ?", 1))
	} else {
		database.DB.Model(&model.Article{}).
			Where("id = ?", article.ID).
			UpdateColumn("not_helpful_count", gorm.Expr("not_helpful_count + ?", 1))
	}
	c.SetCookie(voteCookieName, "1", 365*24*60*60, "/", "", true, true)

	c.JSON(http.StatusOK, gin.H{"success": true})
}
