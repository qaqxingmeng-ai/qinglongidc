package handler

import (
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type ProductHandler struct{}

func NewProductHandler() *ProductHandler {
	return &ProductHandler{}
}

// GET /api/products
func (h *ProductHandler) List(c *gin.Context) {
	// Get user level for pricing
	level := "GUEST"
	if userID := middleware.GetUserID(c); userID != "" {
		var user model.User
		if err := database.DB.First(&user, "id = ?", userID).Error; err == nil {
			level = service.NormalizePriceLevel(user.Level)
		}
	}

	// Load pricing config
	var pricingConfig model.PricingConfig
	if err := database.DB.First(&pricingConfig, "id = ?", "default").Error; err != nil {
		pricingConfig = service.DefaultPricingRules()
	}

	// Build query
	query := database.DB.Model(&model.Product{}).Where("status = ?", "ACTIVE").Preload("CPU")

	// Filters
	if region := c.Query("region"); region != "" {
		query = query.Where("region = ?", region)
	}
	if category := c.Query("category"); category != "" {
		query = query.Where("category = ?", category)
	}
	if search := c.Query("search"); search != "" {
		search = "%" + search + "%"
		query = query.Where("name ILIKE ? OR region ILIKE ?", search, search)
	}
	if minPrice := c.Query("minPrice"); minPrice != "" {
		if v, err := strconv.ParseFloat(minPrice, 64); err == nil {
			query = query.Where("original_price >= ?", v)
		}
	}
	if maxPrice := c.Query("maxPrice"); maxPrice != "" {
		if v, err := strconv.ParseFloat(maxPrice, 64); err == nil {
			query = query.Where("original_price <= ?", v)
		}
	}

	// Sorting
	sortField := c.DefaultQuery("sort", "sortOrder")
	sortOrder := c.DefaultQuery("order", "asc")
	if sortOrder != "asc" && sortOrder != "desc" {
		sortOrder = "asc"
	}
	allowedSorts := map[string]string{
		"sortOrder":     "sort_order",
		"price":         "original_price",
		"createdAt":     "created_at",
		"clickCount":    "click_count",
		"orderCount":    "order_count",
		"name":          "name",
	}
	dbField, ok := allowedSorts[sortField]
	if !ok {
		dbField = "sort_order"
	}
	query = query.Order(dbField + " " + sortOrder)

	// Pagination
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	var total int64
	query.Count(&total)

	var products []model.Product
	query.Offset((page - 1) * pageSize).Limit(pageSize).Find(&products)

	// Calculate prices for user level
	type ProductResponse struct {
		model.Product
		DisplayPrice float64            `json:"displayPrice"`
		Prices       map[string]float64 `json:"prices,omitempty"`
	}

	items := make([]ProductResponse, 0, len(products))
	for _, p := range products {
		pr := ProductResponse{
			Product:      p,
			DisplayPrice: service.CalculatePrice(p.OriginalPrice, level, pricingConfig),
			Prices:       service.CalculateAllPrices(p.OriginalPrice, pricingConfig),
		}
		items = append(items, pr)
	}

	c.JSON(http.StatusOK, gin.H{
		"products":   items,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// GET /api/products/:id
func (h *ProductHandler) Detail(c *gin.Context) {
	id := c.Param("id")

	var product model.Product
	if err := database.DB.Preload("CPU").First(&product, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "商品不存在"})
		return
	}

	userID := middleware.GetUserID(c)
	track := c.DefaultQuery("track", "1") != "0"
	if track {
		database.DB.Model(&product).UpdateColumn("click_count", gorm.Expr("click_count + ?", 1))

		analytics := model.Analytics{
			ID:     service.GenerateID(),
			Event:  "PRODUCT_CLICK",
			Target: &id,
		}
		if userID != "" {
			analytics.UserID = &userID
		}
		database.DB.Create(&analytics)

		source := c.DefaultQuery("source", "DETAIL")
		validSources := map[string]bool{"LIST": true, "DETAIL": true, "AI": true, "SEARCH": true}
		if !validSources[source] {
			source = "DETAIL"
		}
		pv := model.ProductView{
			ID:        service.GenerateID(),
			ProductID: id,
			ViewedAt:  time.Now(),
			Source:    source,
		}
		if userID != "" {
			pv.UserID = &userID
		}
		database.DB.Create(&pv)
	}

	// Get user level
	level := "GUEST"
	if userID != "" {
		var user model.User
		if err := database.DB.First(&user, "id = ?", userID).Error; err == nil {
			level = service.NormalizePriceLevel(user.Level)
		}
	}

	var pricingConfig model.PricingConfig
	if err := database.DB.First(&pricingConfig, "id = ?", "default").Error; err != nil {
		pricingConfig = service.DefaultPricingRules()
	}

	c.JSON(http.StatusOK, gin.H{
		"product":      product,
		"displayPrice": service.CalculatePrice(product.OriginalPrice, level, pricingConfig),
	})
}

// GET /api/filters
func (h *ProductHandler) Filters(c *gin.Context) {
	var regions []string
	database.DB.Model(&model.Product{}).
		Where("status = ?", "ACTIVE").
		Distinct("region").
		Pluck("region", &regions)

	var categories []string
	database.DB.Model(&model.Product{}).
		Where("status = ?", "ACTIVE").
		Distinct("category").
		Pluck("category", &categories)

	// Price range
	var minPrice, maxPrice float64
	database.DB.Model(&model.Product{}).Where("status = ?", "ACTIVE").
		Select("COALESCE(MIN(original_price), 0)").Scan(&minPrice)
	database.DB.Model(&model.Product{}).Where("status = ?", "ACTIVE").
		Select("COALESCE(MAX(original_price), 0)").Scan(&maxPrice)

	// CPU models
	var cpuModels []string
	database.DB.Model(&model.Product{}).
		Where("status = ?", "ACTIVE").
		Joins("JOIN cpus ON cpus.id = products.cpu_id").
		Distinct("cpus.model").
		Pluck("cpus.model", &cpuModels)

	_ = strings.TrimSpace // Avoid unused import

	c.JSON(http.StatusOK, gin.H{
		"regions":    regions,
		"categories": categories,
		"cpuModels":  cpuModels,
		"priceRange": gin.H{
			"min": minPrice,
			"max": maxPrice,
		},
	})
}

// GET /api/products/batch-check?ids=id1,id2,...
// Returns current displayPrice and stock for a list of product IDs.
func (h *ProductHandler) BatchCheck(c *gin.Context) {
	rawIDs := c.Query("ids")
	if rawIDs == "" {
		c.JSON(http.StatusOK, gin.H{"items": []interface{}{}})
		return
	}
	ids := strings.Split(rawIDs, ",")
	if len(ids) > 50 {
		ids = ids[:50]
	}

	level := "GUEST"
	if userID := middleware.GetUserID(c); userID != "" {
		var user model.User
		if err := database.DB.First(&user, "id = ?", userID).Error; err == nil {
			level = service.NormalizePriceLevel(user.Level)
		}
	}

	var pricingConfig model.PricingConfig
	if err := database.DB.First(&pricingConfig, "id = ?", "default").Error; err != nil {
		pricingConfig = service.DefaultPricingRules()
	}

	var products []model.Product
	database.DB.Where("id IN ? AND status = ?", ids, "ACTIVE").Find(&products)

	type item struct {
		ID           string  `json:"id"`
		DisplayPrice float64 `json:"displayPrice"`
		Stock        int     `json:"stock"`
	}
	result := make([]item, 0, len(products))
	for _, p := range products {
		result = append(result, item{
			ID:           p.ID,
			DisplayPrice: service.CalculatePrice(p.OriginalPrice, level, pricingConfig),
			Stock:        p.Stock,
		})
	}

	c.JSON(http.StatusOK, gin.H{"items": result})
}

// GET /api/products/compare?ids=id1,id2,id3
// Returns full product details for 2–4 products for side-by-side comparison.
func (h *ProductHandler) Compare(c *gin.Context) {
	rawIDs := c.Query("ids")
	if rawIDs == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids required"})
		return
	}
	ids := strings.Split(rawIDs, ",")
	if len(ids) < 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "at least 2 ids required"})
		return
	}
	if len(ids) > 4 {
		ids = ids[:4]
	}

	level := "GUEST"
	if userID := middleware.GetUserID(c); userID != "" {
		var user model.User
		if err := database.DB.First(&user, "id = ?", userID).Error; err == nil {
			level = service.NormalizePriceLevel(user.Level)
		}
	}

	var pricingConfig model.PricingConfig
	if err := database.DB.First(&pricingConfig, "id = ?", "default").Error; err != nil {
		pricingConfig = service.DefaultPricingRules()
	}

	var products []model.Product
	database.DB.Preload("CPU").Where("id IN ? AND status = ?", ids, "ACTIVE").Find(&products)

	// Preserve the order of requested IDs
	productMap := make(map[string]model.Product, len(products))
	for _, p := range products {
		productMap[p.ID] = p
	}

	type compareItem struct {
		ID                 string   `json:"id"`
		Name               string   `json:"name"`
		Category           string   `json:"category"`
		Region             string   `json:"region"`
		CPUDisplay         string   `json:"cpuDisplay"`
		CPUModel           string   `json:"cpuModel"`
		CPUCores           int      `json:"cpuCores"`
		CPUFrequency       string   `json:"cpuFrequency"`
		CPUBenchmark       int      `json:"cpuBenchmark"`
		CPUTags            string   `json:"cpuTags"`
		IsDualCPU          bool     `json:"isDualCPU"`
		Memory             string   `json:"memory"`
		Storage            string   `json:"storage"`
		Bandwidth          string   `json:"bandwidth"`
		IPLabel            string   `json:"ipLabel"`
		ProtectionLabel    string   `json:"protectionLabel"`
		DisplayPrice       float64  `json:"displayPrice"`
		Stock              int      `json:"stock"`
		ScoreNetwork       int      `json:"scoreNetwork"`
		ScoreCPUSingle     int      `json:"scoreCpuSingle"`
		ScoreCPUMulti      int      `json:"scoreCpuMulti"`
		ScoreMemory        int      `json:"scoreMemory"`
		ScoreStorage       int      `json:"scoreStorage"`
		ScoreLatency       int      `json:"scoreLatency"`
		ScoreDelivery      int      `json:"scoreDelivery"`
		ScoreDefense       int      `json:"scoreDefense"`
		ScoreSupport       int      `json:"scoreSupport"`
		ScorePlatformBonus int      `json:"scorePlatformBonus"`
		AIDescription      string   `json:"aiDescription"`
		AISuitableFor      string   `json:"aiSuitableFor"`
	}

	result := make([]compareItem, 0, len(ids))
	for _, id := range ids {
		p, ok := productMap[id]
		if !ok {
			continue
		}
		aiDesc := ""
		if p.AIDescription != nil {
			aiDesc = *p.AIDescription
		}
		aiSuitable := ""
		if p.AISuitableFor != nil {
			aiSuitable = *p.AISuitableFor
		}
		cpuTags := p.CPU.Tags
		result = append(result, compareItem{
			ID:                 p.ID,
			Name:               p.Name,
			Category:           p.Category,
			Region:             p.Region,
			CPUDisplay:         p.CPUDisplay,
			CPUModel:           p.CPU.Model,
			CPUCores:           p.CPU.Cores,
			CPUFrequency:       p.CPU.Frequency,
			CPUBenchmark:       p.CPU.Benchmark,
			CPUTags:            cpuTags,
			IsDualCPU:          p.IsDualCPU,
			Memory:             p.Memory,
			Storage:            p.Storage,
			Bandwidth:          p.Bandwidth,
			IPLabel:            p.IPLabel,
			ProtectionLabel:    p.ProtectionLabel,
			DisplayPrice:       service.CalculatePrice(p.OriginalPrice, level, pricingConfig),
			Stock:              p.Stock,
			ScoreNetwork:       p.ScoreNetwork,
			ScoreCPUSingle:     p.ScoreCPUSingle,
			ScoreCPUMulti:      p.ScoreCPUMulti,
			ScoreMemory:        p.ScoreMemory,
			ScoreStorage:       p.ScoreStorage,
			ScoreLatency:       p.ScoreLatency,
			ScoreDelivery:      p.ScoreDelivery,
			ScoreDefense:       p.ScoreDefense,
			ScoreSupport:       p.ScoreSupport,
			ScorePlatformBonus: p.ScorePlatformBonus,
			AIDescription:      aiDesc,
			AISuitableFor:      aiSuitable,
		})
	}

	c.JSON(http.StatusOK, gin.H{"products": result})
}
