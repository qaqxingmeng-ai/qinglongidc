package handler

import (
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type RealtimeHandler struct {
	allowedOrigins []string
}

func NewRealtimeHandler(allowedOrigins []string) *RealtimeHandler {
	return &RealtimeHandler{allowedOrigins: allowedOrigins}
}

// GET /api/realtime/token
func (h *RealtimeHandler) Token(c *gin.Context) {
	token, err := service.SignRealtimeToken(service.JWTPayload{
		UserID: middleware.GetUserID(c),
		Role:   middleware.GetUserRole(c),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成实时令牌失败"})
		return
	}

	expiresAt := time.Now().Add(5 * time.Minute)
	c.JSON(http.StatusOK, gin.H{
		"token":     token,
		"expiresAt": expiresAt,
	})
}

// GET /api/admin/realtime/online-users
func (h *RealtimeHandler) OnlineUsers(c *gin.Context) {
	snapshots := service.Realtime().OnlineUsersSnapshot()
	if len(snapshots) == 0 {
		c.JSON(http.StatusOK, gin.H{"users": []gin.H{}, "total": 0})
		return
	}

	ids := make([]string, 0, len(snapshots))
	connMap := make(map[string]int, len(snapshots))
	for _, s := range snapshots {
		if s.UserID == "" {
			continue
		}
		ids = append(ids, s.UserID)
		connMap[s.UserID] = s.Connections
	}

	if len(ids) == 0 {
		c.JSON(http.StatusOK, gin.H{"users": []gin.H{}, "total": 0})
		return
	}

	var users []model.User
	database.DB.Select("id", "name", "email", "role").Where("id IN ?", ids).Find(&users)

	rows := make([]gin.H, 0, len(users))
	for _, u := range users {
		rows = append(rows, gin.H{
			"id":          u.ID,
			"name":        u.Name,
			"email":       u.Email,
			"role":        u.Role,
			"connections": connMap[u.ID],
		})
	}

	sort.Slice(rows, func(i, j int) bool {
		ci, _ := rows[i]["connections"].(int)
		cj, _ := rows[j]["connections"].(int)
		if ci == cj {
			ni, _ := rows[i]["name"].(string)
			nj, _ := rows[j]["name"].(string)
			return ni < nj
		}
		return ci > cj
	})

	c.JSON(http.StatusOK, gin.H{
		"users": rows,
		"total": len(rows),
	})
}

// GET /ws
func (h *RealtimeHandler) ServeWS(c *gin.Context) {
	// Origin 预检：避免任何未在白名单中的跨源 WS 直接连到后端。
	// CheckOrigin 已做底层防护，这里在 token 校验之前再做一次显式拒绝，
	// 以便返回更清晰的错误码，同时拦截掉不规范客户端的探测。
	origin := strings.TrimSpace(c.Request.Header.Get("Origin"))
	if origin == "" || len(h.allowedOrigins) == 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "WS 连接被拒绝：Origin 缺失或未配置白名单"})
		return
	}
	allowed := false
	for _, a := range h.allowedOrigins {
		if origin == strings.TrimSpace(a) {
			allowed = true
			break
		}
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "WS 连接被拒绝：Origin 不在白名单"})
		return
	}

	token := strings.TrimSpace(c.Query("token"))
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "缺少实时令牌"})
		return
	}

	payload, err := service.VerifyRealtimeToken(token)
	if err != nil || payload.UserID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "实时令牌无效或已过期"})
		return
	}

	// Limit concurrent WS connections per user
	if service.Realtime().UserConnectionCount(payload.UserID) >= 5 {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "已达连接上限"})
		return
	}

	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			origin := strings.TrimSpace(r.Header.Get("Origin"))
			if origin == "" || len(h.allowedOrigins) == 0 {
				return false
			}
			for _, allowed := range h.allowedOrigins {
				if origin == strings.TrimSpace(allowed) {
					return true
				}
			}
			return false
		},
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	service.Realtime().Register(conn, payload.UserID, payload.Role)
}

// GET /api/dashboard/notifications/preferences
func (h *RealtimeHandler) GetNotificationPreferences(c *gin.Context) {
	h.respondPreferencePayload(c, middleware.GetUserID(c))
}

// PUT /api/dashboard/notifications/preferences
func (h *RealtimeHandler) UpdateNotificationPreferences(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		BrowserPushEnabled *bool `json:"browserPushEnabled"`
		TicketReplyPush    *bool `json:"ticketReplyPush"`
		ServerExpiryPush   *bool `json:"serverExpiryPush"`
		BalanceChangePush  *bool `json:"balanceChangePush"`
		SecurityAlertPush  *bool `json:"securityAlertPush"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "通知偏好参数无效"})
		return
	}

	if _, err := service.GetOrCreateNotificationPreference(userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取通知偏好失败"})
		return
	}

	updates := map[string]interface{}{
		"updated_at": time.Now(),
	}
	if req.BrowserPushEnabled != nil {
		updates["browser_push_enabled"] = *req.BrowserPushEnabled
	}
	if req.TicketReplyPush != nil {
		updates["ticket_reply_push"] = *req.TicketReplyPush
	}
	if req.ServerExpiryPush != nil {
		updates["server_expiry_push"] = *req.ServerExpiryPush
	}
	if req.BalanceChangePush != nil {
		updates["balance_change_push"] = *req.BalanceChangePush
	}
	if req.SecurityAlertPush != nil {
		updates["security_alert_push"] = *req.SecurityAlertPush
	}

	if err := database.DB.Model(&model.NotificationPreference{}).
		Where("user_id = ?", userID).
		Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存通知偏好失败"})
		return
	}

	h.respondPreferencePayload(c, userID)
}

// POST /api/dashboard/notifications/subscriptions
func (h *RealtimeHandler) UpsertNotificationSubscription(c *gin.Context) {
	if !service.WebPushConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "浏览器推送尚未配置"})
		return
	}

	userID := middleware.GetUserID(c)
	var req struct {
		Endpoint  string  `json:"endpoint" binding:"required"`
		P256DH    string  `json:"p256dh" binding:"required"`
		Auth      string  `json:"auth" binding:"required"`
		UserAgent *string `json:"userAgent"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "推送订阅参数无效"})
		return
	}

	subscription, err := service.UpsertNotificationSubscription(userID, req.Endpoint, req.P256DH, req.Auth, req.UserAgent)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存推送订阅失败"})
		return
	}

	if _, err := service.GetOrCreateNotificationPreference(userID); err == nil {
		_ = database.DB.Model(&model.NotificationPreference{}).
			Where("user_id = ?", userID).
			Updates(map[string]interface{}{
				"browser_push_enabled": true,
				"updated_at":           time.Now(),
			}).Error
	}

	c.JSON(http.StatusOK, gin.H{"subscription": subscription})
}

// DELETE /api/dashboard/notifications/subscriptions
func (h *RealtimeHandler) DeleteNotificationSubscription(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		Endpoint string `json:"endpoint"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "推送订阅参数无效"})
		return
	}

	if err := service.DeleteNotificationSubscription(userID, req.Endpoint); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除推送订阅失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *RealtimeHandler) respondPreferencePayload(c *gin.Context, userID string) {
	pref, err := service.GetOrCreateNotificationPreference(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取通知偏好失败"})
		return
	}

	var subscriptionCount int64
	database.DB.Model(&model.NotificationSubscription{}).
		Where("user_id = ?", userID).
		Count(&subscriptionCount)

	c.JSON(http.StatusOK, gin.H{
		"preferences":           pref,
		"browserPushConfigured": service.WebPushConfigured(),
		"webPushPublicKey":      service.PublicWebPushKey(),
		"subscriptionCount":     subscriptionCount,
	})
}
