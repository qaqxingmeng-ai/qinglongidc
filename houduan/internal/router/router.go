package router

import (
	"log"

	"github.com/gin-gonic/gin"

	"serverai-backend/config"
	"serverai-backend/internal/handler"
	"serverai-backend/internal/handler/admin"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/service"
)

func Setup(cfg *config.Config) *gin.Engine {
	r := gin.Default()
	if err := r.SetTrustedProxies(cfg.TrustedProxies); err != nil {
		log.Fatalf("invalid TRUSTED_PROXIES: %v", err)
	}

	// Global middleware
	r.Use(middleware.CORS(cfg.AllowedOrigins))
	if cfg.WAFEnabled {
		r.Use(middleware.WAF(middleware.WAFConfig{
			Enabled:      cfg.WAFEnabled,
			IPWhitelist:  cfg.IPWhitelist,
			IPBlacklist:  cfg.IPBlacklist,
			RateLimitRPS: cfg.RateLimitPerSec,
			MaxBodyBytes: cfg.MaxBodyBytes,
		}))
	}
	r.Use(middleware.InternalKey(cfg.InternalAPIKey))
	r.Use(middleware.CSRF())
	r.Use(middleware.WrapResponse())

	// Services
	emailSvc := service.NewEmailService(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPassword, cfg.SMTPFrom)
	service.SetGlobalEmailService(emailSvc)
	aiClient := service.NewAIClient(cfg)

	// Handlers
	authHandler := handler.NewAuthHandler(emailSvc, cfg)
	productHandler := handler.NewProductHandler()
	orderHandler := handler.NewOrderHandler()
	financeHandler := handler.NewFinanceHandler()
	serverHandler := handler.NewServerHandler()
	serverTagHandler := handler.NewServerTagHandler()
	ticketHandler := handler.NewTicketHandler(emailSvc, cfg.AdminEmail, aiClient)
	dashboardHandler := handler.NewDashboardHandler()
	aiHandler := handler.NewAIHandler(aiClient)
	agentHandler := handler.NewAgentHandler()
	announcementHandler := handler.NewAnnouncementHandler()
	favoriteHandler := handler.NewFavoriteHandler()
	realtimeHandler := handler.NewRealtimeHandler(cfg.AllowedOrigins)

	// Admin handlers
	adminProductHandler := admin.NewProductHandler(aiClient)
	adminServerHandler := admin.NewServerHandler()
	adminUserHandler := admin.NewUserHandler()
	adminOrderHandler := admin.NewOrderHandler()
	adminFinanceHandler := admin.NewFinanceHandler()
	adminTicketHandler := admin.NewTicketHandler()
	adminCPUHandler := admin.NewCPUHandler()
	adminPricingHandler := admin.NewPricingHandler()
	adminDashboardHandler := admin.NewDashboardHandler()
	adminLogHandler := admin.NewLogHandler()
	adminSettingsHandler := admin.NewSettingsHandler(cfg)
	adminRegionHandler := admin.NewRegionHandler()
	adminAnnouncementHandler := admin.NewAnnouncementHandler()
	couponHandler := handler.NewCouponHandler()
	adminCouponHandler := admin.NewCouponHandler()
	adminAnalyticsHandler := admin.NewAnalyticsHandler()
	adminBulkHandler := admin.NewBulkHandler()
	adminExportHandler := admin.NewExportHandler()
	adminBackupHandler := admin.NewBackupHandler(cfg)
	adminTicketRatingHandler := admin.NewTicketRatingAdminHandler()
	adminSupplierHandler := admin.NewSupplierHandler()
	adminEmailTemplateHandler := admin.NewEmailTemplateHandler()
	adminArticleHandler := admin.NewArticleHandler()
	adminCategoryHandler := admin.NewCategoryHandler()
	adminNpsHandler := admin.NewNpsHandler()
	adminLoginHistoryHandler := admin.NewLoginHistoryAdminHandler()
	adminPointsHandler := admin.NewPointsAdminHandler()
	adminCommissionHandler := admin.NewCommissionHandler()
	adminReportHandler := admin.NewReportHandler(aiClient)
	adminAnomalyHandler := admin.NewAnomalyHandler()
	adminAPIUsageHandler := admin.NewAPIUsageHandler()
	adminSLAHandler := admin.NewSLAHandler()

	api := r.Group("/api")

	r.GET("/ws", realtimeHandler.ServeWS)

	// Health check (public)
	api.GET("/health", handler.HealthCheck)
	api.GET("/site-meta", handler.SiteMeta)

	// ========== Public ==========
	api.POST("/auth/login", authHandler.Login)
	api.POST("/auth/register", authHandler.Register)
	api.GET("/auth/csrf", authHandler.CSRFToken)
	api.POST("/auth/send-code", authHandler.SendCode)
	api.GET("/auth/verify-agent", authHandler.VerifyAgent)
	api.POST("/auth/verify-agent", authHandler.VerifyAgent)
	api.POST("/auth/forgot-password", authHandler.ForgotPassword)
	api.POST("/auth/reset-password", authHandler.ResetPassword)

	api.GET("/products", middleware.OptionalAuth(), productHandler.List)
	api.GET("/products/filters", productHandler.Filters)
	api.GET("/products/batch-check", middleware.OptionalAuth(), productHandler.BatchCheck)
	api.GET("/products/compare", middleware.OptionalAuth(), productHandler.Compare)
	api.GET("/products/:id", middleware.OptionalAuth(), productHandler.Detail)

	api.GET("/ai/has-key", aiHandler.HasKey)

	// Announcements (public)
	api.GET("/announcements/active", announcementHandler.Active)

	// Alias: frontend calls /api/filters directly
	api.GET("/filters", productHandler.Filters)

	// Knowledge base (public)
	api.GET("/docs/categories", handler.DocCategoryList)
	api.GET("/docs/articles", handler.DocArticleList)
	api.GET("/docs/articles/:slug", handler.DocArticleDetail)

	// ========== Authenticated ==========
	auth := api.Group("", middleware.Auth())

	// Knowledge base (authenticated)
	auth.POST("/docs/articles/:id/helpful", handler.DocArticleHelpful)

	// Auth
	auth.GET("/auth/me", authHandler.Me)
	auth.PUT("/auth/me", authHandler.UpdateMe)
	auth.POST("/auth/logout", authHandler.Logout)
	auth.POST("/auth/change-password", authHandler.ChangePassword)
	auth.POST("/auth/change-email", authHandler.ChangeEmail)
	auth.GET("/auth/sessions", authHandler.Sessions)
	auth.POST("/auth/sessions/logout-others", authHandler.LogoutOtherSessions)
	auth.DELETE("/auth/sessions/:id", authHandler.RevokeSession)

	// Dashboard
	auth.GET("/dashboard/stats", dashboardHandler.Stats)
	auth.GET("/dashboard/logs", dashboardHandler.UserLogs)
	auth.GET("/dashboard/security", dashboardHandler.SecurityScore)
	auth.GET("/dashboard/analytics/personal", dashboardHandler.PersonalAnalytics)

	// Servers (user) - primary + alias
	auth.GET("/dashboard/servers", serverHandler.UserList)
	auth.GET("/dashboard/servers/calendar", serverHandler.Calendar)
	auth.GET("/dashboard/servers/expiring-soon", serverHandler.ExpiringSoon)
	auth.POST("/dashboard/servers/batch-renew", serverHandler.BatchRenew)
	auth.GET("/dashboard/servers/:id", serverHandler.UserDetail)
	auth.PUT("/dashboard/servers/:id/note", serverHandler.UpdateUserNote)
	auth.POST("/dashboard/servers/:id/renew", serverHandler.Renew)
	auth.PATCH("/dashboard/servers/:id/auto-renew", serverHandler.ToggleAutoRenew)
	auth.PUT("/dashboard/servers/:id/tags", serverTagHandler.SetServerTags)
	auth.GET("/dashboard/server-tags", serverTagHandler.List)
	auth.POST("/dashboard/server-tags", serverTagHandler.Create)
	auth.PUT("/dashboard/server-tags/:id", serverTagHandler.Update)
	auth.DELETE("/dashboard/server-tags/:id", serverTagHandler.Delete)
	auth.GET("/servers", serverHandler.UserList)

	// Orders - primary + alias
	auth.GET("/orders", orderHandler.List)
	auth.POST("/orders", orderHandler.Create)
	auth.GET("/orders/:id", orderHandler.Detail)
	auth.GET("/orders/:id/receipt", orderHandler.ReceiptPDF)
	auth.GET("/orders/:id/review", orderHandler.GetReview)
	auth.POST("/orders/:id/review", orderHandler.CreateReview)
	auth.GET("/dashboard/orders", orderHandler.List)
	auth.POST("/dashboard/orders", orderHandler.Create)
	auth.GET("/dashboard/orders/:id", orderHandler.Detail)
	auth.GET("/dashboard/orders/:id/receipt", orderHandler.ReceiptPDF)
	auth.GET("/dashboard/orders/:id/review", orderHandler.GetReview)
	auth.POST("/dashboard/orders/:id/review", orderHandler.CreateReview)

	// Finance - primary + alias
	auth.GET("/finance", financeHandler.UserFinance)
	auth.GET("/finance/transactions", financeHandler.UserTransactions)
	auth.GET("/dashboard/finance", financeHandler.UserFinance)
	auth.GET("/dashboard/finance/transactions", financeHandler.UserTransactions)

	// Tickets
	auth.GET("/tickets", ticketHandler.List)
	auth.POST("/tickets", ticketHandler.Create)
	auth.GET("/tickets/:id", ticketHandler.Detail)
	auth.POST("/tickets/:id", ticketHandler.Update)
	auth.POST("/tickets/:id/messages", ticketHandler.Reply)
	auth.PATCH("/tickets/:id/status", ticketHandler.UpdateStatus)
	auth.GET("/tickets/:id/rating", handler.TicketRatingGet)
	auth.POST("/tickets/:id/rating", handler.TicketRatingCreate)

	// AI
	auth.POST("/ai/wizard", aiHandler.Wizard)
	auth.POST("/ai/provision-chat", aiHandler.ProvisionChat)
	auth.GET("/ai/sessions", aiHandler.Sessions)
	auth.GET("/ai/sessions/:id", aiHandler.SessionDetail)
	auth.GET("/ai/fallback-products", aiHandler.FallbackProducts)

	// Notifications
	notifHandler := &handler.NotificationHandler{}
	auth.GET("/dashboard/notifications", notifHandler.List)
	auth.GET("/dashboard/notifications/unread-count", notifHandler.UnreadCount)
	auth.POST("/dashboard/notifications/read-all", notifHandler.ReadAll)
	auth.PATCH("/dashboard/notifications/:id/read", notifHandler.MarkRead)
	auth.GET("/dashboard/notifications/preferences", realtimeHandler.GetNotificationPreferences)
	auth.PUT("/dashboard/notifications/preferences", realtimeHandler.UpdateNotificationPreferences)
	auth.POST("/dashboard/notifications/subscriptions", realtimeHandler.UpsertNotificationSubscription)
	auth.DELETE("/dashboard/notifications/subscriptions", realtimeHandler.DeleteNotificationSubscription)

	// Realtime
	auth.GET("/realtime/token", realtimeHandler.Token)

	// Coupons (user)
	auth.GET("/dashboard/coupons", couponHandler.GetMyCoupons)
	auth.POST("/dashboard/coupons/redeem", couponHandler.Redeem)
	auth.GET("/dashboard/coupons/applicable", couponHandler.GetApplicable)

	// Favorites
	auth.GET("/dashboard/favorites", favoriteHandler.GetFavorites)
	auth.POST("/dashboard/favorites", favoriteHandler.AddFavorite)
	auth.DELETE("/dashboard/favorites/:productId", favoriteHandler.RemoveFavorite)
	auth.GET("/dashboard/favorites/:productId/check", favoriteHandler.IsFavorite)

	// Membership
	membershipHandler := handler.NewMembershipHandler()
	api.GET("/membership/benefits", membershipHandler.Benefits)
	auth.GET("/membership/progress", membershipHandler.Progress)

	// NPS
	auth.POST("/nps", handler.NpsSubmit)

	// Login history
	auth.GET("/dashboard/login-history", handler.LoginHistoryList)

	// Points & checkin
	auth.GET("/dashboard/points", handler.PointsInfo)
	auth.POST("/dashboard/checkin", handler.Checkin)
	auth.GET("/dashboard/points/history", handler.PointsHistory)
	auth.GET("/dashboard/checkin/calendar", handler.CheckinCalendar)
	auth.GET("/dashboard/points/shop", handler.PointsShop)
	auth.POST("/dashboard/points/redeem", handler.PointsRedeem)

	// API Tokens
	auth.GET("/dashboard/api-tokens", handler.ApiTokenList)
	auth.POST("/dashboard/api-tokens", handler.ApiTokenCreate)
	auth.DELETE("/dashboard/api-tokens/:id", handler.ApiTokenDelete)
	auth.GET("/dashboard/api-tokens/stats", handler.ApiTokenStats)

	// ========== Agent ==========
	agentGroup := api.Group("/agent", middleware.Auth(), middleware.RequireRole("AGENT", "ADMIN"))
	agentGroup.GET("/stats", agentHandler.Stats)
	agentGroup.GET("/users", agentHandler.Users)
	agentGroup.POST("/users", agentHandler.CreateUser)
	agentGroup.GET("/users/:id", agentHandler.UserDetail)
	agentGroup.PUT("/users/:id", agentHandler.UpdateUser)
	agentGroup.GET("/orders", agentHandler.Orders)
	agentGroup.GET("/finance", agentHandler.Finance)
	agentGroup.GET("/logs", agentHandler.Logs)
	agentGroup.GET("/commissions", agentHandler.Commissions)
	agentGroup.GET("/commissions/summary", agentHandler.CommissionSummary)
	agentGroup.GET("/commission/available", agentHandler.CommissionAvailable)
	agentGroup.POST("/commission/withdraw", agentHandler.CommissionWithdraw)
	agentGroup.GET("/commission/withdrawals", agentHandler.CommissionWithdrawals)
	agentGroup.GET("/promo", agentHandler.PromoStats)
	agentGroup.GET("/performance", agentHandler.PerformanceDashboard)

	// Referral link tracking (public, no auth)
	api.GET("/ref/:code", agentHandler.TrackRef)

	// ========== Admin ==========
	adminGroup := api.Group("/admin", middleware.Auth(), middleware.RequireRole("ADMIN"), middleware.AdminIPWhitelist())

	// Dashboard
	adminGroup.GET("/dashboard", adminDashboardHandler.Stats)
	adminGroup.GET("/dashboard/trends", adminDashboardHandler.Trends)
	adminGroup.GET("/realtime/online-users", realtimeHandler.OnlineUsers)

	// Products
	adminGroup.GET("/products", adminProductHandler.List)
	adminGroup.POST("/products", adminProductHandler.Create)
	adminGroup.PUT("/products/:id", adminProductHandler.Update)
	adminGroup.DELETE("/products/:id", adminProductHandler.Delete)
	adminGroup.POST("/products/:id/allocate", adminProductHandler.Allocate)
	adminGroup.POST("/products/batch", adminProductHandler.BatchUpdate)
	adminGroup.POST("/products/import", adminProductHandler.Import)
	adminGroup.POST("/products/ai-score", adminProductHandler.AIScore)
	adminGroup.POST("/products/ai-score-save", adminProductHandler.AIScoreSave)
	adminGroup.POST("/products/ai-chat", adminProductHandler.AIChat)
	adminGroup.POST("/products/ai-chat-simple", adminProductHandler.AIChatSimple)
	adminGroup.POST("/products/batch-gen-desc", adminProductHandler.BatchGenerateDescription)
	adminGroup.PUT("/products/sort", adminProductHandler.UpdateSort)
	adminGroup.PATCH("/products/:id/stock", adminProductHandler.UpdateStock)
	adminGroup.GET("/products/low-stock", adminProductHandler.LowStock)

	// Admin AI tools
	adminGroup.POST("/ai/ticket-suggest", aiHandler.TicketSuggest)
	adminGroup.POST("/ai/ticket-feedback", aiHandler.TicketFeedback)

	// Servers
	adminGroup.GET("/servers", adminServerHandler.List)
	adminGroup.GET("/servers/calendar", adminServerHandler.Calendar)
	adminGroup.POST("/servers", adminServerHandler.Create)
	adminGroup.GET("/servers/:id", adminServerHandler.Detail)
	adminGroup.PUT("/servers/:id", adminServerHandler.Update)
	adminGroup.POST("/servers/:id/provision", adminServerHandler.Provision)
	adminGroup.POST("/servers/:id/transfer", adminServerHandler.Transfer)
	adminGroup.POST("/servers/:id/renew", adminServerHandler.Renew)
	adminGroup.PATCH("/servers/:id/status", adminServerHandler.UpdateStatus)
	adminGroup.PATCH("/servers/:id/auto-renew", adminServerHandler.ToggleAutoRenew)
	adminGroup.DELETE("/servers/:id", adminServerHandler.Delete)

	// Users
	adminGroup.GET("/users", adminUserHandler.List)
	adminGroup.GET("/users/:id", adminUserHandler.Detail)
	adminGroup.POST("/users", adminUserHandler.Create)
	adminGroup.PUT("/users/:id", adminUserHandler.Update)
	adminGroup.DELETE("/users/:id", adminUserHandler.Delete)
	adminGroup.POST("/users/:id/reset-password", adminUserHandler.ResetPassword)
	adminGroup.POST("/users/batch", adminUserHandler.BatchUpdate)

	// Orders
	adminGroup.GET("/orders", adminOrderHandler.List)
	adminGroup.GET("/orders/:id", adminOrderHandler.Detail)
	adminGroup.PATCH("/orders/:id/status", adminOrderHandler.UpdateStatus)

	// Reviews
	adminGroup.GET("/reviews", adminOrderHandler.ReviewStats)
	adminGroup.POST("/reviews/:id/ticket", adminOrderHandler.CreateTicketFromReview)

	// Finance
	adminGroup.GET("/finance", adminFinanceHandler.Overview)
	adminGroup.GET("/finance/overview", adminFinanceHandler.Overview)
	adminGroup.GET("/finance/transactions", adminFinanceHandler.Transactions)
	adminGroup.GET("/finance/balance", adminFinanceHandler.Balance)
	adminGroup.POST("/finance/balance", adminFinanceHandler.Adjust)
	adminGroup.POST("/finance/recharge", adminFinanceHandler.Recharge)
	adminGroup.POST("/finance/adjust", adminFinanceHandler.Adjust)

	// Tickets
	adminGroup.GET("/tickets", adminTicketHandler.List)
	adminGroup.GET("/tickets/stats", adminTicketHandler.Stats)
	adminGroup.PATCH("/tickets/:id/status", adminTicketHandler.UpdateStatus)
	adminGroup.PATCH("/tickets/:id/priority", adminTicketHandler.UpdatePriority)
	adminGroup.GET("/tickets/classification-stats", adminTicketHandler.ClassificationStats)
	adminGroup.GET("/tickets/:id/classification", adminTicketHandler.GetClassification)
	adminGroup.POST("/tickets/:id/classification/accept", adminTicketHandler.AcceptClassification)

	// CPUs
	adminGroup.GET("/cpus", adminCPUHandler.List)
	adminGroup.POST("/cpus", adminCPUHandler.Create)
	adminGroup.PUT("/cpus/:id", adminCPUHandler.Update)
	adminGroup.DELETE("/cpus/:id", adminCPUHandler.Delete)

	// Pricing
	adminGroup.GET("/pricing", adminPricingHandler.Get)
	adminGroup.PUT("/pricing", adminPricingHandler.Update)

	// Settings
	adminGroup.GET("/settings", adminSettingsHandler.Get)
	adminGroup.PUT("/settings", adminSettingsHandler.Update)
	adminGroup.POST("/settings/test-smtp", adminSettingsHandler.TestSMTP)
	adminGroup.POST("/settings/test-ai", adminSettingsHandler.TestAI)

	// Regions
	adminGroup.GET("/regions", adminRegionHandler.List)
	adminGroup.POST("/regions", adminRegionHandler.Create)
	adminGroup.PUT("/regions/:region", adminRegionHandler.Update)
	adminGroup.DELETE("/regions/:region", adminRegionHandler.Delete)

	// Notifications (admin)
	adminNotifHandler := &admin.NotificationAdminHandler{}
	adminGroup.POST("/notifications/announce", adminNotifHandler.Announce)
	adminGroup.GET("/notifications/history", adminNotifHandler.History)
	adminGroup.GET("/notifications/user-search", adminNotifHandler.UserSearch)

	// SMS (admin)
	adminSMSHandler := admin.NewSMSHandler()
	adminGroup.GET("/sms/status", adminSMSHandler.Status)
	adminGroup.GET("/sms/templates", adminSMSHandler.Templates)
	adminGroup.POST("/sms/test", adminSMSHandler.TestSend)

	// Announcements (admin)
	adminGroup.GET("/announcements", adminAnnouncementHandler.List)
	adminGroup.POST("/announcements", adminAnnouncementHandler.Create)
	adminGroup.PUT("/announcements/:id", adminAnnouncementHandler.Update)
	adminGroup.PATCH("/announcements/:id/toggle", adminAnnouncementHandler.Toggle)
	adminGroup.DELETE("/announcements/:id", adminAnnouncementHandler.Delete)
	adminGroup.GET("/cron-logs", adminAnnouncementHandler.CronLogs)

	// Coupons (admin)
	adminGroup.GET("/coupons", adminCouponHandler.List)
	adminGroup.POST("/coupons", adminCouponHandler.Create)
	adminGroup.PUT("/coupons/:id", adminCouponHandler.Update)
	adminGroup.PATCH("/coupons/:id/toggle", adminCouponHandler.Toggle)
	adminGroup.DELETE("/coupons/:id", adminCouponHandler.Delete)
	adminGroup.POST("/coupons/:id/generate-codes", adminCouponHandler.GenerateCodes)
	adminGroup.GET("/coupons/:id/usage", adminCouponHandler.GetUsage)

	// Logs
	adminGroup.GET("/logs", adminLogHandler.List)
	adminGroup.GET("/logs/events", adminLogHandler.Events)

	// Analytics
	adminGroup.GET("/analytics", adminAnalyticsHandler.Overview)
	adminGroup.GET("/analytics/products", adminAnalyticsHandler.Products)
	adminGroup.GET("/reports/weekly", adminReportHandler.WeeklyReport)
	adminGroup.GET("/anomalies", adminAnomalyHandler.List)
	adminGroup.POST("/anomalies/scan", adminAnomalyHandler.Scan)
	adminGroup.PATCH("/anomalies/:id/resolve", adminAnomalyHandler.Resolve)
	adminGroup.GET("/api-usage/stats", adminAPIUsageHandler.Stats)
	adminGroup.GET("/api-usage/logs", adminAPIUsageHandler.Logs)
	adminGroup.PATCH("/api-tokens/:id/limit", adminAPIUsageHandler.UpdateTokenLimit)
	adminGroup.GET("/sla/configs", adminSLAHandler.ConfigList)
	adminGroup.POST("/sla/configs", adminSLAHandler.UpsertConfig)
	adminGroup.GET("/sla/violations", adminSLAHandler.ViolationList)
	adminGroup.POST("/sla/violations", adminSLAHandler.CreateViolation)
	adminGroup.POST("/sla/violations/scan", adminSLAHandler.ScanTicketTimeout)
	adminGroup.PATCH("/sla/violations/:id/status", adminSLAHandler.UpdateViolationStatus)
	adminGroup.GET("/sla/reports", adminSLAHandler.Report)

	// Health (detailed)
	adminGroup.GET("/health", handler.HealthDetailed)

	// Bulk operations
	adminGroup.POST("/bulk/users/level", adminBulkHandler.BatchUserLevel)
	adminGroup.POST("/bulk/users/balance", adminBulkHandler.BatchUserBalance)
	adminGroup.POST("/bulk/users/notify", adminBulkHandler.BatchUserNotify)
	adminGroup.POST("/bulk/servers/status", adminBulkHandler.BatchServerStatus)
	adminGroup.POST("/bulk/servers/assign", adminBulkHandler.BatchServerAssign)

	// Export
	adminGroup.GET("/export/users", adminExportHandler.Users)
	adminGroup.GET("/export/orders", adminExportHandler.Orders)
	adminGroup.GET("/export/servers", adminExportHandler.Servers)
	adminGroup.GET("/export/transactions", adminExportHandler.Transactions)
	adminGroup.GET("/export/download", adminExportHandler.Download)

	// Backups
	adminGroup.GET("/backups", adminBackupHandler.List)
	adminGroup.POST("/backups", adminBackupHandler.Create)
	adminGroup.GET("/backups/:id/download", adminBackupHandler.Download)
	adminGroup.DELETE("/backups/:id", adminBackupHandler.Delete)

	// Ticket ratings (admin)
	adminGroup.GET("/ticket-ratings", adminTicketRatingHandler.List)

	// Suppliers
	adminGroup.GET("/suppliers", adminSupplierHandler.List)
	adminGroup.POST("/suppliers", adminSupplierHandler.Create)
	adminGroup.PUT("/suppliers/:id", adminSupplierHandler.Update)
	adminGroup.DELETE("/suppliers/:id", adminSupplierHandler.Delete)

	// Email templates
	adminGroup.GET("/email-templates", adminEmailTemplateHandler.List)
	adminGroup.PUT("/email-templates/:id", adminEmailTemplateHandler.Update)
	adminGroup.POST("/email-templates/:id/preview", adminEmailTemplateHandler.Preview)
	adminGroup.POST("/email-templates/:id/reset", adminEmailTemplateHandler.Reset)

	// Article categories
	adminGroup.GET("/article-categories", adminCategoryHandler.List)
	adminGroup.POST("/article-categories", adminCategoryHandler.Create)
	adminGroup.PUT("/article-categories/:id", adminCategoryHandler.Update)
	adminGroup.DELETE("/article-categories/:id", adminCategoryHandler.Delete)

	// Articles
	adminGroup.GET("/articles", adminArticleHandler.List)
	adminGroup.POST("/articles", adminArticleHandler.Create)
	adminGroup.PUT("/articles/:id", adminArticleHandler.Update)
	adminGroup.DELETE("/articles/:id", adminArticleHandler.Delete)
	adminGroup.PATCH("/articles/:id/publish", adminArticleHandler.TogglePublish)

	// NPS
	adminGroup.GET("/nps", adminNpsHandler.List)
	adminGroup.GET("/nps/stats", adminNpsHandler.Stats)

	// Login history (admin)
	adminGroup.GET("/login-history", adminLoginHistoryHandler.List)

	// Points (admin)
	adminGroup.GET("/points", adminPointsHandler.List)
	adminGroup.POST("/points/adjust", adminPointsHandler.Adjust)

	// Finance trends + top users
	adminGroup.GET("/finance/trends", adminFinanceHandler.Trends)
	adminGroup.GET("/finance/top-users", adminFinanceHandler.TopUsers)
	adminGroup.GET("/finance/dashboard", adminFinanceHandler.Dashboard)
	adminGroup.GET("/finance/profit", adminFinanceHandler.Profit)

	// Agent commission settlement (admin)
	adminGroup.GET("/agent-commission", adminCommissionHandler.AgentList)
	adminGroup.GET("/agent-commission/:agentId/details", adminCommissionHandler.AgentDetails)
	adminGroup.GET("/agent-commission/withdrawals", adminCommissionHandler.Withdrawals)
	adminGroup.POST("/agent-commission/withdrawals/:id/approve", adminCommissionHandler.Approve)
	adminGroup.POST("/agent-commission/withdrawals/:id/reject", adminCommissionHandler.Reject)
	adminGroup.POST("/agent-commission/withdrawals/:id/settle", adminCommissionHandler.Settle)

	// Level history
	adminGroup.GET("/users/:id/level-history", adminUserHandler.LevelHistory)

	return r
}
