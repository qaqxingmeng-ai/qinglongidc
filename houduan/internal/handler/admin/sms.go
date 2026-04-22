package admin

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/service"
)

type SMSHandler struct{}

func NewSMSHandler() *SMSHandler { return &SMSHandler{} }

// GET /api/admin/sms/status
// Returns whether SMS is configured and current balance.
func (h *SMSHandler) Status(c *gin.Context) {
	configured := service.IsSMSConfigured()
	result := gin.H{
		"configured": configured,
	}

	if configured {
		balance, err := service.GetSMSBalance()
		if err != nil {
			result["balanceError"] = err.Error()
		} else {
			result["balance"] = balance.Balance
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}

// GET /api/admin/sms/templates
// Lists all SMS templates from Submail.
func (h *SMSHandler) Templates(c *gin.Context) {
	templates, err := service.ListSMSTemplates()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"templates": templates}})
}

// POST /api/admin/sms/test
// Send a test SMS to a specified phone number.
func (h *SMSHandler) TestSend(c *gin.Context) {
	var req struct {
		Phone   string `json:"phone" binding:"required"`
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "请提供手机号和内容"})
		return
	}

	cfg := service.LoadSMSConfig()
	if cfg.AppID == "" || cfg.AppKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "短信服务未配置"})
		return
	}

	// Prepend signature if not already present
	content := req.Content
	if cfg.Signature != "" && !strings.HasPrefix(content, cfg.Signature) {
		content = cfg.Signature + content
	}

	result, err := service.SendSMSDirect(req.Phone, content)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
		"sendId": result.SendID,
		"fee":    result.Fee,
	}})
}
