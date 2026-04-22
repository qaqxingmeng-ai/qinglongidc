package admin

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type ArticleHandler struct{}

func NewArticleHandler() *ArticleHandler { return &ArticleHandler{} }

// slugify converts a string to a URL-safe slug
func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	re := regexp.MustCompile(`[^a-z0-9\u4e00-\u9fff]+`)
	s = re.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	return s
}

// ==================== Categories ====================

type CategoryHandler struct{}

func NewCategoryHandler() *CategoryHandler { return &CategoryHandler{} }

// GET /api/admin/article-categories
func (h *CategoryHandler) List(c *gin.Context) {
	var cats []model.ArticleCategory
	database.DB.Where("parent_id IS NULL").
		Order("sort_order ASC, name ASC").
		Preload("Children").
		Find(&cats)

	var allCount []struct {
		CategoryID string
		Count      int64
	}
	database.DB.Model(&model.Article{}).
		Select("category_id, count(*) as count").
		Group("category_id").Scan(&allCount)

	countMap := map[string]int64{}
	for _, r := range allCount {
		countMap[r.CategoryID] = r.Count
	}

	type CatWithCount struct {
		model.ArticleCategory
		ArticleCount int64 `json:"articleCount"`
	}
	result := make([]CatWithCount, len(cats))
	for i, cat := range cats {
		result[i] = CatWithCount{ArticleCategory: cat, ArticleCount: countMap[cat.ID]}
	}

	c.JSON(http.StatusOK, gin.H{"categories": result})
}

// POST /api/admin/article-categories
func (h *CategoryHandler) Create(c *gin.Context) {
	var req struct {
		Name      string  `json:"name" binding:"required,max=100"`
		Slug      *string `json:"slug"`
		SortOrder int     `json:"sortOrder"`
		ParentID  *string `json:"parentId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	slug := ""
	if req.Slug != nil && *req.Slug != "" {
		slug = *req.Slug
	} else {
		slug = slugify(req.Name)
	}

	cat := model.ArticleCategory{
		ID:        service.GenerateID(),
		Name:      req.Name,
		Slug:      slug,
		SortOrder: req.SortOrder,
		ParentID:  req.ParentID,
	}
	if err := database.DB.Create(&cat).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "分类 slug 已存在"})
		return
	}
	c.JSON(http.StatusOK, cat)
}

// PUT /api/admin/article-categories/:id
func (h *CategoryHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var cat model.ArticleCategory
	if err := database.DB.First(&cat, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "分类不存在"})
		return
	}
	var req struct {
		Name      *string `json:"name"`
		Slug      *string `json:"slug"`
		SortOrder *int    `json:"sortOrder"`
	}
	c.ShouldBindJSON(&req)
	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Slug != nil {
		updates["slug"] = *req.Slug
	}
	if req.SortOrder != nil {
		updates["sort_order"] = *req.SortOrder
	}
	database.DB.Model(&cat).Updates(updates)
	c.JSON(http.StatusOK, cat)
}

// DELETE /api/admin/article-categories/:id
func (h *CategoryHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	var cnt int64
	database.DB.Model(&model.Article{}).Where("category_id = ?", id).Count(&cnt)
	if cnt > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该分类下还有文章，无法删除"})
		return
	}
	database.DB.Delete(&model.ArticleCategory{}, "id = ?", id)
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// ==================== Articles ====================

// isASCII helper to avoid unused import error
func isASCII(s string) bool {
	for _, r := range s {
		if r > unicode.MaxASCII {
			return false
		}
	}
	return true
}

// GET /api/admin/articles
func (h *ArticleHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	search := c.Query("search")
	category := c.Query("categoryId")

	q := database.DB.Model(&model.Article{})
	if search != "" {
		q = q.Where("title ILIKE ?", "%"+search+"%")
	}
	if category != "" {
		q = q.Where("category_id = ?", category)
	}

	var total int64
	q.Count(&total)

	var articles []model.Article
	q.Select("id,title,slug,category_id,tags,view_count,helpful_count,not_helpful_count,is_published,sort_order,created_by,created_at,updated_at").
		Order("created_at DESC").
		Offset((page-1)*pageSize).Limit(pageSize).
		Preload("Category").
		Find(&articles)

	c.JSON(http.StatusOK, gin.H{"articles": articles, "total": total})
}

// POST /api/admin/articles
func (h *ArticleHandler) Create(c *gin.Context) {
	creatorID := middleware.GetUserID(c)
	var req struct {
		Title      string  `json:"title" binding:"required,max=200"`
		Slug       *string `json:"slug"`
		Content    string  `json:"content" binding:"required"`
		CategoryID string  `json:"categoryId" binding:"required"`
		Tags       string  `json:"tags"` // JSON array string
		SortOrder  int     `json:"sortOrder"`
		IsPublished bool   `json:"isPublished"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	slug := ""
	if req.Slug != nil && *req.Slug != "" {
		slug = *req.Slug
	} else {
		slug = slugify(req.Title) + "-" + strconv.FormatInt(time.Now().Unix(), 36)
	}

	tags := req.Tags
	if tags == "" {
		tags = "[]"
	}

	article := model.Article{
		ID:          service.GenerateID(),
		Title:       req.Title,
		Slug:        slug,
		Content:     req.Content,
		CategoryID:  req.CategoryID,
		Tags:        tags,
		IsPublished: req.IsPublished,
		SortOrder:   req.SortOrder,
		CreatedBy:   creatorID,
	}
	if err := database.DB.Create(&article).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "文章 slug 已存在"})
		return
	}
	c.JSON(http.StatusOK, article)
}

// PUT /api/admin/articles/:id
func (h *ArticleHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var article model.Article
	if err := database.DB.First(&article, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}

	var req struct {
		Title       *string `json:"title"`
		Slug        *string `json:"slug"`
		Content     *string `json:"content"`
		CategoryID  *string `json:"categoryId"`
		Tags        *string `json:"tags"`
		SortOrder   *int    `json:"sortOrder"`
		IsPublished *bool   `json:"isPublished"`
	}
	c.ShouldBindJSON(&req)

	updates := map[string]interface{}{}
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.Slug != nil {
		updates["slug"] = *req.Slug
	}
	if req.Content != nil {
		updates["content"] = *req.Content
	}
	if req.CategoryID != nil {
		updates["category_id"] = *req.CategoryID
	}
	if req.Tags != nil {
		updates["tags"] = *req.Tags
	}
	if req.SortOrder != nil {
		updates["sort_order"] = *req.SortOrder
	}
	if req.IsPublished != nil {
		updates["is_published"] = *req.IsPublished
	}
	updates["updated_at"] = time.Now()

	database.DB.Model(&article).Updates(updates)
	c.JSON(http.StatusOK, article)
}

// DELETE /api/admin/articles/:id
func (h *ArticleHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	database.DB.Delete(&model.Article{}, "id = ?", id)
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// PATCH /api/admin/articles/:id/publish
func (h *ArticleHandler) TogglePublish(c *gin.Context) {
	id := c.Param("id")
	var article model.Article
	if err := database.DB.First(&article, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		return
	}
	database.DB.Model(&article).Updates(map[string]interface{}{
		"is_published": !article.IsPublished,
		"updated_at":   time.Now(),
	})
	article.IsPublished = !article.IsPublished
	c.JSON(http.StatusOK, gin.H{"isPublished": article.IsPublished})
}
