package database

import (
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"serverai-backend/internal/model"
)

var DB *gorm.DB

func Connect(databaseURL string) error {
	var err error
	DB, err = gorm.Open(postgres.Open(databaseURL), &gorm.Config{
		Logger:                                   logger.Default.LogMode(logger.Warn),
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		return err
	}

	sqlDB, err := DB.DB()
	if err != nil {
		return err
	}
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(5 * time.Minute)
	sqlDB.SetConnMaxIdleTime(2 * time.Minute)

	return nil
}

func Migrate() error {
	dedupeCommissionOrders()

	err := DB.AutoMigrate(
		&model.User{},
		&model.CPU{},
		&model.Product{},
		&model.RegionInfo{},
		&model.PricingConfig{},
		&model.Order{},
		&model.OrderItem{},
		&model.ServerInstance{},
		&model.ServerTag{},
		&model.ServerTagRelation{},
		&model.Ticket{},
		&model.TicketMessage{},
		&model.AISession{},
		&model.AIMessage{},
		&model.Transaction{},
		&model.EmailVerification{},
		&model.Analytics{},
		&model.UserLog{},
		&model.SystemSetting{},
		&model.Notification{},
		&model.NotificationPreference{},
		&model.NotificationSubscription{},
		&model.Announcement{},
		&model.CronLog{},
		&model.OrderReview{},
		&model.ProductFavorite{},
		&model.Coupon{},
		&model.UserCoupon{},
		&model.ProductView{},
		&model.TicketRating{},
		&model.BackupRecord{},
		&model.LevelHistory{},
		&model.Supplier{},
		&model.EmailTemplate{},
		&model.ArticleCategory{},
		&model.Article{},
		&model.NpsResponse{},
		&model.LoginHistory{},
		&model.UserSession{},
		&model.UserPoints{},
		&model.PointsTransaction{},
		&model.ApiToken{},
		&model.ApiTokenUsageLog{},
		&model.InviteRewardLog{},
		&model.Commission{},
		&model.CommissionWithdrawal{},
		&model.PromoClick{},
		&model.AITicketFeedback{},
		&model.AnomalyAlert{},
		&model.AITicketClassification{},
		&model.SLAConfig{},
		&model.SLAViolation{},
	)
	if err != nil {
		return err
	}

	// Seed default pricing config
	var count int64
	DB.Model(&model.PricingConfig{}).Count(&count)
	if count == 0 {
		DB.Create(&model.PricingConfig{
			ID:                "default",
			PartnerMarkup:     0.20,
			VIPTopMarkup:      0.40,
			VIPMarkup:         0.50,
			GuestMarkup:       1.00,
			RoundingThreshold: 600,
			RoundingSmallStep: 10,
			RoundingLargeStep: 50,
		})
	}

	backfillServerOrderLinks()
	if DB.Migrator().HasTable(&model.Transaction{}) {
		DB.Model(&model.Transaction{}).
			Where("type = ?", "RENEW").
			Update("type", "RENEWAL")
	}

	migrateUserCouponIndexes()
	migrateOrderIdempotencyIndex()

	return nil
}

func dedupeCommissionOrders() {
	if !DB.Migrator().HasTable(&model.Commission{}) {
		return
	}
	DB.Exec(`
		DELETE FROM commissions c
		USING commissions d
		WHERE c.order_id = d.order_id
		  AND (
			c.created_at > d.created_at OR
			(c.created_at = d.created_at AND c.id > d.id)
		  )
	`)
}

func backfillServerOrderLinks() {
	if !DB.Migrator().HasTable(&model.Order{}) || !DB.Migrator().HasTable(&model.ServerInstance{}) {
		return
	}

	var orders []model.Order
	if err := DB.Preload("Items").
		Where("status IN ?", []string{"PAID", "COMPLETED"}).
		Where("renewal_server_id IS NULL").
		Find(&orders).Error; err != nil {
		return
	}

	for _, order := range orders {
		if len(order.Items) != 1 || order.Items[0].Quantity != 1 {
			continue
		}

		var linkedCount int64
		if err := DB.Model(&model.ServerInstance{}).
			Where("order_id = ?", order.ID).
			Count(&linkedCount).Error; err != nil || linkedCount > 0 {
			continue
		}

		searchUntil := order.CreatedAt.Add(30 * 24 * time.Hour)
		var candidates []model.ServerInstance
		if err := DB.Where("order_id IS NULL").
			Where("user_id = ? AND product_id = ?", order.UserID, order.Items[0].ProductID).
			Where("created_at >= ? AND created_at <= ?", order.CreatedAt, searchUntil).
			Order("created_at ASC").
			Find(&candidates).Error; err != nil {
			continue
		}
		if len(candidates) != 1 {
			continue
		}

		DB.Model(&model.ServerInstance{}).
			Where("id = ? AND order_id IS NULL", candidates[0].ID).
			Update("order_id", order.ID)
	}
}

func migrateUserCouponIndexes() {
	if !DB.Migrator().HasTable(&model.UserCoupon{}) {
		return
	}

	DB.Exec(`DROP INDEX IF EXISTS idx_uc_user_coupon`)
	DB.Exec(`CREATE INDEX IF NOT EXISTS idx_uc_user_coupon ON user_coupons(user_id, coupon_id)`)
	DB.Exec(`CREATE INDEX IF NOT EXISTS idx_user_coupons_coupon_status ON user_coupons(coupon_id, status)`)
	DB.Exec(`CREATE INDEX IF NOT EXISTS idx_user_coupons_user_coupon_status ON user_coupons(user_id, coupon_id, status)`)
}

func migrateOrderIdempotencyIndex() {
	if !DB.Migrator().HasTable(&model.Order{}) {
		return
	}

	DB.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_user_idempotency_key ON orders(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`)
}
