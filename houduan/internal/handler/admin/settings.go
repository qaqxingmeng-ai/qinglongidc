package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/smtp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	openai "github.com/sashabaranov/go-openai"

	"serverai-backend/config"
	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

type SettingsHandler struct {
	cfg *config.Config
}

func NewSettingsHandler(cfg *config.Config) *SettingsHandler {
	return &SettingsHandler{cfg: cfg}
}

// settingKeys lists all supported setting keys.
var settingKeys = []string{
	"site_name",
	"site_subtitle",
	"ai_model",
	"ai_fallback_model",
	"ai_base_url",
	"ai_api_key",
	"smtp_host",
	"smtp_port",
	"smtp_user",
	"smtp_password",
	"smtp_from",
	"waf_enabled",
	"waf_rate_limit",
	"invite_bonus_invitee_yuan",
	"invite_bonus_inviter_yuan",
	"invite_bonus_inviter_monthly_cap_yuan",
	"ai_provider",
	"ai_wizard_prompt",
	"ai_scoring_prompt",
	"product_tag_library",
	"product_score_weights",
	"sms_appid",
	"sms_appkey",
	"sms_signature",
}

var settingAliases = map[string]string{
	"siteName":          "site_name",
	"siteSubtitle":      "site_subtitle",
	"aiModel":           "ai_model",
	"aiFallback":        "ai_fallback_model",
	"aiBaseURL":         "ai_base_url",
	"aiApiKey":          "ai_api_key",
	"smtpHost":          "smtp_host",
	"smtpPort":          "smtp_port",
	"smtpUser":          "smtp_user",
	"smtpPassword":      "smtp_password",
	"smtpFrom":          "smtp_from",
	"wafEnabled":        "waf_enabled",
	"wafRateLimit":      "waf_rate_limit",
	"inviteeBonus":      "invite_bonus_invitee_yuan",
	"inviterBonus":      "invite_bonus_inviter_yuan",
	"inviterMonthlyCap": "invite_bonus_inviter_monthly_cap_yuan",
	"aiProvider":        "ai_provider",
	"aiWizardPrompt":    "ai_wizard_prompt",
	"aiScoringPrompt":   "ai_scoring_prompt",
	"productTagLibrary": "product_tag_library",
	"productScoreWeights": "product_score_weights",
	"smsAppID":            "sms_appid",
	"smsAppKey":           "sms_appkey",
	"smsSignature":        "sms_signature",
}

// loadDBSettings returns a map of key->value from the DB.
func loadDBSettings() map[string]string {
	var rows []model.SystemSetting
	database.DB.Find(&rows)
	m := make(map[string]string, len(rows))
	for _, r := range rows {
		m[r.Key] = r.Value
	}
	return m
}

func settingOr(db map[string]string, key, fallback string) string {
	if v, ok := db[key]; ok && v != "" {
		return v
	}
	return fallback
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

func fallbackStr(primary, fallback string) string {
	if strings.TrimSpace(primary) != "" {
		return strings.TrimSpace(primary)
	}
	return fallback
}

func normalizeSettingKey(key string) string {
	if canonical, ok := settingAliases[key]; ok {
		return canonical
	}
	return key
}

func stringifySettingValue(value interface{}) (string, bool) {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed), true
	case float64:
		return strings.TrimSpace(fmt.Sprintf("%v", typed)), true
	case float32:
		return strings.TrimSpace(fmt.Sprintf("%v", typed)), true
	case int:
		return strings.TrimSpace(fmt.Sprintf("%d", typed)), true
	case int64:
		return strings.TrimSpace(fmt.Sprintf("%d", typed)), true
	case bool:
		return boolStr(typed), true
	case map[string]interface{}, []interface{}:
		buf, err := json.Marshal(typed)
		if err != nil {
			return "", false
		}
		return string(buf), true
	default:
		if typed == nil {
			return "", true
		}
		buf, err := json.Marshal(typed)
		if err != nil {
			return "", false
		}
		return string(buf), true
	}
}

// GET /api/admin/settings
func (h *SettingsHandler) Get(c *gin.Context) {
	db := loadDBSettings()
	var productScoreWeights interface{}
	if raw := settingOr(db, "product_score_weights", ""); raw != "" {
		var decoded interface{}
		if err := json.Unmarshal([]byte(raw), &decoded); err == nil {
			productScoreWeights = decoded
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"siteName":          settingOr(db, "site_name", "ServerAI"),
		"siteSubtitle":      settingOr(db, "site_subtitle", "智能服务器平台"),
		"aiModel":           settingOr(db, "ai_model", h.cfg.OpenAIModel),
		"aiFallback":        settingOr(db, "ai_fallback_model", h.cfg.OpenAIFallbackModel),
		"aiBaseURL":         settingOr(db, "ai_base_url", h.cfg.OpenAIBaseURL),
		"hasAIKey":          settingOr(db, "ai_api_key", h.cfg.OpenAIKey) != "",
		"aiProvider":        settingOr(db, "ai_provider", "custom"),
		"aiWizardPrompt":    settingOr(db, "ai_wizard_prompt", ""),
		"aiScoringPrompt":   settingOr(db, "ai_scoring_prompt", ""),
		"productTagLibrary": settingOr(db, "product_tag_library", ""),
		"productScoreWeights": productScoreWeights,
		"smtpHost":          settingOr(db, "smtp_host", h.cfg.SMTPHost),
		"smtpPort":          settingOr(db, "smtp_port", h.cfg.SMTPPort),
		"smtpUser":          settingOr(db, "smtp_user", h.cfg.SMTPUser),
		"smtpFrom":          settingOr(db, "smtp_from", h.cfg.SMTPFrom),
		"hasSMTPPass":       settingOr(db, "smtp_password", h.cfg.SMTPPassword) != "",
		"wafEnabled":        settingOr(db, "waf_enabled", boolStr(h.cfg.WAFEnabled)),
		"wafRateLimit":      settingOr(db, "waf_rate_limit", fmt.Sprintf("%d", h.cfg.RateLimitPerSec)),
		"inviteeBonus":      settingOr(db, "invite_bonus_invitee_yuan", "20"),
		"inviterBonus":      settingOr(db, "invite_bonus_inviter_yuan", "50"),
		"inviterMonthlyCap": settingOr(db, "invite_bonus_inviter_monthly_cap_yuan", "500"),
		"smsAppID":          settingOr(db, "sms_appid", ""),
		"hasSMSKey":         settingOr(db, "sms_appkey", "") != "",
		"smsSignature":      settingOr(db, "sms_signature", ""),
	})
}

// PUT /api/admin/settings
func (h *SettingsHandler) Update(c *gin.Context) {
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式错误"})
		return
	}

	allowed := map[string]bool{}
	for _, k := range settingKeys {
		allowed[k] = true
	}

	now := time.Now()
	for k, v := range body {
		canonicalKey := normalizeSettingKey(k)
		if !allowed[canonicalKey] {
			continue
		}
		serialized, ok := stringifySettingValue(v)
		if !ok {
			continue
		}
		database.DB.Save(&model.SystemSetting{Key: canonicalKey, Value: serialized, UpdatedAt: now})
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /api/admin/settings/test-smtp
func (h *SettingsHandler) TestSMTP(c *gin.Context) {
	var req struct {
		Host     string `json:"host"`
		Port     string `json:"port"`
		User     string `json:"user"`
		Password string `json:"password"`
		From     string `json:"from"`
		To       string `json:"to" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供收件人邮箱"})
		return
	}

	db := loadDBSettings()
	host := fallbackStr(req.Host, settingOr(db, "smtp_host", h.cfg.SMTPHost))
	port := fallbackStr(req.Port, settingOr(db, "smtp_port", h.cfg.SMTPPort))
	user := fallbackStr(req.User, settingOr(db, "smtp_user", h.cfg.SMTPUser))
	pass := fallbackStr(req.Password, settingOr(db, "smtp_password", h.cfg.SMTPPassword))
	from := fallbackStr(req.From, settingOr(db, "smtp_from", h.cfg.SMTPFrom))

	if host == "" || user == "" || pass == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "SMTP 配置不完整"})
		return
	}
	if port == "" {
		port = "587"
	}

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: ServerAI SMTP 测试\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n这是一封测试邮件，说明您的 SMTP 配置正确。",
		from, req.To)

	auth := smtp.PlainAuth("", user, pass, host)
	addr := fmt.Sprintf("%s:%s", host, port)
	if err := smtp.SendMail(addr, auth, from, []string{req.To}, []byte(msg)); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("发送失败: %s", err.Error())})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "测试邮件已发送"})
}

// POST /api/admin/settings/test-ai
func (h *SettingsHandler) TestAI(c *gin.Context) {
	var req struct {
		APIKey  string `json:"apiKey"`
		BaseURL string `json:"baseUrl"`
		Model   string `json:"model"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式错误"})
		return
	}

	db := loadDBSettings()
	apiKey := fallbackStr(req.APIKey, settingOr(db, "ai_api_key", h.cfg.OpenAIKey))
	baseURL := fallbackStr(req.BaseURL, settingOr(db, "ai_base_url", h.cfg.OpenAIBaseURL))
	model := fallbackStr(req.Model, settingOr(db, "ai_model", h.cfg.OpenAIModel))

	if apiKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "API Key 未配置"})
		return
	}

	clientCfg := openai.DefaultConfig(apiKey)
	if baseURL != "" {
		clientCfg.BaseURL = baseURL
	}
	client := openai.NewClientWithConfig(clientCfg)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	resp, err := client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model:     model,
		MaxTokens: 10,
		Messages: []openai.ChatCompletionMessage{
			{Role: "user", Content: "Hi"},
		},
	})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("AI 连接失败: %s", err.Error())})
		return
	}

	reply := ""
	if len(resp.Choices) > 0 {
		reply = resp.Choices[0].Message.Content
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "reply": reply, "model": resp.Model})
}
