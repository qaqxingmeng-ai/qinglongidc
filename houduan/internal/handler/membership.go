package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
)

type MembershipHandler struct{}

func NewMembershipHandler() *MembershipHandler { return &MembershipHandler{} }

// levelThresholds maps level to minimum cumulative spend (CNY)
var levelThresholds = map[string]float64{
	"GUEST":   0,
	"VIP":     500,
	"VIP_TOP": 2000,
	"PARTNER": 10000,
}

// levelOrder is the ordered sequence
var levelOrder = []string{"GUEST", "VIP", "VIP_TOP", "PARTNER"}

// Benefits table
var levelBenefits = map[string]map[string]interface{}{
	"GUEST": {
		"label":           "普通用户",
		"color":           "gray",
		"discountPercent": 0,
		"ticketPriority":  "NORMAL",
		"supportSLA":      "48小时",
		"dedicatedCSM":    false,
		"apiRateLimit":    100,
		"badge":           false,
	},
	"VIP": {
		"label":           "VIP",
		"color":           "blue",
		"discountPercent": 5,
		"ticketPriority":  "NORMAL",
		"supportSLA":      "24小时",
		"dedicatedCSM":    false,
		"apiRateLimit":    500,
		"badge":           true,
	},
	"VIP_TOP": {
		"label":           "VIP TOP",
		"color":           "purple",
		"discountPercent": 10,
		"ticketPriority":  "HIGH",
		"supportSLA":      "8小时",
		"dedicatedCSM":    false,
		"apiRateLimit":    2000,
		"badge":           true,
	},
	"PARTNER": {
		"label":           "合作伙伴",
		"color":           "gold",
		"discountPercent": 15,
		"ticketPriority":  "HIGH",
		"supportSLA":      "4小时",
		"dedicatedCSM":    true,
		"apiRateLimit":    10000,
		"badge":           true,
	},
}

// GET /api/membership/benefits
func (h *MembershipHandler) Benefits(c *gin.Context) {
	benefits := make([]map[string]interface{}, len(levelOrder))
	for i, lvl := range levelOrder {
		b := levelBenefits[lvl]
		entry := map[string]interface{}{
			"level":           lvl,
			"minSpend":        levelThresholds[lvl],
		}
		for k, v := range b {
			entry[k] = v
		}
		benefits[i] = entry
	}
	c.JSON(http.StatusOK, gin.H{"levels": benefits})
}

// GET /api/membership/progress
func (h *MembershipHandler) Progress(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var user model.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	// Cumulative spend: sum of all purchase and renewal transactions (negative amounts mean spending)
	var spent float64
	database.DB.Model(&model.Transaction{}).
		Select("COALESCE(SUM(ABS(amount)),0)").
		Where("user_id = ? AND type IN ? AND amount < 0", userID, []string{"PURCHASE", "RENEW", "RENEWAL"}).
		Scan(&spent)

	currentLevel := user.Level

	// Find next level
	var nextLevel *string
	var nextThreshold *float64
	for i, lvl := range levelOrder {
		if lvl == currentLevel && i+1 < len(levelOrder) {
			nl := levelOrder[i+1]
			nt := levelThresholds[nl]
			nextLevel = &nl
			nextThreshold = &nt
			break
		}
	}

	currentBenefits := levelBenefits[currentLevel]
	currentBenefitsWithLevel := map[string]interface{}{
		"level":    currentLevel,
		"minSpend": levelThresholds[currentLevel],
	}
	for k, v := range currentBenefits {
		currentBenefitsWithLevel[k] = v
	}

	var progressPct float64
	if nextThreshold != nil {
		currentThreshold := levelThresholds[currentLevel]
		gap := *nextThreshold - currentThreshold
		done := spent - currentThreshold
		if gap > 0 {
			progressPct = done / gap * 100
		}
		if progressPct > 100 {
			progressPct = 100
		}
		if progressPct < 0 {
			progressPct = 0
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"currentLevel":    currentLevel,
		"totalSpent":      spent,
		"benefits":        currentBenefitsWithLevel,
		"nextLevel":       nextLevel,
		"nextThreshold":   nextThreshold,
		"progressPercent": progressPct,
	})
}
