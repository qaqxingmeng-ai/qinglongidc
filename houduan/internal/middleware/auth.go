package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

// Auth middleware extracts JWT from cookie or Authorization header
// and sets user info in the context.
func Auth() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := ""
		auth := c.GetHeader("Authorization")
		if strings.HasPrefix(auth, "Bearer ") {
			bearer := strings.TrimPrefix(auth, "Bearer ")
			if strings.HasPrefix(bearer, "sat_") {
				if !authByAPIToken(c, bearer) {
					return
				}
				return
			}
			tokenStr = bearer
		}

		// Fall back to cookie if no Bearer token
		if tokenStr == "" {
			if cookie, err := c.Cookie("token"); err == nil && cookie != "" {
				tokenStr = cookie
			}
		}

		if tokenStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
			c.Abort()
			return
		}

		tokenDetails, err := service.VerifyTokenDetails(tokenStr)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "登录已过期"})
			c.Abort()
			return
		}

		if tokenDetails.JWTID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "登录会话无效，请重新登录"})
			c.Abort()
			return
		}

		now := time.Now()
		payload := tokenDetails.Payload

		var session model.UserSession
		err = database.DB.
			Where("user_id = ? AND jwt_id = ? AND is_active = ?", payload.UserID, tokenDetails.JWTID, true).
			First(&session).Error
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "登录会话已失效，请重新登录"})
			c.Abort()
			return
		}
		if session.ExpiresAt.Before(now) {
			database.DB.Model(&model.UserSession{}).Where("id = ?", session.ID).Update("is_active", false)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "登录会话已过期，请重新登录"})
			c.Abort()
			return
		}
		if session.LastActiveAt.Before(now.Add(-2 * time.Minute)) {
			database.DB.Model(&model.UserSession{}).Where("id = ?", session.ID).Update("last_active_at", now)
		}

		c.Set("userId", payload.UserID)
		c.Set("email", payload.Email)
		c.Set("role", payload.Role)
		c.Set("name", payload.Name)
		c.Set("sessionId", session.ID)
		c.Next()
	}
}

func authByAPIToken(c *gin.Context, rawToken string) bool {
	hash := sha256.Sum256([]byte(rawToken))
	hashHex := hex.EncodeToString(hash[:])

	var token model.ApiToken
	if err := database.DB.First(&token, "token_hash = ?", hashHex).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "API Token 无效"})
		c.Abort()
		return false
	}

	now := time.Now()
	if token.ExpiresAt != nil && token.ExpiresAt.Before(now) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "API Token 已过期"})
		c.Abort()
		return false
	}

	limit := token.DailyLimit
	if limit <= 0 {
		limit = 1000
	}
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	var todayCalls int64
	database.DB.Model(&model.ApiTokenUsageLog{}).Where("token_id = ? AND created_at >= ?", token.ID, dayStart).Count(&todayCalls)
	if int(todayCalls) >= limit {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "API Token 调用次数已达当日上限"})
		c.Abort()
		return false
	}

	if token.Scope == "READ" {
		method := strings.ToUpper(c.Request.Method)
		if method != "GET" && method != "HEAD" && method != "OPTIONS" {
			c.JSON(http.StatusForbidden, gin.H{"error": "当前 API Token 为只读权限"})
			c.Abort()
			return false
		}
	}

	var user model.User
	if err := database.DB.Select("id,email,name,role").First(&user, "id = ?", token.UserID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "API Token 所属用户不存在"})
		c.Abort()
		return false
	}

	database.DB.Model(&model.ApiToken{}).Where("id = ?", token.ID).Update("last_used_at", now)

	c.Set("userId", user.ID)
	c.Set("email", user.Email)
	c.Set("role", user.Role)
	c.Set("name", user.Name)

	start := time.Now()
	c.Next()

	durationMs := int(time.Since(start).Milliseconds())
	path := c.FullPath()
	if path == "" {
		path = c.Request.URL.Path
	}
	database.DB.Create(&model.ApiTokenUsageLog{
		ID:         service.GenerateID(),
		TokenID:    token.ID,
		UserID:     user.ID,
		Method:     strings.ToUpper(c.Request.Method),
		Path:       path,
		StatusCode: c.Writer.Status(),
		DurationMs: durationMs,
		IP:         ClientIPForStorage(c),
		UserAgent:  c.Request.UserAgent(),
		CreatedAt:  time.Now(),
	})

	return true
}

// OptionalAuth extracts JWT if present but does not require it.
// Validates session is still active to prevent use of revoked tokens.
func OptionalAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := ""
		if cookie, err := c.Cookie("token"); err == nil && cookie != "" {
			tokenStr = cookie
		}
		if tokenStr == "" {
			auth := c.GetHeader("Authorization")
			if strings.HasPrefix(auth, "Bearer ") {
				tokenStr = strings.TrimPrefix(auth, "Bearer ")
			}
		}

		if tokenStr != "" {
			if details, err := service.VerifyTokenDetails(tokenStr); err == nil && details.JWTID != "" {
				var session model.UserSession
				if err := database.DB.
					Where("user_id = ? AND jwt_id = ? AND is_active = ?", details.Payload.UserID, details.JWTID, true).
					First(&session).Error; err == nil && !session.ExpiresAt.Before(time.Now()) {
					c.Set("userId", details.Payload.UserID)
					c.Set("email", details.Payload.Email)
					c.Set("role", details.Payload.Role)
					c.Set("name", details.Payload.Name)
				}
			}
		}
		c.Next()
	}
}

// RequireRole ensures the user has one of the specified roles.
func RequireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
			c.Abort()
			return
		}
		roleStr, _ := role.(string)
		for _, r := range roles {
			if r == roleStr {
				c.Next()
				return
			}
		}
		c.JSON(http.StatusForbidden, gin.H{"error": "权限不足"})
		c.Abort()
	}
}

// GetUserID extracts user ID from context.
func GetUserID(c *gin.Context) string {
	v, _ := c.Get("userId")
	s, _ := v.(string)
	return s
}

// GetUserRole extracts user role from context.
func GetUserRole(c *gin.Context) string {
	v, _ := c.Get("role")
	s, _ := v.(string)
	return s
}

// GetUserEmail extracts user email from context.
func GetUserEmail(c *gin.Context) string {
	v, _ := c.Get("email")
	s, _ := v.(string)
	return s
}

// GetUserLevel extracts user level from context (set by handlers when needed).
func GetUserLevel(c *gin.Context) string {
	v, _ := c.Get("level")
	s, _ := v.(string)
	return s
}
