package admin

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type EmailTemplateHandler struct{}

func NewEmailTemplateHandler() *EmailTemplateHandler { return &EmailTemplateHandler{} }

// defaultTemplates provides seed data for email templates
var defaultTemplates = []model.EmailTemplate{
	{
		Type:         "REGISTER_VERIFY",
		Name:         "注册验证码",
		Subject:      "【ServerAI】您的注册验证码",
		BodyMarkdown: "您好，\n\n感谢注册 ServerAI！\n\n您的验证码为：**{{code}}**\n\n验证码 10 分钟内有效，请勿泄露给他人。\n\n如非本人操作，请忽略此邮件。",
		Variables:    `["code","username"]`,
	},
	{
		Type:         "PASSWORD_RESET",
		Name:         "密码重置",
		Subject:      "【ServerAI】密码重置验证码",
		BodyMarkdown: "您好 {{username}}，\n\n您申请了密码重置。\n\n验证码为：**{{code}}**\n\n验证码 5 分钟内有效。如非本人操作，请立即联系客服。",
		Variables:    `["code","username"]`,
	},
	{
		Type:         "TICKET_NOTIFY",
		Name:         "工单通知",
		Subject:      "【ServerAI】工单 #{{ticket_no}} 有新消息",
		BodyMarkdown: "您好 {{username}}，\n\n您的工单 **#{{ticket_no}}**（{{subject}}）有新回复。\n\n请登录平台查看详情。",
		Variables:    `["username","ticket_no","subject","reply_content"]`,
	},
	{
		Type:         "SERVER_EXPIRY",
		Name:         "服务器到期提醒",
		Subject:      "【ServerAI】您的服务器即将到期",
		BodyMarkdown: "您好 {{username}}，\n\n您的服务器 **{{server_ip}}**（{{product_name}}）将于 **{{expire_date}}** 到期，还有 **{{days_left}}** 天。\n\n请及时续费以避免服务中断。",
		Variables:    `["username","server_ip","product_name","expire_date","days_left"]`,
	},
	{
		Type:         "BALANCE_CHANGE",
		Name:         "余额变动通知",
		Subject:      "【ServerAI】账户余额变动",
		BodyMarkdown: "您好 {{username}}，\n\n您的账户余额发生变动：\n\n- 变动金额：{{amount}} 元\n- 操作类型：{{type}}\n- 变动后余额：{{balance_after}} 元\n\n如有疑问，请联系客服。",
		Variables:    `["username","amount","type","balance_after","note"]`,
	},
	{
		Type:         "ORDER_CONFIRM",
		Name:         "订单确认",
		Subject:      "【ServerAI】订单 {{order_no}} 确认",
		BodyMarkdown: "您好 {{username}}，\n\n您的订单 **{{order_no}}** 已确认。\n\n订单金额：{{total_price}} 元\n产品：{{product_name}}\n\n我们将尽快为您开通服务。",
		Variables:    `["username","order_no","total_price","product_name"]`,
	},
	{
		Type:         "SECURITY_ALERT",
		Name:         "安全告警",
		Subject:      "【ServerAI】账号安全提醒",
		BodyMarkdown: "您好 {{username}}，\n\n我们检测到您的账号于 **{{time}}** 从 IP **{{ip}}** 登录。\n\n如非本人操作，请立即修改密码并联系客服。",
		Variables:    `["username","time","ip","location"]`,
	},
}

// GET /api/admin/email-templates
func (h *EmailTemplateHandler) List(c *gin.Context) {
	var templates []model.EmailTemplate
	database.DB.Order("type ASC").Find(&templates)

	// Seed missing defaults
	if len(templates) < len(defaultTemplates) {
		existing := map[string]bool{}
		for _, t := range templates {
			existing[t.Type] = true
		}
		for _, dt := range defaultTemplates {
			if !existing[dt.Type] {
				dt.ID = service.GenerateID()
				dt.CreatedAt = time.Now()
				dt.UpdatedAt = time.Now()
				database.DB.Create(&dt)
				templates = append(templates, dt)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"templates": templates})
}

// PUT /api/admin/email-templates/:id
func (h *EmailTemplateHandler) Update(c *gin.Context) {
	operatorID := middleware.GetUserID(c)
	id := c.Param("id")

	var tmpl model.EmailTemplate
	if err := database.DB.First(&tmpl, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "模板不存在"})
		return
	}

	var req struct {
		Subject      string `json:"subject" binding:"required,max=200"`
		BodyMarkdown string `json:"bodyMarkdown" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	database.DB.Model(&tmpl).Updates(map[string]interface{}{
		"subject":       req.Subject,
		"body_markdown": req.BodyMarkdown,
		"updated_by":    operatorID,
		"updated_at":    time.Now(),
	})
	c.JSON(http.StatusOK, tmpl)
}

// POST /api/admin/email-templates/:id/preview
// Renders template with example variables, returns HTML
func (h *EmailTemplateHandler) Preview(c *gin.Context) {
	id := c.Param("id")
	var tmpl model.EmailTemplate
	if err := database.DB.First(&tmpl, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "模板不存在"})
		return
	}

	var req struct {
		Variables map[string]string `json:"variables"`
	}
	c.ShouldBindJSON(&req)

	body := tmpl.BodyMarkdown
	subject := tmpl.Subject
	for k, v := range req.Variables {
		body = strings.ReplaceAll(body, "{{"+k+"}}", v)
		subject = strings.ReplaceAll(subject, "{{"+k+"}}", v)
	}

	c.JSON(http.StatusOK, gin.H{"subject": subject, "body": body})
}

// POST /api/admin/email-templates/:id/reset
// Reset to default template
func (h *EmailTemplateHandler) Reset(c *gin.Context) {
	id := c.Param("id")
	var tmpl model.EmailTemplate
	if err := database.DB.First(&tmpl, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "模板不存在"})
		return
	}

	for _, dt := range defaultTemplates {
		if dt.Type == tmpl.Type {
			database.DB.Model(&tmpl).Updates(map[string]interface{}{
				"subject":       dt.Subject,
				"body_markdown": dt.BodyMarkdown,
				"updated_at":    time.Now(),
			})
			break
		}
	}
	c.JSON(http.StatusOK, tmpl)
}
