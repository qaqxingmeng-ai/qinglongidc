package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"sort"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

func apiTokenResponse(t model.ApiToken) gin.H {
	return gin.H{
		"id":          t.ID,
		"name":        t.Name,
		"scope":       t.Scope,
		"dailyLimit":  t.DailyLimit,
		"lastUsedAt":  t.LastUsedAt,
		"tokenSuffix": t.TokenSuffix,
		"expiresAt":   t.ExpiresAt,
		"createdAt":   t.CreatedAt,
	}
}

// GET /api/dashboard/api-tokens
func ApiTokenList(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var tokens []model.ApiToken
	database.DB.Where("user_id = ?", userID).Order("created_at DESC").Find(&tokens)
	rows := make([]gin.H, 0, len(tokens))
	for _, t := range tokens {
		rows = append(rows, apiTokenResponse(t))
	}
	c.JSON(http.StatusOK, gin.H{"tokens": rows})
}

// POST /api/dashboard/api-tokens
func ApiTokenCreate(c *gin.Context) {
	userID := middleware.GetUserID(c)

	// Only PARTNER / ADMIN may create tokens
	role := middleware.GetUserRole(c)
	var user model.User
	database.DB.Select("level, role").First(&user, "id = ?", userID)
	if user.Level != "PARTNER" && role != "ADMIN" {
		c.JSON(http.StatusForbidden, gin.H{"error": "仅 PARTNER 等级用户可使用 API Token"})
		return
	}

	var req struct {
		Name      string `json:"name" binding:"required,max=100"`
		Scope     string `json:"scope"`
		ExpiresIn int    `json:"expiresIn"` // days: 30/90/180/365
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	// Max 5 active tokens
	var count int64
	database.DB.Model(&model.ApiToken{}).Where("user_id = ?", userID).Count(&count)
	if count >= 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "最多创建 5 个 Token"})
		return
	}

	scope := req.Scope
	if scope != "READ" && scope != "READWRITE" {
		scope = "READ"
	}

	// Generate random token
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成失败"})
		return
	}
	rawToken := "sat_" + hex.EncodeToString(raw)
	hash := sha256.Sum256([]byte(rawToken))
	hashHex := hex.EncodeToString(hash[:])
	suffix := rawToken[len(rawToken)-8:]

	var expiresAt *time.Time
	if req.ExpiresIn > 0 {
		t := time.Now().AddDate(0, 0, req.ExpiresIn)
		expiresAt = &t
	}

	token := model.ApiToken{
		ID:          service.GenerateID(),
		UserID:      userID,
		Name:        req.Name,
		TokenHash:   hashHex,
		TokenSuffix: suffix,
		Scope:       scope,
		DailyLimit:  1000,
		ExpiresAt:   expiresAt,
		CreatedAt:   time.Now(),
	}
	if err := database.DB.Create(&token).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建失败"})
		return
	}

	// Return full token ONCE
	c.JSON(http.StatusOK, gin.H{
		"token":     rawToken, // only shown once
		"tokenInfo": apiTokenResponse(token),
	})
}

// GET /api/dashboard/api-tokens/stats
func ApiTokenStats(c *gin.Context) {
	userID := middleware.GetUserID(c)
	since := time.Now().AddDate(0, 0, -30)

	var tokens []model.ApiToken
	database.DB.Where("user_id = ?", userID).Find(&tokens)
	if len(tokens) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"summary": gin.H{
				"totalCalls":   0,
				"successCalls": 0,
				"errorCalls":   0,
				"avgLatencyMs": 0,
			},
			"dailyTrend":    []gin.H{},
			"endpointStats": []gin.H{},
			"tokenStats":    []gin.H{},
			"recentLogs":    []gin.H{},
		})
		return
	}

	tokenIDs := make([]string, 0, len(tokens))
	tokenNameMap := map[string]string{}
	for _, t := range tokens {
		tokenIDs = append(tokenIDs, t.ID)
		tokenNameMap[t.ID] = t.Name
	}

	var summary struct {
		TotalCalls   int64
		SuccessCalls int64
		ErrorCalls   int64
		AvgLatencyMs float64
	}
	database.DB.Table("api_token_usage_logs").
		Select("COUNT(*) AS total_calls, SUM(CASE WHEN status_code < 400 THEN 1 ELSE 0 END) AS success_calls, SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS error_calls, COALESCE(AVG(duration_ms), 0) AS avg_latency_ms").
		Where("token_id IN ? AND created_at >= ?", tokenIDs, since).
		Scan(&summary)

	var trend []struct {
		Day   time.Time
		Calls int64
	}
	database.DB.Table("api_token_usage_logs").
		Select("DATE(created_at) AS day, COUNT(*) AS calls").
		Where("token_id IN ? AND created_at >= ?", tokenIDs, since).
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

	var endpointRows []struct {
		Method       string
		Path         string
		Calls        int64
		AvgLatencyMs float64
	}
	database.DB.Table("api_token_usage_logs").
		Select("method, path, COUNT(*) AS calls, COALESCE(AVG(duration_ms), 0) AS avg_latency_ms").
		Where("token_id IN ? AND created_at >= ?", tokenIDs, since).
		Group("method, path").
		Order("calls DESC").
		Limit(20).
		Scan(&endpointRows)

	endpointResp := make([]gin.H, 0, len(endpointRows))
	for _, row := range endpointRows {
		endpointResp = append(endpointResp, gin.H{
			"method":       row.Method,
			"path":         row.Path,
			"calls":        row.Calls,
			"avgLatencyMs": int(row.AvgLatencyMs + 0.5),
		})
	}

	var tokenRows []struct {
		TokenID string
		Calls   int64
	}
	database.DB.Table("api_token_usage_logs").
		Select("token_id, COUNT(*) AS calls").
		Where("token_id IN ? AND created_at >= ?", tokenIDs, since).
		Group("token_id").
		Scan(&tokenRows)

	tokenStatsMap := map[string]int64{}
	for _, r := range tokenRows {
		tokenStatsMap[r.TokenID] = r.Calls
	}

	tokenResp := make([]gin.H, 0, len(tokens))
	for _, t := range tokens {
		tokenResp = append(tokenResp, gin.H{
			"tokenId":     t.ID,
			"name":        t.Name,
			"scope":       t.Scope,
			"dailyLimit":  t.DailyLimit,
			"lastUsedAt":  t.LastUsedAt,
			"calls":       tokenStatsMap[t.ID],
			"tokenSuffix": t.TokenSuffix,
			"expiresAt":   t.ExpiresAt,
		})
	}
	sort.Slice(tokenResp, func(i, j int) bool {
		ic, _ := tokenResp[i]["calls"].(int64)
		jc, _ := tokenResp[j]["calls"].(int64)
		return ic > jc
	})

	var recentLogs []model.ApiTokenUsageLog
	database.DB.Where("token_id IN ?", tokenIDs).
		Order("created_at DESC").
		Limit(50).
		Find(&recentLogs)

	recentResp := make([]gin.H, 0, len(recentLogs))
	for _, l := range recentLogs {
		recentResp = append(recentResp, gin.H{
			"id":         l.ID,
			"tokenId":    l.TokenID,
			"tokenName":  tokenNameMap[l.TokenID],
			"method":     l.Method,
			"path":       l.Path,
			"statusCode": l.StatusCode,
			"durationMs": l.DurationMs,
			"ip":         l.IP,
			"createdAt":  l.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"summary": gin.H{
			"totalCalls":   summary.TotalCalls,
			"successCalls": summary.SuccessCalls,
			"errorCalls":   summary.ErrorCalls,
			"avgLatencyMs": int(summary.AvgLatencyMs + 0.5),
		},
		"dailyTrend":    trendResp,
		"endpointStats": endpointResp,
		"tokenStats":    tokenResp,
		"recentLogs":    recentResp,
	})
}

// DELETE /api/dashboard/api-tokens/:id
func ApiTokenDelete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")
	result := database.DB.Where("id = ? AND user_id = ?", id, userID).Delete(&model.ApiToken{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Token 不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
