package admin

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type NotificationAdminHandler struct{}

// POST /api/admin/notifications/announce
// Enhanced: supports target (all / role:X / userIds:[...]), channels (site / email / sms).
func (h *NotificationAdminHandler) Announce(c *gin.Context) {
	var req struct {
		Title   string   `json:"title" binding:"required"`
		Content string   `json:"content"`
		Target  string   `json:"target"`  // "all" | "role:USER" | "role:AGENT" | "role:ADMIN"
		UserIDs []string `json:"userIds"` // specific user IDs (overrides target)

		Channels []string `json:"channels"` // ["site"] | ["site","email"] | ["site","email","sms"]

		// SMS-specific fields (only when channels includes "sms")
		SMSTemplateID string            `json:"smsTemplateId"` // Submail template project ID
		SMSVars       map[string]string `json:"smsVars"`       // template variables
		SMSContent    string            `json:"smsContent"`    // direct SMS content (if no template)
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "参数错误"})
		return
	}

	// Default channels to site only
	if len(req.Channels) == 0 {
		req.Channels = []string{"site"}
	}

	// Resolve target user IDs
	var targetUserIDs []string
	if len(req.UserIDs) > 0 {
		targetUserIDs = req.UserIDs
	} else if strings.HasPrefix(req.Target, "role:") {
		role := strings.TrimPrefix(req.Target, "role:")
		database.DB.Model(&model.User{}).Where("role = ?", role).Pluck("id", &targetUserIDs)
	} else {
		// default: all users
		database.DB.Model(&model.User{}).Pluck("id", &targetUserIDs)
	}

	if len(targetUserIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"sent": 0, "message": "没有匹配的用户"}})
		return
	}

	result := gin.H{}

	// Channel: Site notification
	wantSite := false
	for _, ch := range req.Channels {
		if ch == "site" {
			wantSite = true
			break
		}
	}
	if wantSite {
		count, err := service.CreateNotificationForUsers(targetUserIDs, "SYSTEM_ANNOUNCE", req.Title, req.Content, nil, nil)
		if err != nil {
			log.Printf("[NOTIFY] 站内信发送失败: %v", err)
			result["siteError"] = err.Error()
		} else {
			result["siteSent"] = count
		}
	}

	// Channel: Email
	wantEmail := false
	for _, ch := range req.Channels {
		if ch == "email" {
			wantEmail = true
			break
		}
	}
	if wantEmail {
		// Fetch user emails
		type userEmail struct {
			ID    string
			Email string
		}
		var users []userEmail
		database.DB.Model(&model.User{}).Where("id IN ?", targetUserIDs).Select("id, email").Find(&users)

		emailSent := 0
		emailFailed := 0
		emailSvc := service.GetEmailService()
		for _, u := range users {
			if u.Email == "" {
				continue
			}
			if err := emailSvc.SendAnnouncement(u.Email, req.Title, req.Content); err != nil {
				log.Printf("[NOTIFY] 邮件发送失败 %s: %v", u.Email, err)
				emailFailed++
			} else {
				emailSent++
			}
		}
		result["emailSent"] = emailSent
		result["emailFailed"] = emailFailed
	}

	// Channel: SMS
	wantSMS := false
	for _, ch := range req.Channels {
		if ch == "sms" {
			wantSMS = true
			break
		}
	}
	if wantSMS {
		if !service.IsSMSConfigured() {
			result["smsError"] = "短信服务未配置"
		} else {
			// Fetch user phones
			type userPhone struct {
				ID    string
				Phone *string
			}
			var users []userPhone
			database.DB.Model(&model.User{}).Where("id IN ?", targetUserIDs).Select("id, phone").Find(&users)

			smsSent := 0
			smsFailed := 0
			for _, u := range users {
				if u.Phone == nil || strings.TrimSpace(*u.Phone) == "" {
					continue
				}
				phone := strings.TrimSpace(*u.Phone)

				var err error
				if req.SMSTemplateID != "" {
					_, err = service.SendSMSWithTemplate(phone, req.SMSTemplateID, req.SMSVars)
				} else if req.SMSContent != "" {
					cfg := service.LoadSMSConfig()
					content := req.SMSContent
					if cfg.Signature != "" && !strings.HasPrefix(content, cfg.Signature) {
						content = cfg.Signature + content
					}
					_, err = service.SendSMSDirect(phone, content)
				} else {
					err = fmt.Errorf("短信需要模板 ID 或内容")
				}

				if err != nil {
					log.Printf("[NOTIFY] 短信发送失败 %s: %v", phone, err)
					smsFailed++
				} else {
					smsSent++
				}
			}
			result["smsSent"] = smsSent
			result["smsFailed"] = smsFailed
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}

// GET /api/admin/notifications/history
// List sent notification records (for admin review).
func (h *NotificationAdminHandler) History(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.Notification{}).Where("type = ?", "SYSTEM_ANNOUNCE")

	var total int64
	query.Count(&total)

	type NotifWithUser struct {
		model.Notification
		UserName  string `json:"userName"`
		UserEmail string `json:"userEmail"`
	}

	var items []NotifWithUser
	database.DB.Table("notifications").
		Select("notifications.*, users.name as user_name, users.email as user_email").
		Joins("LEFT JOIN users ON users.id = notifications.user_id").
		Where("notifications.type = ?", "SYSTEM_ANNOUNCE").
		Order("notifications.created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Scan(&items)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"items": items,
			"total": total,
		},
	})
}

// GET /api/admin/notifications/user-search?q=xxx
// Search users for targeted notifications.
func (h *NotificationAdminHandler) UserSearch(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	if q == "" {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"users": []interface{}{}}})
		return
	}

	type userResult struct {
		ID    string  `json:"id"`
		Name  string  `json:"name"`
		Email string  `json:"email"`
		Phone *string `json:"phone,omitempty"`
	}

	var users []userResult
	like := "%" + q + "%"
	database.DB.Model(&model.User{}).
		Where("name ILIKE ? OR email ILIKE ? OR phone ILIKE ?", like, like, like).
		Select("id, name, email, phone").
		Limit(20).
		Find(&users)

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"users": users}})
}
