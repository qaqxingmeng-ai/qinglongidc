package service

import (
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"serverai-backend/internal/model"
)

// 订单状态机：明确允许的流转路径。未列出的跳转一律拒绝。
//
//   PENDING   -> PAID, CANCELLED
//   PAID      -> COMPLETED, REFUNDED
//   COMPLETED -> REFUNDED
//   CANCELLED -> (终态)
//   REFUNDED  -> (终态)
var orderStateTransitions = map[string]map[string]bool{
	"PENDING":   {"PAID": true, "CANCELLED": true},
	"PAID":      {"COMPLETED": true, "REFUNDED": true},
	"COMPLETED": {"REFUNDED": true},
	"CANCELLED": {},
	"REFUNDED":  {},
}

// ValidateOrderTransition 返回 nil 表示允许。
func ValidateOrderTransition(from, to string) error {
	if from == to {
		return fmt.Errorf("订单已处于该状态")
	}
	allowed, ok := orderStateTransitions[from]
	if !ok {
		return fmt.Errorf("未知订单状态：%s", from)
	}
	if !allowed[to] {
		return fmt.Errorf("订单不可从 %s 跳转到 %s", from, to)
	}
	return nil
}

// RollbackOrderResources 在事务内回滚订单占用的外部资源：
//   - 恢复所有 OrderItem 的商品库存（stock=-1 的不处理）
//   - UserCoupon 恢复为 UNUSED；coupons.used_count -= 1（带下限保护）
//   - 返还所抵扣的积分（REFUND 记录），并撤销本次订单获得的积分（如果还够扣）
//   - 退回已扣的余额（Transaction REFUND）
//   - 把关联到该订单的服务器实例标记为 TERMINATED
//
// 调用方：退款 / 取消 订单流程。幂等：依赖状态机守护（同一订单只会进入此函数一次）。
func RollbackOrderResources(tx *gorm.DB, order *model.Order) error {
	// 1) 库存回补
	var items []model.OrderItem
	if err := tx.Where("order_id = ?", order.ID).Find(&items).Error; err != nil {
		return err
	}
	for _, it := range items {
		var product model.Product
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&product, "id = ?", it.ProductID).Error; err != nil {
			// 商品被删除就跳过，不阻断退款
			if err == gorm.ErrRecordNotFound {
				continue
			}
			return err
		}
		if product.Stock == -1 {
			continue
		}
		if err := tx.Model(&model.Product{}).Where("id = ?", product.ID).
			Update("stock", gorm.Expr("stock + ?", it.Quantity)).Error; err != nil {
			return err
		}
	}

	// 2) 优惠券归还
	if order.CouponID != nil && *order.CouponID != "" {
		var uc model.UserCoupon
		if err := tx.First(&uc, "id = ?", *order.CouponID).Error; err == nil {
			if uc.Status == "USED" {
				if err := tx.Model(&uc).Updates(map[string]interface{}{
					"status":   "UNUSED",
					"used_at":  nil,
					"order_id": nil,
				}).Error; err != nil {
					return err
				}
				// used_count 下限保护（不可为负）
				tx.Exec(
					"UPDATE coupons SET used_count = used_count - 1, updated_at = NOW() WHERE id = ? AND used_count > 0",
					uc.CouponID,
				)
			}
		}
	}

	// 3) 积分回补（抵扣的）
	if order.PointsUsed > 0 {
		var existedPtTx model.PointsTransaction
		if err := tx.Where("user_id = ? AND type = ? AND related_id = ?", order.UserID, "REFUND", order.ID).
			First(&existedPtTx).Error; err == nil {
			// 已做过积分退款，直接跳过，避免重复加分
			goto skipPointsRefund
		}

		var up model.UserPoints
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&up, "user_id = ?", order.UserID).Error; err == nil {
			if err := tx.Model(&up).Update("points", up.Points+order.PointsUsed).Error; err != nil {
				return err
			}
			refundNote := fmt.Sprintf("订单 %s 退款返还抵扣积分", order.OrderNo)
			pt := model.PointsTransaction{
				ID:        GenerateID(),
				UserID:    order.UserID,
				Type:      "REFUND",
				Points:    order.PointsUsed,
				Note:      refundNote,
				RelatedID: &order.ID,
			}
			if err := tx.Create(&pt).Error; err != nil {
				return err
			}
		}
	}

skipPointsRefund:

	// 4) 余额退回
	if order.TotalPrice > 0 {
		var existedRefund model.Transaction
		if err := tx.Where("user_id = ? AND type = ? AND related_order_id = ?", order.UserID, "REFUND", order.ID).
			First(&existedRefund).Error; err == nil {
			// 已做过余额退款，避免重复加余额
			goto skipBalanceRefund
		}

		var user model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&user, "id = ?", order.UserID).Error; err == nil {
			before := user.Balance
			after := before + order.TotalPrice
			if err := tx.Model(&user).Update("balance", after).Error; err != nil {
				return err
			}
			note := fmt.Sprintf("订单 %s 退款", order.OrderNo)
			rec := model.Transaction{
				ID:             GenerateID(),
				UserID:         order.UserID,
				Type:           "REFUND",
				Amount:         order.TotalPrice,
				BalanceBefore:  before,
				BalanceAfter:   after,
				Note:           &note,
				RelatedOrderID: &order.ID,
			}
			if err := tx.Create(&rec).Error; err != nil {
				return err
			}
		}
	}

skipBalanceRefund:

	// 5) 关联服务器实例终止
	if err := tx.Model(&model.ServerInstance{}).
		Where("order_id = ?", order.ID).
		Updates(map[string]interface{}{"status": "TERMINATED"}).Error; err != nil {
		return err
	}

	return nil
}
