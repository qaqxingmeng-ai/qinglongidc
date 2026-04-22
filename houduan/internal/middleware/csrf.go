package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const csrfCookieName = "csrf_token"

func isSafeMethod(method string) bool {
	switch strings.ToUpper(method) {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	default:
		return false
	}
}

// CSRF validates X-CSRF-Token for cookie-authenticated, non-safe requests.
// Requests authenticated via Bearer/API token without session cookie are ignored.
func CSRF() gin.HandlerFunc {
	return func(c *gin.Context) {
		if isSafeMethod(c.Request.Method) {
			c.Next()
			return
		}

		sessionToken, err := c.Cookie("token")
		if err != nil || strings.TrimSpace(sessionToken) == "" {
			c.Next()
			return
		}

		cookieToken, err := c.Cookie(csrfCookieName)
		if err != nil || strings.TrimSpace(cookieToken) == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "CSRF token 缺失"})
			c.Abort()
			return
		}

		headerToken := strings.TrimSpace(c.GetHeader("X-CSRF-Token"))
		if headerToken == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "CSRF token 缺失"})
			c.Abort()
			return
		}

		if subtle.ConstantTimeCompare([]byte(cookieToken), []byte(headerToken)) != 1 {
			c.JSON(http.StatusForbidden, gin.H{"error": "CSRF token 校验失败"})
			c.Abort()
			return
		}

		c.Next()
	}
}
