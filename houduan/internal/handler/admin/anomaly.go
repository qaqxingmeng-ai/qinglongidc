package admin

import (
	"fmt"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type AnomalyHandler struct{}

func NewAnomalyHandler() *AnomalyHandler { return &AnomalyHandler{} }

// runAnomalyDetection performs all anomaly checks and inserts AnomalyAlert records.
// Returns the count of new alerts created.
func runAnomalyDetection() int {
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	todayEnd := today.Add(24 * time.Hour)
	created := 0

	// ---- 1. Revenue anomaly: today vs 7-day average > ±30% ----
	var todayRevenue float64
	database.DB.Model(&model.Transaction{}).
		Where("created_at >= ? AND created_at < ? AND type IN ?", today, todayEnd, []string{"PURCHASE", "RENEW", "RENEWAL"}).
		Select("COALESCE(SUM(ABS(amount)), 0)").Scan(&todayRevenue)

	var avgRevenue float64
	database.DB.Raw(`
		SELECT COALESCE(AVG(daily_rev), 0) FROM (
			SELECT DATE(created_at) AS day, SUM(ABS(amount)) AS daily_rev
			FROM transactions
			WHERE created_at >= ? AND created_at < ?
				AND type IN ('PURCHASE','RENEW','RENEWAL')
			GROUP BY day
		) t
	`, today.AddDate(0, 0, -7), today).Scan(&avgRevenue)

	if avgRevenue > 0 && todayRevenue > 0 {
		diff := math.Abs(todayRevenue-avgRevenue) / avgRevenue
		if diff > 0.3 {
			direction := "低于"
			if todayRevenue > avgRevenue {
				direction = "高于"
			}
			title := fmt.Sprintf("收入异常波动：今日收入 ¥%.2f %s 7日均值 ¥%.2f（偏差 %.0f%%）",
				todayRevenue, direction, avgRevenue, diff*100)
			alert := model.AnomalyAlert{
				ID:     service.GenerateID(),
				Type:   "REVENUE_ANOMALY",
				Title:  title,
				Detail: fmt.Sprintf("检测日期: %s", today.Format("2006-01-02")),
				Status: "OPEN",
			}
			// Dedup: skip if same type+date already exists
			var existing int64
			database.DB.Model(&model.AnomalyAlert{}).
				Where("type = ? AND created_at >= ? AND created_at < ?", "REVENUE_ANOMALY", today, todayEnd).
				Count(&existing)
			if existing == 0 {
				database.DB.Create(&alert)
				created++
			}
		}
	}

	// ---- 2. Ticket spike: today vs 14-day average > 50% ----
	var todayTickets int64
	database.DB.Model(&model.Ticket{}).
		Where("created_at >= ? AND created_at < ?", today, todayEnd).
		Count(&todayTickets)

	var avgTickets float64
	database.DB.Raw(`
		SELECT COALESCE(AVG(daily_count), 0) FROM (
			SELECT DATE(created_at) AS day, COUNT(*) AS daily_count
			FROM tickets
			WHERE created_at >= ? AND created_at < ?
			GROUP BY day
		) t
	`, today.AddDate(0, 0, -14), today).Scan(&avgTickets)

	if avgTickets > 0 && float64(todayTickets) > avgTickets*1.5 {
		title := fmt.Sprintf("工单量异常：今日新增工单 %d 张，超过 14 日均值 %.1f 张的 50%%",
			todayTickets, avgTickets)
		var existing int64
		database.DB.Model(&model.AnomalyAlert{}).
			Where("type = ? AND created_at >= ? AND created_at < ?", "TICKET_SPIKE", today, todayEnd).
			Count(&existing)
		if existing == 0 {
			database.DB.Create(&model.AnomalyAlert{
				ID:     service.GenerateID(),
				Type:   "TICKET_SPIKE",
				Title:  title,
				Status: "OPEN",
			})
			created++
		}
	}

	// ---- 3. User churn risk: 30+ days no login with expiring server (within 7 days) ----
	type churnUser struct {
		UserID string
		Email  string
	}
	var churnUsers []churnUser
	database.DB.Raw(`
		SELECT u.id AS user_id, u.email FROM users u
		WHERE u.last_login_at < ?
		AND EXISTS (
			SELECT 1 FROM server_instances s
			WHERE s.user_id = u.id
			AND s.status = 'ACTIVE'
			AND s.expire_date BETWEEN ? AND ?
		)
	`, today.AddDate(0, 0, -30), today, today.AddDate(0, 0, 7)).Scan(&churnUsers)

	if len(churnUsers) > 0 {
		var existing int64
		database.DB.Model(&model.AnomalyAlert{}).
			Where("type = ? AND created_at >= ? AND created_at < ?", "USER_CHURN_RISK", today, todayEnd).
			Count(&existing)
		if existing == 0 {
			title := fmt.Sprintf("用户流失预警：%d 位用户超过 30 天未登录且有服务器即将到期", len(churnUsers))
			detail := "流失风险用户（前5位）："
			limit := len(churnUsers)
			if limit > 5 {
				limit = 5
			}
			for _, u := range churnUsers[:limit] {
				detail += u.Email + " "
			}
			database.DB.Create(&model.AnomalyAlert{
				ID:     service.GenerateID(),
				Type:   "USER_CHURN_RISK",
				Title:  title,
				Detail: detail,
				Status: "OPEN",
			})
			created++
		}
	}

	// ---- 4. Suspicious recharge: single > 10000 or user >= 5 recharges today ----
	type suspRecharge struct {
		ID     string
		Amount float64
		UserID string
	}
	var bigRecharges []suspRecharge
	database.DB.Raw(`
		SELECT id, amount, user_id FROM transactions
		WHERE type = 'RECHARGE' AND amount >= 10000
		AND created_at >= ? AND created_at < ?
	`, today, todayEnd).Scan(&bigRecharges)

	for _, r := range bigRecharges {
		var existing int64
		database.DB.Model(&model.AnomalyAlert{}).
			Where("type = ? AND related_id = ?", "SUSPICIOUS_RECHARGE", r.ID).
			Count(&existing)
		if existing == 0 {
			relID := r.ID
			database.DB.Create(&model.AnomalyAlert{
				ID:        service.GenerateID(),
				Type:      "SUSPICIOUS_RECHARGE",
				Title:     fmt.Sprintf("大额充值待核查：单笔充值 ¥%.2f", r.Amount),
				Status:    "OPEN",
				RelatedID: &relID,
			})
			created++
		}
	}

	// Frequent recharges: >= 5 today
	type freqRecharge struct {
		UserID string
		Count  int64
	}
	var freqRecharges []freqRecharge
	database.DB.Raw(`
		SELECT user_id, COUNT(*) AS count FROM transactions
		WHERE type = 'RECHARGE' AND created_at >= ? AND created_at < ?
		GROUP BY user_id HAVING COUNT(*) >= 5
	`, today, todayEnd).Scan(&freqRecharges)

	for _, fr := range freqRecharges {
		var existing int64
		database.DB.Model(&model.AnomalyAlert{}).
			Where("type = ? AND related_id = ? AND created_at >= ?", "SUSPICIOUS_RECHARGE", fr.UserID, today).
			Count(&existing)
		if existing == 0 {
			uid := fr.UserID
			database.DB.Create(&model.AnomalyAlert{
				ID:        service.GenerateID(),
				Type:      "SUSPICIOUS_RECHARGE",
				Title:     fmt.Sprintf("频繁充值待核查：用户今日充值 %d 次", fr.Count),
				Status:    "OPEN",
				RelatedID: &uid,
			})
			created++
		}
	}

	return created
}

// POST /api/admin/anomalies/scan
func (h *AnomalyHandler) Scan(c *gin.Context) {
	count := runAnomalyDetection()
	c.JSON(http.StatusOK, gin.H{"success": true, "newAlerts": count})
}

// GET /api/admin/anomalies
func (h *AnomalyHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.AnomalyAlert{})
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	if alertType := c.Query("type"); alertType != "" {
		query = query.Where("type = ?", alertType)
	}

	var total int64
	query.Count(&total)

	var alerts []model.AnomalyAlert
	query.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&alerts)

	c.JSON(http.StatusOK, gin.H{
		"success":         true,
		"alerts":     alerts,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// PATCH /api/admin/anomalies/:id/resolve
func (h *AnomalyHandler) Resolve(c *gin.Context) {
	id := c.Param("id")
	adminID := middleware.GetUserID(c)
	now := time.Now()

	result := database.DB.Model(&model.AnomalyAlert{}).
		Where("id = ? AND status = ?", id, "OPEN").
		Updates(map[string]interface{}{
			"status":      "RESOLVED",
			"resolved_by": adminID,
			"resolved_at": now,
		})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "告警不存在或已处理"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
