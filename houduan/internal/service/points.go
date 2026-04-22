package service

import (
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"serverai-backend/internal/model"
)

// EarnPoints adds points to a user atomically. Call inside a transaction or standalone.
// pointsType: PURCHASE_EARN / CHECKIN / BIND_PHONE / ENABLE_2FA / ADMIN_ADJUST
//
// 幂等保证：对 PURCHASE_EARN / BIND_PHONE / ENABLE_2FA 这类"每 relatedID 仅一次"的事件，
// 如果 (type, relatedId) 已经存在流水则直接返回 nil 不再加分，避免重复结算。
func EarnPoints(db *gorm.DB, userID string, amount int, pointsType, note string, relatedID *string, expireAt *time.Time) error {
	now := time.Now()

	// 幂等检查
	onceTypes := map[string]bool{
		"PURCHASE_EARN": true,
		"BIND_PHONE":    true,
		"ENABLE_2FA":    true,
	}
	if onceTypes[pointsType] && relatedID != nil && *relatedID != "" {
		var existing int64
		db.Model(&model.PointsTransaction{}).
			Where("user_id = ? AND type = ? AND related_id = ?", userID, pointsType, *relatedID).
			Count(&existing)
		if existing > 0 {
			return nil
		}
	}

	// Upsert UserPoints
	var up model.UserPoints
	if err := db.Where("user_id = ?", userID).First(&up).Error; err != nil {
		up = model.UserPoints{
			ID:     GenerateID(),
			UserID: userID,
		}
	}
	up.Points += amount
	up.TotalEarned += amount
	up.UpdatedAt = now

	if err := db.Save(&up).Error; err != nil {
		return err
	}

	// Record transaction
	tx := model.PointsTransaction{
		ID:        GenerateID(),
		UserID:    userID,
		Type:      pointsType,
		Points:    amount,
		RelatedID: relatedID,
		Note:      note,
		ExpireAt:  expireAt,
		CreatedAt: now,
	}
	return db.Create(&tx).Error
}

// SpendPoints deducts points. Returns error if insufficient.
func SpendPoints(db *gorm.DB, userID string, amount int, note string, relatedID *string) error {
	now := time.Now()

	var up model.UserPoints
	if err := db.Where("user_id = ?", userID).First(&up).Error; err != nil {
		return err
	}
	if up.Points < amount {
		return ErrInsufficientPoints
	}

	up.Points -= amount
	up.TotalSpent += amount
	up.UpdatedAt = now

	if err := db.Save(&up).Error; err != nil {
		return err
	}

	tx := model.PointsTransaction{
		ID:        GenerateID(),
		UserID:    userID,
		Type:      "REDEEM",
		Points:    -amount,
		RelatedID: relatedID,
		Note:      note,
		CreatedAt: now,
	}
	return db.Create(&tx).Error
}

// Checkin performs daily checkin. Returns points earned or error.
func Checkin(db *gorm.DB, userID string) (int, error) {
	now := time.Now()
	today := now.Truncate(24 * time.Hour)

	var up model.UserPoints
	if err := db.Where("user_id = ?", userID).First(&up).Error; err != nil {
		up = model.UserPoints{
			ID:     GenerateID(),
			UserID: userID,
		}
	}

	// Already checked in today?
	if up.LastCheckinAt != nil && up.LastCheckinAt.After(today) {
		return 0, ErrAlreadyCheckedIn
	}

	// Calculate streak and points
	streak := up.CheckinStreak
	if up.LastCheckinAt != nil && up.LastCheckinAt.After(today.AddDate(0, 0, -1)) {
		streak++
	} else {
		streak = 1
	}

	pts := checkinPoints(streak)

	up.Points += pts
	up.TotalEarned += pts
	up.CheckinStreak = streak
	up.LastCheckinAt = &now
	up.UpdatedAt = now

	if err := db.Save(&up).Error; err != nil {
		return 0, err
	}

	expireAt := now.AddDate(1, 0, 0)
	tx := model.PointsTransaction{
		ID:        GenerateID(),
		UserID:    userID,
		Type:      "CHECKIN",
		Points:    pts,
		Note:      "每日签到",
		ExpireAt:  &expireAt,
		CreatedAt: now,
	}
	db.Create(&tx)

	return pts, nil
}

func checkinPoints(streak int) int {
	switch {
	case streak >= 7:
		return 10
	case streak >= 4:
		return 5
	case streak >= 3:
		return 3
	case streak >= 2:
		return 2
	default:
		return 1
	}
}

// GetOrInit returns user points record, creating if missing.
func GetOrInitPoints(db *gorm.DB, userID string) model.UserPoints {
	var up model.UserPoints
	if db.Where("user_id = ?", userID).First(&up).Error != nil {
		up = model.UserPoints{
			ID:     GenerateID(),
			UserID: userID,
		}
		db.Create(&up)
	}
	return up
}

// sentinel errors
var ErrInsufficientPoints = &PointsError{"积分不足"}
var ErrAlreadyCheckedIn = &PointsError{"今日已签到"}

type PointsError struct{ msg string }

func (e *PointsError) Error() string { return e.msg }

// RedeemCoupon exchanges points for a coupon. Must be called in a transaction context.
func RedeemCoupon(db *gorm.DB, userID string, couponID string) error {
	now := time.Now()

	// Fetch coupon with row lock
	var coupon model.Coupon
	if err := db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&coupon, "id = ? AND is_active = ? AND points_required > 0", couponID, true).Error; err != nil {
		return err
	}

	// Check coupon validity
	if now.Before(coupon.StartAt) || now.After(coupon.EndAt) {
		return &PointsError{"优惠券已失效"}
	}

	if coupon.TotalCount > 0 && coupon.UsedCount >= coupon.TotalCount {
		return &PointsError{"优惠券已兑完"}
	}

	// Check user points
	var up model.UserPoints
	if err := db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&up, "user_id = ?", userID).Error; err != nil {
		return &PointsError{"积分数据异常"}
	}

	if up.Points < coupon.PointsRequired {
		return ErrInsufficientPoints
	}

	// Deduct points
	up.Points -= coupon.PointsRequired
	up.TotalSpent += coupon.PointsRequired
	up.UpdatedAt = now

	if err := db.Save(&up).Error; err != nil {
		return err
	}

	// Create user coupon
	uc := model.UserCoupon{
		ID:       GenerateID(),
		UserID:   userID,
		CouponID: couponID,
		Status:   "UNUSED",
	}
	if err := db.Create(&uc).Error; err != nil {
		return err
	}

	// Record points transaction
	couponIDStr := couponID
	tx := model.PointsTransaction{
		ID:        GenerateID(),
		UserID:    userID,
		Type:      "REDEEM",
		Points:    -coupon.PointsRequired,
		RelatedID: &couponIDStr,
		Note:      "兑换优惠券：" + coupon.Name,
		CreatedAt: now,
	}
	if err := db.Create(&tx).Error; err != nil {
		return err
	}

	// Increment coupon usage count
	return db.Model(&coupon).Update("used_count", coupon.UsedCount+1).Error
}
