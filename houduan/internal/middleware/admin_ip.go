package middleware

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

var (
	adminIPCache      string
	adminIPCacheMutex sync.RWMutex
	adminIPCacheAt    time.Time
)

func getAdminIPWhitelist() string {
	adminIPCacheMutex.RLock()
	if time.Since(adminIPCacheAt) < 60*time.Second {
		cached := adminIPCache
		adminIPCacheMutex.RUnlock()
		return cached
	}
	adminIPCacheMutex.RUnlock()

	if database.DB == nil {
		return ""
	}

	var setting model.SystemSetting
	if err := database.DB.First(&setting, "key = ?", "admin_ip_whitelist").Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			fmt.Printf("[WARN] admin_ip_whitelist query error: %v\n", err)
		}
		adminIPCacheMutex.Lock()
		adminIPCache = ""
		adminIPCacheAt = time.Now()
		adminIPCacheMutex.Unlock()
		return ""
	}

	whitelist := strings.TrimSpace(setting.Value)
	adminIPCacheMutex.Lock()
	adminIPCache = whitelist
	adminIPCacheAt = time.Now()
	adminIPCacheMutex.Unlock()

	return whitelist
}

func AdminIPWhitelist() gin.HandlerFunc {
	return func(c *gin.Context) {
		whitelist := getAdminIPWhitelist()
		if whitelist == "" {
			c.Next()
			return
		}

		clientIP, ok := TrustedClientIP(c)
		if !ok {
			detail := "管理后台开启了 IP 白名单，但当前请求经由 BFF proxy 模式转发，后端无法可靠识别客户端真实 IP"
			database.DB.Create(&model.UserLog{
				ID:     service.GenerateID(),
				UserID: "system",
				Event:  "ADMIN_IP_UNAVAILABLE",
				Detail: &detail,
			})
			c.AbortWithStatusJSON(http.StatusPreconditionFailed, gin.H{
				"error": "当前 proxy 模式下无法可靠识别客户端 IP，请在上游代理执行管理后台白名单，或切换到 direct 模式",
			})
			return
		}
		clientNet := net.ParseIP(clientIP)

		for _, entry := range strings.Split(whitelist, ",") {
			entry = strings.TrimSpace(entry)
			if entry == "" {
				continue
			}
			if strings.Contains(entry, "/") {
				_, ipNet, err := net.ParseCIDR(entry)
				if err == nil && clientNet != nil && ipNet.Contains(clientNet) {
					c.Next()
					return
				}
				continue
			}
			if entry == clientIP {
				c.Next()
				return
			}
		}

		detail := fmt.Sprintf("IP %s 被管理后台白名单拦截，访问路径 %s", clientIP, c.Request.URL.Path)
		ip := clientIP
		database.DB.Create(&model.UserLog{
			ID:     service.GenerateID(),
			UserID: "system",
			Event:  "ADMIN_IP_BLOCKED",
			Detail: &detail,
			IP:     &ip,
		})

		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
			"error": "您的 IP 地址不在管理后台访问白名单中",
		})
	}
}
