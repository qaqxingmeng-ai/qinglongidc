package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"serverai-backend/config"
	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

const csrfCookieName = "csrf_token"

var errVerificationAlreadyUsed = errors.New("verification already used")

// validatePasswordStrength checks that the password is at least 8 chars and contains both a letter and a digit.
func validatePasswordStrength(password string) string {
	if len(password) < 8 {
		return "密码至少8位"
	}
	hasLetter := false
	hasDigit := false
	for _, ch := range password {
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') {
			hasLetter = true
		}
		if ch >= '0' && ch <= '9' {
			hasDigit = true
		}
	}
	if !hasLetter || !hasDigit {
		return "密码必须包含字母和数字"
	}
	return ""
}

const deviceCookieName = "device_id"
const deviceHeaderName = "X-Device-Id"
const sessionMaxAge = 7 * 24 * 3600

func (h *AuthHandler) setCSRFCookie(c *gin.Context, token string, maxAge int) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     csrfCookieName,
		Value:    token,
		Path:     "/",
		Domain:   h.cfg.CookieDomain,
		MaxAge:   maxAge,
		Secure:   h.cfg.CookieSecure,
		HttpOnly: false,
		SameSite: http.SameSiteStrictMode,
	})
}

func (h *AuthHandler) issueSessionCookies(c *gin.Context, jwtToken string) {
	// Session Cookie 使用 SameSite=Lax：允许从外链/支付回调跳转回来时仍带上登录态，
	// 同时 CSRF 仍由 double-submit 的 csrf_token Cookie（Strict）+ X-CSRF-Token Header 保障。
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     "token",
		Value:    jwtToken,
		Path:     "/",
		Domain:   h.cfg.CookieDomain,
		MaxAge:   sessionMaxAge,
		Secure:   h.cfg.CookieSecure,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	h.setCSRFCookie(c, service.GenerateCSRFToken(), sessionMaxAge)
}

func (h *AuthHandler) clearSessionCookies(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     "token",
		Value:    "",
		Path:     "/",
		Domain:   h.cfg.CookieDomain,
		MaxAge:   -1,
		Secure:   h.cfg.CookieSecure,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	h.setCSRFCookie(c, "", -1)
}

func (h *AuthHandler) getOrCreateDeviceID(c *gin.Context) string {
	if header := strings.TrimSpace(c.GetHeader(deviceHeaderName)); header != "" {
		return header
	}
	if cookie, err := c.Cookie(deviceCookieName); err == nil {
		if val := strings.TrimSpace(cookie); val != "" {
			return val
		}
	}
	deviceID := service.GenerateID()
	c.SetCookie(deviceCookieName, deviceID, 365*24*3600, "/", h.cfg.CookieDomain, h.cfg.CookieSecure, false)
	return deviceID
}

func (h *AuthHandler) createUserSession(userID, jwtID, deviceID, ip, ua string, expiresAt time.Time) error {
	if jwtID == "" {
		return fmt.Errorf("missing jwt id")
	}
	now := time.Now()
	session := model.UserSession{
		ID:           service.GenerateID(),
		UserID:       userID,
		DeviceID:     deviceID,
		JWTID:        jwtID,
		IP:           ip,
		UserAgent:    ua,
		LastActiveAt: now,
		ExpiresAt:    expiresAt,
		IsActive:     true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	return database.DB.Create(&session).Error
}

func (h *AuthHandler) sessionPayloadRow(s model.UserSession, currentSessionID string) gin.H {
	return gin.H{
		"id":           s.ID,
		"deviceId":     s.DeviceID,
		"ip":           s.IP,
		"userAgent":    s.UserAgent,
		"isCurrent":    s.ID == currentSessionID,
		"isActive":     s.IsActive,
		"lastActiveAt": s.LastActiveAt,
		"expiresAt":    s.ExpiresAt,
		"createdAt":    s.CreatedAt,
	}
}

func (h *AuthHandler) buildProfilePayload(user model.User) gin.H {
	var agentName *string
	if user.AgentID != nil && *user.AgentID != "" {
		var agent model.User
		if err := database.DB.Select("name").First(&agent, "id = ?", *user.AgentID).Error; err == nil {
			name := agent.Name
			agentName = &name
		}
	}

	return gin.H{
		"id":              user.ID,
		"numericId":       user.NumericID,
		"email":           user.Email,
		"name":            user.Name,
		"phone":           user.Phone,
		"role":            user.Role,
		"level":           user.Level,
		"balance":         user.Balance,
		"inviteCode":      user.InviteCode,
		"hasIdentityCode": user.IdentityCode != nil && strings.TrimSpace(*user.IdentityCode) != "",
		"agentId":         user.AgentID,
		"agentName":       agentName,
		"createdAt":       user.CreatedAt,
	}
}

// GET /api/auth/csrf
func (h *AuthHandler) CSRFToken(c *gin.Context) {
	token := service.GenerateCSRFToken()
	h.setCSRFCookie(c, token, 7*24*3600)
	c.JSON(http.StatusOK, gin.H{"token": token})
}

type AuthHandler struct {
	emailService *service.EmailService
	cfg          *config.Config
}

func NewAuthHandler(emailService *service.EmailService, cfg *config.Config) *AuthHandler {
	return &AuthHandler{emailService: emailService, cfg: cfg}
}

// POST /api/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入有效的邮箱和密码"})
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	ip := middleware.ClientIPForStorage(c)
	networkKey := middleware.ClientNetworkKey(c)
	ua := c.GetHeader("User-Agent")

	// 登录前置门槛：同时检查 email + ip 两个维度（软限速，不再按邮箱硬锁）。
	if msg := CheckLoginGate(email, networkKey); msg != "" {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": msg})
		return
	}

	recordHistory := func(uid *string, ok bool, reason string) {
		h := model.LoginHistory{
			ID:           service.GenerateID(),
			UserID:       uid,
			Email:        email,
			IP:           ip,
			UserAgent:    ua,
			IsSuccessful: ok,
			LoginAt:      time.Now(),
		}
		if reason != "" {
			h.FailReason = &reason
		}
		database.DB.Create(&h)
	}

	var user model.User
	if err := database.DB.Where("email = ?", email).First(&user).Error; err != nil {
		RecordLoginFailure(email, networkKey)
		recordHistory(nil, false, "用户不存在")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "邮箱或密码错误"})
		return
	}
	if strings.EqualFold(user.Role, "DELETED") {
		RecordLoginFailure(email, networkKey)
		recordHistory(&user.ID, false, "账号已禁用")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "邮箱或密码错误"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		RecordLoginFailure(email, networkKey)
		recordHistory(&user.ID, false, "密码错误")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "邮箱或密码错误"})
		return
	}

	// 登录成功：邮箱 + IP 两侧计数都清零，给该 IP 的其他正常用户也解除影响。
	ResetLoginFailure(email, networkKey)
	deviceID := h.getOrCreateDeviceID(c)

	token, err := service.SignToken(service.JWTPayload{
		UserID:   user.ID,
		Email:    user.Email,
		Role:     user.Role,
		Name:     user.Name,
		DeviceID: deviceID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "登录失败"})
		return
	}
	tokenDetails, err := service.VerifyTokenDetails(token)
	if err != nil || tokenDetails.JWTID == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "登录失败"})
		return
	}
	if err := h.createUserSession(user.ID, tokenDetails.JWTID, deviceID, ip, ua, tokenDetails.ExpiresAt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "登录失败"})
		return
	}

	h.issueSessionCookies(c, token)

	// Log login event
	database.DB.Create(&model.UserLog{
		ID:        service.GenerateID(),
		UserID:    user.ID,
		Event:     "LOGIN",
		IP:        &ip,
		CreatedAt: time.Now(),
	})
	// Login history record
	recordHistory(&user.ID, true, "")

	c.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":    user.ID,
			"email": user.Email,
			"name":  user.Name,
			"role":  user.Role,
			"level": user.Level,
		},
	})
}

// POST /api/auth/register
func (h *AuthHandler) Register(c *gin.Context) {
	var req struct {
		Email        string `json:"email" binding:"required,email"`
		Password     string `json:"password" binding:"required,min=8"`
		Name         string `json:"name" binding:"required"`
		Phone        string `json:"phone"`
		Code         string `json:"code"`
		InviteCode   string `json:"inviteCode"`
		IdentityCode string `json:"identityCode"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写完整的注册信息"})
		return
	}

	if msg := validatePasswordStrength(req.Password); msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	code := strings.TrimSpace(req.Code)
	inviteCode := strings.ToUpper(strings.TrimSpace(req.InviteCode))
	identityCode := strings.TrimSpace(req.IdentityCode)

	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入邮箱验证码"})
		return
	}

	// Check if email already exists
	var count int64
	database.DB.Model(&model.User{}).Where("email = ?", email).Count(&count)
	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "邮箱已被注册"})
		return
	}

	var verification model.EmailVerification
	if err := database.DB.Where("email = ? AND code = ? AND used = ? AND expires_at > ?",
		email, code, false, time.Now()).
		Order("created_at DESC").First(&verification).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "邮箱验证码无效或已过期"})
		return
	}

	var matchedAgent *model.User
	if inviteCode != "" {
		var agent model.User
		if err := database.DB.Where("invite_code = ? AND role IN ?", inviteCode, []string{"AGENT", "ADMIN"}).First(&agent).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "邀请码无效"})
			return
		}
		if agent.IdentityCode != nil && strings.TrimSpace(*agent.IdentityCode) != "" {
			if identityCode == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "请输入身份码"})
				return
			}
			ok, needUpgrade := service.VerifyIdentityCode(*agent.IdentityCode, identityCode)
			if !ok {
				c.JSON(http.StatusBadRequest, gin.H{"error": "身份码错误"})
				return
			}
			// 若 agent 的身份码还是明文，在首次成功匹配时顺便升级成哈希
			if needUpgrade {
				if hashed, herr := service.HashIdentityCode(identityCode); herr == nil && hashed != "" {
					database.DB.Model(&model.User{}).Where("id = ?", agent.ID).
						Update("identity_code", hashed)
				}
			}
		}
		matchedAgent = &agent
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "注册失败"})
		return
	}

	user := model.User{
		ID:        service.GenerateID(),
		Email:     email,
		Password:  string(hashedPassword),
		Name:      strings.TrimSpace(req.Name),
		Role:      "USER",
		Level:     "GUEST",
		Balance:   0,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if phone := strings.TrimSpace(req.Phone); phone != "" {
		user.Phone = &phone
	}
	if matchedAgent != nil {
		user.AgentID = &matchedAgent.ID
	}

	// Use transaction with advisory lock to atomically assign numeric ID
	inviteeBonus := 0.0
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		// Advisory lock to serialize numeric_id assignment
		if err := tx.Exec("SELECT pg_advisory_xact_lock(1)").Error; err != nil {
			return err
		}
		var maxNumericID int
		if err := tx.Raw("SELECT COALESCE(MAX(numeric_id), 9999) FROM users").Scan(&maxNumericID).Error; err != nil {
			return err
		}
		user.NumericID = maxNumericID + 1
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		if result := tx.Model(&model.EmailVerification{}).
			Where("id = ? AND used = ?", verification.ID, false).
			Update("used", true); result.Error != nil {
			return result.Error
		} else if result.RowsAffected == 0 {
			return errVerificationAlreadyUsed
		}
		bonus, err := applyInviteeRegisterBonusTx(tx, &user)
		if err != nil {
			return err
		}
		inviteeBonus = bonus
		return nil
	})
	if err != nil {
		if err == errVerificationAlreadyUsed {
			c.JSON(http.StatusBadRequest, gin.H{"error": "邮箱验证码已失效，请重新获取"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "注册失败"})
		return
	}

	if inviteeBonus > 0 {
		relatedType := "invite_reward"
		SendNotification(user.ID, "INVITEE_BONUS", "新人红包到账", "您通过邀请码注册，已获得新人红包奖励。", nil, &relatedType)
		if user.AgentID != nil && *user.AgentID != "" {
			SendNotification(*user.AgentID, "INVITEE_BONUS", "邀请注册成功", "您邀请的新用户已注册并获得新人红包。", nil, &relatedType)
		}
	}

	deviceID := h.getOrCreateDeviceID(c)
	// Sign token
	token, signErr := service.SignToken(service.JWTPayload{
		UserID:   user.ID,
		Email:    user.Email,
		Role:     user.Role,
		Name:     user.Name,
		DeviceID: deviceID,
	})
	if signErr == nil {
		if details, err := service.VerifyTokenDetails(token); err == nil {
			_ = h.createUserSession(user.ID, details.JWTID, deviceID, middleware.ClientIPForStorage(c), c.GetHeader("User-Agent"), details.ExpiresAt)
		}
		h.issueSessionCookies(c, token)
	}

	c.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":         user.ID,
			"email":      user.Email,
			"name":       user.Name,
			"phone":      user.Phone,
			"role":       user.Role,
			"level":      user.Level,
			"agentId":    user.AgentID,
			"inviteCode": user.InviteCode,
		},
	})
}

// GET /api/auth/me
func (h *AuthHandler) Me(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var user model.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	c.JSON(http.StatusOK, h.buildProfilePayload(user))
}

// PUT /api/auth/me
func (h *AuthHandler) UpdateMe(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		Name  *string `json:"name"`
		Phone *string `json:"phone"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求"})
		return
	}

	// Check if user is binding phone for the first time (award points)
	var bindingPhoneFirstTime bool
	if req.Phone != nil && strings.TrimSpace(*req.Phone) != "" {
		var currentUser model.User
		if database.DB.Select("phone").First(&currentUser, "id = ?", userID).Error == nil {
			if currentUser.Phone == nil || *currentUser.Phone == "" {
				bindingPhoneFirstTime = true
			}
		}
	}

	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = strings.TrimSpace(*req.Name)
	}
	if req.Phone != nil {
		phone := strings.TrimSpace(*req.Phone)
		if phone != "" {
			var cnt int64
			database.DB.Model(&model.User{}).Where("phone = ? AND id <> ?", phone, userID).Count(&cnt)
			if cnt > 0 {
				c.JSON(http.StatusConflict, gin.H{"error": "该手机号已被其他账号绑定"})
				return
			}
		}
		updates["phone"] = phone
	}
	updates["updated_at"] = time.Now()

	database.DB.Model(&model.User{}).Where("id = ?", userID).Updates(updates)

	var updated model.User
	if err := database.DB.Select("id,name,phone").First(&updated, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败"})
		return
	}

	// Award points for first-time phone binding
	if bindingPhoneFirstTime {
		_ = service.EarnPoints(database.DB, userID, 50, "BIND_PHONE", "绑定手机号奖励", nil, nil)
	}

	// Log
	database.DB.Create(&model.UserLog{
		ID:        service.GenerateID(),
		UserID:    userID,
		Event:     "INFO_CHANGE",
		CreatedAt: time.Now(),
	})

	c.JSON(http.StatusOK, gin.H{"success": true, "id": updated.ID, "name": updated.Name, "phone": updated.Phone})
}

// POST /api/auth/logout
func (h *AuthHandler) Logout(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if sessionID, ok := c.Get("sessionId"); ok {
		if sid, ok := sessionID.(string); ok && sid != "" {
			database.DB.Model(&model.UserSession{}).
				Where("id = ? AND user_id = ?", sid, userID).
				Updates(map[string]interface{}{"is_active": false, "updated_at": time.Now()})
		}
	}
	h.clearSessionCookies(c)
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GET /api/auth/sessions
func (h *AuthHandler) Sessions(c *gin.Context) {
	userID := middleware.GetUserID(c)
	now := time.Now()

	database.DB.Model(&model.UserSession{}).
		Where("user_id = ? AND is_active = ? AND expires_at <= ?", userID, true, now).
		Update("is_active", false)

	var sessions []model.UserSession
	if err := database.DB.
		Where("user_id = ?", userID).
		Order("last_active_at DESC").
		Limit(20).
		Find(&sessions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取会话失败"})
		return
	}

	currentSessionID, _ := c.Get("sessionId")
	currentID, _ := currentSessionID.(string)
	rows := make([]gin.H, 0, len(sessions))
	for _, s := range sessions {
		rows = append(rows, h.sessionPayloadRow(s, currentID))
	}

	c.JSON(http.StatusOK, gin.H{"sessions": rows})
}

// POST /api/auth/sessions/logout-others
func (h *AuthHandler) LogoutOtherSessions(c *gin.Context) {
	userID := middleware.GetUserID(c)
	currentSessionID, _ := c.Get("sessionId")
	currentID, _ := currentSessionID.(string)
	if currentID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "当前会话无效，请重新登录"})
		return
	}

	result := database.DB.Model(&model.UserSession{}).
		Where("user_id = ? AND id <> ? AND is_active = ?", userID, currentID, true).
		Updates(map[string]interface{}{"is_active": false, "updated_at": time.Now()})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "revoked": result.RowsAffected})
}

// DELETE /api/auth/sessions/:id
func (h *AuthHandler) RevokeSession(c *gin.Context) {
	userID := middleware.GetUserID(c)
	targetID := strings.TrimSpace(c.Param("id"))
	if targetID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "会话ID不能为空"})
		return
	}

	currentSessionID, _ := c.Get("sessionId")
	currentID, _ := currentSessionID.(string)
	if targetID == currentID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "当前会话请使用退出登录"})
		return
	}

	result := database.DB.Model(&model.UserSession{}).
		Where("id = ? AND user_id = ? AND is_active = ?", targetID, userID, true).
		Updates(map[string]interface{}{"is_active": false, "updated_at": time.Now()})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "会话不存在或已失效"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /api/auth/send-code
func (h *AuthHandler) SendCode(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入有效的邮箱"})
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !h.emailService.IsConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "邮件服务暂不可用"})
		return
	}

	// Registration codes are limited to 3 per hour per email.
	oneHourAgo := time.Now().Add(-1 * time.Hour)
	var recentCount int64
	database.DB.Model(&model.EmailVerification{}).
		Where("email = ? AND created_at > ?", email, oneHourAgo).
		Count(&recentCount)
	if recentCount >= 3 {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "操作过于频繁，请1小时后再试"})
		return
	}

	code := service.GenerateVerificationCode()
	verification := model.EmailVerification{
		ID:        service.GenerateID(),
		Email:     email,
		Code:      code,
		ExpiresAt: time.Now().Add(10 * time.Minute),
		CreatedAt: time.Now(),
	}
	if err := database.DB.Create(&verification).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存验证码失败"})
		return
	}

	if err := h.emailService.SendVerificationCode(email, code); err != nil {
		database.DB.Delete(&verification)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "发送验证码失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /api/auth/change-password
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		CurrentPassword string `json:"currentPassword" binding:"required"`
		NewPassword     string `json:"newPassword" binding:"required,min=8"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写完整信息"})
		return
	}

	if msg := validatePasswordStrength(req.NewPassword); msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	var user model.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.CurrentPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "当前密码错误"})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "修改密码失败"})
		return
	}

	database.DB.Model(&model.User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"password":   string(hashedPassword),
		"updated_at": time.Now(),
	})

	// Invalidate all other sessions after password change
	currentSessionID, _ := c.Get("sessionId")
	currentID, _ := currentSessionID.(string)
	if currentID != "" {
		database.DB.Model(&model.UserSession{}).
			Where("user_id = ? AND id <> ? AND is_active = ?", userID, currentID, true).
			Updates(map[string]interface{}{"is_active": false, "updated_at": time.Now()})
	}

	database.DB.Create(&model.UserLog{
		ID:        service.GenerateID(),
		UserID:    userID,
		Event:     "PASSWORD_CHANGE",
		CreatedAt: time.Now(),
	})

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /api/auth/change-email
func (h *AuthHandler) ChangeEmail(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		NewEmail string `json:"newEmail" binding:"required,email"`
		Code     string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写完整信息"})
		return
	}

	newEmail := strings.ToLower(strings.TrimSpace(req.NewEmail))

	// Verify code
	var verification model.EmailVerification
	if err := database.DB.Where("email = ? AND code = ? AND used = ? AND expires_at > ?",
		newEmail, req.Code, false, time.Now()).
		Order("created_at DESC").First(&verification).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "验证码无效或已过期"})
		return
	}

	// Check if email already taken
	var count int64
	database.DB.Model(&model.User{}).Where("email = ? AND id != ?", newEmail, userID).Count(&count)
	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "该邮箱已被使用"})
		return
	}

	var user model.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	sessionIDValue, ok := c.Get("sessionId")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "登录会话无效，请重新登录"})
		return
	}
	sessionID, ok := sessionIDValue.(string)
	if !ok || sessionID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "登录会话无效，请重新登录"})
		return
	}

	deviceID := h.getOrCreateDeviceID(c)
	token, signErr := service.SignToken(service.JWTPayload{
		UserID:   user.ID,
		Email:    newEmail,
		Role:     user.Role,
		Name:     user.Name,
		DeviceID: deviceID,
	})
	if signErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "邮箱修改失败，请稍后重试"})
		return
	}
	details, err := service.VerifyTokenDetails(token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "邮箱修改失败，请稍后重试"})
		return
	}

	now := time.Now()
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		var lockedVerification model.EmailVerification
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&lockedVerification, "id = ?", verification.ID).Error; err != nil {
			return err
		}
		if lockedVerification.Used || lockedVerification.ExpiresAt.Before(now) {
			return errVerificationAlreadyUsed
		}

		if err := tx.Model(&model.User{}).Where("id = ?", userID).Updates(map[string]interface{}{
			"email":      newEmail,
			"updated_at": now,
		}).Error; err != nil {
			return err
		}

		result := tx.Model(&model.EmailVerification{}).
			Where("id = ? AND used = ?", lockedVerification.ID, false).
			Updates(map[string]interface{}{"used": true})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return errVerificationAlreadyUsed
		}

		result = tx.Model(&model.UserSession{}).
			Where("id = ? AND user_id = ? AND is_active = ?", sessionID, userID, true).
			Updates(map[string]interface{}{
				"jwt_id":         details.JWTID,
				"expires_at":     details.ExpiresAt,
				"last_active_at": now,
				"is_active":      true,
				"device_id":      deviceID,
				"ip":             middleware.ClientIPForStorage(c),
				"user_agent":     c.GetHeader("User-Agent"),
				"updated_at":     now,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}

		return tx.Create(&model.UserLog{
			ID:        service.GenerateID(),
			UserID:    userID,
			Event:     "EMAIL_CHANGE",
			CreatedAt: now,
		}).Error
	}); err != nil {
		switch {
		case errors.Is(err, errVerificationAlreadyUsed):
			c.JSON(http.StatusBadRequest, gin.H{"error": "验证码无效或已过期"})
		case errors.Is(err, gorm.ErrRecordNotFound):
			c.JSON(http.StatusUnauthorized, gin.H{"error": "登录会话已失效，请重新登录"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "邮箱修改失败，请稍后重试"})
		}
		return
	}

	h.issueSessionCookies(c, token)

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /api/auth/forgot-password
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入有效的邮箱地址"})
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !h.emailService.IsConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "邮件服务暂不可用"})
		return
	}

	// Rate limit before user-existence check to prevent abuse on any email
	oneHourAgo := time.Now().Add(-1 * time.Hour)
	var recentCount int64
	database.DB.Model(&model.EmailVerification{}).
		Where("email = ? AND created_at > ?", email, oneHourAgo).
		Count(&recentCount)
	if recentCount >= 3 {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "操作过于频繁，请1小时后再试"})
		return
	}

	// Check user exists (don't reveal whether email exists for security)
	var user model.User
	userExists := database.DB.Where("email = ?", email).First(&user).Error == nil

	if userExists {
		// Generate 6-digit code
		code := service.GenerateVerificationCode()
		expiresAt := time.Now().Add(5 * time.Minute)

		verification := model.EmailVerification{
			ID:        service.GenerateID(),
			Email:     email,
			Code:      code,
			Used:      false,
			ExpiresAt: expiresAt,
			CreatedAt: time.Now(),
		}
		if err := database.DB.Create(&verification).Error; err == nil {
			if err := h.emailService.SendResetCode(email, code); err != nil {
				database.DB.Delete(&verification)
			}
		}
	}

	// Always return 200 to avoid email enumeration
	c.JSON(http.StatusOK, gin.H{"message": "如果该邮箱已注册，验证码将在几分钟内发送"})
}

// POST /api/auth/reset-password
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Code     string `json:"code" binding:"required"`
		Password string `json:"password" binding:"required,min=8"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写完整信息，密码至少8位"})
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))

	if msg := validatePasswordStrength(req.Password); msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	// Hash new password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败，请重试"})
		return
	}

	now := time.Now()
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		var verification model.EmailVerification
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("email = ? AND code = ? AND used = ? AND expires_at > ?",
				email, req.Code, false, now).
			Order("created_at DESC").
			First(&verification).Error; err != nil {
			return errVerificationAlreadyUsed
		}

		result := tx.Model(&model.User{}).
			Where("email = ?", email).
			Updates(map[string]interface{}{
				"password":   string(hashedPassword),
				"updated_at": now,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}

		result = tx.Model(&model.EmailVerification{}).
			Where("id = ? AND used = ?", verification.ID, false).
			Update("used", true)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return errVerificationAlreadyUsed
		}

		var user model.User
		if err := tx.Select("id").Where("email = ?", email).First(&user).Error; err != nil {
			return err
		}

		if err := tx.Model(&model.UserSession{}).
			Where("user_id = ? AND is_active = ?", user.ID, true).
			Updates(map[string]interface{}{"is_active": false, "updated_at": now}).Error; err != nil {
			return err
		}

		return tx.Create(&model.UserLog{
			ID:        service.GenerateID(),
			UserID:    user.ID,
			Event:     "PASSWORD_RESET",
			CreatedAt: now,
		}).Error
	}); err != nil {
		switch {
		case errors.Is(err, errVerificationAlreadyUsed):
			c.JSON(http.StatusBadRequest, gin.H{"error": "验证码无效或已过期"})
		case errors.Is(err, gorm.ErrRecordNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败，请重试"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /api/auth/verify-agent
func (h *AuthHandler) VerifyAgent(c *gin.Context) {
	inviteCode := strings.TrimSpace(c.Query("code"))
	if inviteCode == "" {
		inviteCode = strings.TrimSpace(c.Query("inviteCode"))
	}
	if inviteCode == "" {
		var req struct {
			InviteCode string `json:"inviteCode" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err == nil {
			inviteCode = strings.TrimSpace(req.InviteCode)
		}
	}
	inviteCode = strings.ToUpper(inviteCode)
	if inviteCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入邀请码"})
		return
	}

	var agent model.User
	if err := database.DB.Where("invite_code = ? AND role IN ?", inviteCode, []string{"AGENT", "ADMIN"}).First(&agent).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "邀请码无效"})
		return
	}

	identityRequired := agent.IdentityCode != nil && strings.TrimSpace(*agent.IdentityCode) != ""

	c.JSON(http.StatusOK, gin.H{
		"valid":            true,
		"agentName":        agent.Name,
		"identityRequired": identityRequired,
	})
}
