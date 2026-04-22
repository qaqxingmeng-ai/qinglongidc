package admin

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

type NpsHandler struct{}

func NewNpsHandler() *NpsHandler { return &NpsHandler{} }

// GET /api/admin/nps/stats
func (h *NpsHandler) Stats(c *gin.Context) {
	var total int64
	database.DB.Model(&model.NpsResponse{}).Count(&total)

	var avgScore float64
	database.DB.Model(&model.NpsResponse{}).Select("COALESCE(AVG(score),0)").Scan(&avgScore)

	// Distribution 0-10
	type Dist struct {
		Score int   `json:"score"`
		Count int64 `json:"count"`
	}
	var dist []Dist
	database.DB.Model(&model.NpsResponse{}).
		Select("score, count(*) as count").
		Group("score").Order("score ASC").Scan(&dist)

	// Category breakdown: Detractors (0-6), Passives (7-8), Promoters (9-10)
	var detractors, passives, promoters int64
	database.DB.Model(&model.NpsResponse{}).Where("score <= 6").Count(&detractors)
	database.DB.Model(&model.NpsResponse{}).Where("score IN (7,8)").Count(&passives)
	database.DB.Model(&model.NpsResponse{}).Where("score >= 9").Count(&promoters)

	npsScore := 0.0
	if total > 0 {
		npsScore = (float64(promoters) - float64(detractors)) / float64(total) * 100
	}

	// Monthly trend (last 6 months)
	type MonthlyData struct {
		Month string  `json:"month"`
		Count int64   `json:"count"`
		Avg   float64 `json:"avg"`
	}
	var monthly []MonthlyData
	database.DB.Model(&model.NpsResponse{}).
		Select("TO_CHAR(created_at, 'YYYY-MM') as month, count(*) as count, AVG(score) as avg").
		Where("created_at >= ?", time.Now().AddDate(0, -6, 0)).
		Group("month").Order("month ASC").Scan(&monthly)

	// Recent responses
	var recent []model.NpsResponse
	database.DB.Preload("User").Order("created_at DESC").Limit(20).Find(&recent)

	c.JSON(http.StatusOK, gin.H{
		"total":        total,
		"avgScore":     avgScore,
		"npsScore":     npsScore,
		"detractors":   detractors,
		"passives":     passives,
		"promoters":    promoters,
		"distribution": dist,
		"monthly":      monthly,
		"recent":       recent,
	})
}

// GET /api/admin/nps
func (h *NpsHandler) List(c *gin.Context) {
	var responses []model.NpsResponse
	database.DB.Preload("User").Order("created_at DESC").Limit(100).Find(&responses)
	c.JSON(http.StatusOK, gin.H{"responses": responses})
}
