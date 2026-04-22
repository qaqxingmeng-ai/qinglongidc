package admin

import (
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type OrderHandler struct{}

func NewOrderHandler() *OrderHandler {
	return &OrderHandler{}
}

// GET /api/admin/orders
func (h *OrderHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.Order{})

	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	if userID := c.Query("userId"); userID != "" {
		query = query.Where("user_id = ?", userID)
	}
	if search := strings.TrimSpace(c.Query("search")); search != "" {
		pattern := "%" + search + "%"
		matchedUsers := database.DB.Model(&model.User{}).
			Select("id").
			Where("name ILIKE ? OR email ILIKE ?", pattern, pattern)
		query = query.Where("order_no ILIKE ? OR user_id IN (?)", pattern, matchedUsers)
	}

	var total int64
	query.Count(&total)

	var orders []model.Order
	query.Preload("User").Preload("Items").Preload("Items.Product").Preload("Tickets").
		Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&orders)

	c.JSON(http.StatusOK, gin.H{
		"orders":     orders,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

// GET /api/admin/orders/:id
func (h *OrderHandler) Detail(c *gin.Context) {
	id := c.Param("id")

	var order model.Order
	if err := database.DB.Preload("User").Preload("Items").Preload("Items.Product").
		First(&order, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "订单不存在"})
		return
	}

	c.JSON(http.StatusOK, order)
}

// PATCH /api/admin/orders/:id/status
func (h *OrderHandler) UpdateStatus(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供状态"})
		return
	}

	valid := map[string]bool{"PENDING": true, "PAID": true, "COMPLETED": true, "CANCELLED": true, "REFUNDED": true}
	if !valid[req.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的状态"})
		return
	}

	var (
		updatedOrder            model.Order
		shouldCreateCommission  bool
		shouldCancelCommission  bool
	)

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		var order model.Order
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&order, "id = ?", id).Error; err != nil {
			return err
		}

		wasPaid := order.Status == "PAID" || order.Status == "COMPLETED"
		wasRefunded := order.Status == "REFUNDED"
		now := time.Now()

		// 状态机守护：拒绝非法流转（同态直接返回成功）
		if order.Status == req.Status {
			updatedOrder = order
			return nil
		}
		if err := service.ValidateOrderTransition(order.Status, req.Status); err != nil {
			return err
		}

		if req.Status == "PAID" && order.RenewalServerID != nil && *order.RenewalServerID != "" && order.RenewalPeriod > 0 {
			var srv model.ServerInstance
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&srv, "id = ?", *order.RenewalServerID).Error; err != nil {
				return err
			}
			newExpire := now.AddDate(0, order.RenewalPeriod, 0)
			if srv.ExpireDate != nil && srv.ExpireDate.After(now) {
				newExpire = srv.ExpireDate.AddDate(0, order.RenewalPeriod, 0)
			}
			if err := tx.Model(&model.ServerInstance{}).Where("id = ?", *order.RenewalServerID).
				Updates(map[string]interface{}{
					"expire_date": newExpire,
					"status":      "ACTIVE",
					"updated_at":  now,
				}).Error; err != nil {
				return err
			}
		}

		// 退款：回补库存、优惠券、积分、余额、服务器
		if req.Status == "REFUNDED" {
			if err := service.RollbackOrderResources(tx, &order); err != nil {
				return err
			}
		}
		// 取消：只对 PENDING 可走到这里，资源尚未真正占用（库存在创建时就扣了，所以也回补），
		// 跟退款差别在于不需要退余额（PENDING 订单本身创建时已扣）——当前流程中所有创建都直接 PAID，
		// 因此 CANCELLED 也做完整回滚。
		if req.Status == "CANCELLED" {
			if err := service.RollbackOrderResources(tx, &order); err != nil {
				return err
			}
		}

		if err := tx.Model(&model.Order{}).Where("id = ?", id).
			Updates(map[string]interface{}{
				"status":     req.Status,
				"updated_at": now,
			}).Error; err != nil {
			return err
		}
		if err := tx.First(&updatedOrder, "id = ?", id).Error; err != nil {
			return err
		}

		shouldCreateCommission = req.Status == "PAID" && !wasPaid
		shouldCancelCommission = (req.Status == "REFUNDED" || req.Status == "CANCELLED") && !wasRefunded
		return nil
	})
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "订单不存在"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Create commission for agent (async, non-blocking) whenever an order is first marked PAID.
	if shouldCreateCommission {
		go service.CreateCommissionForOrder(id)
	}
	if shouldCancelCommission {
		go service.CancelCommissionForOrder(id)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "order": updatedOrder})
}

// GET /api/admin/reviews
func (h *OrderHandler) ReviewStats(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	// Average + distribution
	type distRow struct {
		Rating int   `json:"rating"`
		Count  int64 `json:"count"`
	}
	var distRows []distRow
	database.DB.Model(&model.OrderReview{}).
		Select("rating, count(*) as count").
		Group("rating").
		Order("rating ASC").
		Scan(&distRows)

	var totalCount int64
	var totalSum float64
	dist := make(map[int]int64)
	for _, r := range distRows {
		dist[r.Rating] = r.Count
		totalCount += r.Count
		totalSum += float64(r.Rating) * float64(r.Count)
	}
	avg := 0.0
	if totalCount > 0 {
		avg = totalSum / float64(totalCount)
	}

	// Negative reviews (rating <= 2)
	minRating, _ := strconv.Atoi(c.DefaultQuery("minRating", "0"))
	maxRating, _ := strconv.Atoi(c.DefaultQuery("maxRating", "0"))

	query := database.DB.Model(&model.OrderReview{}).
		Preload("User").
		Preload("Order")
	if minRating > 0 {
		query = query.Where("rating >= ?", minRating)
	}
	if maxRating > 0 {
		query = query.Where("rating <= ?", maxRating)
	}

	var listTotal int64
	query.Count(&listTotal)

	var reviews []model.OrderReview
	query.Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&reviews)

	c.JSON(http.StatusOK, gin.H{
		"avg":          avg,
		"totalReviews": totalCount,
		"distribution": dist,
		"reviews":      reviews,
		"total":        listTotal,
		"page":         page,
		"pageSize":     pageSize,
		"totalPages":   int(math.Ceil(float64(listTotal) / float64(pageSize))),
	})
}

// POST /api/admin/reviews/:id/ticket
func (h *OrderHandler) CreateTicketFromReview(c *gin.Context) {
	reviewID := c.Param("id")
	adminID := c.GetString("userID")

	var review model.OrderReview
	if err := database.DB.Preload("User").Preload("Order").
		First(&review, "id = ?", reviewID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "评价不存在"})
		return
	}

	subject := fmt.Sprintf("[差评跟进] 订单 %s（%d 星）", review.Order.OrderNo, review.Rating)
	content := fmt.Sprintf("用户 %s 对订单 %s 评价 %d 星。\n评价内容：%s",
		review.User.Email, review.Order.OrderNo, review.Rating,
		func() string {
			if review.Content != nil {
				return *review.Content
			}
			return "（无文字评价）"
		}())

	ticketID := service.GenerateID()
	ticket := model.Ticket{
		ID:       ticketID,
		TicketNo: "TK" + strconv.FormatInt(time.Now().UnixMilli(), 10),
		UserID:   review.UserID,
		AgentID:  &adminID,
		OrderID:  &review.OrderID,
		Type:     "AFTERSALE",
		Category: "GENERAL",
		Subject:  subject,
		Status:   "OPEN",
		Priority: "HIGH",
	}

	tx := database.DB.Begin()
	if err := tx.Create(&ticket).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建工单失败"})
		return
	}
	msg := model.TicketMessage{
		ID:       service.GenerateID(),
		TicketID: ticketID,
		Sender:   adminID,
		Role:     "ADMIN",
		Content:  content,
	}
	if err := tx.Create(&msg).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建工单消息失败"})
		return
	}
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建工单失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ticketId": ticketID})
}
