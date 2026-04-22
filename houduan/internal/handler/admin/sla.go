package admin

import (
	"fmt"
	"math"
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

type SLAHandler struct{}

func NewSLAHandler() *SLAHandler { return &SLAHandler{} }

type slaScope struct {
	Region   string
	Supplier string
}

func normalizeScope(region, supplier string) slaScope {
	return slaScope{Region: strings.TrimSpace(region), Supplier: strings.TrimSpace(supplier)}
}

func getSLAConfig(region, supplier string) model.SLAConfig {
	scope := normalizeScope(region, supplier)
	defaults := model.SLAConfig{
		AvailabilityTarget:     99.9,
		FirstResponseTargetMin: 30,
		RecoveryTargetMin:      240,
		CompensationMultiplier: 1.5,
	}

	var cfg model.SLAConfig
	if err := database.DB.Where("region = ? AND supplier = ?", scope.Region, scope.Supplier).First(&cfg).Error; err == nil {
		return cfg
	}
	if scope.Region != "" {
		if err := database.DB.Where("region = ? AND supplier = ''", scope.Region).First(&cfg).Error; err == nil {
			return cfg
		}
	}
	if scope.Supplier != "" {
		if err := database.DB.Where("region = '' AND supplier = ?", scope.Supplier).First(&cfg).Error; err == nil {
			return cfg
		}
	}
	if err := database.DB.Where("region = '' AND supplier = ''").First(&cfg).Error; err == nil {
		return cfg
	}
	return defaults
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

func estimateDailyFee(serverID, orderID *string) float64 {
	if serverID != nil && *serverID != "" {
		var server model.ServerInstance
		if err := database.DB.Preload("Product").First(&server, "id = ?", *serverID).Error; err == nil {
			if server.Product.OriginalPrice > 0 {
				return server.Product.OriginalPrice / 30
			}
		}
	}
	if orderID != nil && *orderID != "" {
		var item model.OrderItem
		if err := database.DB.Where("order_id = ?", *orderID).Order("id ASC").First(&item).Error; err == nil {
			if item.Price > 0 {
				months := item.Period
				if months < 1 {
					months = 1
				}
				return item.Price / float64(months*30)
			}
		}
	}
	return 0
}

func lookupTicketScope(ticketID string) (string, string, *string, *string) {
	var t model.Ticket
	if err := database.DB.First(&t, "id = ?", ticketID).Error; err != nil {
		return "", "", nil, nil
	}

	orderID := t.OrderID
	if orderID != nil && *orderID != "" {
		var item model.OrderItem
		if err := database.DB.Where("order_id = ?", *orderID).Order("id ASC").First(&item).Error; err == nil {
			var p model.Product
			if err := database.DB.First(&p, "id = ?", item.ProductID).Error; err == nil {
				return p.Region, p.Supplier, t.OrderID, nil
			}
		}
	}

	return "", "", t.OrderID, nil
}

func calcCompensation(durationMin, targetMin int, dailyFee, multiplier float64) (int, float64) {
	if durationMin <= targetMin || dailyFee <= 0 || multiplier <= 0 {
		return 0, 0
	}
	overMin := durationMin - targetMin
	days := int(math.Ceil(float64(overMin) / 1440.0))
	if days < 1 {
		days = 1
	}
	return days, round2(float64(days) * dailyFee * multiplier)
}

// GET /api/admin/sla/configs
func (h *SLAHandler) ConfigList(c *gin.Context) {
	var items []model.SLAConfig
	database.DB.Order("region ASC, supplier ASC, updated_at DESC").Find(&items)
	c.JSON(http.StatusOK, gin.H{"items": items})
}

// POST /api/admin/sla/configs
func (h *SLAHandler) UpsertConfig(c *gin.Context) {
	var req struct {
		ID                     *string  `json:"id"`
		Region                 string   `json:"region"`
		Supplier               string   `json:"supplier"`
		AvailabilityTarget     *float64 `json:"availabilityTarget"`
		FirstResponseTargetMin *int     `json:"firstResponseTargetMin"`
		RecoveryTargetMin      *int     `json:"recoveryTargetMin"`
		CompensationMultiplier *float64 `json:"compensationMultiplier"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	scope := normalizeScope(req.Region, req.Supplier)
	if req.AvailabilityTarget != nil && (*req.AvailabilityTarget < 90 || *req.AvailabilityTarget > 100) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "availabilityTarget 范围为 90-100"})
		return
	}
	if req.FirstResponseTargetMin != nil && (*req.FirstResponseTargetMin < 1 || *req.FirstResponseTargetMin > 1440) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "firstResponseTargetMin 范围为 1-1440"})
		return
	}
	if req.RecoveryTargetMin != nil && (*req.RecoveryTargetMin < 1 || *req.RecoveryTargetMin > 10080) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "recoveryTargetMin 范围为 1-10080"})
		return
	}
	if req.CompensationMultiplier != nil && (*req.CompensationMultiplier < 0.1 || *req.CompensationMultiplier > 10) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "compensationMultiplier 范围为 0.1-10"})
		return
	}

	now := time.Now()
	var cfg model.SLAConfig
	if req.ID != nil && *req.ID != "" {
		if err := database.DB.First(&cfg, "id = ?", *req.ID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "配置不存在"})
			return
		}
	} else {
		err := database.DB.Where("region = ? AND supplier = ?", scope.Region, scope.Supplier).First(&cfg).Error
		if err != nil {
			cfg = model.SLAConfig{ID: service.GenerateID(), Region: scope.Region, Supplier: scope.Supplier, CreatedAt: now}
		}
	}

	if req.AvailabilityTarget != nil {
		cfg.AvailabilityTarget = *req.AvailabilityTarget
	} else if cfg.AvailabilityTarget == 0 {
		cfg.AvailabilityTarget = 99.9
	}
	if req.FirstResponseTargetMin != nil {
		cfg.FirstResponseTargetMin = *req.FirstResponseTargetMin
	} else if cfg.FirstResponseTargetMin == 0 {
		cfg.FirstResponseTargetMin = 30
	}
	if req.RecoveryTargetMin != nil {
		cfg.RecoveryTargetMin = *req.RecoveryTargetMin
	} else if cfg.RecoveryTargetMin == 0 {
		cfg.RecoveryTargetMin = 240
	}
	if req.CompensationMultiplier != nil {
		cfg.CompensationMultiplier = *req.CompensationMultiplier
	} else if cfg.CompensationMultiplier == 0 {
		cfg.CompensationMultiplier = 1.5
	}
	cfg.Region = scope.Region
	cfg.Supplier = scope.Supplier
	cfg.UpdatedAt = now

	if err := database.DB.Save(&cfg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"item": cfg})
}

// GET /api/admin/sla/violations
func (h *SLAHandler) ViolationList(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.SLAViolation{})
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		query = query.Where("status = ?", status)
	}
	if vtype := strings.TrimSpace(c.Query("type")); vtype != "" {
		query = query.Where("type = ?", vtype)
	}
	if region := strings.TrimSpace(c.Query("region")); region != "" {
		query = query.Where("region = ?", region)
	}
	if supplier := strings.TrimSpace(c.Query("supplier")); supplier != "" {
		query = query.Where("supplier = ?", supplier)
	}

	var total int64
	query.Count(&total)

	var items []model.SLAViolation
	query.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&items)

	c.JSON(http.StatusOK, gin.H{
		"items":    items,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// POST /api/admin/sla/violations
func (h *SLAHandler) CreateViolation(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	var req struct {
		Type            string  `json:"type" binding:"required"`
		Region          string  `json:"region"`
		Supplier        string  `json:"supplier"`
		TicketID        *string `json:"ticketId"`
		ServerID        *string `json:"serverId"`
		OrderID         *string `json:"orderId"`
		OccurredAt      string  `json:"occurredAt"`
		DurationMinutes int     `json:"durationMinutes"`
		TargetMinutes   int     `json:"targetMinutes"`
		Note            string  `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if req.Type != "FIRST_RESPONSE" && req.Type != "RECOVERY" && req.Type != "AVAILABILITY" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type 仅支持 FIRST_RESPONSE/RECOVERY/AVAILABILITY"})
		return
	}
	if req.DurationMinutes <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "durationMinutes 必须大于 0"})
		return
	}

	scope := normalizeScope(req.Region, req.Supplier)
	if req.TicketID != nil && *req.TicketID != "" {
		region, supplier, orderID, _ := lookupTicketScope(*req.TicketID)
		if scope.Region == "" {
			scope.Region = region
		}
		if scope.Supplier == "" {
			scope.Supplier = supplier
		}
		if req.OrderID == nil && orderID != nil {
			req.OrderID = orderID
		}
	}
	cfg := getSLAConfig(scope.Region, scope.Supplier)
	targetMin := req.TargetMinutes
	if targetMin <= 0 {
		targetMin = cfg.FirstResponseTargetMin
		if req.Type == "RECOVERY" || req.Type == "AVAILABILITY" {
			targetMin = cfg.RecoveryTargetMin
		}
	}

	dailyFee := estimateDailyFee(req.ServerID, req.OrderID)
	compDays, compAmt := calcCompensation(req.DurationMinutes, targetMin, dailyFee, cfg.CompensationMultiplier)
	now := time.Now()
	occurredAt := now
	if strings.TrimSpace(req.OccurredAt) != "" {
		if t, err := time.Parse(time.RFC3339, strings.TrimSpace(req.OccurredAt)); err == nil {
			occurredAt = t
		}
	}
	var notePtr *string
	if strings.TrimSpace(req.Note) != "" {
		note := strings.TrimSpace(req.Note)
		notePtr = &note
	}

	item := model.SLAViolation{
		ID:                 service.GenerateID(),
		Type:               req.Type,
		Source:             "MANUAL",
		Status:             "OPEN",
		Region:             scope.Region,
		Supplier:           scope.Supplier,
		TicketID:           req.TicketID,
		ServerID:           req.ServerID,
		OrderID:            req.OrderID,
		OccurredAt:         occurredAt,
		DetectedAt:         now,
		DurationMinutes:    req.DurationMinutes,
		TargetMinutes:      targetMin,
		CompensationAmount: compAmt,
		CompensationDays:   compDays,
		Note:               notePtr,
		CreatedBy:          &adminID,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	if err := database.DB.Create(&item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "记录失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"item": item})
}

func createTimeoutViolations(now time.Time) int {
	created := 0

	var tickets []model.Ticket
	database.DB.Where("status IN ? AND first_response_at IS NULL", []string{"OPEN", "REPLIED"}).Order("created_at ASC").Find(&tickets)
	for _, t := range tickets {
		region, supplier, orderID, _ := lookupTicketScope(t.ID)
		cfg := getSLAConfig(region, supplier)
		target := cfg.FirstResponseTargetMin
		if target <= 0 {
			target = 30
		}
		duration := int(now.Sub(t.CreatedAt).Minutes())
		if duration <= target {
			continue
		}

		var exist int64
		database.DB.Model(&model.SLAViolation{}).
			Where("type = ? AND source = ? AND ticket_id = ?", "FIRST_RESPONSE", "AUTO", t.ID).
			Count(&exist)
		if exist > 0 {
			continue
		}

		dailyFee := estimateDailyFee(nil, orderID)
		compDays, compAmt := calcCompensation(duration, target, dailyFee, cfg.CompensationMultiplier)
		ticketID := t.ID
		item := model.SLAViolation{
			ID:                 service.GenerateID(),
			Type:               "FIRST_RESPONSE",
			Source:             "AUTO",
			Status:             "OPEN",
			Region:             region,
			Supplier:           supplier,
			TicketID:           &ticketID,
			OrderID:            orderID,
			OccurredAt:         t.CreatedAt,
			DetectedAt:         now,
			DurationMinutes:    duration,
			TargetMinutes:      target,
			CompensationAmount: compAmt,
			CompensationDays:   compDays,
			CreatedAt:          now,
			UpdatedAt:          now,
		}
		if err := database.DB.Create(&item).Error; err == nil {
			created++
		}
	}
	return created
}

// POST /api/admin/sla/violations/scan
func (h *SLAHandler) ScanTicketTimeout(c *gin.Context) {
	now := time.Now()
	created := createTimeoutViolations(now)
	c.JSON(http.StatusOK, gin.H{"newViolations": created})
}

// PATCH /api/admin/sla/violations/:id/status
func (h *SLAHandler) UpdateViolationStatus(c *gin.Context) {
	id := c.Param("id")
	adminID := middleware.GetUserID(c)
	var req struct {
		Status string `json:"status" binding:"required"`
		Note   string `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if req.Status != "OPEN" && req.Status != "CONFIRMED" && req.Status != "WAIVED" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status 仅支持 OPEN/CONFIRMED/WAIVED"})
		return
	}

	now := time.Now()
	updates := map[string]interface{}{
		"status":     req.Status,
		"updated_at": now,
	}
	if req.Status == "CONFIRMED" || req.Status == "WAIVED" {
		updates["resolved_by"] = adminID
		updates["resolved_at"] = now
	} else {
		updates["resolved_by"] = nil
		updates["resolved_at"] = nil
	}
	if strings.TrimSpace(req.Note) != "" {
		updates["note"] = strings.TrimSpace(req.Note)
	}

	ret := database.DB.Model(&model.SLAViolation{}).Where("id = ?", id).Updates(updates)
	if ret.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "记录不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GET /api/admin/sla/reports?month=YYYY-MM
func (h *SLAHandler) Report(c *gin.Context) {
	month := strings.TrimSpace(c.DefaultQuery("month", time.Now().Format("2006-01")))
	start, err := time.Parse("2006-01", month)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "month 格式应为 YYYY-MM"})
		return
	}
	end := start.AddDate(0, 1, 0)

	type totalRow struct {
		Region       string
		Supplier     string
		TotalTickets int64
	}
	totals := make([]totalRow, 0)
	database.DB.Raw(`
		SELECT COALESCE(p.region, '') AS region, COALESCE(p.supplier, '') AS supplier, COUNT(*) AS total_tickets
		FROM tickets t
		LEFT JOIN orders o ON o.id = t.order_id
		LEFT JOIN order_items oi ON oi.order_id = o.id
		LEFT JOIN products p ON p.id = oi.product_id
		WHERE t.created_at >= ? AND t.created_at < ?
		GROUP BY COALESCE(p.region, ''), COALESCE(p.supplier, '')
	`, start, end).Scan(&totals)

	type violationRow struct {
		Region             string
		Supplier           string
		Type               string
		Cnt                int64
		CompensationAmount float64
	}
	violations := make([]violationRow, 0)
	database.DB.Raw(`
		SELECT COALESCE(region, '') AS region, COALESCE(supplier, '') AS supplier, type, COUNT(*) AS cnt, COALESCE(SUM(compensation_amount),0) AS compensation_amount
		FROM sla_violations
		WHERE created_at >= ? AND created_at < ?
		GROUP BY COALESCE(region, ''), COALESCE(supplier, ''), type
	`, start, end).Scan(&violations)

	type agg struct {
		Region                string  `json:"region"`
		Supplier              string  `json:"supplier"`
		TotalTickets          int64   `json:"totalTickets"`
		FirstResponseBreaches int64   `json:"firstResponseBreaches"`
		RecoveryBreaches      int64   `json:"recoveryBreaches"`
		AvailabilityBreaches  int64   `json:"availabilityBreaches"`
		FirstResponseRate     float64 `json:"firstResponseRate"`
		TotalCompensation     float64 `json:"totalCompensation"`
	}
	bucket := map[string]*agg{}
	keyOf := func(region, supplier string) string { return region + "|" + supplier }

	for _, t := range totals {
		k := keyOf(t.Region, t.Supplier)
		bucket[k] = &agg{Region: t.Region, Supplier: t.Supplier, TotalTickets: t.TotalTickets}
	}
	for _, v := range violations {
		k := keyOf(v.Region, v.Supplier)
		if _, ok := bucket[k]; !ok {
			bucket[k] = &agg{Region: v.Region, Supplier: v.Supplier}
		}
		it := bucket[k]
		switch v.Type {
		case "FIRST_RESPONSE":
			it.FirstResponseBreaches += v.Cnt
		case "RECOVERY":
			it.RecoveryBreaches += v.Cnt
		case "AVAILABILITY":
			it.AvailabilityBreaches += v.Cnt
		}
		it.TotalCompensation = round2(it.TotalCompensation + v.CompensationAmount)
	}

	items := make([]agg, 0, len(bucket))
	for _, it := range bucket {
		if it.TotalTickets > 0 {
			rate := (1 - float64(it.FirstResponseBreaches)/float64(it.TotalTickets)) * 100
			if rate < 0 {
				rate = 0
			}
			it.FirstResponseRate = round2(rate)
		} else {
			it.FirstResponseRate = 100
		}
		items = append(items, *it)
	}

	type summary struct {
		TotalBreaches     int64   `json:"totalBreaches"`
		TotalCompensation float64 `json:"totalCompensation"`
		FirstResponseRate float64 `json:"firstResponseRate"`
	}
	s := summary{}
	var totalTickets int64
	var firstResponseBreaches int64
	for _, it := range items {
		totalTickets += it.TotalTickets
		firstResponseBreaches += it.FirstResponseBreaches
		s.TotalBreaches += it.FirstResponseBreaches + it.RecoveryBreaches + it.AvailabilityBreaches
		s.TotalCompensation = round2(s.TotalCompensation + it.TotalCompensation)
	}
	if totalTickets > 0 {
		s.FirstResponseRate = round2((1 - float64(firstResponseBreaches)/float64(totalTickets)) * 100)
	} else {
		s.FirstResponseRate = 100
	}

	c.JSON(http.StatusOK, gin.H{
		"month":   month,
		"summary": s,
		"items":   items,
		"note":    fmt.Sprintf("报表基于 %s 月工单与违约记录聚合", month),
	})
}
