package admin

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

type APIUsageHandler struct{}

func NewAPIUsageHandler() *APIUsageHandler {
	return &APIUsageHandler{}
}

// GET /api/admin/api-usage/stats
func (h *APIUsageHandler) Stats(c *gin.Context) {
	since := time.Now().AddDate(0, 0, -30)

	var summary struct {
		TotalCalls   int64
		SuccessCalls int64
		ErrorCalls   int64
		AvgLatencyMs float64
	}
	database.DB.Table("api_token_usage_logs").
		Select("COUNT(*) AS total_calls, SUM(CASE WHEN status_code < 400 THEN 1 ELSE 0 END) AS success_calls, SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS error_calls, COALESCE(AVG(duration_ms), 0) AS avg_latency_ms").
		Where("created_at >= ?", since).
		Scan(&summary)

	var trend []struct {
		Day   time.Time
		Calls int64
	}
	database.DB.Table("api_token_usage_logs").
		Select("DATE(created_at) AS day, COUNT(*) AS calls").
		Where("created_at >= ?", since).
		Group("DATE(created_at)").
		Order("day ASC").
		Scan(&trend)

	trendResp := make([]gin.H, 0, len(trend))
	for _, item := range trend {
		trendResp = append(trendResp, gin.H{
			"date":  item.Day.Format("2006-01-02"),
			"calls": item.Calls,
		})
	}

	var tokenRank []struct {
		TokenID string
		Name    string
		UserID  string
		Calls   int64
	}
	database.DB.Table("api_token_usage_logs AS l").
		Select("l.token_id, t.name, t.user_id, COUNT(*) AS calls").
		Joins("LEFT JOIN api_tokens t ON t.id = l.token_id").
		Where("l.created_at >= ?", since).
		Group("l.token_id, t.name, t.user_id").
		Order("calls DESC").
		Limit(20).
		Scan(&tokenRank)

	tokenRankResp := make([]gin.H, 0, len(tokenRank))
	for _, row := range tokenRank {
		tokenRankResp = append(tokenRankResp, gin.H{
			"tokenId": row.TokenID,
			"name":    row.Name,
			"userId":  row.UserID,
			"calls":   row.Calls,
		})
	}

	var endpointRank []struct {
		Method string
		Path   string
		Calls  int64
	}
	database.DB.Table("api_token_usage_logs").
		Select("method, path, COUNT(*) AS calls").
		Where("created_at >= ?", since).
		Group("method, path").
		Order("calls DESC").
		Limit(20).
		Scan(&endpointRank)

	endpointResp := make([]gin.H, 0, len(endpointRank))
	for _, row := range endpointRank {
		endpointResp = append(endpointResp, gin.H{
			"method": row.Method,
			"path":   row.Path,
			"calls":  row.Calls,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"summary": gin.H{
			"totalCalls":   summary.TotalCalls,
			"successCalls": summary.SuccessCalls,
			"errorCalls":   summary.ErrorCalls,
			"avgLatencyMs": int(summary.AvgLatencyMs + 0.5),
		},
		"dailyTrend":      trendResp,
		"tokenRanking":    tokenRankResp,
		"endpointRanking": endpointResp,
	})
}

// GET /api/admin/api-usage/logs
func (h *APIUsageHandler) Logs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Table("api_token_usage_logs AS l").
		Select("l.id, l.token_id, t.name AS token_name, t.user_id, l.method, l.path, l.status_code, l.duration_ms, l.ip, l.created_at").
		Joins("LEFT JOIN api_tokens t ON t.id = l.token_id")

	if tokenID := c.Query("tokenId"); tokenID != "" {
		query = query.Where("l.token_id = ?", tokenID)
	}
	if userID := c.Query("userId"); userID != "" {
		query = query.Where("t.user_id = ?", userID)
	}
	if method := c.Query("method"); method != "" {
		query = query.Where("l.method = ?", method)
	}

	var total int64
	query.Count(&total)

	var rows []struct {
		ID         string    `json:"id"`
		TokenID    string    `json:"tokenId"`
		TokenName  string    `json:"tokenName"`
		UserID     string    `json:"userId"`
		Method     string    `json:"method"`
		Path       string    `json:"path"`
		StatusCode int       `json:"statusCode"`
		DurationMs int       `json:"durationMs"`
		IP         string    `json:"ip"`
		CreatedAt  time.Time `json:"createdAt"`
	}
	query.Order("l.created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Scan(&rows)

	c.JSON(http.StatusOK, gin.H{
		"items":    rows,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// PATCH /api/admin/api-tokens/:id/limit
func (h *APIUsageHandler) UpdateTokenLimit(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		DailyLimit int `json:"dailyLimit" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if req.DailyLimit < 100 || req.DailyLimit > 1000000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "dailyLimit 范围必须在 100 到 1000000"})
		return
	}
	result := database.DB.Model(&model.ApiToken{}).Where("id = ?", id).Update("daily_limit", req.DailyLimit)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Token 不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
