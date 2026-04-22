package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	openai "github.com/sashabaranov/go-openai"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type AIHandler struct {
	aiClient *service.AIClient
}

func NewAIHandler(aiClient *service.AIClient) *AIHandler {
	return &AIHandler{aiClient: aiClient}
}

// POST /api/ai/wizard
func (h *AIHandler) Wizard(c *gin.Context) {
	var req struct {
		SessionID     string `json:"sessionId"`
		Message       string `json:"message"`
		Usage         string `json:"usage"`
		Budget        string `json:"budget"`
		Region        string `json:"region"`
		Bandwidth     string `json:"bandwidth"`
		CPUPreference string `json:"cpuPreference"`
		Storage       string `json:"storage"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数错误"})
		return
	}

	userID := middleware.GetUserID(c)

	// AI 日配额：防被盗账号刷外部模型 token
	if ok, _ := ConsumeAIQuota(userID, middleware.ClientNetworkKey(c)); !ok {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "AI 调用已达今日上限，请明天再试"})
		return
	}

	// 用户侧输入清洗（截断 + 剔除越狱关键词）
	req.Message = sanitizeAIUserInput(req.Message)
	req.Usage = sanitizeAIUserInput(req.Usage)
	req.Budget = sanitizeAIUserInput(req.Budget)
	req.Region = sanitizeAIUserInput(req.Region)
	req.Bandwidth = sanitizeAIUserInput(req.Bandwidth)
	req.CPUPreference = sanitizeAIUserInput(req.CPUPreference)
	req.Storage = sanitizeAIUserInput(req.Storage)
	if hasPromptInjectionRisk(req.Message) || hasPromptInjectionRisk(req.Usage) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "输入包含不支持的控制指令，请改为描述业务需求"})
		return
	}

	// New provision mode (frontend wizard requirements)
	if strings.TrimSpace(req.Message) == "" && strings.TrimSpace(req.Usage) != "" {
		h.handleWizardByRequirements(c, userID, req.Usage, req.Budget, req.Region, req.Bandwidth, req.CPUPreference, req.Storage)
		return
	}

	if strings.TrimSpace(req.Message) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入消息"})
		return
	}

	// Get or create session
	var session model.AISession
	if req.SessionID != "" {
		if err := database.DB.Preload("Messages").First(&session, "id = ?", req.SessionID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "会话不存在"})
			return
		}
		// Verify session ownership to prevent IDOR
		if session.UserID != nil && *session.UserID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "无权访问此会话"})
			return
		}
		// Authenticated user cannot access anonymous sessions
		if session.UserID == nil && userID != "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "无权访问此会话"})
			return
		}
	} else {
		session = model.AISession{
			ID:        service.GenerateID(),
			Status:    "ACTIVE",
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		if userID != "" {
			session.UserID = &userID
		}
		if err := database.DB.Create(&session).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "创建会话失败"})
			return
		}

		// Track analytics
		analytics := model.Analytics{
			ID:     service.GenerateID(),
			Event:  "AI_SESSION",
			Target: &session.ID,
		}
		if userID != "" {
			analytics.UserID = &userID
		}
		database.DB.Create(&analytics)
	}

	// Save user message
	database.DB.Create(&model.AIMessage{
		ID:        service.GenerateID(),
		SessionID: session.ID,
		Role:      "user",
		Content:   req.Message,
		CreatedAt: time.Now(),
	})

	// Build messages for AI
	var sessionMessages []model.AIMessage
	database.DB.Where("session_id = ?", session.ID).Order("created_at ASC").Find(&sessionMessages)

	aiMessages := make([]openai.ChatCompletionMessage, 0, len(sessionMessages))
	for _, m := range sessionMessages {
		role := openai.ChatMessageRoleUser
		if m.Role == "assistant" {
			role = openai.ChatMessageRoleAssistant
		}
		aiMessages = append(aiMessages, openai.ChatCompletionMessage{
			Role:    role,
			Content: m.Content,
		})
	}

	// Get active products for context
	var products []model.Product
	database.DB.Where("status = ?", "ACTIVE").Preload("CPU").Find(&products)

	// Get user level for pricing
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

	// Build compact product JSON
	type compactProduct struct {
		ID    string  `json:"id"`
		Name  string  `json:"name"`
		Region string `json:"region"`
		CPU   string  `json:"cpu"`
		Dual  bool    `json:"dual"`
		Cores int     `json:"cores"`
		Freq  string  `json:"freq"`
		SB    int     `json:"sb"`
		TB    int     `json:"tb"`
		Mem   string  `json:"mem"`
		Disk  string  `json:"disk"`
		BW    string  `json:"bw"`
		Price float64 `json:"price"`
	}

	compactProducts := make([]compactProduct, 0, len(products))
	for _, p := range products {
		benchmark := p.CPU.Benchmark
		singleBench := benchmark
		if p.CPU.Cores > 0 {
			singleBench = benchmark / p.CPU.Cores
		}
		_ = singleBench // Available if needed

		compactProducts = append(compactProducts, compactProduct{
			ID:     p.ID,
			Name:   p.Name,
			Region: p.Region,
			CPU:    p.CPU.Model,
			Dual:   p.IsDualCPU,
			Cores:  p.CPU.Cores,
			Freq:   p.CPU.Frequency,
			SB:     singleBench,
			TB:     benchmark,
			Mem:    p.Memory,
			Disk:   p.Storage,
			BW:     p.Bandwidth,
			Price:  service.CalculatePrice(p.OriginalPrice, level, pricingConfig),
		})
	}

	productsJSON, _ := json.Marshal(compactProducts)

	// Call AI
	response, err := h.aiClient.SelectServers(context.Background(), aiMessages, string(productsJSON))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI 服务暂时不可用"})
		return
	}

	// Save assistant message
	database.DB.Create(&model.AIMessage{
		ID:        service.GenerateID(),
		SessionID: session.ID,
		Role:      "assistant",
		Content:   response,
		CreatedAt: time.Now(),
	})

	// Check if we got a recommendation
	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(response), &parsed); err == nil {
		if parsed["type"] == "recommendation" {
			database.DB.Model(&model.AISession{}).Where("id = ?", session.ID).Updates(map[string]interface{}{
				"status":     "COMPLETED",
				"result":     response,
				"updated_at": time.Now(),
			})

			// Track conversion
			analytics := model.Analytics{
				ID:     service.GenerateID(),
				Event:  "AI_CONVERSION",
				Target: &session.ID,
			}
			if userID != "" {
				analytics.UserID = &userID
			}
			database.DB.Create(&analytics)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"sessionId": session.ID,
		"response":  response,
	})
}

// GET /api/ai/has-key
func (h *AIHandler) HasKey(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"hasKey": h.aiClient.HasKey()})
}

// POST /api/ai/provision-chat
func (h *AIHandler) ProvisionChat(c *gin.Context) {
	var req struct {
		Message   string `json:"message"`
		ServerID  string `json:"serverId"`
		ProductID string `json:"productId"`
		Category  string `json:"category"`
		History   []struct {
			Q string   `json:"q"`
			A []string `json:"a"`
		} `json:"history"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数错误"})
		return
	}

	// AI 日配额
	if ok, _ := ConsumeAIQuota(middleware.GetUserID(c), middleware.ClientNetworkKey(c)); !ok {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "AI 调用已达今日上限，请明天再试"})
		return
	}

	// 用户输入清洗
	req.Message = sanitizeAIUserInput(req.Message)
	req.Category = sanitizeAIUserInput(req.Category)
	if hasPromptInjectionRisk(req.Message) || hasPromptInjectionRisk(req.Category) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "输入包含不支持的控制指令，请改为描述业务需求"})
		return
	}

	// New provision page protocol: category + history => question/ready
	if len(req.History) > 0 && strings.TrimSpace(req.Category) != "" {
		step := len(req.History)
		switch step {
		case 1:
			c.JSON(http.StatusOK, gin.H{
				"type":       "question",
				"question":   "您的预算区间大概是多少？",
				"options":    []string{"¥0-500/月", "¥500-1000/月", "¥1000-3000/月", "¥3000+/月", "不限"},
				"multiSelect": false,
			})
			return
		case 2:
			c.JSON(http.StatusOK, gin.H{
				"type":       "question",
				"question":   "您偏好的机房区域是？",
				"options":    []string{"华东", "华北", "华南", "海外", "不限"},
				"multiSelect": false,
			})
			return
		case 3:
			c.JSON(http.StatusOK, gin.H{
				"type":       "question",
				"question":   "您期望的带宽规格是？",
				"options":    []string{"10M", "30M", "50M", "100M", "1G", "不限"},
				"multiSelect": false,
			})
			return
		default:
			usage := strings.Join(req.History[0].A, "、")
			budget := pickFirst(req.History, 1, "不限")
			region := pickFirst(req.History, 2, "不限")
			bandwidth := pickFirst(req.History, 3, "不限")
			cpuPreference := defaultCPUPreference(req.Category)
			storage := defaultStorage(req.Category)
			budgetMin, budgetMax := parseBudgetRange(budget)

			c.JSON(http.StatusOK, gin.H{
				"type":     "ready",
				"analysis": "已完成需求采集，正在基于预算、地域与带宽要求进行匹配。",
				"requirements": gin.H{
					"usage":         usage,
					"cpuPreference": cpuPreference,
					"region":        region,
					"bandwidth":     bandwidth,
					"storage":       storage,
					"budgetMin":     budgetMin,
					"budgetMax":     budgetMax,
				},
			})
			return
		}
	}

	if strings.TrimSpace(req.Message) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入消息"})
		return
	}

	// Build context about the server/product
	contextInfo := ""
	if req.ServerID != "" {
		var server model.ServerInstance
		query := database.DB.Preload("Product").Preload("Product.CPU").
			Where("id = ?", req.ServerID)
		// Restrict to current user's server unless anonymous
		if curUserID := middleware.GetUserID(c); curUserID != "" {
			query = query.Where("user_id = ?", curUserID)
		}
		if err := query.First(&server).Error; err == nil {
			serverJSON, _ := json.Marshal(server)
			contextInfo = "Server info: " + string(serverJSON)
		}
	}
	if req.ProductID != "" {
		var product model.Product
		if err := database.DB.Preload("CPU").First(&product, "id = ?", req.ProductID).Error; err == nil {
			productJSON, _ := json.Marshal(product)
			contextInfo += "\nProduct info: " + string(productJSON)
		}
	}

	prompt := req.Message
	if contextInfo != "" {
		prompt = contextInfo + "\n\nUser question: " + req.Message
	}

	resp, err := h.aiClient.ChatSimple(context.Background(), prompt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI 服务暂时不可用"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"reply": resp})
}

func pickFirst(history []struct {
	Q string   `json:"q"`
	A []string `json:"a"`
}, idx int, fallback string) string {
	if idx < 0 || idx >= len(history) {
		return fallback
	}
	if len(history[idx].A) == 0 {
		return fallback
	}
	v := strings.TrimSpace(history[idx].A[0])
	if v == "" {
		return fallback
	}
	return v
}

func defaultCPUPreference(category string) string {
	if strings.Contains(category, "AI") || strings.Contains(strings.ToLower(category), "ai") {
		return "多核优先"
	}
	if strings.Contains(category, "网站") || strings.Contains(category, "应用") {
		return "均衡"
	}
	if strings.Contains(category, "游戏") {
		return "高主频"
	}
	return "均衡"
}

func defaultStorage(category string) string {
	if strings.Contains(category, "数据") {
		return "大容量"
	}
	if strings.Contains(category, "游戏") || strings.Contains(category, "开发") {
		return "NVMe"
	}
	return "不限"
}

func parseBudgetRange(budget string) (float64, float64) {
	b := strings.ReplaceAll(strings.TrimSpace(budget), ",", "")
	if b == "" || strings.Contains(b, "不限") {
		return 0, 999999
	}
	re := regexp.MustCompile(`\d+`)
	nums := re.FindAllString(b, -1)
	if len(nums) == 0 {
		return 0, 999999
	}
	if len(nums) == 1 {
		v, _ := strconv.ParseFloat(nums[0], 64)
		if strings.Contains(b, "+") {
			return v, 999999
		}
		return 0, v
	}
	minV, _ := strconv.ParseFloat(nums[0], 64)
	maxV, _ := strconv.ParseFloat(nums[1], 64)
	if maxV < minV {
		minV, maxV = maxV, minV
	}
	return minV, maxV
}

func (h *AIHandler) handleWizardByRequirements(c *gin.Context, userID, usage, budget, region, bandwidth, cpuPreference, storage string) {
	var products []model.Product
	database.DB.Where("status = ?", "ACTIVE").Preload("CPU").Find(&products)

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

	bMin, bMax := parseBudgetRange(budget)

	type wizardProduct struct {
		ID             string   `json:"id"`
		Name           string   `json:"name"`
		Region         string   `json:"region"`
		Bandwidth      string   `json:"bandwidth"`
		Memory         string   `json:"memory"`
		Storage        string   `json:"storage"`
		DisplayPrice   float64  `json:"displayPrice"`
		CPUModel       string   `json:"cpuModel"`
		TotalBenchmark int      `json:"totalBenchmark"`
		IsDualCPU      bool     `json:"isDualCPU"`
		Reason         string   `json:"reason"`
		SuitableFor    string   `json:"suitableFor"`
		Advantages     []string `json:"advantages"`
		Disadvantages  []string `json:"disadvantages"`
		TotalScore     float64  `json:"totalScore"`
	}

	// ── Step 1: compute price and budget fit for all products ──────────────
	type candidate struct {
		p        model.Product
		price    float64
		inBudget bool
		demandOK bool
		fitScore float64
	}

	unlimited := bMax >= 99999
	candidates := make([]candidate, 0, len(products))
	for _, p := range products {
		price := service.CalculatePrice(p.OriginalPrice, level, pricingConfig)
		inBudget := unlimited || (price >= bMin && price <= bMax)
		candidates = append(candidates, candidate{p: p, price: price, inBudget: inBudget, demandOK: true})
	}

	// If no products fall within budget, fall back to the cheapest 10.
	inBudgetCount := 0
	for _, cd := range candidates {
		if cd.inBudget {
			inBudgetCount++
		}
	}
	budgetRelaxed := false
	if !unlimited && inBudgetCount == 0 {
		budgetRelaxed = true
		sort.Slice(candidates, func(i, j int) bool { return candidates[i].price < candidates[j].price })
		limit := 10
		if len(candidates) < limit {
			limit = len(candidates)
		}
		for i := 0; i < limit; i++ {
			candidates[i].inBudget = true
		}
	}

	// ── Step 2: user-selected requirements (memory/storage are optional) ──
	requestedMemoryGB := extractRequestedMemoryGB(usage)
	requestedStorageGB := parseStorageGB(storage)
	hasStoragePreference := storage != "" && storage != "不限"
	requestedBandwidthMbps := parseBandwidthMbps(bandwidth)
	needLargeBandwidth := requestedBandwidthMbps >= 500 || detectLargeBandwidthDemand(usage)
	needMultiIP := detectMultiIPDemand(usage)

	// ── Step 3: score only in-budget products (需求约束优先，不额外加分) ────
	for i, cd := range candidates {
		if !cd.inBudget {
			candidates[i].fitScore = -1
			continue
		}
		p := cd.p

		productBandwidthMbps := parseBandwidthMbps(p.Bandwidth)
		demandOK := true
		if requestedBandwidthMbps > 0 && productBandwidthMbps < requestedBandwidthMbps {
			demandOK = false
		} else if requestedBandwidthMbps == 0 && needLargeBandwidth && productBandwidthMbps < 500 {
			demandOK = false
		}
		if needMultiIP {
			multiIPByName := strings.Contains(strings.ToLower(p.Name), "站群") || strings.Contains(strings.ToLower(p.Name), "多ip")
			if !supportsMultiIP(p.IPLabel) && !multiIPByName {
				demandOK = false
			}
		}

		// Core scoring dimensions only:
		// 1) Network 2) Defense 3) CPU single-core 4) CPU multi-core
		networkWeight := 0.30
		defenseWeight := 0.20
		singleWeight := 0.25
		multiWeight := 0.25
		if cpuPreference == "高主频" {
			singleWeight = 0.35
			multiWeight = 0.15
		}
		if cpuPreference == "多核优先" {
			singleWeight = 0.15
			multiWeight = 0.35
		}

		score := float64(p.ScoreNetwork)*networkWeight +
			float64(p.ScoreDefense)*defenseWeight +
			float64(p.ScoreCPUSingle)*singleWeight +
			float64(p.ScoreCPUMulti)*multiWeight

		// Memory/storage are demand constraints, not additional score dimensions.
		if requestedMemoryGB > 0 {
			memGB := parseStorageGB(p.Memory)
			if memGB < requestedMemoryGB {
				demandOK = false
			}
		}
		if hasStoragePreference {
			storGB := parseStorageGB(p.Storage)
			if requestedStorageGB > 0 {
				if storGB < requestedStorageGB {
					demandOK = false
				}
			} else if !strings.Contains(strings.ToLower(p.Storage), strings.ToLower(storage)) {
				demandOK = false
			}
		}
		candidates[i].demandOK = demandOK

		// Value nudge: slightly prefer cheaper option when scores are close
		if cd.price > 0 {
			score += 5 / (1 + cd.price/500)
		}

		candidates[i].fitScore = score
	}

	// ── Step 4: sort – in-budget first, then by fitScore desc ──────────────
	sort.Slice(candidates, func(i, j int) bool {
		ci, cj := candidates[i], candidates[j]
		if ci.inBudget != cj.inBudget {
			return ci.inBudget
		}
		if ci.demandOK != cj.demandOK {
			return ci.demandOK
		}
		return ci.fitScore > cj.fitScore
	})

	hasDemandMatched := false
	for _, cd := range candidates {
		if cd.inBudget && cd.demandOK {
			hasDemandMatched = true
			break
		}
	}

	// Collect top 12 in-budget + up to 8 over-budget as reference
	matches := make([]wizardProduct, 0, 20)
	outCount := 0
	for _, cd := range candidates {
		if len(matches) >= 20 {
			break
		}
		if hasDemandMatched && !cd.demandOK {
			continue
		}
		if !cd.inBudget {
			if outCount >= 8 {
				continue
			}
			outCount++
		}
		p := cd.p
		reason := buildWizardReason(p, cd.price, bMin, bMax, region, usage, needLargeBandwidth, needMultiIP)
		advantages, disadvantages := buildWizardPros(p, cd.price, bMin, bMax, cpuPreference, requestedMemoryGB, hasStoragePreference, needLargeBandwidth, needMultiIP)
		matches = append(matches, wizardProduct{
			ID:             p.ID,
			Name:           p.Name,
			Region:         p.Region,
			Bandwidth:      p.Bandwidth,
			Memory:         p.Memory,
			Storage:        p.Storage,
			DisplayPrice:   cd.price,
			CPUModel:       p.CPU.Model,
			TotalBenchmark: p.CPU.Benchmark,
			IsDualCPU:      p.IsDualCPU,
			Reason:         reason,
			SuitableFor:    usage,
			Advantages:     advantages,
			Disadvantages:  disadvantages,
			TotalScore:     cd.fitScore,
		})
	}

	analysis := "已根据您的预算和需求完成匹配，优先展示符合预算的方案。"
	if budgetRelaxed {
		analysis = "当前预算范围内暂无商品，已为您展示最接近预算的方案，建议适当放宽预算后重新筛选。"
	} else if inBudgetCount > 0 && !unlimited {
		analysis = fmt.Sprintf("在您 %s 的预算范围内，共找到 %d 款匹配商品，已按需求契合度排序。", budget, inBudgetCount)
	}

	c.JSON(http.StatusOK, gin.H{
		"analysis": analysis,
		"products": matches,
		"fallback": len(matches) == 0,
	})
}

// parseStorageGB extracts a numeric GB value from strings like "128G", "2TB", "2x500GB".
func parseStorageGB(s string) float64 {
	s = strings.ToLower(strings.ReplaceAll(s, " ", ""))
	reMulti := regexp.MustCompile(`(\d+)\s*[x*×]\s*(\d+(?:\.\d+)?)\s*([tgm]b?)`)
	total := 0.0

	for _, m := range reMulti.FindAllStringSubmatch(s, -1) {
		count, _ := strconv.ParseFloat(m[1], 64)
		v, _ := strconv.ParseFloat(m[2], 64)
		switch {
		case strings.HasPrefix(m[3], "t"):
			v *= 1024
		case strings.HasPrefix(m[3], "m"):
			v /= 1024
		}
		total += count * v
	}

	// Remove multiplicative fragments to avoid double-counting in simple parser.
	remainder := reMulti.ReplaceAllString(s, " ")
	re := regexp.MustCompile(`(\d+(?:\.\d+)?)\s*([tgm]b?)`)
	for _, m := range re.FindAllStringSubmatch(remainder, -1) {
		v, _ := strconv.ParseFloat(m[1], 64)
		switch {
		case strings.HasPrefix(m[2], "t"):
			v *= 1024
		case strings.HasPrefix(m[2], "m"):
			v /= 1024
		}
		total += v
	}
	if total == 0 {
		if n := regexp.MustCompile(`\d+`).FindString(s); n != "" {
			total, _ = strconv.ParseFloat(n, 64)
		}
	}
	return total
}

// extractRequestedMemoryGB tries to parse explicit memory requirement from usage text,
// e.g. "内存 64G" / "64GB 内存" / "2TB 内存".
func extractRequestedMemoryGB(usage string) float64 {
	u := strings.ToLower(strings.TrimSpace(usage))
	if !strings.Contains(u, "内存") {
		return 0
	}
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`内存[^0-9]{0,6}(\d+(?:\.\d+)?)\s*([tgm]b?)`),
		regexp.MustCompile(`(\d+(?:\.\d+)?)\s*([tgm]b?)[^\n]{0,6}内存`),
	}

	var m []string
	for _, re := range patterns {
		m = re.FindStringSubmatch(u)
		if len(m) == 3 {
			break
		}
	}
	if len(m) != 3 {
		return 0
	}
	v, err := strconv.ParseFloat(m[1], 64)
	if err != nil {
		return 0
	}
	unit := m[2]
	if strings.HasPrefix(unit, "t") {
		return v * 1024
	}
	if strings.HasPrefix(unit, "m") {
		return v / 1024
	}
	return v
}

func parseBandwidthMbps(s string) float64 {
	t := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(s), " ", ""))
	if t == "" || t == "不限" {
		return 0
	}
	re := regexp.MustCompile(`(\d+(?:\.\d+)?)\s*([gmk]?)(?:bps|b|m)?`)
	m := re.FindStringSubmatch(t)
	if len(m) < 3 {
		return 0
	}
	v, err := strconv.ParseFloat(m[1], 64)
	if err != nil {
		return 0
	}
	switch m[2] {
	case "g":
		return v * 1000
	case "k":
		return v / 1000
	default:
		return v
	}
}

func detectLargeBandwidthDemand(usage string) bool {
	u := strings.ToLower(usage)
	keywords := []string{"大带宽", "高带宽", "千兆", "万兆", "1g", "10g", "视频分发", "直播", "下载"}
	for _, kw := range keywords {
		if strings.Contains(u, strings.ToLower(kw)) {
			return true
		}
	}
	return false
}

func detectMultiIPDemand(usage string) bool {
	u := strings.ToLower(usage)
	keywords := []string{"站群", "多ip", "多ip段", "多段ip", "多线路ip", "批量ip", "ip池"}
	for _, kw := range keywords {
		if strings.Contains(u, strings.ToLower(kw)) {
			return true
		}
	}
	return false
}

func supportsMultiIP(ipLabel string) bool {
	v := strings.ToLower(strings.TrimSpace(ipLabel))
	if v == "" {
		return false
	}
	if strings.Contains(v, "多ip") || strings.Contains(v, "站群") || strings.Contains(v, "ip段") || strings.Contains(v, "独立ip") {
		return true
	}
	if m := regexp.MustCompile(`(\d+)\s*ip`).FindStringSubmatch(v); len(m) == 2 {
		n, _ := strconv.Atoi(m[1])
		return n >= 2
	}
	return false
}

func buildWizardReason(p model.Product, price, bMin, bMax float64, region, usage string, needLargeBandwidth bool, needMultiIP bool) string {
	parts := []string{}
	if bMax < 99999 && price <= bMax {
		parts = append(parts, "符合预算")
	} else if bMax < 99999 {
		parts = append(parts, "超出预算")
	}
	if region != "" && region != "不限" && strings.Contains(strings.ToLower(p.Region), strings.ToLower(region)) {
		parts = append(parts, "地域匹配")
	}
	if needLargeBandwidth && parseBandwidthMbps(p.Bandwidth) >= 500 {
		parts = append(parts, "大带宽匹配")
	}
	if needMultiIP && supportsMultiIP(p.IPLabel) {
		parts = append(parts, "多IP需求匹配")
	}
	if usage != "" {
		parts = append(parts, "适合"+usage)
	}
	if len(parts) == 0 {
		return "综合配置均衡，性价比较高"
	}
	return strings.Join(parts, "，")
}

func buildWizardPros(p model.Product, price, bMin, bMax float64, cpuPreference string, requestedMemoryGB float64, hasStoragePreference bool, needLargeBandwidth bool, needMultiIP bool) ([]string, []string) {
	pros := []string{}
	cons := []string{}

	if bMax < 99999 && price <= bMax {
		pros = append(pros, "价格在预算内")
	} else if bMax < 99999 {
		cons = append(cons, fmt.Sprintf("价格 ¥%.0f 超出预算", price))
	}
	if p.ScoreNetwork >= 70 {
		pros = append(pros, "网络质量较好")
	} else if p.ScoreNetwork < 40 {
		cons = append(cons, "网络评分偏低")
	}

	if p.ScoreDefense >= 70 {
		pros = append(pros, "防御能力较强")
	} else if p.ScoreDefense < 40 {
		cons = append(cons, "防御能力偏弱")
	}

	if cpuPreference == "高主频" {
		if p.ScoreCPUSingle >= 70 {
			pros = append(pros, "CPU 单核表现较强")
		} else {
			cons = append(cons, "CPU 单核表现一般")
		}
	} else if cpuPreference == "多核优先" {
		if p.ScoreCPUMulti >= 70 {
			pros = append(pros, "CPU 多核表现较强")
		} else {
			cons = append(cons, "CPU 多核表现一般")
		}
	} else {
		if p.ScoreCPUSingle >= 65 {
			pros = append(pros, "CPU 单核表现稳定")
		}
		if p.ScoreCPUMulti >= 65 {
			pros = append(pros, "CPU 多核表现稳定")
		}
	}

	if requestedMemoryGB > 0 {
		memGB := parseStorageGB(p.Memory)
		if memGB >= requestedMemoryGB {
			pros = append(pros, fmt.Sprintf("内存满足需求(%.0fG)", requestedMemoryGB))
		} else {
			cons = append(cons, fmt.Sprintf("内存不足，需求 %.0fG", requestedMemoryGB))
		}
	}

	if hasStoragePreference {
		pros = append(pros, "已按用户硬盘偏好参与匹配")
	}

	if needLargeBandwidth {
		if parseBandwidthMbps(p.Bandwidth) >= 500 {
			pros = append(pros, "大带宽能力满足场景")
		} else {
			cons = append(cons, "带宽规格偏低")
		}
	}

	if needMultiIP {
		if supportsMultiIP(p.IPLabel) {
			pros = append(pros, "支持多IP/站群场景")
		} else {
			cons = append(cons, "多IP能力信息不足")
		}
	}

	if len(pros) == 0 {
		pros = append(pros, "配置均衡")
	}
	return pros, cons
}

// GET /api/ai/sessions — user's recent AI sessions
func (h *AIHandler) Sessions(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusOK, gin.H{"success": true, "sessions": []struct{}{}})
		return
	}

	page := 1
	if p, err := strconv.Atoi(c.DefaultQuery("page", "1")); err == nil && p > 0 {
		page = p
	}
	pageSize := 10

	var sessions []model.AISession
	var total int64
	database.DB.Model(&model.AISession{}).Where("user_id = ?", userID).Count(&total)
	database.DB.Where("user_id = ?", userID).
		Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&sessions)

	c.JSON(http.StatusOK, gin.H{
		"success":         true,
		"sessions":   sessions,
		"total":      total,
		"page":       page,
		"totalPages": (total + int64(pageSize) - 1) / int64(pageSize),
	})
}

// GET /api/ai/sessions/:id — single session with messages
func (h *AIHandler) SessionDetail(c *gin.Context) {
	sessionID := c.Param("id")
	userID := middleware.GetUserID(c)

	var session model.AISession
	if err := database.DB.First(&session, "id = ?", sessionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "会话不存在"})
		return
	}

	// Only owner can view
	if session.UserID != nil && *session.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权访问"})
		return
	}

	var messages []model.AIMessage
	database.DB.Where("session_id = ?", sessionID).Order("created_at ASC").Find(&messages)

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"session":  session,
		"messages": messages,
	})
}

// GET /api/ai/fallback-products — return up to 6 active products for fallback
func (h *AIHandler) FallbackProducts(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var products []model.Product
	database.DB.Where("status = ?", "ACTIVE").Preload("CPU").Order("sort_order ASC").Limit(6).Find(&products)

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

	type fallbackProduct struct {
		ID           string   `json:"id"`
		Name         string   `json:"name"`
		Region       string   `json:"region"`
		Bandwidth    string   `json:"bandwidth"`
		Memory       string   `json:"memory"`
		Storage      string   `json:"storage"`
		DisplayPrice float64  `json:"displayPrice"`
		CPUModel     string   `json:"cpuModel"`
		IsDualCPU    bool     `json:"isDualCPU"`
		Advantages   []string `json:"advantages"`
	}

	items := make([]fallbackProduct, 0, len(products))
	for _, p := range products {
		advs := []string{}
		if p.AIDescription != nil && *p.AIDescription != "" {
			s := *p.AIDescription
			advs = append(advs, s[:min(len(s), 40)])
		}
		if p.AISuitableFor != nil && *p.AISuitableFor != "" {
			s := *p.AISuitableFor
			advs = append(advs, s[:min(len(s), 40)])
		}
		items = append(items, fallbackProduct{
			ID:           p.ID,
			Name:         p.Name,
			Region:       p.Region,
			Bandwidth:    p.Bandwidth,
			Memory:       p.Memory,
			Storage:      p.Storage,
			DisplayPrice: service.CalculatePrice(p.OriginalPrice, level, pricingConfig),
			CPUModel:     p.CPU.Model,
			IsDualCPU:    p.IsDualCPU,
			Advantages:   advs,
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "products": items})
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// POST /api/admin/ai/ticket-suggest
func (h *AIHandler) TicketSuggest(c *gin.Context) {
	var req struct {
		TicketID string `json:"ticketId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 ticketId"})
		return
	}

	var ticket model.Ticket
	if err := database.DB.First(&ticket, "id = ?", req.TicketID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "工单不存在"})
		return
	}

	var messages []model.TicketMessage
	database.DB.Where("ticket_id = ?", req.TicketID).Order("created_at asc").Limit(10).Find(&messages)

	// Build context string
	var sb strings.Builder
	sb.WriteString("工单主题：" + ticket.Subject + "\n")
	sb.WriteString("工单类型：" + ticket.Type + "\n\n")
	sb.WriteString("对话历史：\n")
	for _, m := range messages {
		role := "用户"
		if m.Role == "ADMIN" || m.Role == "AGENT" {
			role = "客服"
		}
		sb.WriteString(role + "：" + m.Content + "\n")
	}
	sb.WriteString("\n请根据以上工单信息，为客服生成一条建议回复。")

	suggestion, err := h.aiClient.SuggestTicketReply(c.Request.Context(), sb.String())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI 生成失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "suggestion": suggestion})
}

// POST /api/admin/ai/ticket-feedback
func (h *AIHandler) TicketFeedback(c *gin.Context) {
	var req struct {
		TicketID   string `json:"ticketId" binding:"required"`
		Suggestion string `json:"suggestion" binding:"required"`
		Action     string `json:"action" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	validActions := map[string]bool{"adopted": true, "modified": true, "ignored": true}
	if !validActions[req.Action] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 action"})
		return
	}

	adminID := middleware.GetUserID(c)
	fb := model.AITicketFeedback{
		ID:         service.GenerateID(),
		TicketID:   req.TicketID,
		AdminID:    adminID,
		Suggestion: req.Suggestion,
		Action:     req.Action,
		CreatedAt:  time.Now(),
	}
	database.DB.Create(&fb)

	c.JSON(http.StatusOK, gin.H{"success": true})
}
