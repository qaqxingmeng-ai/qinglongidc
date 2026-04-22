package service

import (
	"math"

	"serverai-backend/internal/model"
)

// PriceLevels in order.
var PriceLevels = []string{"PARTNER", "VIP_TOP", "VIP", "GUEST"}

// LevelLabels maps level to display label.
var LevelLabels = map[string]string{
	"PARTNER": "合作商",
	"VIP_TOP": "高级会员",
	"VIP":     "会员",
	"GUEST":   "普通用户",
}

// DefaultPricingRules returns the default pricing rules.
func DefaultPricingRules() model.PricingConfig {
	return model.PricingConfig{
		ID:                "default",
		PartnerMarkup:     0.20,
		VIPTopMarkup:      0.40,
		VIPMarkup:         0.50,
		GuestMarkup:       1.00,
		RoundingThreshold: 600,
		RoundingSmallStep: 10,
		RoundingLargeStep: 50,
	}
}

func NormalizePriceLevel(level string) string {
	for _, l := range PriceLevels {
		if l == level {
			return level
		}
	}
	return "GUEST"
}

func GetMarkup(config model.PricingConfig, level string) float64 {
	switch level {
	case "PARTNER":
		return config.PartnerMarkup
	case "VIP_TOP":
		return config.VIPTopMarkup
	case "VIP":
		return config.VIPMarkup
	default:
		return config.GuestMarkup
	}
}

func roundUp(price float64, config model.PricingConfig) float64 {
	step := config.RoundingSmallStep
	if price > float64(config.RoundingThreshold) {
		step = config.RoundingLargeStep
	}
	return math.Ceil(price/float64(step)) * float64(step)
}

// CalculatePrice computes the retail price for a given level.
// costPrice = originalPrice / 2
// retailPrice = costPrice * (1 + markup)
// then rounded up by step
func CalculatePrice(originalPrice float64, level string, config model.PricingConfig) float64 {
	costPrice := originalPrice / 2
	markup := GetMarkup(config, level)
	rawPrice := costPrice * (1 + markup)
	return roundUp(rawPrice, config)
}

// CalculateAllPrices computes prices for all levels.
func CalculateAllPrices(originalPrice float64, config model.PricingConfig) map[string]float64 {
	result := make(map[string]float64)
	for _, level := range PriceLevels {
		result[level] = CalculatePrice(originalPrice, level, config)
	}
	return result
}

// GetCostPrice returns originalPrice / 2.
func GetCostPrice(originalPrice float64) float64 {
	return originalPrice / 2
}

// CanInvite checks if a level allows generating invite codes.
func CanInvite(level string) bool {
	return level == "PARTNER"
}

// CanCreateSubUser checks if a level allows creating sub-users.
func CanCreateSubUser(level string) bool {
	return level == "PARTNER"
}

// CreatableLevels are the levels a PARTNER can assign to sub-users.
var CreatableLevels = []string{"VIP_TOP", "VIP", "GUEST"}
