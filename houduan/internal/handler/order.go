package handler

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/phpdave11/gofpdf"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type OrderHandler struct{}

func NewOrderHandler() *OrderHandler {
	return &OrderHandler{}
}

func sanitizeOrderIdempotencyKey(raw string) (string, bool) {
	key := strings.TrimSpace(raw)
	if key == "" {
		return "", true
	}
	if len(key) < 8 || len(key) > 80 {
		return "", false
	}
	for _, ch := range key {
		isDigit := ch >= '0' && ch <= '9'
		isLower := ch >= 'a' && ch <= 'z'
		isUpper := ch >= 'A' && ch <= 'Z'
		if !(isDigit || isLower || isUpper || ch == '-' || ch == '_' || ch == ':' || ch == '.') {
			return "", false
		}
	}
	return key, true
}

func classifyCreateOrderError(err error) (int, string, string) {
	if err == nil {
		return http.StatusInternalServerError, "创建订单失败，请稍后重试", "ORDER_CREATE_FAILED"
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return http.StatusConflict, "请求重复，请勿重复提交", "ORDER_DUPLICATE"
	}

	msg := strings.TrimSpace(err.Error())
	if msg == "" {
		return http.StatusInternalServerError, "创建订单失败，请稍后重试", "ORDER_CREATE_FAILED"
	}

	bizHints := []string{
		"用户不存在",
		"商品",
		"库存不足",
		"优惠券",
		"订单金额",
		"首单",
		"最多可使用",
		"积分",
		"余额不足",
	}
	for _, hint := range bizHints {
		if strings.Contains(msg, hint) {
			return http.StatusBadRequest, msg, "ORDER_CREATE_BAD_REQUEST"
		}
	}

	return http.StatusInternalServerError, "创建订单失败，请稍后重试", "ORDER_CREATE_FAILED"
}

// GET /api/dashboard/orders/:id
func (h *OrderHandler) Detail(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")

	var order model.Order
	if err := database.DB.
		Preload("Items").
		Preload("Items.Product").
		Preload("Tickets").
		Where("id = ? AND user_id = ?", id, userID).
		First(&order).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "订单不存在"})
		return
	}

	productIDSet := map[string]bool{}
	totalQty := 0
	for _, item := range order.Items {
		productIDSet[item.ProductID] = true
		totalQty += item.Quantity
	}

	// 续费订单关联在 order.RenewalServerID；新开订单在开通时通过 server_instance.order_id 回写。
	// 之前按 product_id 回退匹配会把该用户历史同品所有实例误串到当前订单，已移除。
	var relatedServers []model.ServerInstance
	serverQuery := database.DB.Preload("Product").
		Where("user_id = ? AND order_id = ?", userID, order.ID)
	if order.RenewalServerID != nil && *order.RenewalServerID != "" {
		serverQuery = database.DB.Preload("Product").
			Where("user_id = ? AND (order_id = ? OR id = ?)", userID, order.ID, *order.RenewalServerID)
	}
	if err := serverQuery.
		Order("created_at DESC").
		Limit(100).
		Find(&relatedServers).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询关联实例失败"})
		return
	}

	type detailServer struct {
		ID         string     `json:"id"`
		IP         *string    `json:"ip,omitempty"`
		Status     string     `json:"status"`
		UserNote   *string    `json:"userNote,omitempty"`
		StartDate  *time.Time `json:"startDate,omitempty"`
		ExpireDate *time.Time `json:"expireDate,omitempty"`
		CreatedAt  time.Time  `json:"createdAt"`
		Product    struct {
			Name   string `json:"name"`
			Region string `json:"region"`
		} `json:"product"`
	}

	servers := make([]detailServer, 0)
	if totalQty < 1 {
		totalQty = len(relatedServers)
	}
	for _, srv := range relatedServers {
		if len(servers) >= totalQty {
			break
		}
		item := detailServer{
			ID:         srv.ID,
			IP:         srv.IP,
			Status:     srv.Status,
			UserNote:   srv.UserNote,
			StartDate:  srv.StartDate,
			ExpireDate: srv.ExpireDate,
			CreatedAt:  srv.CreatedAt,
		}
		item.Product.Name = srv.Product.Name
		item.Product.Region = srv.Product.Region
		servers = append(servers, item)
	}

	var purchaseTx model.Transaction
	var paidAt *time.Time
	if err := database.DB.
		Where("related_order_id = ? AND type = ?", order.ID, "PURCHASE").
		Order("created_at ASC").
		First(&purchaseTx).Error; err == nil {
		t := purchaseTx.CreatedAt
		paidAt = &t
	}

	var provisionAt *time.Time
	for _, s := range servers {
		if provisionAt == nil || s.CreatedAt.Before(*provisionAt) {
			t := s.CreatedAt
			provisionAt = &t
		}
	}

	var completedAt *time.Time
	if order.Status == "COMPLETED" {
		t := order.UpdatedAt
		completedAt = &t
	}

	timeline := []gin.H{
		{"key": "CREATED", "label": "订单创建", "done": true, "time": order.CreatedAt},
		{"key": "PAID", "label": "支付完成", "done": paidAt != nil, "time": paidAt},
		{"key": "PROVISIONED", "label": "资源开通", "done": provisionAt != nil, "time": provisionAt},
		{"key": "COMPLETED", "label": "订单完成", "done": completedAt != nil, "time": completedAt},
	}

	c.JSON(http.StatusOK, gin.H{
		"order":    order,
		"timeline": timeline,
		"servers":  servers,
	})
}

// GET /api/dashboard/orders/:id/receipt
func (h *OrderHandler) ReceiptPDF(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")

	var order model.Order
	if err := database.DB.
		Preload("User").
		Preload("Items").
		Preload("Items.Product").
		Where("id = ? AND user_id = ?", id, userID).
		First(&order).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "订单不存在"})
		return
	}

	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetTitle("Order Receipt", false)
	pdf.AddPage()
	pdf.SetFont("Arial", "B", 16)
	pdf.CellFormat(190, 10, "Order Receipt", "", 1, "L", false, 0, "")

	pdf.SetFont("Arial", "", 11)
	pdf.CellFormat(190, 7, fmt.Sprintf("Order No: %s", order.OrderNo), "", 1, "L", false, 0, "")
	pdf.CellFormat(190, 7, fmt.Sprintf("Created At: %s", order.CreatedAt.Format("2006-01-02 15:04:05")), "", 1, "L", false, 0, "")
	pdf.CellFormat(190, 7, fmt.Sprintf("Status: %s", order.Status), "", 1, "L", false, 0, "")
	userLabel := order.User.Name
	if userLabel == "" {
		userLabel = order.User.Email
	}
	if userLabel == "" {
		userLabel = order.UserID
	}
	pdf.CellFormat(190, 7, fmt.Sprintf("User: %s", userLabel), "", 1, "L", false, 0, "")
	pdf.Ln(2)

	pdf.SetFont("Arial", "B", 11)
	pdf.CellFormat(80, 8, "Product", "1", 0, "L", false, 0, "")
	pdf.CellFormat(20, 8, "Qty", "1", 0, "C", false, 0, "")
	pdf.CellFormat(20, 8, "Period", "1", 0, "C", false, 0, "")
	pdf.CellFormat(35, 8, "Amount", "1", 0, "R", false, 0, "")
	pdf.CellFormat(35, 8, "Region", "1", 1, "L", false, 0, "")

	pdf.SetFont("Arial", "", 10)
	for _, item := range order.Items {
		pdf.CellFormat(80, 8, item.Product.Name, "1", 0, "L", false, 0, "")
		pdf.CellFormat(20, 8, strconv.Itoa(item.Quantity), "1", 0, "C", false, 0, "")
		pdf.CellFormat(20, 8, fmt.Sprintf("%d mo", item.Period), "1", 0, "C", false, 0, "")
		pdf.CellFormat(35, 8, fmt.Sprintf("%.2f", item.Price), "1", 0, "R", false, 0, "")
		pdf.CellFormat(35, 8, item.Product.Region, "1", 1, "L", false, 0, "")
	}

	pdf.Ln(2)
	pdf.SetFont("Arial", "B", 12)
	pdf.CellFormat(190, 8, fmt.Sprintf("Total: %.2f", order.TotalPrice), "", 1, "R", false, 0, "")

	var out bytes.Buffer
	if err := pdf.Output(&out); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "收据生成失败"})
		return
	}

	filename := fmt.Sprintf("receipt-%s.pdf", order.OrderNo)
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.Data(http.StatusOK, "application/pdf", out.Bytes())
}

// GET /api/dashboard/orders
func (h *OrderHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 10
	}

	var total int64
	database.DB.Model(&model.Order{}).Where("user_id = ?", userID).Count(&total)

	var orders []model.Order
	database.DB.Where("user_id = ?", userID).
		Preload("Items").
		Preload("Items.Product").
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

// POST /api/dashboard/orders
func (h *OrderHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	idempotencyHeader := c.GetHeader("Idempotency-Key")
	if strings.TrimSpace(idempotencyHeader) == "" {
		idempotencyHeader = c.GetHeader("X-Idempotency-Key")
	}
	idempotencyKey, idemOK := sanitizeOrderIdempotencyKey(idempotencyHeader)
	if !idemOK {
		c.JSON(http.StatusBadRequest, gin.H{"error": "幂等键格式不合法（8-80位，仅允许字母数字及 - _ : .）", "code": "INVALID_IDEMPOTENCY_KEY"})
		return
	}
	var orderIdempotencyKey *string
	if idempotencyKey != "" {
		orderIdempotencyKey = &idempotencyKey
		var existing model.Order
		if err := database.DB.Select("id", "order_no", "total_price", "discount_amount").
			Where("user_id = ? AND idempotency_key = ?", userID, idempotencyKey).
			First(&existing).Error; err == nil {
			c.JSON(http.StatusOK, gin.H{
				"orderId":          existing.ID,
				"orderNo":          existing.OrderNo,
				"total":            existing.TotalPrice,
				"discount":         existing.DiscountAmount,
				"idempotentReplay": true,
			})
			return
		}
	}

	var req struct {
		Items []struct {
			ProductID string `json:"productId" binding:"required"`
			Quantity  int    `json:"quantity"`
			Period    int    `json:"period"`
		} `json:"items" binding:"required,min=1"`
		Note        string  `json:"note"`
		CouponID    *string `json:"couponId"`
		PointsToUse int     `json:"pointsToUse"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请添加商品到订单"})
		return
	}

	// Get user
	var user model.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	if user.Phone == nil || strings.TrimSpace(*user.Phone) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "下单前请先绑定手机号", "code": "PHONE_REQUIRED"})
		return
	}

	// Get pricing config
	var pricingConfig model.PricingConfig
	if err := database.DB.First(&pricingConfig, "id = ?", "default").Error; err != nil {
		pricingConfig = service.DefaultPricingRules()
	}

	level := service.NormalizePriceLevel(user.Level)

	// Build order in a transaction with stock row-lock
	var orderID string
	var orderNo string
	var finalItems []model.OrderItem
	var finalTotal float64
	var finalDiscount float64

	txErr := database.DB.Transaction(func(tx *gorm.DB) error {
		var txUser model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&txUser, "id = ?", userID).Error; err != nil {
			return fmt.Errorf("用户不存在")
		}

		var txTotal float64
		var txItems []model.OrderItem

		for _, item := range req.Items {
			var product model.Product
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&product, "id = ? AND status = ?", item.ProductID, "ACTIVE").Error; err != nil {
				return fmt.Errorf("商品 %s 不存在或已下架", item.ProductID)
			}

			qty := item.Quantity
			if qty < 1 {
				qty = 1
			}
			period := item.Period
			if period < 1 {
				period = 1
			}

			// Stock check (stock == -1 means unlimited)
			if product.Stock != -1 {
				if product.Stock < qty {
					return fmt.Errorf("商品 %s 库存不足，当前库存：%d", product.Name, product.Stock)
				}
				if err := tx.Model(&product).Update("stock", product.Stock-qty).Error; err != nil {
					return err
				}
			}

			itemPrice := service.CalculatePrice(product.OriginalPrice, level, pricingConfig) * float64(qty) * float64(period)
			txTotal += itemPrice
			txItems = append(txItems, model.OrderItem{
				ID:        service.GenerateID(),
				ProductID: product.ID,
				Quantity:  qty,
				Period:    period,
				Price:     itemPrice,
			})
		}

		// Apply coupon discount if provided
		var discount float64
		var appliedCouponID *string
		if req.CouponID != nil && *req.CouponID != "" {
			var uc model.UserCoupon
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Preload("Coupon").
				First(&uc, "id = ? AND user_id = ? AND status = ?", *req.CouponID, userID, "UNUSED").Error; err != nil {
				return fmt.Errorf("优惠券不可用")
			}
			cp := uc.Coupon
			now := time.Now()
			if !cp.IsActive || now.Before(cp.StartAt) || now.After(cp.EndAt) {
				return fmt.Errorf("优惠券已失效")
			}
			if txTotal < cp.MinOrderAmount {
				return fmt.Errorf("订单金额未达到优惠券最低使用金额 %.2f 元", cp.MinOrderAmount)
			}
			// Scope: FIRST_ORDER check
			if cp.Scope == "FIRST_ORDER" {
				var paidOrders int64
				tx.Model(&model.Order{}).Where("user_id = ? AND status IN ?", userID, []string{"PAID", "COMPLETED"}).Count(&paidOrders)
				if paidOrders > 0 {
					return fmt.Errorf("该优惠券仅限首单使用")
				}
			}
			// Calculate discount
			switch cp.Type {
			case "PERCENTAGE":
				discount = txTotal * cp.Value
			case "FIXED", "RENEWAL":
				discount = cp.Value
			}
			if cp.MaxDiscount > 0 && discount > cp.MaxDiscount {
				discount = cp.MaxDiscount
			}
			if discount > txTotal {
				discount = txTotal
			}
			txTotal -= discount

			// Mark coupon as used（用户侧行），并在券主表做条件自增以防并发超发
			now2 := time.Now()
			if err := tx.Model(&uc).Updates(map[string]interface{}{
				"status":  "USED",
				"used_at": now2,
			}).Error; err != nil {
				return err
			}
			// 只有 total_count = -1（无限）或 used_count < total_count 时才 +1，RowsAffected=0 说明已抢光
			res := tx.Exec(
				"UPDATE coupons SET used_count = used_count + 1, updated_at = NOW() WHERE id = ? AND (total_count = -1 OR used_count < total_count)",
				cp.ID,
			)
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				return fmt.Errorf("优惠券已被领完")
			}
			appliedCouponID = req.CouponID
		}

		// Apply points discount: 100 points = 1 yuan, max 10% of order amount
		var pointsUsed int
		if req.PointsToUse > 0 {
			maxPointsAllowed := int(math.Ceil(txTotal * 0.1 * 100)) // 10% of order * 100
			if req.PointsToUse > maxPointsAllowed {
				return fmt.Errorf("最多可使用 %d 积分（订单金额 10%%）", maxPointsAllowed)
			}

			// Check user points
			var userPoints model.UserPoints
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&userPoints, "user_id = ?", userID).Error; err != nil {
				return fmt.Errorf("积分数据异常")
			}
			if userPoints.Points < req.PointsToUse {
				return fmt.Errorf("积分不足，可用 %d 积分，需要 %d 积分", userPoints.Points, req.PointsToUse)
			}

			// Deduct points and calculate discount
			pointsDeduct := float64(req.PointsToUse) / 100.0
			if err := tx.Model(&userPoints).Update("points", userPoints.Points-req.PointsToUse).Error; err != nil {
				return err
			}

			// Record points transaction
			txPtRec := model.PointsTransaction{
				ID:        service.GenerateID(),
				UserID:    userID,
				Type:      "REDEEM",
				Points:    -req.PointsToUse,
				Note:      "订单支付抵扣",
				RelatedID: nil,
			}
			if err := tx.Create(&txPtRec).Error; err != nil {
				return err
			}

			txTotal -= pointsDeduct
			pointsUsed = req.PointsToUse
		}

		if txUser.Balance < txTotal {
			return fmt.Errorf("余额不足，需要 %.2f 元，当前余额 %.2f 元", txTotal, txUser.Balance)
		}

		// Deduct balance
		newBalance := service.RoundMoney(txUser.Balance - txTotal)
		if err := tx.Model(&txUser).Update("balance", newBalance).Error; err != nil {
			return err
		}

		// Create order
		oid := service.GenerateID()
		randBytes := make([]byte, 4)
		rand.Read(randBytes)
		orderNo = fmt.Sprintf("ORD%s%s", time.Now().Format("20060102150405"), strings.ToUpper(hex.EncodeToString(randBytes)))
		note := req.Note
		order := model.Order{
			ID:             oid,
			OrderNo:        orderNo,
			UserID:         userID,
			IdempotencyKey: orderIdempotencyKey,
			TotalPrice:     txTotal,
			DiscountAmount: discount,
			PointsUsed:     pointsUsed,
			CouponID:       appliedCouponID,
			Status:         "PAID",
		}
		if note != "" {
			order.Note = &note
		}
		if err := tx.Create(&order).Error; err != nil {
			return err
		}
		for i := range txItems {
			txItems[i].OrderID = oid
		}
		if err := tx.Create(&txItems).Error; err != nil {
			return err
		}

		// Update UserCoupon.OrderID
		if appliedCouponID != nil {
			tx.Model(&model.UserCoupon{}).Where("id = ?", *appliedCouponID).Update("order_id", oid)
		}

		// Transaction record
		txNote := fmt.Sprintf("订单 %s", orderNo)
		txRecord := model.Transaction{
			ID:             service.GenerateID(),
			UserID:         userID,
			Type:           "PURCHASE",
			Amount:         -txTotal,
			BalanceBefore:  service.RoundMoney(txUser.Balance),
			BalanceAfter:   newBalance,
			Note:           &txNote,
			RelatedOrderID: &oid,
		}
		if err := tx.Create(&txRecord).Error; err != nil {
			return err
		}

		orderID = oid
		finalItems = txItems
		finalTotal = txTotal
		finalDiscount = discount
		return nil
	})

	if txErr != nil {
		if idempotencyKey != "" && errors.Is(txErr, gorm.ErrDuplicatedKey) {
			var existing model.Order
			if err := database.DB.Select("id", "order_no", "total_price", "discount_amount").
				Where("user_id = ? AND idempotency_key = ?", userID, idempotencyKey).
				First(&existing).Error; err == nil {
				c.JSON(http.StatusOK, gin.H{
					"orderId":          existing.ID,
					"orderNo":          existing.OrderNo,
					"total":            existing.TotalPrice,
					"discount":         existing.DiscountAmount,
					"idempotentReplay": true,
				})
				return
			}
		}
		status, msg, code := classifyCreateOrderError(txErr)
		c.JSON(status, gin.H{"error": msg, "code": code})
		return
	}

	// Earn points: 1 yuan = 1 point
	pointsEarned := int(math.Round(finalTotal))
	if pointsEarned > 0 {
		_ = service.EarnPoints(database.DB, userID, pointsEarned, "PURCHASE_EARN", "订单消费获得", &orderID, nil)
	}

	applyInviterFirstPaidReward(orderID, userID)

	// Create agent commission if applicable
	go service.CreateCommissionForOrder(orderID)

	_ = finalItems
	c.JSON(http.StatusOK, gin.H{
		"orderId":          orderID,
		"orderNo":          orderNo,
		"total":            finalTotal,
		"discount":         finalDiscount,
		"idempotentReplay": false,
	})
}

// POST /api/dashboard/orders/:id/review
func (h *OrderHandler) CreateReview(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")

	var req struct {
		Rating  int    `json:"rating" binding:"required,min=1,max=5"`
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "评分必须在 1-5 之间"})
		return
	}
	if len([]rune(req.Content)) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "评价内容不超过 200 字"})
		return
	}

	var order model.Order
	if err := database.DB.Where("id = ? AND user_id = ?", id, userID).First(&order).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "订单不存在"})
		return
	}
	if order.Status != "COMPLETED" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "只有已完成的订单可以评价"})
		return
	}
	if time.Since(order.UpdatedAt) > 30*24*time.Hour {
		c.JSON(http.StatusBadRequest, gin.H{"error": "订单完成超过 30 天，无法评价"})
		return
	}

	// Check if already reviewed
	var existing model.OrderReview
	if err := database.DB.Where("order_id = ?", id).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "您已对该订单评价过"})
		return
	}

	review := model.OrderReview{
		ID:      service.GenerateID(),
		OrderID: id,
		UserID:  userID,
		Rating:  req.Rating,
	}
	if req.Content != "" {
		review.Content = &req.Content
	}
	if err := database.DB.Create(&review).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "评价提交失败"})
		return
	}

	// Award 10 points for review
	_ = service.EarnPoints(database.DB, userID, 10, "REVIEW", "订单评价获得", &id, nil)

	c.JSON(http.StatusOK, gin.H{"review": review})
}

// GET /api/dashboard/orders/:id/review
func (h *OrderHandler) GetReview(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")

	// Ensure order belongs to user
	var order model.Order
	if err := database.DB.Where("id = ? AND user_id = ?", id, userID).First(&order).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "订单不存在"})
		return
	}

	var review model.OrderReview
	if err := database.DB.Where("order_id = ?", id).First(&review).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"review": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"review": review})
}
