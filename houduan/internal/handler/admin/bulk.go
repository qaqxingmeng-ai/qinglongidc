package admin

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/xuri/excelize/v2"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type BulkHandler struct{}

func NewBulkHandler() *BulkHandler { return &BulkHandler{} }

// POST /api/admin/bulk/users/level
// Body: { userIds: string[], level: string }
func (h *BulkHandler) BatchUserLevel(c *gin.Context) {
	var req struct {
		UserIDs []string `json:"userIds" binding:"required,min=1,max=500"`
		Level   string   `json:"level" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	validLevels := map[string]bool{"GUEST": true, "USER": true, "VIP": true, "VIP_TOP": true, "PARTNER": true}
	if !validLevels[req.Level] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的用户等级"})
		return
	}

	result := database.DB.Model(&model.User{}).
		Where("id IN ?", req.UserIDs).
		Update("level", req.Level)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败"})
		return
	}

	operatorID := middleware.GetUserID(c)
	detail := fmt.Sprintf("批量调整 %d 个用户等级为 %s", result.RowsAffected, req.Level)
	database.DB.Create(&model.UserLog{
		ID:     service.GenerateID(),
		UserID: operatorID,
		Event:  "ADMIN_BATCH_LEVEL",
		Detail: &detail,
	})

	c.JSON(http.StatusOK, gin.H{"updated": result.RowsAffected})
}

// POST /api/admin/bulk/users/balance
// Body: { userIds: string[], amount: float64, note: string }
func (h *BulkHandler) BatchUserBalance(c *gin.Context) {
	var req struct {
		UserIDs []string `json:"userIds" binding:"required,min=1,max=200"`
		Amount  float64  `json:"amount" binding:"required"`
		Note    string   `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Amount == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "金额不能为 0"})
		return
	}
	if req.Amount < -100000 || req.Amount > 100000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "金额超出范围"})
		return
	}

	operatorID := middleware.GetUserID(c)
	var successCount int64

	for _, uid := range req.UserIDs {
		changed := false
		err := database.DB.Transaction(func(tx *gorm.DB) error {
			var user model.User
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, "id = ?", uid).Error; err != nil {
				return err
			}

			balanceBefore := service.RoundMoney(user.Balance)
			newBalance := service.RoundMoney(user.Balance + req.Amount)
			if newBalance < 0 {
				newBalance = 0
			}
			actualDelta := service.RoundMoney(newBalance - balanceBefore)
			if actualDelta == 0 {
				return nil
			}

			if err := tx.Model(&model.User{}).Where("id = ?", uid).Updates(map[string]interface{}{
				"balance":    newBalance,
				"updated_at": time.Now(),
			}).Error; err != nil {
				return err
			}

			txType := "ADMIN_RECHARGE"
			if actualDelta < 0 {
				txType = "ADMIN_DEDUCT"
			}
			note := req.Note
			if err := tx.Create(&model.Transaction{
				ID:            service.GenerateID(),
				UserID:        uid,
				Type:          txType,
				Amount:        actualDelta,
				BalanceBefore: balanceBefore,
				BalanceAfter:  newBalance,
				Note:          &note,
				OperatorID:    &operatorID,
			}).Error; err != nil {
				return err
			}

			changed = true
			return nil
		})
		if err == nil && changed {
			successCount++
		}
	}

	detail := fmt.Sprintf("批量调整 %d 个用户余额 %+.2f", successCount, req.Amount)
	database.DB.Create(&model.UserLog{
		ID:     service.GenerateID(),
		UserID: operatorID,
		Event:  "ADMIN_BATCH_BALANCE",
		Detail: &detail,
	})

	c.JSON(http.StatusOK, gin.H{"success": successCount, "total": len(req.UserIDs)})
}

// POST /api/admin/bulk/users/notify
// Body: { userIds: string[], title: string, content: string, notifType: string }
func (h *BulkHandler) BatchUserNotify(c *gin.Context) {
	var req struct {
		UserIDs   []string `json:"userIds" binding:"required,min=1,max=500"`
		Title     string   `json:"title" binding:"required,max=200"`
		Content   string   `json:"content" binding:"required,max=2000"`
		NotifType string   `json:"notifType"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.NotifType == "" {
		req.NotifType = "SYSTEM"
	}

	sent, err := service.CreateNotificationForUsers(req.UserIDs, req.NotifType, req.Title, req.Content, nil, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "发送失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"sent": sent})
}

// POST /api/admin/bulk/servers/status
// Body: { serverIds: string[], status: string, reason: string }
func (h *BulkHandler) BatchServerStatus(c *gin.Context) {
	var req struct {
		ServerIDs []string `json:"serverIds" binding:"required,min=1,max=200"`
		Status    string   `json:"status" binding:"required"`
		Reason    string   `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	validStatuses := map[string]bool{"ACTIVE": true, "ABNORMAL": true, "SUSPENDED": true, "EXPIRED": true}
	if !validStatuses[req.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的状态值"})
		return
	}

	var servers []model.ServerInstance
	database.DB.Where("id IN ?", req.ServerIDs).Find(&servers)

	result := database.DB.Model(&model.ServerInstance{}).
		Where("id IN ?", req.ServerIDs).
		Updates(map[string]interface{}{
			"status":     req.Status,
			"updated_at": time.Now(),
		})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败"})
		return
	}

	operatorID := middleware.GetUserID(c)
	detail := fmt.Sprintf("批量将 %d 台服务器状态改为 %s：%s", result.RowsAffected, req.Status, req.Reason)
	database.DB.Create(&model.UserLog{
		ID:     service.GenerateID(),
		UserID: operatorID,
		Event:  "ADMIN_BATCH_SERVER_STATUS",
		Detail: &detail,
	})

	for _, server := range servers {
		content := fmt.Sprintf("您的服务器状态已更新为 %s。%s", req.Status, strings.TrimSpace(req.Reason))
		if strings.TrimSpace(req.Reason) == "" {
			content = fmt.Sprintf("您的服务器状态已更新为 %s。", req.Status)
		}
		sid := server.ID
		stype := "server"
		_, _ = service.CreateNotification(server.UserID, "SERVER_STATUS", "服务器状态更新", content, &sid, &stype)
	}

	c.JSON(http.StatusOK, gin.H{"updated": result.RowsAffected})
}

// POST /api/admin/bulk/servers/assign
// Body: { serverIds: string[], targetUserId: string }
func (h *BulkHandler) BatchServerAssign(c *gin.Context) {
	var req struct {
		ServerIDs    []string `json:"serverIds" binding:"required,min=1,max=100"`
		TargetUserID string   `json:"targetUserId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate target user
	var targetUser model.User
	if err := database.DB.First(&targetUser, "id = ?", req.TargetUserID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "目标用户不存在"})
		return
	}

	result := database.DB.Model(&model.ServerInstance{}).
		Where("id IN ?", req.ServerIDs).
		Update("user_id", req.TargetUserID)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "分配失败"})
		return
	}

	operatorID := middleware.GetUserID(c)
	detail := fmt.Sprintf("批量分配 %d 台服务器给用户 %s(%s)", result.RowsAffected, targetUser.Name, targetUser.Email)
	database.DB.Create(&model.UserLog{
		ID:     service.GenerateID(),
		UserID: operatorID,
		Event:  "ADMIN_BATCH_SERVER_ASSIGN",
		Detail: &detail,
	})

	c.JSON(http.StatusOK, gin.H{"updated": result.RowsAffected})
}

// ==================== Export Handler ====================

type ExportHandler struct{}

func NewExportHandler() *ExportHandler { return &ExportHandler{} }

func exportDirPath() (string, error) {
	return resolveProjectPath("", defaultExportDir)
}

// GET /api/admin/export/users?fields=id,name,email,...&desensitize=true
func (h *ExportHandler) Users(c *gin.Context) {
	desensitize := c.DefaultQuery("desensitize", "true") == "true"

	var users []model.User
	database.DB.Order("created_at DESC").Find(&users)

	rows := [][]string{{"ID", "数字ID", "邮箱", "姓名", "手机号", "角色", "等级", "余额", "注册时间"}}
	for _, u := range users {
		email := u.Email
		phone := ""
		if u.Phone != nil {
			phone = *u.Phone
		}
		if desensitize {
			parts := strings.SplitN(email, "@", 2)
			if len(parts) == 2 && len(parts[0]) > 2 {
				email = parts[0][:2] + strings.Repeat("*", len(parts[0])-2) + "@" + parts[1]
			}
				if len(phone) > 7 {
					phone = phone[:3] + "****" + phone[len(phone)-4:]
				}
			}
		rows = append(rows, []string{
			u.ID,
			strconv.Itoa(u.NumericID),
			email,
			u.Name,
			phone,
			u.Role,
			u.Level,
			fmt.Sprintf("%.2f", u.Balance),
			u.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
	content, err := buildCSVContent(rows)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "export failed"})
		return
	}

	filename := fmt.Sprintf("users_%s.csv", time.Now().Format("20060102150405"))
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("BOM", "\xef\xbb\xbf")
	c.String(http.StatusOK, "\xef\xbb\xbf"+content)
}

// GET /api/admin/export/orders?startDate=&endDate=&status=
func (h *ExportHandler) Orders(c *gin.Context) {
	query := database.DB.Model(&model.Order{}).Preload("User").Preload("Items.Product")
	if start := c.Query("startDate"); start != "" {
		if t, err := time.Parse("2006-01-02", start); err == nil {
			query = query.Where("orders.created_at >= ?", t)
		}
	}
	if end := c.Query("endDate"); end != "" {
		if t, err := time.Parse("2006-01-02", end); err == nil {
			query = query.Where("orders.created_at <= ?", t.Add(24*time.Hour-1))
		}
	}
	if status := c.Query("status"); status != "" {
		query = query.Where("orders.status = ?", status)
	}

	var orders []model.Order
	query.Order("orders.created_at DESC").Find(&orders)

	rows := [][]string{{"订单号", "用户邮箱", "用户名", "总金额", "折扣", "状态", "商品名称", "创建时间"}}
	for _, o := range orders {
		productNames := make([]string, 0, len(o.Items))
		for _, item := range o.Items {
			productNames = append(productNames, item.Product.Name)
		}
		rows = append(rows, []string{
			o.OrderNo,
			o.User.Email,
			o.User.Name,
			fmt.Sprintf("%.2f", o.TotalPrice),
			fmt.Sprintf("%.2f", o.DiscountAmount),
			o.Status,
			strings.Join(productNames, ";"),
			o.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
	content, err := buildCSVContent(rows)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "export failed"})
		return
	}

	filename := fmt.Sprintf("orders_%s.csv", time.Now().Format("20060102150405"))
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.String(http.StatusOK, "\xef\xbb\xbf"+content)
}

// GET /api/admin/export/servers?status=&region=
func (h *ExportHandler) Servers(c *gin.Context) {
	query := database.DB.Model(&model.ServerInstance{}).Preload("User").Preload("Product")
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}

	var servers []model.ServerInstance
	query.Order("created_at DESC").Find(&servers)

	rows := [][]string{{"实例ID", "用户邮箱", "产品名", "IP", "状态", "到期时间", "自动续费", "创建时间"}}
	for _, s := range servers {
		ip := ""
		if s.IP != nil {
			ip = *s.IP
		}
		expireDate := ""
		if s.ExpireDate != nil {
			expireDate = s.ExpireDate.Format("2006-01-02")
		}
		autoRenew := "否"
		if s.AutoRenew {
			autoRenew = "是"
		}
		rows = append(rows, []string{
			s.ID,
			s.User.Email,
			s.Product.Name,
			ip,
			s.Status,
			expireDate,
			autoRenew,
			s.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
	content, err := buildCSVContent(rows)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "export failed"})
		return
	}

	filename := fmt.Sprintf("servers_%s.csv", time.Now().Format("20060102150405"))
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.String(http.StatusOK, "\xef\xbb\xbf"+content)
}

// GET /api/admin/export/transactions
// Query: startDate, endDate, type, userEmail, minAmount, maxAmount, format=csv|xlsx, async=true
func (h *ExportHandler) Transactions(c *gin.Context) {
	query := database.DB.Model(&model.Transaction{}).Preload("User")

	if start := c.Query("startDate"); start != "" {
		if t, err := time.Parse("2006-01-02", start); err == nil {
			query = query.Where("transactions.created_at >= ?", t)
		}
	}
	if end := c.Query("endDate"); end != "" {
		if t, err := time.Parse("2006-01-02", end); err == nil {
			query = query.Where("transactions.created_at <= ?", t.Add(24*time.Hour-1))
		}
	}
	if txType := c.Query("type"); txType != "" {
		query = query.Where("transactions.type = ?", txType)
	}
	if email := c.Query("userEmail"); email != "" {
		query = query.Joins("JOIN users ON users.id = transactions.user_id").
			Where("users.email ILIKE ?", "%"+email+"%")
	}
	if minAmt := c.Query("minAmount"); minAmt != "" {
		if v, err := strconv.ParseFloat(minAmt, 64); err == nil {
			query = query.Where("ABS(transactions.amount) >= ?", v)
		}
	}
	if maxAmt := c.Query("maxAmount"); maxAmt != "" {
		if v, err := strconv.ParseFloat(maxAmt, 64); err == nil {
			query = query.Where("ABS(transactions.amount) <= ?", v)
		}
	}

	// Count first for async threshold
	var total int64
	query.Count(&total)

	format := c.DefaultQuery("format", "csv")
	asyncMode := c.Query("async") == "true" || total > 5000

	if asyncMode {
		// Background export: generate file, return download URL
		go func() {
			var txs []model.Transaction
			database.DB.Model(&model.Transaction{}).Preload("User").
				Where(query.Statement.Clauses).
				Order("transactions.created_at DESC").Find(&txs)
			_ = txs // file written below via separate helper
		}()

		// Actually run synchronously but stream directly — large dataset warning
		var txs []model.Transaction
		query.Order("transactions.created_at DESC").Find(&txs)

		stamp := time.Now().Format("20060102150405")
		exportDir, err := exportDirPath()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "export path invalid"})
			return
		}
		_ = os.MkdirAll(exportDir, 0755)

		if format == "xlsx" {
			fp := filepath.Join(exportDir, fmt.Sprintf("transactions_%s.xlsx", stamp))
			if err := writeTransactionsXLSX(fp, txs); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "export failed"})
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"success":          true,
				"downloadUrl": "/api/admin/export/download?file=" + filepath.Base(fp),
				"filename":    filepath.Base(fp),
				"total":       total,
			})
		} else {
			fp := filepath.Join(exportDir, fmt.Sprintf("transactions_%s.csv", stamp))
			if err := writeTransactionsCSV(fp, txs); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "export failed"})
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"success":          true,
				"downloadUrl": "/api/admin/export/download?file=" + filepath.Base(fp),
				"filename":    filepath.Base(fp),
				"total":       total,
			})
		}
		return
	}

	// Sync small export — stream directly
	var txs []model.Transaction
	query.Order("transactions.created_at DESC").Find(&txs)

	stamp := time.Now().Format("20060102150405")
	if format == "xlsx" {
		exportDir, err := exportDirPath()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "export path invalid"})
			return
		}
		if err := os.MkdirAll(exportDir, 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "export path invalid"})
			return
		}
		fp := filepath.Join(exportDir, fmt.Sprintf("transactions_%s.xlsx", stamp))
		if err := writeTransactionsXLSX(fp, txs); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "export failed"})
			return
		}
		defer func() {
			_ = safeRemoveWithinDir(exportDir, fp)
		}()
		c.Header("Content-Disposition", "attachment; filename=transactions_"+stamp+".xlsx")
		c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		c.File(fp)
	} else {
		filename := fmt.Sprintf("transactions_%s.csv", stamp)
		content, err := buildTransactionsCSV(txs)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "export failed"})
			return
		}
		c.Header("Content-Disposition", "attachment; filename="+filename)
		c.Header("Content-Type", "text/csv; charset=utf-8")
		c.String(http.StatusOK, "\xef\xbb\xbf"+content)
	}
}

// GET /api/admin/export/download?file=transactions_xxx.csv
func (h *ExportHandler) Download(c *gin.Context) {
	name := filepath.Base(c.Query("file"))
	if name == "" || name == "." {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid file"})
		return
	}
	exportDir, err := exportDirPath()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "export path invalid"})
		return
	}
	fp := filepath.Join(exportDir, name)
	if _, err := os.Stat(fp); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		return
	}
	c.Header("Content-Disposition", "attachment; filename="+name)
	c.File(fp)
}

// ---- helpers ----

func buildTransactionsCSV(txs []model.Transaction) (string, error) {
	rows := [][]string{{"交易ID", "用户邮箱", "类型", "金额", "变动前余额", "变动后余额", "备注", "时间"}}
	var totalIn, totalOut float64
	for _, t := range txs {
		note := ""
		if t.Note != nil {
			note = *t.Note
		}
		rows = append(rows, []string{
			t.ID,
			t.User.Email,
			t.Type,
			fmt.Sprintf("%.2f", t.Amount),
			fmt.Sprintf("%.2f", t.BalanceBefore),
			fmt.Sprintf("%.2f", t.BalanceAfter),
			note,
			t.CreatedAt.Format("2006-01-02 15:04:05"),
		})
		if t.Amount > 0 {
			totalIn += t.Amount
		} else {
			totalOut += t.Amount
		}
	}
	rows = append(rows, []string{
		"汇总",
		fmt.Sprintf("共%d条", len(txs)),
		"",
		fmt.Sprintf("流入: %.2f", totalIn),
		fmt.Sprintf("流出: %.2f", totalOut),
		"",
		"",
		"",
	})
	return buildCSVContent(rows)
}

func writeTransactionsCSV(fp string, txs []model.Transaction) error {
	content, err := buildTransactionsCSV(txs)
	if err != nil {
		return err
	}
	f, err := os.Create(fp)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.WriteString("\xef\xbb\xbf" + content)
	return err
}

func writeTransactionsXLSX(fp string, txs []model.Transaction) error {
	xl := excelize.NewFile()
	sheet := "交易流水"
	xl.NewSheet(sheet)
	xl.DeleteSheet("Sheet1")

	headers := []string{"交易ID", "用户邮箱", "类型", "金额", "变动前余额", "变动后余额", "备注", "时间"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		xl.SetCellValue(sheet, cell, h)
	}

	var totalIn, totalOut float64
	for row, t := range txs {
		note := ""
		if t.Note != nil {
			note = *t.Note
		}
		r := row + 2
		values := []interface{}{
			t.ID, t.User.Email, t.Type,
			t.Amount, t.BalanceBefore, t.BalanceAfter,
			note, t.CreatedAt.Format("2006-01-02 15:04:05"),
		}
		for col, v := range values {
			cell, _ := excelize.CoordinatesToCellName(col+1, r)
			xl.SetCellValue(sheet, cell, v)
		}
		if t.Amount > 0 {
			totalIn += t.Amount
		} else {
			totalOut += t.Amount
		}
	}
	// Summary row
	sumRow := len(txs) + 2
	sumValues := []interface{}{
		"汇总", fmt.Sprintf("共%d条", len(txs)), "", totalIn, totalOut, "", "", "",
	}
	for col, v := range sumValues {
		cell, _ := excelize.CoordinatesToCellName(col+1, sumRow)
		xl.SetCellValue(sheet, cell, v)
	}

	return xl.SaveAs(fp)
}
