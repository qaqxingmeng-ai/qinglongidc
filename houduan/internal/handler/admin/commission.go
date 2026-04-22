package admin

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"math"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type CommissionHandler struct{}

func NewCommissionHandler() *CommissionHandler { return &CommissionHandler{} }

// GET /api/admin/agent-commission?page=&pageSize=
// Lists all agents with their commission summary
func (h *CommissionHandler) AgentList(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	type AgentSummary struct {
		AgentID      string  `json:"agentId"`
		AgentName    string  `json:"agentName"`
		AgentEmail   string  `json:"agentEmail"`
		TotalAmount  float64 `json:"totalAmount"`
		FrozenAmt    float64 `json:"frozenAmount"`
		AvailableAmt float64 `json:"availableAmount"`
		SettledAmt   float64 `json:"settledAmount"`
		PendingAmt   float64 `json:"pendingWithdraw"`
		OrderCount   int64   `json:"orderCount"`
	}

	var agents []model.User
	var total int64
	database.DB.Model(&model.User{}).Where("role = ?", "AGENT").Count(&total)
	database.DB.Where("role = ?", "AGENT").
		Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&agents)

	// Batch aggregate commission stats for all agents in one query
	agentIDs := make([]string, len(agents))
	for i, a := range agents {
		agentIDs[i] = a.ID
	}

	type commAgg struct {
		AgentID   string  `gorm:"column:agent_id"`
		Status    string  `gorm:"column:status"`
		Total     float64 `gorm:"column:total"`
		ItemCount int64   `gorm:"column:item_count"`
	}
	var commRows []commAgg
	if len(agentIDs) > 0 {
		database.DB.Raw(`
			SELECT agent_id, status, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS item_count
			FROM commissions
			WHERE agent_id IN ?
			GROUP BY agent_id, status`, agentIDs).Scan(&commRows)
	}

	type withdrawAgg struct {
		AgentID string  `gorm:"column:agent_id"`
		Total   float64 `gorm:"column:total"`
	}
	var withdrawRows []withdrawAgg
	if len(agentIDs) > 0 {
		database.DB.Raw(`
			SELECT agent_id, COALESCE(SUM(amount), 0) AS total
			FROM commission_withdrawals
			WHERE agent_id IN ? AND status IN ('PENDING','APPROVED')
			GROUP BY agent_id`, agentIDs).Scan(&withdrawRows)
	}

	// Build lookup maps
	type agentAcc struct {
		frozen, available, settled, pending float64
		orderCount                          int64
	}
	accMap := make(map[string]*agentAcc)
	for _, row := range commRows {
		acc, ok := accMap[row.AgentID]
		if !ok {
			acc = &agentAcc{}
			accMap[row.AgentID] = acc
		}
		switch row.Status {
		case "FROZEN":
			acc.frozen = row.Total
		case "AVAILABLE":
			acc.available = row.Total
		case "SETTLED":
			acc.settled = row.Total
		}
		acc.orderCount += row.ItemCount
	}
	for _, row := range withdrawRows {
		acc, ok := accMap[row.AgentID]
		if !ok {
			acc = &agentAcc{}
			accMap[row.AgentID] = acc
		}
		acc.pending = row.Total
	}

	results := make([]AgentSummary, 0, len(agents))
	for _, a := range agents {
		acc := accMap[a.ID]
		if acc == nil {
			acc = &agentAcc{}
		}
		results = append(results, AgentSummary{
			AgentID:      a.ID,
			AgentName:    a.Name,
			AgentEmail:   a.Email,
			TotalAmount:  acc.frozen + acc.available + acc.settled,
			FrozenAmt:    acc.frozen,
			AvailableAmt: acc.available,
			SettledAmt:   acc.settled,
			PendingAmt:   acc.pending,
			OrderCount:   acc.orderCount,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"success":         true,
		"agents":     results,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// GET /api/admin/agent-commission/:agentId/details?page=&startDate=&endDate=
// Order-level commission details for one agent
func (h *CommissionHandler) AgentDetails(c *gin.Context) {
	agentID := c.Param("agentId")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.Commission{}).Where("agent_id = ?", agentID)
	if start := c.Query("startDate"); start != "" {
		if t, err := time.Parse("2006-01-02", start); err == nil {
			query = query.Where("commissions.created_at >= ?", t)
		}
	}
	if end := c.Query("endDate"); end != "" {
		if t, err := time.Parse("2006-01-02", end); err == nil {
			query = query.Where("commissions.created_at <= ?", t.Add(24*time.Hour-1))
		}
	}
	if status := c.Query("status"); status != "" {
		query = query.Where("commissions.status = ?", status)
	}

	var total int64
	query.Count(&total)

	var items []model.Commission
	query.Preload("Order").Preload("Order.User").Preload("Order.Items.Product").
		Order("commissions.created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&items)

	c.JSON(http.StatusOK, gin.H{
		"success":          true,
		"commissions": items,
		"total":       total,
		"page":        page,
		"pageSize":    pageSize,
		"totalPages":  int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// GET /api/admin/agent-commission/withdrawals?page=&status=&agentId=
func (h *CommissionHandler) Withdrawals(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.CommissionWithdrawal{})
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	if agentID := c.Query("agentId"); agentID != "" {
		query = query.Where("agent_id = ?", agentID)
	}

	var total int64
	query.Count(&total)

	var items []model.CommissionWithdrawal
	query.Preload("Agent").
		Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&items)

	c.JSON(http.StatusOK, gin.H{
		"success":          true,
		"withdrawals": items,
		"total":       total,
		"page":        page,
		"pageSize":    pageSize,
		"totalPages":  int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// POST /api/admin/agent-commission/withdrawals/:id/approve
func (h *CommissionHandler) Approve(c *gin.Context) {
	id := c.Param("id")

	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		var w model.CommissionWithdrawal
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&w, "id = ?", id).Error; err != nil {
			return err
		}
		if w.Status != "PENDING" {
			return errors.New("only PENDING withdrawals can be approved")
		}
		now := time.Now()
		w.Status = "APPROVED"
		w.ReviewedAt = &now
		return tx.Save(&w).Error
	}); err != nil {
		if err.Error() == "only PENDING withdrawals can be approved" {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /api/admin/agent-commission/withdrawals/:id/reject
// Body: { "note": "reason" }
func (h *CommissionHandler) Reject(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Note string `json:"note"`
	}
	_ = c.ShouldBindJSON(&req)

	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		var w model.CommissionWithdrawal
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&w, "id = ?", id).Error; err != nil {
			return err
		}
		if w.Status != "PENDING" && w.Status != "APPROVED" {
			return errors.New("cannot reject in current status")
		}
		now := time.Now()
		w.Status = "REJECTED"
		w.ReviewedAt = &now
		if req.Note != "" {
			w.AdminNote = &req.Note
		}
		return tx.Save(&w).Error
	}); err != nil {
		if err.Error() == "cannot reject in current status" {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /api/admin/agent-commission/withdrawals/:id/settle
// Marks the withdrawal as settled and marks matching FROZEN commissions as SETTLED
func (h *CommissionHandler) Settle(c *gin.Context) {
	id := c.Param("id")
	var (
		w                    model.CommissionWithdrawal
		errInvalidStatus     = errors.New("only APPROVED withdrawals can be settled")
		errInsufficientFunds = errors.New("available commission is lower than the approved withdrawal amount")
	)

	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&w, "id = ?", id).Error; err != nil {
			return err
		}
		if w.Status != "APPROVED" {
			return errInvalidStatus
		}

		now := time.Now()
		var toSettle []model.Commission
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("agent_id = ? AND status = ?", w.AgentID, "AVAILABLE").
			Order("created_at ASC").
			Find(&toSettle).Error; err != nil {
			return err
		}

		var settled float64
		var settleIDs []string
		for _, cm := range toSettle {
			if settled >= w.Amount {
				break
			}
			settleIDs = append(settleIDs, cm.ID)
			settled += cm.Amount
		}
		if settled < w.Amount {
			return errInsufficientFunds
		}

		if len(settleIDs) > 0 {
			if err := tx.Model(&model.Commission{}).
				Where("id IN (?)", settleIDs).
				Updates(map[string]interface{}{
					"status":     "SETTLED",
					"settled_at": now,
					"updated_at": now,
				}).Error; err != nil {
				return err
			}
		}

		w.Status = "SETTLED"
		w.SettledAt = &now
		return tx.Save(&w).Error
	}); err != nil {
		switch {
		case errors.Is(err, errInvalidStatus):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, errInsufficientFunds):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "settlement failed"})
		}
		return
	}

	_, _ = service.CreateNotification(
		w.AgentID,
		"COMMISSION",
		"佣金结算完成",
		"您的佣金结算申请已完成，金额 ¥"+strconv.FormatFloat(w.Amount, 'f', 2, 64),
		&w.ID,
		strPtr("CommissionWithdrawal"),
	)

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func strPtr(s string) *string { return &s }
