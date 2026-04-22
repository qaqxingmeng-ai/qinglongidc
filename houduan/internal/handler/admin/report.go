package admin

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type ReportHandler struct {
	aiClient *service.AIClient
}

func NewReportHandler(aiClient *service.AIClient) *ReportHandler {
	return &ReportHandler{aiClient: aiClient}
}

// weekStats collects a 7-day summary for the given week end date.
type weekStats struct {
	StartDate    string  `json:"startDate"`
	EndDate      string  `json:"endDate"`
	NewUsers     int64   `json:"newUsers"`
	Revenue      float64 `json:"revenue"`
	OrderCount   int64   `json:"orderCount"`
	TicketCount  int64   `json:"ticketCount"`
	RenewalCount int64   `json:"renewalCount"`
}

func collectWeekStats(start, end time.Time) weekStats {
	s := weekStats{
		StartDate: start.Format("2006-01-02"),
		EndDate:   end.Format("2006-01-02"),
	}
	database.DB.Model(&model.User{}).Where("created_at >= ? AND created_at < ?", start, end).Count(&s.NewUsers)
	database.DB.Model(&model.Transaction{}).
		Where("created_at >= ? AND created_at < ? AND type IN ?", start, end, []string{"PURCHASE", "RENEW", "RENEWAL"}).
		Select("COALESCE(SUM(ABS(amount)), 0)").Scan(&s.Revenue)
	database.DB.Model(&model.Order{}).
		Where("created_at >= ? AND created_at < ? AND status != ?", start, end, "CANCELLED").
		Count(&s.OrderCount)
	database.DB.Model(&model.Ticket{}).
		Where("created_at >= ? AND created_at < ?", start, end).
		Count(&s.TicketCount)
	database.DB.Model(&model.Order{}).
		Where("created_at >= ? AND created_at < ? AND renewal_server_id IS NOT NULL AND status != ?", start, end, "CANCELLED").
		Count(&s.RenewalCount)
	return s
}

// GET /api/admin/reports/weekly?date=YYYY-MM-DD
// date = the end of the report week (defaults to today)
func (h *ReportHandler) WeeklyReport(c *gin.Context) {
	endStr := c.DefaultQuery("date", time.Now().Format("2006-01-02"))
	endDate, err := time.Parse("2006-01-02", endStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date 格式错误，请使用 YYYY-MM-DD"})
		return
	}
	endDate = endDate.Add(24 * time.Hour) // exclusive upper bound
	startDate := endDate.AddDate(0, 0, -7)
	prevStart := startDate.AddDate(0, 0, -7)

	thisWeek := collectWeekStats(startDate, endDate)
	lastWeek := collectWeekStats(prevStart, startDate)

	payload := map[string]interface{}{
		"thisWeek": thisWeek,
		"lastWeek": lastWeek,
		"changes": map[string]interface{}{
			"newUsers":     safePctChange(lastWeek.NewUsers, thisWeek.NewUsers),
			"revenue":      safePctChangeF(lastWeek.Revenue, thisWeek.Revenue),
			"orderCount":   safePctChange(lastWeek.OrderCount, thisWeek.OrderCount),
			"ticketCount":  safePctChange(lastWeek.TicketCount, thisWeek.TicketCount),
			"renewalCount": safePctChange(lastWeek.RenewalCount, thisWeek.RenewalCount),
		},
	}

	statsBytes, _ := json.Marshal(payload)

	// Try AI insights
	insights, aiErr := h.aiClient.GenerateWeeklyInsights(c.Request.Context(), string(statsBytes))
	if aiErr != nil {
		insights = ""
	}

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"thisWeek": thisWeek,
		"lastWeek": lastWeek,
		"changes":  payload["changes"],
		"insights": insights,
	})
}

func safePctChange(prev, cur int64) string {
	if prev == 0 {
		if cur > 0 {
			return "+∞%"
		}
		return "0%"
	}
	pct := float64(cur-prev) / float64(prev) * 100
	if pct >= 0 {
		return fmt.Sprintf("+%.1f%%", pct)
	}
	return fmt.Sprintf("%.1f%%", pct)
}

func safePctChangeF(prev, cur float64) string {
	if prev == 0 {
		if cur > 0 {
			return "+∞%"
		}
		return "0%"
	}
	pct := (cur - prev) / prev * 100
	if pct >= 0 {
		return fmt.Sprintf("+%.1f%%", pct)
	}
	return fmt.Sprintf("%.1f%%", pct)
}
