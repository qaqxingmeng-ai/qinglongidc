package admin

import (
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type FinanceHandler struct{}

func NewFinanceHandler() *FinanceHandler {
	return &FinanceHandler{}
}

// GET /api/admin/finance/overview
func (h *FinanceHandler) Overview(c *gin.Context) {
	var totalBalance float64
	database.DB.Model(&model.User{}).Select("COALESCE(SUM(balance), 0)").Scan(&totalBalance)

	var totalRecharge float64
	database.DB.Model(&model.Transaction{}).Where("type = ?", "RECHARGE").
		Select("COALESCE(SUM(amount), 0)").Scan(&totalRecharge)

	var totalSpend float64
	database.DB.Model(&model.Transaction{}).Where("type = ?", "PURCHASE").
		Select("COALESCE(SUM(ABS(amount)), 0)").Scan(&totalSpend)

	var todayRecharge float64
	today := time.Now().Truncate(24 * time.Hour)
	database.DB.Model(&model.Transaction{}).Where("type = ? AND created_at >= ?", "RECHARGE", today).
		Select("COALESCE(SUM(amount), 0)").Scan(&todayRecharge)

	var todaySpend float64
	database.DB.Model(&model.Transaction{}).Where("type = ? AND created_at >= ?", "PURCHASE", today).
		Select("COALESCE(SUM(ABS(amount)), 0)").Scan(&todaySpend)

	c.JSON(http.StatusOK, gin.H{
		"totalBalance":  totalBalance,
		"totalRecharge": totalRecharge,
		"totalSpend":    totalSpend,
		"todayRecharge": todayRecharge,
		"todaySpend":    todaySpend,
	})
}

// GET /api/admin/finance/transactions
func (h *FinanceHandler) Transactions(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.Transaction{})

	if txType := c.Query("type"); txType != "" {
		query = query.Where("type = ?", txType)
	}
	if userID := c.Query("userId"); userID != "" {
		query = query.Where("user_id = ?", userID)
	}

	var total int64
	query.Count(&total)

	var transactions []model.Transaction
	query.Preload("User").
		Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&transactions)

	c.JSON(http.StatusOK, gin.H{
		"transactions": transactions,
		"total":        total,
		"page":         page,
		"pageSize":     pageSize,
		"totalPages":   int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// POST /api/admin/finance/recharge
func (h *FinanceHandler) Recharge(c *gin.Context) {
	adminID := middleware.GetUserID(c)

	var req struct {
		UserID string  `json:"userId" binding:"required"`
		Amount float64 `json:"amount" binding:"required,gt=0"`
		Note   string  `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写充值信息"})
		return
	}

	note := req.Note
	if note == "" {
		note = "管理员充值"
	}
	now := time.Now()
	var balanceBefore, balanceAfter float64
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		var user model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, "id = ?", req.UserID).Error; err != nil {
			return err
		}

		balanceBefore = service.RoundMoney(user.Balance)
		balanceAfter = service.RoundMoney(user.Balance + req.Amount)

		if err := tx.Model(&model.User{}).Where("id = ?", req.UserID).Updates(map[string]interface{}{
			"balance":    balanceAfter,
			"updated_at": now,
		}).Error; err != nil {
			return err
		}

		if err := tx.Create(&model.Transaction{
			ID:            service.GenerateID(),
			UserID:        req.UserID,
			Type:          "RECHARGE",
			Amount:        req.Amount,
			BalanceBefore: balanceBefore,
			BalanceAfter:  balanceAfter,
			Note:          &note,
			OperatorID:    &adminID,
			CreatedAt:     now,
		}).Error; err != nil {
			return err
		}

		return tx.Create(&model.UserLog{
			ID:        service.GenerateID(),
			UserID:    adminID,
			Event:     "ADMIN_RECHARGE",
			TargetID:  &req.UserID,
			Detail:    stringPtr("充值金额: " + strconv.FormatFloat(req.Amount, 'f', 2, 64)),
			CreatedAt: now,
		}).Error
	}); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "充值失败"})
		return
	}

	_, _ = service.CreateNotification(
		req.UserID,
		"BALANCE_CHANGE",
		"余额充值到账",
		"您的账户已充值 ¥"+strconv.FormatFloat(req.Amount, 'f', 2, 64)+"，当前余额 ¥"+strconv.FormatFloat(balanceAfter, 'f', 2, 64),
		nil,
		nil,
	)

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"balance":       balanceAfter,
		"balanceBefore": balanceBefore,
	})
}

// POST /api/admin/finance/adjust
func (h *FinanceHandler) Adjust(c *gin.Context) {
	adminID := middleware.GetUserID(c)

	var req struct {
		UserID string  `json:"userId" binding:"required"`
		Amount float64 `json:"amount" binding:"required"`
		Note   string  `json:"note" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写调整信息和备注"})
		return
	}

	now := time.Now()
	var balanceBefore, balanceAfter float64
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		var user model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, "id = ?", req.UserID).Error; err != nil {
			return err
		}

		balanceBefore = service.RoundMoney(user.Balance)
		balanceAfter = service.RoundMoney(user.Balance + req.Amount)
		if balanceAfter < 0 {
			return errors.New("调整后余额不能为负")
		}

		if err := tx.Model(&model.User{}).Where("id = ?", req.UserID).Updates(map[string]interface{}{
			"balance":    balanceAfter,
			"updated_at": now,
		}).Error; err != nil {
			return err
		}

		if err := tx.Create(&model.Transaction{
			ID:            service.GenerateID(),
			UserID:        req.UserID,
			Type:          "ADMIN_ADJUST",
			Amount:        req.Amount,
			BalanceBefore: balanceBefore,
			BalanceAfter:  balanceAfter,
			Note:          &req.Note,
			OperatorID:    &adminID,
			CreatedAt:     now,
		}).Error; err != nil {
			return err
		}

		detail := "余额调整: " + strconv.FormatFloat(req.Amount, 'f', 2, 64)
		return tx.Create(&model.UserLog{
			ID:        service.GenerateID(),
			UserID:    adminID,
			Event:     "ADMIN_ADJUST",
			TargetID:  &req.UserID,
			Detail:    &detail,
			CreatedAt: now,
		}).Error
	}); err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		case err.Error() == "调整后余额不能为负":
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "调整失败"})
		}
		return
	}

	action := "增加"
	if req.Amount < 0 {
		action = "扣减"
	}
	_, _ = service.CreateNotification(
		req.UserID,
		"BALANCE_CHANGE",
		"账户余额变动",
		"您的账户余额已"+action+" ¥"+strconv.FormatFloat(math.Abs(req.Amount), 'f', 2, 64)+"，当前余额 ¥"+strconv.FormatFloat(balanceAfter, 'f', 2, 64),
		nil,
		nil,
	)

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"balance":       balanceAfter,
		"balanceBefore": balanceBefore,
	})
}

// GET /api/admin/finance/balance
func (h *FinanceHandler) Balance(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.User{})
	search := strings.TrimSpace(c.Query("search"))
	if search == "" {
		search = strings.TrimSpace(c.Query("q"))
	}
	if search != "" {
		s := "%" + search + "%"
		query = query.Where("email ILIKE ? OR name ILIKE ? OR CAST(numeric_id AS TEXT) ILIKE ?", s, s, s)
	}

	var total int64
	query.Count(&total)

	type userBalanceRow struct {
		ID               string    `json:"id"`
		NumericID        int       `json:"numericId"`
		Email            string    `json:"email"`
		Name             string    `json:"name"`
		Phone            *string   `json:"phone,omitempty"`
		Role             string    `json:"role"`
		Level            string    `json:"level"`
		Balance          float64   `json:"balance"`
		CreatedAt        time.Time `json:"createdAt"`
		TransactionCount int64     `json:"transactionCount"`
	}

	var users []userBalanceRow
	query.Select(`
		id,
		numeric_id,
		email,
		name,
		phone,
		role,
		level,
		balance,
		created_at,
		COALESCE((SELECT COUNT(1) FROM transactions t WHERE t.user_id = users.id), 0) AS transaction_count
	`).
		Order("balance DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&users)

	c.JSON(http.StatusOK, gin.H{
		"users":      users,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// GET /api/admin/finance/trends?months=12
func (h *FinanceHandler) Trends(c *gin.Context) {
	months, _ := strconv.Atoi(c.DefaultQuery("months", "12"))
	if months < 1 || months > 24 {
		months = 12
	}

	type MonthStat struct {
		Month    string  `json:"month"`
		Recharge float64 `json:"recharge"`
		Purchase float64 `json:"purchase"`
	}

	var rechargeStats []struct {
		Month  string  `gorm:"column:month"`
		Amount float64 `gorm:"column:amount"`
	}
	database.DB.Raw(`
		SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COALESCE(SUM(amount), 0) AS amount
		FROM transactions
		WHERE type = 'RECHARGE' AND created_at >= NOW() - (? * INTERVAL '1 month')
		GROUP BY month ORDER BY month ASC`, months).Scan(&rechargeStats)

	var purchaseStats []struct {
		Month  string  `gorm:"column:month"`
		Amount float64 `gorm:"column:amount"`
	}
	database.DB.Raw(`
		SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COALESCE(SUM(ABS(amount)), 0) AS amount
		FROM transactions
		WHERE type = 'PURCHASE' AND created_at >= NOW() - (? * INTERVAL '1 month')
		GROUP BY month ORDER BY month ASC`, months).Scan(&purchaseStats)

	// Build month index map
	rechargeMap := map[string]float64{}
	for _, r := range rechargeStats {
		rechargeMap[r.Month] = r.Amount
	}
	purchaseMap := map[string]float64{}
	for _, p := range purchaseStats {
		purchaseMap[p.Month] = p.Amount
	}

	// Fill all months
	result := make([]MonthStat, 0, months)
	now := time.Now()
	for i := months - 1; i >= 0; i-- {
		t := now.AddDate(0, -i, 0)
		m := t.Format("2006-01")
		result = append(result, MonthStat{
			Month:    m,
			Recharge: rechargeMap[m],
			Purchase: purchaseMap[m],
		})
	}

	c.JSON(http.StatusOK, gin.H{"trends": result})
}

// GET /api/admin/finance/users
// Returns top users for the users list endpoint
func (h *FinanceHandler) Users(c *gin.Context) {
	h.TopUsers(c)
}

// GET /api/admin/finance/dashboard
// Returns complete financial dashboard data: growth rates, profit, composition, top users.
func (h *FinanceHandler) Dashboard(c *gin.Context) {
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	lastMonthStart := monthStart.AddDate(0, -1, 0)
	yearStart := time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
	lastYearStart := yearStart.AddDate(-1, 0, 0)
	lastYearEnd := yearStart

	// Total platform revenue from PURCHASE transactions
	var totalRevenue float64
	database.DB.Model(&model.Transaction{}).Where("type = 'PURCHASE'").
		Select("COALESCE(SUM(ABS(amount)), 0)").Scan(&totalRevenue)

	var monthRevenue float64
	database.DB.Model(&model.Transaction{}).Where("type = 'PURCHASE' AND created_at >= ?", monthStart).
		Select("COALESCE(SUM(ABS(amount)), 0)").Scan(&monthRevenue)

	var lastMonthRevenue float64
	database.DB.Model(&model.Transaction{}).Where("type = 'PURCHASE' AND created_at >= ? AND created_at < ?", lastMonthStart, monthStart).
		Select("COALESCE(SUM(ABS(amount)), 0)").Scan(&lastMonthRevenue)

	var yearRevenue float64
	database.DB.Model(&model.Transaction{}).Where("type = 'PURCHASE' AND created_at >= ?", yearStart).
		Select("COALESCE(SUM(ABS(amount)), 0)").Scan(&yearRevenue)

	var lastYearRevenue float64
	database.DB.Model(&model.Transaction{}).Where("type = 'PURCHASE' AND created_at >= ? AND created_at < ?", lastYearStart, lastYearEnd).
		Select("COALESCE(SUM(ABS(amount)), 0)").Scan(&lastYearRevenue)

	// Total recharge
	var totalRecharge float64
	database.DB.Model(&model.Transaction{}).Where("type = 'RECHARGE'").
		Select("COALESCE(SUM(amount), 0)").Scan(&totalRecharge)

	var monthRecharge float64
	database.DB.Model(&model.Transaction{}).Where("type = 'RECHARGE' AND created_at >= ?", monthStart).
		Select("COALESCE(SUM(amount), 0)").Scan(&monthRecharge)

	// Total orders
	var totalOrders int64
	database.DB.Model(&model.Order{}).Where("status IN ('PAID','COMPLETED')").Count(&totalOrders)

	var monthOrders int64
	database.DB.Model(&model.Order{}).Where("status IN ('PAID','COMPLETED') AND created_at >= ?", monthStart).Count(&monthOrders)

	// Profit = sum(order_items.price) - sum(products.cost_price * quantity * period)
	// Only from paid/completed orders
	var grossRevenue float64
	database.DB.Raw(`
		SELECT COALESCE(SUM(oi.price), 0)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		WHERE o.status IN ('PAID','COMPLETED')`).Scan(&grossRevenue)

	var totalCost float64
	database.DB.Raw(`
		SELECT COALESCE(SUM(p.cost_price * oi.quantity * oi.period), 0)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN products p ON p.id = oi.product_id
		WHERE o.status IN ('PAID','COMPLETED')`).Scan(&totalCost)

	totalProfit := grossRevenue - totalCost

	var monthGrossRevenue float64
	database.DB.Raw(`
		SELECT COALESCE(SUM(oi.price), 0)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		WHERE o.status IN ('PAID','COMPLETED') AND o.created_at >= ?`, monthStart).Scan(&monthGrossRevenue)

	var monthCost float64
	database.DB.Raw(`
		SELECT COALESCE(SUM(p.cost_price * oi.quantity * oi.period), 0)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN products p ON p.id = oi.product_id
		WHERE o.status IN ('PAID','COMPLETED') AND o.created_at >= ?`, monthStart).Scan(&monthCost)

	monthProfit := monthGrossRevenue - monthCost

	// Revenue composition: new purchase vs renewal vs recharge
	var newPurchaseRevenue float64
	database.DB.Raw(`
		SELECT COALESCE(SUM(oi.price), 0)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		WHERE o.status IN ('PAID','COMPLETED') AND o.renewal_server_id IS NULL`).Scan(&newPurchaseRevenue)

	var renewalRevenue float64
	database.DB.Raw(`
		SELECT COALESCE(SUM(oi.price), 0)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		WHERE o.status IN ('PAID','COMPLETED') AND o.renewal_server_id IS NOT NULL`).Scan(&renewalRevenue)

	// Agent sales breakdown
	type AgentStat struct {
		AgentID      string  `gorm:"column:agent_id" json:"agentId"`
		AgentName    string  `gorm:"column:agent_name" json:"agentName"`
		TotalRevenue float64 `gorm:"column:total_revenue" json:"totalRevenue"`
		MonthRevenue float64 `gorm:"column:month_revenue" json:"monthRevenue"`
		OrderCount   int     `gorm:"column:order_count" json:"orderCount"`
		UserCount    int     `gorm:"column:user_count" json:"userCount"`
	}
	var agentSales []AgentStat
	database.DB.Raw(`
		SELECT a.id AS agent_id, a.name AS agent_name,
		       COALESCE(SUM(o.total_price), 0) AS total_revenue,
		       COALESCE(SUM(CASE WHEN o.created_at >= ? THEN o.total_price ELSE 0 END), 0) AS month_revenue,
		       COUNT(DISTINCT o.id) AS order_count,
		       COUNT(DISTINCT o.user_id) AS user_count
		FROM users a
		JOIN users u ON u.agent_id = a.id
		JOIN orders o ON o.user_id = u.id AND o.status IN ('PAID','COMPLETED')
		WHERE a.role = 'AGENT'
		GROUP BY a.id, a.name
		ORDER BY total_revenue DESC
		LIMIT 10`, monthStart).Scan(&agentSales)

	// Recent orders
	type RecentOrder struct {
		ID         string    `gorm:"column:id" json:"id"`
		OrderNo    string    `gorm:"column:order_no" json:"orderNo"`
		TotalPrice float64   `gorm:"column:total_price" json:"totalPrice"`
		Status     string    `gorm:"column:status" json:"status"`
		CreatedAt  time.Time `gorm:"column:created_at" json:"createdAt"`
		UserName   string    `gorm:"column:user_name" json:"userName"`
		UserEmail  string    `gorm:"column:user_email" json:"userEmail"`
		IsRenewal  bool      `gorm:"column:is_renewal" json:"isRenewal"`
	}
	var recentOrders []RecentOrder
	database.DB.Raw(`
		SELECT o.id, o.order_no, o.total_price, o.status, o.created_at,
		       u.name AS user_name, u.email AS user_email,
		       (o.renewal_server_id IS NOT NULL) AS is_renewal
		FROM orders o
		JOIN users u ON u.id = o.user_id
		ORDER BY o.created_at DESC
		LIMIT 10`).Scan(&recentOrders)

	// Growth rates
	momGrowth := 0.0
	if lastMonthRevenue > 0 {
		momGrowth = (monthRevenue - lastMonthRevenue) / lastMonthRevenue * 100
	}
	yoyGrowth := 0.0
	if lastYearRevenue > 0 {
		yoyGrowth = (yearRevenue - lastYearRevenue) / lastYearRevenue * 100
	}

	c.JSON(http.StatusOK, gin.H{
		"totalRevenue":       totalRevenue,
		"monthRevenue":       monthRevenue,
		"lastMonthRevenue":   lastMonthRevenue,
		"yearRevenue":        yearRevenue,
		"lastYearRevenue":    lastYearRevenue,
		"totalRecharge":      totalRecharge,
		"monthRecharge":      monthRecharge,
		"totalOrders":        totalOrders,
		"monthOrders":        monthOrders,
		"totalProfit":        totalProfit,
		"monthProfit":        monthProfit,
		"grossRevenue":       grossRevenue,
		"totalCost":          totalCost,
		"momGrowth":          momGrowth,
		"yoyGrowth":          yoyGrowth,
		"newPurchaseRevenue": newPurchaseRevenue,
		"renewalRevenue":     renewalRevenue,
		"rechargeRevenue":    totalRecharge,
		"agentSales":         agentSales,
		"recentOrders":       recentOrders,
	})
}

// GET /api/admin/finance/profit?period=month&months=12
// Returns profit breakdown by month and by region/supplier.
func (h *FinanceHandler) Profit(c *gin.Context) {
	months, _ := strconv.Atoi(c.DefaultQuery("months", "12"))
	if months < 1 || months > 24 {
		months = 12
	}

	type MonthProfit struct {
		Month   string  `json:"month"`
		Revenue float64 `json:"revenue"`
		Cost    float64 `json:"cost"`
		Profit  float64 `json:"profit"`
	}

	var rawStats []struct {
		Month   string  `gorm:"column:month"`
		Revenue float64 `gorm:"column:revenue"`
		Cost    float64 `gorm:"column:cost"`
	}
	database.DB.Raw(`
		SELECT TO_CHAR(o.created_at, 'YYYY-MM') AS month,
		       COALESCE(SUM(oi.price), 0) AS revenue,
		       COALESCE(SUM(p.cost_price * oi.quantity * oi.period), 0) AS cost
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN products p ON p.id = oi.product_id
		WHERE o.status IN ('PAID','COMPLETED')
		  AND o.created_at >= NOW() - (? * INTERVAL '1 month')
		GROUP BY month
		ORDER BY month ASC`, months).Scan(&rawStats)

	statMap := map[string]MonthProfit{}
	for _, s := range rawStats {
		statMap[s.Month] = MonthProfit{Month: s.Month, Revenue: s.Revenue, Cost: s.Cost, Profit: s.Revenue - s.Cost}
	}

	// Fill gaps
	result := make([]MonthProfit, 0, months)
	now := time.Now()
	for i := months - 1; i >= 0; i-- {
		t := now.AddDate(0, -i, 0)
		m := t.Format("2006-01")
		if v, ok := statMap[m]; ok {
			result = append(result, v)
		} else {
			result = append(result, MonthProfit{Month: m})
		}
	}

	// By region
	type RegionProfit struct {
		Region  string  `gorm:"column:region" json:"region"`
		Revenue float64 `gorm:"column:revenue" json:"revenue"`
		Cost    float64 `gorm:"column:cost" json:"cost"`
		Profit  float64 `gorm:"column:profit" json:"profit"`
	}
	var byRegion []RegionProfit
	database.DB.Raw(`
		SELECT p.region,
		       COALESCE(SUM(oi.price), 0) AS revenue,
		       COALESCE(SUM(p.cost_price * oi.quantity * oi.period), 0) AS cost,
		       COALESCE(SUM(oi.price - (p.cost_price * oi.quantity * oi.period)), 0) AS profit
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN products p ON p.id = oi.product_id
		WHERE o.status IN ('PAID','COMPLETED')
		GROUP BY p.region
		ORDER BY profit DESC
		LIMIT 15`).Scan(&byRegion)

	// By supplier
	type SupplierProfit struct {
		Supplier string  `gorm:"column:supplier" json:"supplier"`
		Revenue  float64 `gorm:"column:revenue" json:"revenue"`
		Cost     float64 `gorm:"column:cost" json:"cost"`
		Profit   float64 `gorm:"column:profit" json:"profit"`
	}
	var bySupplier []SupplierProfit
	database.DB.Raw(`
		SELECT COALESCE(NULLIF(p.supplier,''), '未标注') AS supplier,
		       COALESCE(SUM(oi.price), 0) AS revenue,
		       COALESCE(SUM(p.cost_price * oi.quantity * oi.period), 0) AS cost,
		       COALESCE(SUM(oi.price - (p.cost_price * oi.quantity * oi.period)), 0) AS profit
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN products p ON p.id = oi.product_id
		WHERE o.status IN ('PAID','COMPLETED')
		GROUP BY supplier
		ORDER BY profit DESC
		LIMIT 15`).Scan(&bySupplier)

	c.JSON(http.StatusOK, gin.H{
		"byMonth":    result,
		"byRegion":   byRegion,
		"bySupplier": bySupplier,
	})
}

// GET /api/admin/finance/top-users?limit=10&type=recharge
func (h *FinanceHandler) TopUsers(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	if limit < 1 || limit > 50 {
		limit = 10
	}
	txType := c.DefaultQuery("type", "recharge") // recharge | purchase

	txTypeSQL := "RECHARGE"
	if txType == "purchase" {
		txTypeSQL = "PURCHASE"
	}

	type TopUser struct {
		UserID  string  `gorm:"column:user_id" json:"userId"`
		Email   string  `gorm:"column:email" json:"email"`
		Name    string  `gorm:"column:name" json:"name"`
		Amount  float64 `gorm:"column:amount" json:"amount"`
		TxCount int     `gorm:"column:tx_count" json:"txCount"`
		Level   string  `gorm:"column:level" json:"level"`
	}

	var users []TopUser
	database.DB.Raw(`
		SELECT t.user_id, u.email, u.name, u.level,
		       COALESCE(SUM(ABS(t.amount)), 0) AS amount,
		       COUNT(*) AS tx_count
		FROM transactions t
		JOIN users u ON u.id = t.user_id
		WHERE t.type = ?
		GROUP BY t.user_id, u.email, u.name, u.level
		ORDER BY amount DESC
		LIMIT ?`, txTypeSQL, limit).Scan(&users)

	c.JSON(http.StatusOK, gin.H{"users": users, "type": txType})
}
