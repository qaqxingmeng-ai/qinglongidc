package service

import (
	"math"
	"strings"
	"time"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

// AutoRouteTicket assigns a newly created ticket to an admin with the lowest load.
func AutoRouteTicket(ticketID, initialContent string) {
	var ticket model.Ticket
	if err := database.DB.First(&ticket, "id = ?", ticketID).Error; err != nil {
		return
	}
	if ticket.AssignedAdminID != nil {
		return
	}

	text := strings.ToLower(strings.TrimSpace(ticket.Subject + "\n" + initialContent))
	now := time.Now()
	updates := map[string]interface{}{"updated_at": now}

	if isUrgentText(text) {
		switch ticket.Priority {
		case "LOW", "NORMAL":
			updates["priority"] = "HIGH"
		case "HIGH":
			updates["priority"] = "URGENT"
		}
	}

	adminID := selectBestAdmin(ticket.Type)
	if adminID != "" {
		updates["assigned_admin_id"] = adminID
		updates["routed_at"] = now
	}

	database.DB.Model(&model.Ticket{}).Where("id = ?", ticketID).Updates(updates)

	if adminID != "" {
		relatedType := "ticket"
		createNotification(
			adminID,
			"TICKET_ROUTED",
			"新工单已分配",
			"工单 "+ticket.TicketNo+" 已自动分配给您，请尽快处理。",
			&ticketID,
			&relatedType,
		)
	}
}

// RunTicketRoutingWatchdog escalates tickets with delayed first response.
func RunTicketRoutingWatchdog() {
	now := time.Now()
	var tickets []model.Ticket
	database.DB.Where("status IN ? AND routed_at IS NOT NULL", []string{"OPEN", "PROCESSING"}).Find(&tickets)

	for _, ticket := range tickets {
		if ticket.RoutedAt == nil || ticket.FirstResponseAt != nil {
			continue
		}

		elapsed := now.Sub(*ticket.RoutedAt)
		ticketID := ticket.ID
		relatedType := "ticket"

		if ticket.EscalatedAt2h == nil && elapsed >= 2*time.Hour {
			updates := map[string]interface{}{
				"escalated_at2h": now,
				"updated_at":     now,
			}
			if ticket.Priority == "LOW" || ticket.Priority == "NORMAL" {
				updates["priority"] = "HIGH"
			} else if ticket.Priority == "HIGH" {
				updates["priority"] = "URGENT"
			}
			database.DB.Model(&model.Ticket{}).Where("id = ?", ticket.ID).Updates(updates)

			if ticket.AssignedAdminID != nil && *ticket.AssignedAdminID != "" {
				createNotification(
					*ticket.AssignedAdminID,
					"TICKET_ESCALATION_2H",
					"工单首响超时（2小时）",
					"工单 "+ticket.TicketNo+" 已超过 2 小时未首响，优先级已自动升级。",
					&ticketID,
					&relatedType,
				)
			}
		}

		if ticket.EscalatedAt8h == nil && elapsed >= 8*time.Hour {
			database.DB.Model(&model.Ticket{}).Where("id = ?", ticket.ID).Updates(map[string]interface{}{
				"escalated_at8h": now,
				"priority":       "URGENT",
				"updated_at":     now,
			})

			notifyAllAdmins(
				"TICKET_ESCALATION_8H",
				"工单严重超时（8小时）",
				"工单 "+ticket.TicketNo+" 已超过 8 小时未首响，请立即处理。",
				&ticketID,
				&relatedType,
			)
		}
	}
}

func selectBestAdmin(ticketType string) string {
	var admins []model.User
	database.DB.Select("id").Where("role = ?", "ADMIN").Find(&admins)
	if len(admins) == 0 {
		return ""
	}

	adminIDs := make([]string, len(admins))
	for i, a := range admins {
		adminIDs[i] = a.ID
	}

	// Batch query: open ticket counts per admin
	type loadRow struct {
		AdminID   string `gorm:"column:assigned_admin_id"`
		OpenCount int64  `gorm:"column:open_count"`
	}
	var loads []loadRow
	database.DB.Raw(`
		SELECT assigned_admin_id, COUNT(*) AS open_count
		FROM tickets
		WHERE assigned_admin_id IN ? AND status IN ('OPEN','PROCESSING')
		GROUP BY assigned_admin_id`, adminIDs).Scan(&loads)
	loadMap := make(map[string]int64)
	for _, l := range loads {
		loadMap[l.AdminID] = l.OpenCount
	}

	// Batch query: same-type closed tickets in last 30 days per admin
	type expRow struct {
		AdminID    string `gorm:"column:assigned_admin_id"`
		ClosedCount int64  `gorm:"column:closed_count"`
	}
	var exps []expRow
	thirtyDaysAgo := time.Now().AddDate(0, 0, -30)
	database.DB.Raw(`
		SELECT assigned_admin_id, COUNT(*) AS closed_count
		FROM tickets
		WHERE assigned_admin_id IN ? AND type = ? AND status IN ('RESOLVED','CLOSED') AND created_at >= ?
		GROUP BY assigned_admin_id`, adminIDs, ticketType, thirtyDaysAgo).Scan(&exps)
	expMap := make(map[string]int64)
	for _, e := range exps {
		expMap[e.AdminID] = e.ClosedCount
	}

	bestID := ""
	bestScore := math.MaxFloat64
	for _, admin := range admins {
		openCount := loadMap[admin.ID]
		sameTypeClosed := expMap[admin.ID]

		bonus := math.Min(float64(sameTypeClosed), 20) * 0.05
		score := float64(openCount) - bonus
		if score < bestScore {
			bestScore = score
			bestID = admin.ID
		}
	}
	return bestID
}

func notifyAllAdmins(notifType, title, content string, relatedID, relatedType *string) {
	var admins []model.User
	database.DB.Select("id").Where("role = ?", "ADMIN").Find(&admins)
	for _, admin := range admins {
		createNotification(admin.ID, notifType, title, content, relatedID, relatedType)
	}
}

func isUrgentText(text string) bool {
	keywords := []string{
		"紧急", "宕机", "故障", "无法访问", "服务不可用", "攻击", "中断", "退款", "扣费", "failed", "urgent", "down",
	}
	for _, kw := range keywords {
		if strings.Contains(text, kw) {
			return true
		}
	}
	return false
}
