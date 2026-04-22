package handler

import (
	"fmt"
	"strconv"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

func getSettingFloat(key string, def float64) float64 {
	var s model.SystemSetting
	if err := database.DB.First(&s, "key = ?", key).Error; err != nil {
		return def
	}
	if s.Value == "" {
		return def
	}
	v, err := strconv.ParseFloat(s.Value, 64)
	if err != nil {
		return def
	}
	return v
}

func applyInviteeRegisterBonusTx(tx *gorm.DB, user *model.User) (float64, error) {
	if user.AgentID == nil || *user.AgentID == "" {
		return 0, nil
	}

	bonus := getSettingFloat("invite_bonus_invitee_yuan", 20)
	if bonus <= 0 {
		return 0, nil
	}

	monthKey := time.Now().Format("2006-01")
	inviterID := *user.AgentID
	if err := tx.Create(&model.InviteRewardLog{
		ID:         service.GenerateID(),
		RewardType: "INVITEE_REGISTER",
		InviterID:  &inviterID,
		InviteeID:  user.ID,
		Amount:     bonus,
		MonthKey:   monthKey,
		CreatedAt:  time.Now(),
	}).Error; err != nil {
		return 0, err
	}

	before := user.Balance
	after := before + bonus
	if err := tx.Model(&model.User{}).Where("id = ?", user.ID).Update("balance", after).Error; err != nil {
		return 0, err
	}
	user.Balance = after

	note := "邀请码注册新人红包"
	if err := tx.Create(&model.Transaction{
		ID:            service.GenerateID(),
		UserID:        user.ID,
		Type:          "INVITEE_REGISTER_BONUS",
		Amount:        bonus,
		BalanceBefore: before,
		BalanceAfter:  after,
		Note:          &note,
		CreatedAt:     time.Now(),
	}).Error; err != nil {
		return 0, err
	}

	return bonus, nil
}

func applyInviterFirstPaidReward(orderID, inviteeID string) {
	var notifyInviterID string
	var inviterAmount float64

	_ = database.DB.Transaction(func(tx *gorm.DB) error {
		var invitee model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&invitee, "id = ?", inviteeID).Error; err != nil {
			return err
		}
		if invitee.AgentID == nil || *invitee.AgentID == "" {
			return nil
		}
		inviterID := *invitee.AgentID

		var exists int64
		tx.Model(&model.InviteRewardLog{}).
			Where("reward_type = ? AND invitee_id = ?", "INVITER_FIRST_PAID", inviteeID).
			Count(&exists)
		if exists > 0 {
			return nil
		}

		var purchaseCount int64
		tx.Model(&model.Transaction{}).
			Where("user_id = ? AND type = ?", inviteeID, "PURCHASE").
			Count(&purchaseCount)
		if purchaseCount != 1 {
			return nil
		}

		baseReward := getSettingFloat("invite_bonus_inviter_yuan", 50)
		if baseReward <= 0 {
			return nil
		}
		monthlyCap := getSettingFloat("invite_bonus_inviter_monthly_cap_yuan", 500)
		if monthlyCap <= 0 {
			monthlyCap = 500
		}

		now := time.Now()
		monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		nextMonth := monthStart.AddDate(0, 1, 0)
		monthKey := now.Format("2006-01")

		var monthReward float64
		tx.Model(&model.InviteRewardLog{}).
			Where("reward_type = ? AND inviter_id = ? AND created_at >= ? AND created_at < ?", "INVITER_FIRST_PAID", inviterID, monthStart, nextMonth).
			Select("COALESCE(SUM(amount), 0)").
			Scan(&monthReward)

		remaining := monthlyCap - monthReward
		if remaining <= 0 {
			return nil
		}
		reward := baseReward
		if reward > remaining {
			reward = remaining
		}
		if reward <= 0 {
			return nil
		}

		var inviter model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&inviter, "id = ?", inviterID).Error; err != nil {
			return err
		}
		before := inviter.Balance
		after := before + reward

		if err := tx.Model(&model.User{}).Where("id = ?", inviterID).Update("balance", after).Error; err != nil {
			return err
		}

		note := fmt.Sprintf("邀请奖励：用户 %s 首单支付", inviteeID)
		if err := tx.Create(&model.Transaction{
			ID:             service.GenerateID(),
			UserID:         inviterID,
			Type:           "INVITER_FIRST_PAID_REWARD",
			Amount:         reward,
			BalanceBefore:  before,
			BalanceAfter:   after,
			RelatedOrderID: &orderID,
			Note:           &note,
			CreatedAt:      now,
		}).Error; err != nil {
			return err
		}

		if err := tx.Create(&model.InviteRewardLog{
			ID:         service.GenerateID(),
			RewardType: "INVITER_FIRST_PAID",
			InviterID:  &inviterID,
			InviteeID:  inviteeID,
			OrderID:    &orderID,
			Amount:     reward,
			MonthKey:   monthKey,
			CreatedAt:  now,
		}).Error; err != nil {
			return err
		}

		notifyInviterID = inviterID
		inviterAmount = reward
		return nil
	})

	if notifyInviterID != "" && inviterAmount > 0 {
		relatedType := "invite_reward"
		SendNotification(notifyInviterID, "INVITE_REWARD", "邀请奖励到账", fmt.Sprintf("您邀请的用户完成首单，奖励 %.2f 元已到账。", inviterAmount), nil, &relatedType)
		SendNotification(inviteeID, "INVITE_REWARD", "邀请奖励已发放", "您的邀请人已获得首单奖励，感谢您的支持。", nil, &relatedType)
	}
}
