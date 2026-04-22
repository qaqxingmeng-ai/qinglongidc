package admin

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

type PricingHandler struct{}

type pricingLevelResponse struct {
	Level             string  `json:"level"`
	Label             string  `json:"label"`
	Markup            float64 `json:"markup"`
	MarkupPercent     float64 `json:"markupPercent"`
	RetailRatePercent float64 `json:"retailRatePercent"`
}

func pricingLabel(level string) string {
	switch level {
	case "PARTNER":
		return "合伙人"
	case "VIP_TOP":
		return "SVIP"
	case "VIP":
		return "VIP"
	default:
		return "访客价"
	}
}

func presentPricingConfig(config model.PricingConfig) gin.H {
	levels := []pricingLevelResponse{
		{
			Level:             "PARTNER",
			Label:             pricingLabel("PARTNER"),
			Markup:            config.PartnerMarkup,
			MarkupPercent:     config.PartnerMarkup * 100,
			RetailRatePercent: (1 + config.PartnerMarkup) * 100,
		},
		{
			Level:             "VIP_TOP",
			Label:             pricingLabel("VIP_TOP"),
			Markup:            config.VIPTopMarkup,
			MarkupPercent:     config.VIPTopMarkup * 100,
			RetailRatePercent: (1 + config.VIPTopMarkup) * 100,
		},
		{
			Level:             "VIP",
			Label:             pricingLabel("VIP"),
			Markup:            config.VIPMarkup,
			MarkupPercent:     config.VIPMarkup * 100,
			RetailRatePercent: (1 + config.VIPMarkup) * 100,
		},
		{
			Level:             "GUEST",
			Label:             pricingLabel("GUEST"),
			Markup:            config.GuestMarkup,
			MarkupPercent:     config.GuestMarkup * 100,
			RetailRatePercent: (1 + config.GuestMarkup) * 100,
		},
	}

	return gin.H{
		"id":                config.ID,
		"partnerMarkup":     config.PartnerMarkup,
		"vipTopMarkup":      config.VIPTopMarkup,
		"vipMarkup":         config.VIPMarkup,
		"guestMarkup":       config.GuestMarkup,
		"roundingThreshold": config.RoundingThreshold,
		"roundingSmallStep": config.RoundingSmallStep,
		"roundingLargeStep": config.RoundingLargeStep,
		"createdAt":         config.CreatedAt,
		"updatedAt":         config.UpdatedAt,
		"rounding": gin.H{
			"threshold": config.RoundingThreshold,
			"smallStep": config.RoundingSmallStep,
			"largeStep": config.RoundingLargeStep,
		},
		"levels": levels,
	}
}

func numberFromMap(body map[string]interface{}, key string) (float64, bool) {
	raw, ok := body[key]
	if !ok {
		return 0, false
	}
	switch value := raw.(type) {
	case float64:
		return value, true
	case float32:
		return float64(value), true
	case int:
		return float64(value), true
	case int32:
		return float64(value), true
	case int64:
		return float64(value), true
	case string:
		var parsed float64
		if _, err := fmt.Sscanf(value, "%f", &parsed); err == nil {
			return parsed, true
		}
	}
	return 0, false
}

func NewPricingHandler() *PricingHandler {
	return &PricingHandler{}
}

// GET /api/admin/pricing
func (h *PricingHandler) Get(c *gin.Context) {
	var config model.PricingConfig
	if err := database.DB.First(&config, "id = ?", "default").Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "定价配置不存在"})
		return
	}

	c.JSON(http.StatusOK, presentPricingConfig(config))
}

// PUT /api/admin/pricing
func (h *PricingHandler) Update(c *gin.Context) {
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的定价参数"})
		return
	}

	partnerMarkup, ok := numberFromMap(body, "partnerMarkup")
	if !ok {
		if markups, exists := body["markups"].(map[string]interface{}); exists {
			partnerMarkup, _ = numberFromMap(markups, "PARTNER")
		}
	}
	vipTopMarkup, ok := numberFromMap(body, "vipTopMarkup")
	if !ok {
		if markups, exists := body["markups"].(map[string]interface{}); exists {
			vipTopMarkup, _ = numberFromMap(markups, "VIP_TOP")
		}
	}
	vipMarkup, ok := numberFromMap(body, "vipMarkup")
	if !ok {
		if markups, exists := body["markups"].(map[string]interface{}); exists {
			vipMarkup, _ = numberFromMap(markups, "VIP")
		}
	}
	guestMarkup, ok := numberFromMap(body, "guestMarkup")
	if !ok {
		if markups, exists := body["markups"].(map[string]interface{}); exists {
			guestMarkup, _ = numberFromMap(markups, "GUEST")
		}
	}
	roundingSmallStep, _ := numberFromMap(body, "roundingSmallStep")
	roundingLargeStep, _ := numberFromMap(body, "roundingLargeStep")
	roundingThreshold, _ := numberFromMap(body, "roundingThreshold")

	if roundingMap, exists := body["rounding"].(map[string]interface{}); exists {
		if value, ok := numberFromMap(roundingMap, "smallStep"); ok {
			roundingSmallStep = value
		}
		if value, ok := numberFromMap(roundingMap, "largeStep"); ok {
			roundingLargeStep = value
		}
		if value, ok := numberFromMap(roundingMap, "threshold"); ok {
			roundingThreshold = value
		}
	}

	updates := map[string]interface{}{
		"partner_markup":      partnerMarkup,
		"vip_top_markup":      vipTopMarkup,
		"vip_markup":          vipMarkup,
		"guest_markup":        guestMarkup,
		"rounding_small_step": int(roundingSmallStep),
		"rounding_large_step": int(roundingLargeStep),
		"rounding_threshold":  int(roundingThreshold),
		"updated_at":          time.Now(),
	}

	result := database.DB.Model(&model.PricingConfig{}).Where("id = ?", "default").Updates(updates)
	if result.RowsAffected == 0 {
		// Create default
		config := model.PricingConfig{
			ID:                "default",
			PartnerMarkup:     partnerMarkup,
			VIPTopMarkup:      vipTopMarkup,
			VIPMarkup:         vipMarkup,
			GuestMarkup:       guestMarkup,
			RoundingSmallStep: int(roundingSmallStep),
			RoundingLargeStep: int(roundingLargeStep),
			RoundingThreshold: int(roundingThreshold),
			CreatedAt:         time.Now(),
			UpdatedAt:         time.Now(),
		}
		database.DB.Create(&config)
	}

	var config model.PricingConfig
	if err := database.DB.First(&config, "id = ?", "default").Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": true})
		return
	}

	c.JSON(http.StatusOK, presentPricingConfig(config))
}
