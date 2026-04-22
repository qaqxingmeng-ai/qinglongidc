package middleware

import (
	"crypto/subtle"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

// InternalKey validates the X-Internal-Key header for BFF -> API communication.
// Uses constant-time comparison to prevent timing attacks.
// If key is empty, requests pass through but a warning is logged once.
func InternalKey(key string) gin.HandlerFunc {
	var warnOnce sync.Once
	return func(c *gin.Context) {
		if c.Request.URL.Path == "/ws" {
			c.Next()
			return
		}
		if key == "" {
			warnOnce.Do(func() {
				log.Println("[WARN] INTERNAL_API_KEY is empty -- BFF authentication is disabled. Set INTERNAL_API_KEY in production.")
			})
			c.Next()
			return
		}

		provided := strings.TrimSpace(c.GetHeader("X-Internal-Key"))
		if provided == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(key)) != 1 {
			c.JSON(http.StatusForbidden, gin.H{"error": "invalid internal key"})
			c.Abort()
			return
		}
		c.Next()
	}
}
