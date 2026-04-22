package admin

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	openai "github.com/sashabaranov/go-openai"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type ProductHandler struct {
	aiClient *service.AIClient
}

func NewProductHandler(aiClient *service.AIClient) *ProductHandler {
	return &ProductHandler{aiClient: aiClient}
}

// GET /api/admin/products
func (h *ProductHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSizeStr := c.DefaultQuery("pageSize", c.DefaultQuery("limit", "20"))
	pageSize, _ := strconv.Atoi(pageSizeStr)
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 1000 {
		pageSize = 20
	}

	query := database.DB.Model(&model.Product{}).Preload("CPU")

	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	if region := c.Query("region"); region != "" {
		query = query.Where("region = ?", region)
	}
	if search := c.Query("search"); search != "" {
		s := "%" + search + "%"
		query = query.Where("name ILIKE ? OR region ILIKE ?", s, s)
	} else if q := c.Query("q"); q != "" {
		s := "%" + q + "%"
		query = query.Where("name ILIKE ? OR region ILIKE ?", s, s)
	}

	var total int64
	query.Count(&total)

	var products []model.Product
	query.Order("sort_order ASC, created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&products)

	var pricingConfig model.PricingConfig
	if err := database.DB.First(&pricingConfig, "id = ?", "default").Error; err != nil {
		pricingConfig = service.DefaultPricingRules()
	}

	type ProductWithPrices struct {
		model.Product
		CostPrice float64            `json:"costPrice"`
		Supplier  string             `json:"supplier"`
		AllPrices map[string]float64 `json:"allPrices"`
	}

	items := make([]ProductWithPrices, 0, len(products))
	for _, p := range products {
		items = append(items, ProductWithPrices{
			Product:   p,
			CostPrice: p.CostPrice,
			Supplier:  p.Supplier,
			AllPrices: service.CalculateAllPrices(p.OriginalPrice, pricingConfig),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"products":   items,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// wrapProductWithPrices loads pricing config and wraps a product with allPrices.
func wrapProductWithPrices(p model.Product) interface{} {
	var pricingConfig model.PricingConfig
	if err := database.DB.First(&pricingConfig, "id = ?", "default").Error; err != nil {
		pricingConfig = service.DefaultPricingRules()
	}
	return struct {
		model.Product
		CostPrice float64            `json:"costPrice"`
		Supplier  string             `json:"supplier"`
		AllPrices map[string]float64 `json:"allPrices"`
	}{
		Product:   p,
		CostPrice: p.CostPrice,
		Supplier:  p.Supplier,
		AllPrices: service.CalculateAllPrices(p.OriginalPrice, pricingConfig),
	}
}

// POST /api/admin/products
func (h *ProductHandler) Create(c *gin.Context) {
	var req struct {
		Name          string  `json:"name" binding:"required"`
		Category      string  `json:"category"`
		Region        string  `json:"region" binding:"required"`
		CPUID         string  `json:"cpuId" binding:"required"`
		CPUDisplay    string  `json:"cpuDisplay"`
		IsDualCPU     bool    `json:"isDualCPU"`
		CPUCount      int     `json:"cpuCount"`
		Memory        string  `json:"memory" binding:"required"`
		Storage       string  `json:"storage" binding:"required"`
		Bandwidth     string  `json:"bandwidth" binding:"required"`
		OriginalPrice float64 `json:"originalPrice" binding:"required"`
		SortOrder     int     `json:"sortOrder"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写完整的商品信息"})
		return
	}

	// Verify CPU exists
	var cpu model.CPU
	if err := database.DB.First(&cpu, "id = ?", req.CPUID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CPU型号不存在"})
		return
	}

	product := model.Product{
		ID:            service.GenerateID(),
		Name:          req.Name,
		Category:      "dedicated",
		Region:        req.Region,
		Status:        "ACTIVE",
		CPUID:         req.CPUID,
		CPUDisplay:    req.CPUDisplay,
		IsDualCPU:     req.IsDualCPU,
		CPUCount:      1,
		Memory:        req.Memory,
		Storage:       req.Storage,
		Bandwidth:     req.Bandwidth,
		OriginalPrice: req.OriginalPrice,
		CostPrice:     service.GetCostPrice(req.OriginalPrice),
		SortOrder:     req.SortOrder,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}
	if req.Category != "" {
		product.Category = req.Category
	}
	if req.CPUCount > 0 {
		product.CPUCount = req.CPUCount
	}

	database.DB.Create(&product)
	database.DB.Preload("CPU").First(&product, "id = ?", product.ID)
	c.JSON(http.StatusOK, wrapProductWithPrices(product))
}

// PUT /api/admin/products/:id
func (h *ProductHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var product model.Product
	if err := database.DB.First(&product, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "商品不存在"})
		return
	}

	var raw map[string]interface{}
	if err := c.ShouldBindJSON(&raw); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求"})
		return
	}

	// Field whitelist: only allow explicitly permitted columns to be updated.
	allowed := map[string]bool{
		"name": true, "category": true, "region": true,
		"cpuId": true, "cpuDisplay": true, "isDualCPU": true, "cpuCount": true,
		"memory": true, "storage": true, "bandwidth": true,
		"originalPrice": true, "sortOrder": true, "status": true,
		"stock": true, "description": true, "tags": true,
		"supplier": true,
		"aiDescription": true, "aiSuitableFor": true,
		// Score dimensions
		"scoreNetwork": true, "scoreCpuSingle": true, "scoreCpuMulti": true,
		"scoreMemory": true, "scoreStorage": true, "scoreLatency": true,
		"scoreDelivery": true, "scoreDefense": true, "scoreSupport": true,
		"scorePlatformBonus": true,
		// snake_case aliases
		"cpu_id": true, "cpu_display": true, "is_dual_cpu": true, "cpu_count": true,
		"original_price": true, "sort_order": true,
		"ai_description": true, "ai_suitable_for": true,
		"score_network": true, "score_cpu_single": true, "score_cpu_multi": true,
		"score_memory": true, "score_storage": true, "score_latency": true,
		"score_delivery": true, "score_defense": true, "score_support": true,
		"score_platform_bonus": true,
	}
	filtered := make(map[string]interface{})
	for k, v := range raw {
		if allowed[k] {
			filtered[k] = v
		}
	}

	// Handle originalPrice update
	if op, ok := filtered["originalPrice"]; ok {
		if price, ok := op.(float64); ok {
			filtered["costPrice"] = service.GetCostPrice(price)
		}
	}
	if op, ok := filtered["original_price"]; ok {
		if price, ok := op.(float64); ok {
			filtered["costPrice"] = service.GetCostPrice(price)
		}
	}

	filtered["updated_at"] = time.Now()
	database.DB.Model(&product).Updates(filtered)

	// Reload so the response reflects the saved state
	database.DB.Preload("CPU").First(&product, "id = ?", id)
	c.JSON(http.StatusOK, wrapProductWithPrices(product))
}

// DELETE /api/admin/products/:id
func (h *ProductHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	database.DB.Model(&model.Product{}).Where("id = ?", id).Update("status", "DELETED")
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /api/admin/products/batch
func (h *ProductHandler) BatchUpdate(c *gin.Context) {
	var req struct {
		IDs     []string               `json:"ids" binding:"required"`
		Updates map[string]interface{} `json:"updates" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求"})
		return
	}

	// Field whitelist for batch update
	allowed := map[string]bool{
		"status": true, "sortOrder": true, "sort_order": true,
		"region": true, "category": true, "stock": true, "tags": true,
		"isDualCPU": true, "is_dual_cpu": true,
	}
	filtered := make(map[string]interface{})
	for k, v := range req.Updates {
		if allowed[k] {
			filtered[k] = v
		}
	}
	if len(filtered) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有可更新的字段"})
		return
	}

	filtered["updated_at"] = time.Now()
	result := database.DB.Model(&model.Product{}).Where("id IN ?", req.IDs).Updates(filtered)
	c.JSON(http.StatusOK, gin.H{"success": true, "count": result.RowsAffected})
}

// POST /api/admin/products/import
func (h *ProductHandler) Import(c *gin.Context) {
	mode := strings.ToLower(strings.TrimSpace(c.PostForm("mode")))
	if mode == "" {
		var req struct {
			Mode string `json:"mode"`
		}
		_ = c.ShouldBindJSON(&req)
		mode = strings.ToLower(strings.TrimSpace(req.Mode))
	}
	if mode == "confirm" {
		h.importConfirm(c)
		return
	}

	// Default preview mode supports both JSON(rawText) and multipart(file)
	if _, err := c.FormFile("file"); err == nil {
		h.importPreviewFromFile(c)
		return
	}
	h.importPreviewFromText(c)
}

// POST /api/admin/products/ai-score
func (h *ProductHandler) AIScore(c *gin.Context) {
	var req struct {
		ProductIDs    []string `json:"productIds" binding:"required"`
		ScoringPrompt string  `json:"scoringPrompt"`
		HardwareOnly  bool    `json:"hardwareOnly"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择要评分的商品"})
		return
	}

	var products []model.Product
	database.DB.Where("id IN ?", req.ProductIDs).Preload("CPU").Find(&products)

	if len(products) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到商品"})
		return
	}

	productsJSON, _ := json.Marshal(products)
	results, err := h.aiClient.ScoreProducts(context.Background(), string(productsJSON), req.ScoringPrompt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI评分失败: " + err.Error()})
		return
	}

	// Apply scores to products
	now := time.Now()
	for _, result := range results {
		productID, ok := result["productId"].(string)
		if !ok {
			continue
		}
		updates := map[string]interface{}{
			"score_updated_at": now,
			"updated_at":       now,
			// Non-core dimensions are globally disabled by policy.
			"score_memory":         0,
			"score_storage":        0,
			"score_latency":        0,
			"score_delivery":       0,
			"score_support":        0,
			"score_platform_bonus": 0,
		}
		scoreFields := []string{
			"scoreNetwork", "scoreCpuSingle", "scoreCpuMulti", "scoreDefense",
		}
		for _, f := range scoreFields {
			if v, ok := result[f]; ok {
				dbField := toSnakeCase(f)
				if num, ok := v.(float64); ok {
					updates[dbField] = int(num * 10) // Store as 0-100
				}
			}
		}
		if notes, ok := result["scoreNotes"]; ok {
			notesJSON, _ := json.Marshal(notes)
			updates["score_notes"] = string(notesJSON)
		}
		database.DB.Model(&model.Product{}).Where("id = ?", productID).Updates(updates)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "results": results})
}

// PUT /api/admin/products/sort
func (h *ProductHandler) UpdateSort(c *gin.Context) {
	var req struct {
		Orders []struct {
			ID        string `json:"id"`
			SortOrder int    `json:"sortOrder"`
		} `json:"orders" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求"})
		return
	}

	for _, item := range req.Orders {
		database.DB.Model(&model.Product{}).Where("id = ?", item.ID).Update("sort_order", item.SortOrder)
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func toSnakeCase(s string) string {
	var result strings.Builder
	for i, r := range s {
		if r >= 'A' && r <= 'Z' {
			if i > 0 {
				result.WriteByte('_')
			}
			result.WriteRune(r + 32) // toLower
		} else {
			result.WriteRune(r)
		}
	}
	return result.String()
}

// POST /api/admin/products/ai-chat
func (h *ProductHandler) AIChat(c *gin.Context) {
	var req struct {
		Message       string `json:"message" binding:"required"`
		Products      string `json:"products"`
		ScoringPrompt string `json:"scoringPrompt"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入消息"})
		return
	}

	messages := []openai.ChatCompletionMessage{
		{Role: openai.ChatMessageRoleUser, Content: req.Message},
	}
	resp, err := h.aiClient.ChatScore(context.Background(), messages, req.Products, req.ScoringPrompt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI对话失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"reply": resp})
}

// POST /api/admin/products/ai-chat-simple
func (h *ProductHandler) AIChatSimple(c *gin.Context) {
	var req struct {
		Message string `json:"message" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入消息"})
		return
	}

	resp, err := h.aiClient.ChatSimple(context.Background(), req.Message)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI对话失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"reply": resp})
}

// POST /api/admin/products/ai-score-save
func (h *ProductHandler) AIScoreSave(c *gin.Context) {
	var req struct {
		Scores []struct {
			ProductID string                 `json:"productId" binding:"required"`
			Scores    map[string]interface{} `json:"scores"`
			Notes     interface{}            `json:"notes"`
		} `json:"scores" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供评分数据"})
		return
	}

	now := time.Now()
	for _, item := range req.Scores {
		updates := map[string]interface{}{
			"score_updated_at": now,
			"updated_at":       now,
			// Non-core dimensions are globally disabled by policy.
			"score_memory":         0,
			"score_storage":        0,
			"score_latency":        0,
			"score_delivery":       0,
			"score_support":        0,
			"score_platform_bonus": 0,
		}
		allowedCoreFields := map[string]bool{
			"scoreNetwork":   true,
			"scoreCpuSingle": true,
			"scoreCpuMulti":  true,
			"scoreDefense":   true,
		}
		for field, val := range item.Scores {
			if !allowedCoreFields[field] {
				continue
			}
			dbField := toSnakeCase(field)
			switch v := val.(type) {
			case float64:
				updates[dbField] = int(v)
			case int:
				updates[dbField] = v
			}
		}
		if item.Notes != nil {
			notesJSON, _ := json.Marshal(item.Notes)
			updates["score_notes"] = string(notesJSON)
		}
		database.DB.Model(&model.Product{}).Where("id = ?", item.ProductID).Updates(updates)
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /api/admin/products/:id/allocate
func (h *ProductHandler) Allocate(c *gin.Context) {
	productID := c.Param("id")

	var req struct {
		UserID     string `json:"userId"`
		Identifier string `json:"identifier"`
		Period     int    `json:"period"`
		Months     int    `json:"months"`
		Note       string `json:"note"`
		OrderID    string `json:"orderId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择用户"})
		return
	}

	var product model.Product
	if err := database.DB.First(&product, "id = ?", productID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "商品不存在"})
		return
	}

	identifier := strings.TrimSpace(req.UserID)
	if identifier == "" {
		identifier = strings.TrimSpace(req.Identifier)
	}
	if identifier == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择用户"})
		return
	}

	var user model.User
	query := database.DB.Model(&model.User{})
	if err := query.Where(
		"id = ? OR email = ? OR name = ? OR CAST(numeric_id AS TEXT) = ?",
		identifier,
		strings.ToLower(identifier),
		identifier,
		identifier,
	).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	period := req.Period
	if period < 1 {
		period = req.Months
	}
	if period < 1 {
		period = 1
	}

	now := time.Now()
	expire := now.AddDate(0, period, 0)
	var orderID *string
	if req.OrderID != "" {
		var order model.Order
		if err := database.DB.Preload("Items").First(&order, "id = ? AND user_id = ?", req.OrderID, user.ID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "关联订单不存在"})
			return
		}
		hasProduct := false
		for _, item := range order.Items {
			if item.ProductID == productID {
				hasProduct = true
				break
			}
		}
		if !hasProduct {
			c.JSON(http.StatusBadRequest, gin.H{"error": "关联订单未包含当前商品"})
			return
		}
		orderID = &order.ID
	}

	server := model.ServerInstance{
		ID:         service.GenerateID(),
		UserID:     user.ID,
		OrderID:    orderID,
		ProductID:  productID,
		Status:     "PENDING",
		Config:     "{}",
		ExpireDate: &expire,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := database.DB.Create(&server).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建实例失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "serverId": server.ID, "expireDate": expire})
}

// PATCH /api/admin/products/:id/stock
func (h *ProductHandler) UpdateStock(c *gin.Context) {
	productID := c.Param("id")

	var req struct {
		Stock      *int `json:"stock"`
		StockAlert *int `json:"stockAlert"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	updates := map[string]interface{}{}
	if req.Stock != nil {
		updates["stock"] = *req.Stock
	}
	if req.StockAlert != nil {
		updates["stock_alert"] = *req.StockAlert
	}
	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无更新字段"})
		return
	}

	result := database.DB.Model(&model.Product{}).Where("id = ?", productID).Updates(updates)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "商品不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GET /api/admin/products/low-stock
func (h *ProductHandler) LowStock(c *gin.Context) {
	var products []model.Product
	// stock != -1 AND stock <= stockAlert AND stockAlert > 0
	database.DB.Where("stock != -1 AND stock_alert > 0 AND stock <= stock_alert").
		Order("stock ASC").Find(&products)
	c.JSON(http.StatusOK, gin.H{"products": products})
}

// POST /api/admin/products/batch-gen-desc
// Body: {"ids":["id1","id2"],"overwrite":true}
// Generates AIDescription + AISuitableFor for each product via AI, one at a time.
// Returns a streaming NDJSON response: one JSON line per product when done.
func (h *ProductHandler) BatchGenerateDescription(c *gin.Context) {
	var req struct {
		IDs       []string `json:"ids"`
		Overwrite bool     `json:"overwrite"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供产品 ID 列表"})
		return
	}

	if len(req.IDs) > 50 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "单次最多批量生成 50 个产品"})
		return
	}

	var products []model.Product
	database.DB.Where("id IN ?", req.IDs).Preload("CPU").Find(&products)

	type resultItem struct {
		ID          string  `json:"id"`
		Name        string  `json:"name"`
		Status      string  `json:"status"` // ok | skipped | error
		Description *string `json:"description,omitempty"`
		SuitableFor *string `json:"suitableFor,omitempty"`
		Error       string  `json:"error,omitempty"`
	}

	results := make([]resultItem, 0, len(products))
	for _, p := range products {
		// Skip if already has description and overwrite=false
		if !req.Overwrite && p.AIDescription != nil && *p.AIDescription != "" {
			results = append(results, resultItem{ID: p.ID, Name: p.Name, Status: "skipped"})
			continue
		}

		cpuDesc := ""
		if p.CPU.Model != "" {
			cpuDesc = p.CPU.Model
			if p.IsDualCPU {
				cpuDesc = "双路 " + cpuDesc
			}
			if p.CPU.Cores > 0 {
				cpuDesc += " " + strconv.Itoa(p.CPU.Cores) + "核"
			}
		}

		info := "产品名称：" + p.Name +
			"\n地区：" + p.Region +
			"\nCPU：" + cpuDesc +
			"\n内存：" + p.Memory +
			"\n硬盘：" + p.Storage +
			"\n带宽：" + p.Bandwidth

		desc, suitable, err := h.aiClient.GenerateProductDesc(context.Background(), info)
		if err != nil {
			results = append(results, resultItem{ID: p.ID, Name: p.Name, Status: "error", Error: err.Error()})
			continue
		}

		updates := map[string]interface{}{
			"ai_description":  desc,
			"ai_suitable_for": suitable,
			"updated_at":      time.Now(),
		}
		if dbErr := database.DB.Model(&model.Product{}).Where("id = ?", p.ID).Updates(updates).Error; dbErr != nil {
			results = append(results, resultItem{ID: p.ID, Name: p.Name, Status: "error", Error: dbErr.Error()})
			continue
		}

		results = append(results, resultItem{
			ID:          p.ID,
			Name:        p.Name,
			Status:      "ok",
			Description: &desc,
			SuitableFor: &suitable,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"results": results,
		"total":   len(results),
	})
}
