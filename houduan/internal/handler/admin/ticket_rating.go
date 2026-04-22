package admin

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

type TicketRatingAdminHandler struct{}

func NewTicketRatingAdminHandler() *TicketRatingAdminHandler {
	return &TicketRatingAdminHandler{}
}

// GET /api/admin/ticket-ratings?page=&pageSize=&minRating=&maxRating=&startDate=&endDate=
func (h *TicketRatingAdminHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := database.DB.Model(&model.TicketRating{}).
		Preload("User").
		Preload("Ticket")

	if minR := c.Query("minRating"); minR != "" {
		if v, err := strconv.Atoi(minR); err == nil {
			q = q.Where("rating >= ?", v)
		}
	}
	if maxR := c.Query("maxRating"); maxR != "" {
		if v, err := strconv.Atoi(maxR); err == nil {
			q = q.Where("rating <= ?", v)
		}
	}
	if start := c.Query("startDate"); start != "" {
		if t, err := time.Parse("2006-01-02", start); err == nil {
			q = q.Where("ticket_ratings.created_at >= ?", t)
		}
	}
	if end := c.Query("endDate"); end != "" {
		if t, err := time.Parse("2006-01-02", end); err == nil {
			q = q.Where("ticket_ratings.created_at < ?", t.AddDate(0, 0, 1))
		}
	}

	var total int64
	q.Count(&total)

	var ratings []model.TicketRating
	q.Order("ticket_ratings.created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&ratings)

	// Summary stats
	type Stats struct {
		AvgRating  float64 `json:"avgRating"`
		Count      int64   `json:"count"`
		Score1     int64   `json:"score1"`
		Score2     int64   `json:"score2"`
		Score3     int64   `json:"score3"`
		Score4     int64   `json:"score4"`
		Score5     int64   `json:"score5"`
		LowCount   int64   `json:"lowCount"` // <=2
	}
	var stats Stats
	database.DB.Model(&model.TicketRating{}).
		Select("AVG(rating) as avg_rating, COUNT(*) as count, "+
			"SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) as score1, "+
			"SUM(CASE WHEN rating=2 THEN 1 ELSE 0 END) as score2, "+
			"SUM(CASE WHEN rating=3 THEN 1 ELSE 0 END) as score3, "+
			"SUM(CASE WHEN rating=4 THEN 1 ELSE 0 END) as score4, "+
			"SUM(CASE WHEN rating=5 THEN 1 ELSE 0 END) as score5, "+
			"SUM(CASE WHEN rating<=2 THEN 1 ELSE 0 END) as low_count").
		Scan(&stats)

	// 30-day trend (avg per day)
	type DayTrend struct {
		Date      string  `json:"date"`
		AvgRating float64 `json:"avgRating"`
		Count     int64   `json:"count"`
	}
	var trend []DayTrend
	database.DB.Model(&model.TicketRating{}).
		Select("DATE(created_at) as date, AVG(rating) as avg_rating, COUNT(*) as count").
		Where("created_at >= ?", time.Now().AddDate(0, 0, -30)).
		Group("DATE(created_at)").
		Order("date ASC").
		Scan(&trend)

	c.JSON(http.StatusOK, gin.H{
		"ratings":  ratings,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
		"stats":    stats,
		"trend":    trend,
	})
}
