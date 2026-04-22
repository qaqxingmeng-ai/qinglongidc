package service

import (
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

// defaultFreezeDays is the commission freeze period in days.
// Overridden by SystemSetting key "commission_freeze_days".
const defaultFreezeDays = 7

// getFreezeDays reads commission_freeze_days from SystemSetting, falls back to default.
func getFreezeDays() int {
	var s model.SystemSetting
	if err := database.DB.First(&s, "key = ?", "commission_freeze_days").Error; err != nil {
		return defaultFreezeDays
	}
	days := 0
	for _, c := range s.Value {
		if c >= '0' && c <= '9' {
			days = days*10 + int(c-'0')
		}
	}
	if days <= 0 {
		return defaultFreezeDays
	}
	return days
}

// CreateCommissionForOrder creates a Commission record for an agent when an order is paid.
// It computes: commission = order.TotalPrice - agentLevelPrice for the same items.
func CreateCommissionForOrder(orderID string) {
	var order model.Order
	if err := database.DB.Preload("User").Preload("Items").Preload("Items.Product").
		First(&order, "id = ?", orderID).Error; err != nil {
		return
	}

	// Only create commission if buyer has an agent
	if order.User.AgentID == nil {
		return
	}
	agentID := *order.User.AgentID

	// Load agent to get their level
	var agent model.User
	if err := database.DB.First(&agent, "id = ?", agentID).Error; err != nil {
		return
	}

	// Load pricing config
	var pricingConfig model.PricingConfig
	if err := database.DB.First(&pricingConfig).Error; err != nil {
		return
	}

	// Commission = what the buyer paid (at USER level) - what agent-level price would be
	var agentLevelTotal float64
	for _, item := range order.Items {
		agentPrice := CalculatePrice(item.Product.OriginalPrice, agent.Level, pricingConfig)
		agentLevelTotal += agentPrice * float64(item.Period) * float64(item.Quantity)
	}

	commission := order.TotalPrice - agentLevelTotal
	if commission <= 0 {
		return
	}

	freezeDays := getFreezeDays()
	freezeUntil := time.Now().AddDate(0, 0, freezeDays)

	c := model.Commission{
		ID:          GenerateID(),
		AgentID:     agentID,
		OrderID:     orderID,
		UserID:      order.UserID,
		Amount:      commission,
		Status:      "FROZEN",
		FreezeUntil: freezeUntil,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	database.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "order_id"}},
		DoNothing: true,
	}).Create(&c)
}

// ReleaseMaturedCommissions moves frozen commissions into the withdrawable pool
// once their freeze window has passed.
func ReleaseMaturedCommissions() (released int, totalAmount float64) {
	now := time.Now()
	var commissions []model.Commission
	database.DB.Select("id").Where("status = ? AND freeze_until <= ?", "FROZEN", now).Find(&commissions)

	for _, pending := range commissions {
		releasedThis := false
		amountThis := 0.0
		agentID := ""

		err := database.DB.Transaction(func(tx *gorm.DB) error {
			var commission model.Commission
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				First(&commission, "id = ?", pending.ID).Error; err != nil {
				return err
			}
			if commission.Status != "FROZEN" || commission.FreezeUntil.After(now) {
				return nil
			}

			result := tx.Model(&model.Commission{}).
				Where("id = ? AND status = ?", commission.ID, "FROZEN").
				Updates(map[string]interface{}{
					"status":     "AVAILABLE",
					"updated_at": now,
				})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				return nil
			}

			releasedThis = true
			amountThis = commission.Amount
			agentID = commission.AgentID
			return nil
		})
		if err == nil && releasedThis {
			released++
			totalAmount += amountThis
			relatedType := "commission"
			_, _ = CreateNotification(
				agentID,
				"COMMISSION",
				"佣金已解冻",
				"有一笔推广佣金已结束冻结，可前往佣金中心申请结算。",
				nil,
				&relatedType,
			)
		}
	}
	return
}

// CancelCommissionForOrder revokes commission on refund.
// If commission is still frozen / available, it is marked CANCELLED.
// If already settled, a clawback entry is recorded against the agent balance.
func CancelCommissionForOrder(orderID string) {
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		var c model.Commission
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&c, "order_id = ?", orderID).Error; err != nil {
			return nil
		}

		now := time.Now()
		switch c.Status {
		case "FROZEN", "AVAILABLE":
			return tx.Model(&model.Commission{}).Where("id = ?", c.ID).
				Updates(map[string]interface{}{
					"status":     "CANCELLED",
					"updated_at": now,
				}).Error
		case "SETTLED":
			var agent model.User
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				First(&agent, "id = ?", c.AgentID).Error; err != nil {
				return err
			}
			if err := tx.Model(&model.User{}).Where("id = ?", c.AgentID).
				UpdateColumn("balance", gorm.Expr("balance - ?", c.Amount)).Error; err != nil {
				return err
			}
			if err := tx.Model(&model.Commission{}).Where("id = ?", c.ID).
				Updates(map[string]interface{}{
					"status":     "CANCELLED",
					"updated_at": now,
				}).Error; err != nil {
				return err
			}
			note := "退款撤销推广佣金，订单 " + c.OrderID
			negAmount := -c.Amount
			return tx.Create(&model.Transaction{
				ID:             GenerateID(),
				UserID:         c.AgentID,
				Type:           "COMMISSION_REFUND",
				Amount:         negAmount,
				BalanceBefore:  RoundMoney(agent.Balance),
				BalanceAfter:   RoundMoney(agent.Balance - c.Amount),
				Note:           &note,
				RelatedOrderID: &c.OrderID,
				CreatedAt:      now,
			}).Error
		default:
			return nil
		}
	})
	if err != nil {
		return
	}
}
