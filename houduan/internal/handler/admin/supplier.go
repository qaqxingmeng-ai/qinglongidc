package admin

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type SupplierHandler struct{}

func NewSupplierHandler() *SupplierHandler { return &SupplierHandler{} }

// GET /api/admin/suppliers
func (h *SupplierHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	search := c.Query("search")

	q := database.DB.Model(&model.Supplier{})
	if search != "" {
		q = q.Where("name ILIKE ? OR contact_name ILIKE ? OR contact_email ILIKE ?",
			"%"+search+"%", "%"+search+"%", "%"+search+"%")
	}

	var total int64
	q.Count(&total)

	var suppliers []model.Supplier
	q.Order("is_active DESC, name ASC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&suppliers)

	// Attach product stats for each supplier via batch queries
	type SupplierStats struct {
		model.Supplier
		ProductCount int     `json:"productCount"`
		TotalRevenue float64 `json:"totalRevenue"`
	}

	supplierNames := make([]string, len(suppliers))
	for i, s := range suppliers {
		supplierNames[i] = s.Name
	}

	// Batch product counts
	type pcRow struct {
		Supplier string `gorm:"column:supplier"`
		Count    int64  `gorm:"column:cnt"`
	}
	var pcRows []pcRow
	if len(supplierNames) > 0 {
		database.DB.Raw(`
			SELECT supplier, COUNT(*) AS cnt
			FROM products
			WHERE supplier IN ?
			GROUP BY supplier`, supplierNames).Scan(&pcRows)
	}
	pcMap := make(map[string]int64)
	for _, r := range pcRows {
		pcMap[r.Supplier] = r.Count
	}

	// Batch revenue
	type revRow struct {
		Supplier string  `gorm:"column:supplier"`
		Revenue  float64 `gorm:"column:revenue"`
	}
	var revRows []revRow
	if len(supplierNames) > 0 {
		database.DB.Raw(`
			SELECT p.supplier, COALESCE(SUM(ABS(t.amount)), 0) AS revenue
			FROM transactions t
			JOIN orders ON orders.id = t.related_order_id
			JOIN order_items ON order_items.order_id = orders.id
			JOIN products p ON p.id = order_items.product_id
			WHERE p.supplier IN ? AND t.type IN ('PURCHASE','RENEW','RENEWAL')
			GROUP BY p.supplier`, supplierNames).Scan(&revRows)
	}
	revMap := make(map[string]float64)
	for _, r := range revRows {
		revMap[r.Supplier] = r.Revenue
	}

	result := make([]SupplierStats, len(suppliers))
	for i, s := range suppliers {
		result[i] = SupplierStats{
			Supplier:     s,
			ProductCount: int(pcMap[s.Name]),
			TotalRevenue: revMap[s.Name],
		}
	}

	c.JSON(http.StatusOK, gin.H{"suppliers": result, "total": total})
}

// POST /api/admin/suppliers
func (h *SupplierHandler) Create(c *gin.Context) {
	operatorID := middleware.GetUserID(c)
	var req struct {
		Name         string  `json:"name" binding:"required,max=100"`
		ContactName  *string `json:"contactName"`
		ContactPhone *string `json:"contactPhone"`
		ContactEmail *string `json:"contactEmail"`
		Website      *string `json:"website"`
		Notes        *string `json:"notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	s := model.Supplier{
		ID:           service.GenerateID(),
		Name:         req.Name,
		ContactName:  req.ContactName,
		ContactPhone: req.ContactPhone,
		ContactEmail: req.ContactEmail,
		Website:      req.Website,
		Notes:        req.Notes,
		IsActive:     true,
	}
	if err := database.DB.Create(&s).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "供应商名称已存在"})
		return
	}

	detail := "新建供应商: " + s.Name
	database.DB.Create(&model.UserLog{
		ID:     service.GenerateID(),
		UserID: operatorID,
		Event:  "CREATE_SUPPLIER",
		Detail: &detail,
	})
	c.JSON(http.StatusOK, s)
}

// PUT /api/admin/suppliers/:id
func (h *SupplierHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var s model.Supplier
	if err := database.DB.First(&s, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "供应商不存在"})
		return
	}

	var req struct {
		Name         *string `json:"name"`
		ContactName  *string `json:"contactName"`
		ContactPhone *string `json:"contactPhone"`
		ContactEmail *string `json:"contactEmail"`
		Website      *string `json:"website"`
		Notes        *string `json:"notes"`
		IsActive     *bool   `json:"isActive"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.ContactName != nil {
		updates["contact_name"] = req.ContactName
	}
	if req.ContactPhone != nil {
		updates["contact_phone"] = req.ContactPhone
	}
	if req.ContactEmail != nil {
		updates["contact_email"] = req.ContactEmail
	}
	if req.Website != nil {
		updates["website"] = req.Website
	}
	if req.Notes != nil {
		updates["notes"] = req.Notes
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}

	database.DB.Model(&s).Updates(updates)
	c.JSON(http.StatusOK, s)
}

// DELETE /api/admin/suppliers/:id
func (h *SupplierHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	var s model.Supplier
	if err := database.DB.First(&s, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "供应商不存在"})
		return
	}

	var pc int64
	database.DB.Model(&model.Product{}).Where("supplier = ? AND status = 'ACTIVE'", s.Name).Count(&pc)
	if pc > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该供应商下还有在售产品，无法删除"})
		return
	}

	database.DB.Delete(&s)
	c.JSON(http.StatusOK, gin.H{"success": true})
}
