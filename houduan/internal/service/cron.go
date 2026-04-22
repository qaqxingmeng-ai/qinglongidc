package service

import (
	"fmt"
	"hash/fnv"
	"log"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

// StartCronJobs launches background goroutines for scheduled tasks.
// Each task is aligned to the next scheduled wall-clock time.
// 多实例部署时，每个任务启动前会尝试获取 pg_try_advisory_lock（按 jobName 哈希），
// 持锁实例执行任务，其他实例跳过，从根本上避免重复结算/通知/退款。
func StartCronJobs() {
	go runDailyAt(0, 5, "expiry_transition", runExpiryTransitionJob)
	go runDailyAt(3, 0, "auto_backup", runAutoBackupJob)
	go runDailyAt(8, 0, "expiry_notice", runExpiryNoticeJob)
	go runDailyAt(9, 0, "auto_renewal", runAutoRenewalJob)
	go runDailyAt(10, 0, "coupon_expiry", runCouponExpiryJob)
	go runDailyAt(10, 30, "commission_settle", runCommissionSettleJob)
	go runDailyAt(11, 0, "level_upgrade", runLevelUpgradeJob)
	go runDailyAt(12, 0, "nps_survey", runNpsSurveyJob)
	go runDailyAt(23, 30, "ticket_rating_notice", runTicketRatingNoticeJob)
	go runEvery(15*time.Minute, "ticket_routing_watchdog", RunTicketRoutingWatchdog)
	go runEvery(1*time.Hour, "session_expiry_cleanup", runSessionExpiryCleanupJob)
}

// cronLockKey 将 jobName 哈希成 int64，作为 pg_advisory_lock 的 key。
// 使用 FNV-1a 64 位哈希保证同名任务在所有实例上拿到相同 key。
func cronLockKey(jobName string) int64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte("cron:" + jobName))
	return int64(h.Sum64())
}

// runWithAdvisoryLock 尝试获取数据库级分布式锁；拿不到则跳过（说明另一实例正在执行）。
// 使用 session-scoped pg_try_advisory_lock，任务结束后显式 unlock。
func runWithAdvisoryLock(jobName string, fn func()) {
	key := cronLockKey(jobName)
	var got bool
	if err := database.DB.Raw("SELECT pg_try_advisory_lock(?)", key).Scan(&got).Error; err != nil {
		log.Printf("[cron] %s: acquire advisory lock failed: %v", jobName, err)
		return
	}
	if !got {
		log.Printf("[cron] %s: skipped (another instance holds the lock)", jobName)
		return
	}
	defer func() {
		if err := database.DB.Exec("SELECT pg_advisory_unlock(?)", key).Error; err != nil {
			log.Printf("[cron] %s: release advisory lock failed: %v", jobName, err)
		}
	}()
	fn()
}

// runDailyAt runs fn every 24 h starting at the next occurrence of hour:minute (local time).
func runDailyAt(hour, minute int, jobName string, fn func()) {
	for {
		now := time.Now()
		next := time.Date(now.Year(), now.Month(), now.Day(), hour, minute, 0, 0, now.Location())
		if !next.After(now) {
			next = next.Add(24 * time.Hour)
		}
		time.Sleep(time.Until(next))
		log.Printf("[cron] starting job: %s", jobName)
		func() {
			defer func() {
				if r := recover(); r != nil {
					detail := fmt.Sprintf("panic in job %s: %v", jobName, r)
					saveCronLog(jobName, "PANIC", detail)
					log.Printf("[cron] %s", detail)
				}
			}()
			runWithAdvisoryLock(jobName, fn)
		}()
	}
}

func runEvery(interval time.Duration, jobName string, fn func()) {
	for {
		time.Sleep(interval)
		log.Printf("[cron] starting job: %s", jobName)
		func() {
			defer func() {
				if r := recover(); r != nil {
					detail := fmt.Sprintf("panic in job %s: %v", jobName, r)
					saveCronLog(jobName, "PANIC", detail)
					log.Printf("[cron] %s", detail)
				}
			}()
			runWithAdvisoryLock(jobName, fn)
		}()
	}
}

func runSessionExpiryCleanupJob() {
	now := time.Now()
	result := database.DB.Model(&model.UserSession{}).
		Where("is_active = ? AND expires_at <= ?", true, now).
		Updates(map[string]interface{}{"is_active": false, "updated_at": now})
	if result.Error != nil {
		detail := fmt.Sprintf("会话过期清理失败: %v", result.Error)
		saveCronLog("session_expiry_cleanup", "FAILED", detail)
		log.Printf("[cron] session_expiry_cleanup: %s", detail)
		return
	}
	detail := fmt.Sprintf("失效 %d 个过期会话", result.RowsAffected)
	saveCronLog("session_expiry_cleanup", "SUCCESS", detail)
	log.Printf("[cron] session_expiry_cleanup: %s", detail)
}

// saveCronLog persists a cron execution record.
func saveCronLog(job, status, detail string) {
	database.DB.Create(&model.CronLog{
		ID:          GenerateID(),
		Job:         job,
		Status:      status,
		Detail:      detail,
		ProcessedAt: time.Now(),
	})
}

// ==================== 到期前通知 ====================

func runExpiryNoticeJob() {
	now := time.Now()
	// intervals to check: 7, 3, 1 days ahead
	intervals := []int{7, 3, 1}

	processed := 0
	var errs []string

	for _, days := range intervals {
		from := time.Date(now.Year(), now.Month(), now.Day()+days, 0, 0, 0, 0, now.Location())
		to := from.Add(24 * time.Hour)

		var servers []model.ServerInstance
		database.DB.Where(
			"status = ? AND expire_date >= ? AND expire_date < ?",
			"ACTIVE", from, to,
		).Find(&servers)

		for _, srv := range servers {
			title := fmt.Sprintf("服务器 %s 将于 %d 天后到期", serverLabel(srv), days)
			content := fmt.Sprintf(
				"您的服务器（%s）将于 %s 到期，请及时续费以避免服务中断。",
				serverLabel(srv),
				srv.ExpireDate.Format("2006-01-02"),
			)
			if srv.AutoRenew {
				title = fmt.Sprintf("服务器 %s 将于 %d 天后自动续费", serverLabel(srv), days)
				content = fmt.Sprintf(
					"您的服务器（%s）已开启自动续费，将于 %s 前自动扣款续费，请确保余额充足。",
					serverLabel(srv),
					srv.ExpireDate.Format("2006-01-02"),
				)
			}
			sid := srv.ID
			stype := "server"
			notifType := "SERVER_EXPIRY"
			createNotification(srv.UserID, notifType, title, content, &sid, &stype)
			processed++
		}
	}

	detail := fmt.Sprintf("处理 %d 条到期通知", processed)
	if len(errs) > 0 {
		detail += fmt.Sprintf("；%d 个错误: %v", len(errs), errs)
		saveCronLog("expiry_notice", "PARTIAL", detail)
	} else {
		saveCronLog("expiry_notice", "SUCCESS", detail)
	}
	log.Printf("[cron] expiry_notice: %s", detail)
}

// ==================== 到期状态流转 ====================

func runExpiryTransitionJob() {
	now := time.Now()
	// get grace period from SystemSetting (default 3 days)
	graceDays := getSettingInt("server_grace_period_days", 3)

	processed := 0
	var errs []string

	// ACTIVE -> EXPIRED: expire_date < now
	var expiredServers []model.ServerInstance
	database.DB.Where("status = ? AND expire_date IS NOT NULL AND expire_date < ?", "ACTIVE", now).
		Find(&expiredServers)

	for _, srv := range expiredServers {
		result := database.DB.Model(&model.ServerInstance{}).
			Where("id = ? AND status = ?", srv.ID, "ACTIVE").
			Updates(map[string]interface{}{
				"status":     "EXPIRED",
				"updated_at": now,
			})
		if result.Error != nil {
			errs = append(errs, srv.ID+":"+result.Error.Error())
			continue
		}

		sid := srv.ID
		stype := "server"
		createNotification(srv.UserID, "SERVER_EXPIRY",
			fmt.Sprintf("服务器 %s 已到期", serverLabel(srv)),
			fmt.Sprintf("您的服务器（%s）已于 %s 到期，请在宽限期（%d 天）内续费以恢复服务。",
				serverLabel(srv),
				srv.ExpireDate.Format("2006-01-02"),
				graceDays,
			),
			&sid, &stype)

		database.DB.Create(&model.UserLog{
			ID:       GenerateID(),
			UserID:   srv.UserID,
			Event:    "SERVER_EXPIRED",
			TargetID: &srv.ID,
			Detail:   strPtr("到期状态流转 ACTIVE -> EXPIRED"),
		})
		processed++
	}

	detail := fmt.Sprintf("流转 %d 台服务器 ACTIVE->EXPIRED", processed)
	if len(errs) > 0 {
		detail += fmt.Sprintf("；%d 个错误", len(errs))
		saveCronLog("expiry_transition", "PARTIAL", detail)
	} else {
		saveCronLog("expiry_transition", "SUCCESS", detail)
	}
	log.Printf("[cron] expiry_transition: %s", detail)
}

// ==================== 自动续费 ====================

func runAutoRenewalJob() {
	now := time.Now()
	tomorrow := time.Date(now.Year(), now.Month(), now.Day()+1, 23, 59, 59, 0, now.Location())

	// Find active servers with auto_renew=true expiring tomorrow or already expired today
	var servers []model.ServerInstance
	database.DB.Preload("Product").Preload("User").
		Where("auto_renew = true AND status IN ? AND expire_date IS NOT NULL AND expire_date <= ?",
			[]string{"ACTIVE", "EXPIRED"}, tomorrow).
		Find(&servers)

	succeeded := 0
	failed := 0

	for _, srv := range servers {
		if srv.Product.ID == "" {
			continue
		}

		price := calculateUserPrice(srv.UserID, srv.Product)
		sid := srv.ID
		stype := "server"

		err := database.DB.Transaction(func(tx *gorm.DB) error {
			var u model.User
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				First(&u, "id = ?", srv.UserID).Error; err != nil {
				return err
			}
			if u.Balance < price {
				return fmt.Errorf("余额不足")
			}

			balanceBefore := RoundMoney(u.Balance)
			newBalance := RoundMoney(u.Balance - price)
			if err := tx.Model(&model.User{}).Where("id = ?", u.ID).
				Updates(map[string]interface{}{"balance": newBalance}).Error; err != nil {
				return err
			}

			newExpire := expireDate(srv.ExpireDate, 1)
			if err := tx.Model(&model.ServerInstance{}).Where("id = ?", srv.ID).
				Updates(map[string]interface{}{
					"expire_date": newExpire,
					"status":      "ACTIVE",
					"updated_at":  now,
				}).Error; err != nil {
				return err
			}

			note := fmt.Sprintf("自动续费 %s", serverLabel(srv))
			tx.Create(&model.Transaction{
				ID:              GenerateID(),
				UserID:          u.ID,
				Type:            "RENEWAL",
				Amount:          RoundMoney(-price),
				BalanceBefore:   balanceBefore,
				BalanceAfter:    newBalance,
				Note:            &note,
				RelatedServerID: &sid,
				CreatedAt:       now,
			})
			return nil
		})

		if err != nil {
			failed++
			if err.Error() == "余额不足" {
				var u model.User
				database.DB.First(&u, "id = ?", srv.UserID)
				// calc shortfall
				shortfall := price - u.Balance
				createNotification(srv.UserID, "AUTO_RENEW_FAIL",
					fmt.Sprintf("服务器 %s 自动续费失败", serverLabel(srv)),
					fmt.Sprintf("余额不足 %.2f 元，请及时充值以避免服务中断。", shortfall),
					&sid, &stype)
			}
		} else {
			succeeded++
			var srv2 model.ServerInstance
			database.DB.First(&srv2, "id = ?", sid)
			var expStr string
			if srv2.ExpireDate != nil {
				expStr = srv2.ExpireDate.Format("2006-01-02")
			}
			createNotification(srv.UserID, "AUTO_RENEW_SUCCESS",
				fmt.Sprintf("服务器 %s 自动续费成功", serverLabel(srv)),
				fmt.Sprintf("已成功续费，服务续至 %s。", expStr),
				&sid, &stype)
		}
	}

	detail := fmt.Sprintf("自动续费 成功 %d 台，失败 %d 台", succeeded, failed)
	saveCronLog("auto_renewal", "SUCCESS", detail)
	log.Printf("[cron] auto_renewal: %s", detail)
}

// ==================== helpers ====================

func serverLabel(srv model.ServerInstance) string {
	if srv.Hostname != nil && *srv.Hostname != "" {
		return *srv.Hostname
	}
	if srv.IP != nil && *srv.IP != "" {
		return *srv.IP
	}
	return srv.ID
}

func createNotification(userID, notifType, title, content string, relatedID, relatedType *string) {
	_, _ = CreateNotification(userID, notifType, title, content, relatedID, relatedType)
}

func getSettingInt(key string, def int) int {
	var s model.SystemSetting
	if err := database.DB.First(&s, "key = ?", key).Error; err != nil {
		return def
	}
	var v int
	if _, err := fmt.Sscanf(s.Value, "%d", &v); err != nil {
		return def
	}
	return v
}

func strPtr(s string) *string { return &s }

func expireDate(current *time.Time, months int) time.Time {
	base := time.Now()
	if current != nil && current.After(base) {
		base = *current
	}
	return base.AddDate(0, months, 0)
}

// calculateUserPrice returns the monthly price for a product at the user's level.
func calculateUserPrice(userID string, p model.Product) float64 {
	var u model.User
	if err := database.DB.First(&u, "id = ?", userID).Error; err != nil {
		return p.OriginalPrice
	}
	var pc model.PricingConfig
	if err := database.DB.First(&pc, "id = ?", "default").Error; err != nil {
		return p.OriginalPrice
	}
	markup := pc.GuestMarkup
	switch u.Level {
	case "PARTNER":
		markup = pc.PartnerMarkup
	case "VIP_TOP":
		markup = pc.VIPTopMarkup
	case "VIP":
		markup = pc.VIPMarkup
	}
	return roundPrice(p.CostPrice*(1+markup), pc)
}

func roundPrice(price float64, pc model.PricingConfig) float64 {
	step := float64(pc.RoundingSmallStep)
	if price >= float64(pc.RoundingThreshold) {
		step = float64(pc.RoundingLargeStep)
	}
	if step <= 0 {
		return price
	}
	return float64(int(price/step+0.5)) * step
}

// ==================== 优惠券到期 ====================

func runCouponExpiryJob() {
	now := time.Now()

	// Mark expired UserCoupons as EXPIRED
	// 注意：PostgreSQL 的 UPDATE ... SET 子句中不允许用表别名限定列名（只有 FROM / WHERE 可用别名）。
	// 原先写成 `SET uc.status = ...` 会触发 `syntax error at or near "."`，导致每日静默失败。
	result := database.DB.Exec(`
		UPDATE user_coupons
		SET status = 'EXPIRED', updated_at = ?
		WHERE status = 'UNUSED'
		  AND EXISTS (
		    SELECT 1 FROM coupons c WHERE c.id = user_coupons.coupon_id AND c.end_at < ?
		  )
	`, now, now)
	expiredCount := int(result.RowsAffected)

	// Notify users with coupons expiring within 3 days
	threeDays := now.Add(72 * time.Hour)
	type Row struct {
		UserID   string
		CouponID string
		Name     string
	}
	var rows []Row
	database.DB.Raw(`
		SELECT uc.user_id, c.id AS coupon_id, c.name
		FROM user_coupons uc
		JOIN coupons c ON c.id = uc.coupon_id
		WHERE uc.status = 'UNUSED'
		  AND c.end_at > ? AND c.end_at <= ?
		GROUP BY uc.user_id, c.id, c.name
	`, now, threeDays).Scan(&rows)

	notified := 0
	for _, row := range rows {
		title := "优惠券即将到期"
		content := "您有优惠券「" + row.Name + "」将在 3 天内到期，请尽快使用。"
		_, _ = CreateNotification(row.UserID, "COUPON_EXPIRY", title, content, nil, nil)
		notified++
	}

	detail := fmt.Sprintf("expired=%d notified=%d", expiredCount, notified)
	saveCronLog("coupon_expiry", "success", detail)
	log.Printf("[cron] coupon_expiry done: %s", detail)
}

// ==================== 推广佣金自动结算 ====================

func runCommissionSettleJob() {
	released, totalAmount := ReleaseMaturedCommissions()
	detail := fmt.Sprintf("released=%d amount=%.2f", released, totalAmount)
	saveCronLog("commission_settle", "success", detail)
	log.Printf("[cron] commission_settle done: %s", detail)
}

// ==================== 会员等级自动升降 ====================

// levelOrder maps level names to upgrade thresholds (cumulative spend in CNY).
// GUEST -> USER: 0 (register)
// USER -> VIP: 5000
// VIP -> VIP_TOP: 20000
var levelUpgradeThresholds = map[string]float64{
	"VIP":     5000,
	"VIP_TOP": 20000,
}

// targetAutoLevel returns the target level from cumulative spend.
// 该函数用于统一处理升级/降级，避免只升不降导致等级与消费能力长期偏离。
func targetAutoLevel(totalSpend float64) string {
	if totalSpend >= levelUpgradeThresholds["VIP_TOP"] {
		return "VIP_TOP"
	}
	if totalSpend >= levelUpgradeThresholds["VIP"] {
		return "VIP"
	}
	return "USER"
}

func runLevelUpgradeJob() {
	type SpendRow struct {
		UserID     string
		Level      string
		TotalSpend float64
	}
	var rows []SpendRow
	database.DB.Raw(`
		SELECT u.id AS user_id, u.level, COALESCE(SUM(o.total_price - o.discount_amount), 0) AS total_spend
		FROM users u
		LEFT JOIN orders o ON o.user_id = u.id AND o.status IN ('PAID', 'COMPLETED')
		WHERE u.role = 'USER' AND u.level IN ('GUEST','USER','VIP')
		GROUP BY u.id, u.level
	`).Scan(&rows)

	changed := 0
	for _, row := range rows {
		target := targetAutoLevel(row.TotalSpend)
		if row.Level == target {
			continue
		}

		now := time.Now()
		database.DB.Model(&model.User{}).Where("id = ? AND level = ?", row.UserID, row.Level).
			Updates(map[string]interface{}{"level": target, "updated_at": now})

		action := "调整"
		title := "会员等级调整通知"
		content := fmt.Sprintf("您的累计消费为 %.0f 元，系统已将会员等级由 %s 调整为 %s。", row.TotalSpend, row.Level, target)
		if target == "VIP" || target == "VIP_TOP" {
			action = "升级"
			title = "恭喜！您的会员等级已升级"
			content = fmt.Sprintf("您的累计消费已达 %.0f 元，系统已自动将会员等级由 %s 升级为 %s。", row.TotalSpend, row.Level, target)
		}

		reason := fmt.Sprintf("累计消费 %.2f 元，系统自动%s", row.TotalSpend, action)
		database.DB.Create(&model.LevelHistory{
			ID:        GenerateID(),
			UserID:    row.UserID,
			FromLevel: row.Level,
			ToLevel:   target,
			Reason:    reason,
			ChangedAt: now,
		})

		createNotification(row.UserID, "LEVEL_UPGRADE",
			title,
			content,
			nil, nil)

		changed++
	}

	detail := fmt.Sprintf("调整 %d 位用户等级", changed)
	saveCronLog("level_upgrade", "SUCCESS", detail)
	log.Printf("[cron] level_upgrade: %s", detail)
}

// ==================== 工单满意度评价通知 ====================

// runTicketRatingNoticeJob sends a rating invitation 24h after a ticket is CLOSED/RESOLVED.
// It only sends once per ticket (checks if a rating notification was already sent).
func runTicketRatingNoticeJob() {
	// Find tickets closed/resolved between 23h and 25h ago that have no rating yet and no prior notice
	from := time.Now().Add(-25 * time.Hour)
	to := time.Now().Add(-23 * time.Hour)

	type TicketRow struct {
		ID      string
		UserID  string
		Subject string
	}
	var tickets []TicketRow
	database.DB.Raw(`
		SELECT t.id, t.user_id, t.subject
		FROM tickets t
		WHERE t.status IN ('CLOSED','RESOLVED')
		  AND t.updated_at >= ? AND t.updated_at < ?
		  AND NOT EXISTS (SELECT 1 FROM ticket_ratings tr WHERE tr.ticket_id = t.id)
		  AND NOT EXISTS (
		    SELECT 1 FROM notifications n
		    WHERE n.user_id = t.user_id AND n.related_type = 'ticket_rating' AND n.related_id = t.id
		  )
	`, from, to).Scan(&tickets)

	sent := 0
	for _, t := range tickets {
		tid := t.ID
		rtype := "ticket_rating"
		createNotification(t.UserID, "TICKET_RATING",
			"请对您的工单进行评价",
			"您的工单「"+t.Subject+"」已关闭，请花 30 秒对我们的服务进行评价，您的反馈将帮助我们持续改进。",
			&tid, &rtype)
		sent++
	}

	detail := fmt.Sprintf("发送评价邀请 %d 条", sent)
	saveCronLog("ticket_rating_notice", "SUCCESS", detail)
	log.Printf("[cron] ticket_rating_notice: %s", detail)
}

// ==================== 自动备份 ====================

// AutoBackupFn is set by main to avoid import cycles between service and handler/admin.
var AutoBackupFn func()

func runAutoBackupJob() {
	if AutoBackupFn != nil {
		AutoBackupFn()
		saveCronLog("auto_backup", "SUCCESS", "pg_dump 自动备份触发")
	}
}

// ==================== NPS 调查 ====================

// runNpsSurveyJob sends NPS survey invitations to users who:
//  1. Registered exactly 30 days ago (within 25-27 h window for daily tolerance), or
//  2. Have not received one in the last 90 days (quarterly cadence)
func runNpsSurveyJob() {
	now := time.Now()

	// Window: users created 29.5 - 30.5 days ago
	from30 := now.Add(-30*24*time.Hour - 12*time.Hour)
	to30 := now.Add(-30*24*time.Hour + 12*time.Hour)

	// 90-day window: users who last got a survey more than 88 days ago (or never, excluding the 30-day set)
	cutoff90 := now.Add(-88 * 24 * time.Hour)

	type UserRow struct {
		ID string
	}

	// Set 1: 30-day newcomers who haven't been surveyed yet
	var newcomers []UserRow
	database.DB.Raw(`
		SELECT u.id FROM users u
		WHERE u.created_at >= ? AND u.created_at < ?
		  AND NOT EXISTS (SELECT 1 FROM nps_responses n WHERE n.user_id = u.id)
	`, from30, to30).Scan(&newcomers)

	// Set 2: Long-term users needing quarterly reminder
	var quarterly []UserRow
	database.DB.Raw(`
		SELECT u.id FROM users u
		WHERE u.created_at < ?
		  AND (
		    NOT EXISTS (SELECT 1 FROM nps_responses n WHERE n.user_id = u.id)
		    OR (SELECT MAX(n2.created_at) FROM nps_responses n2 WHERE n2.user_id = u.id) < ?
		  )
		  AND u.id NOT IN (
		    SELECT u2.id FROM users u2
		    WHERE u2.created_at >= ? AND u2.created_at < ?
		  )
	`, from30, cutoff90, from30, to30).Scan(&quarterly)

	sent := 0
	for _, u := range append(newcomers, quarterly...) {
		createNotification(u.ID, "NPS_SURVEY",
			"您愿意向朋友推荐我们吗？",
			"我们非常重视您的反馈！请花 1 分钟评价您使用 ServerAI 的体验，帮助我们持续改进服务。",
			nil, nil)
		sent++
	}

	detail := fmt.Sprintf("发送 NPS 邀请 %d 条 (30天新用户 %d, 季度复查 %d)", sent, len(newcomers), len(quarterly))
	saveCronLog("nps_survey", "SUCCESS", detail)
	log.Printf("[cron] nps_survey: %s", detail)
}
