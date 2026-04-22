package admin

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type CPUHandler struct{}

func NewCPUHandler() *CPUHandler {
	return &CPUHandler{}
}

// GET /api/admin/cpus
func (h *CPUHandler) List(c *gin.Context) {
	var cpus []model.CPU
	database.DB.Order("benchmark DESC").Find(&cpus)
	c.JSON(http.StatusOK, gin.H{"cpus": cpus})
}

// POST /api/admin/cpus
func (h *CPUHandler) Create(c *gin.Context) {
	var req struct {
		Model     string `json:"model" binding:"required"`
		Cores     int    `json:"cores" binding:"required"`
		Threads   int    `json:"threads"`
		Frequency string `json:"frequency"`
		Benchmark int    `json:"benchmark"`
		Tags      string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写CPU信息"})
		return
	}

	cpu := model.CPU{
		ID:        service.GenerateID(),
		Model:     req.Model,
		Cores:     req.Cores,
		Threads:   req.Threads,
		Frequency: req.Frequency,
		Benchmark: req.Benchmark,
		Tags:      req.Tags,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	database.DB.Create(&cpu)
	c.JSON(http.StatusOK, cpu)
}

// PUT /api/admin/cpus/:id
func (h *CPUHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var cpu model.CPU
	if err := database.DB.First(&cpu, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "CPU不存在"})
		return
	}

	var req struct {
		Model     *string `json:"model"`
		Cores     *int    `json:"cores"`
		Threads   *int    `json:"threads"`
		Frequency *string `json:"frequency"`
		Benchmark *int    `json:"benchmark"`
		Tags      *string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求"})
		return
	}

	updates := map[string]interface{}{"updated_at": time.Now()}
	if req.Model != nil {
		updates["model"] = *req.Model
	}
	if req.Cores != nil {
		updates["cores"] = *req.Cores
	}
	if req.Threads != nil {
		updates["threads"] = *req.Threads
	}
	if req.Frequency != nil {
		updates["frequency"] = *req.Frequency
	}
	if req.Benchmark != nil {
		updates["benchmark"] = *req.Benchmark
	}
	if req.Tags != nil {
		updates["tags"] = *req.Tags
	}
	database.DB.Model(&cpu).Updates(updates)
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// DELETE /api/admin/cpus/:id
func (h *CPUHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	// Check if any products use this CPU
	var count int64
	database.DB.Model(&model.Product{}).Where("cpu_id = ?", id).Count(&count)
	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "该CPU型号正在被商品使用，无法删除"})
		return
	}

	database.DB.Where("id = ?", id).Delete(&model.CPU{})
	c.JSON(http.StatusOK, gin.H{"success": true})
}
