package middleware

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

// WAFConfig holds WAF configuration.
type WAFConfig struct {
	Enabled      bool
	IPWhitelist  []string
	IPBlacklist  []string
	RateLimitRPS int // requests per second per IP
	MaxBodyBytes int64
}

type rateLimitEntry struct {
	hits     []time.Time
	lastSeen time.Time
}

var (
	rateLimitMap   = make(map[string]*rateLimitEntry)
	rateLimitMutex sync.Mutex
	rateLimitOps   int // counter to trigger periodic cleanup

	wafCache      WAFConfig
	wafCacheMutex sync.RWMutex
	wafCacheAt    time.Time
)

// WAF implements IP filtering, rate limiting, and basic request sanitization.
func WAF(cfg WAFConfig) gin.HandlerFunc {
	whitelistSet := make(map[string]bool)
	blacklistSet := make(map[string]bool)
	for _, ip := range cfg.IPWhitelist {
		whitelistSet[ip] = true
	}
	for _, ip := range cfg.IPBlacklist {
		blacklistSet[ip] = true
	}

	return func(c *gin.Context) {
		runtimeCfg := loadRuntimeWAFConfig(cfg)
		if !runtimeCfg.Enabled {
			c.Next()
			return
		}

		clientIP, trustedIP := TrustedClientIP(c)
		rateLimitKey := ClientNetworkKey(c)

		// Whitelist check: if whitelist is set, only allow whitelisted IPs
		if len(whitelistSet) > 0 {
			if !trustedIP {
				c.JSON(http.StatusPreconditionFailed, gin.H{"error": "proxy mode requires upstream IP filtering"})
				c.Abort()
				return
			}
			if !whitelistSet[clientIP] {
				c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
				c.Abort()
				return
			}
		}

		// Blacklist check
		if len(blacklistSet) > 0 && !trustedIP {
			c.JSON(http.StatusPreconditionFailed, gin.H{"error": "proxy mode requires upstream IP filtering"})
			c.Abort()
			return
		}
		if blacklistSet[clientIP] {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			c.Abort()
			return
		}

		// Rate limiting
		if runtimeCfg.RateLimitRPS > 0 {
			if !checkRateLimit(rateLimitKey, runtimeCfg.RateLimitRPS) {
				c.JSON(http.StatusTooManyRequests, gin.H{"error": "请求过于频繁，请稍后重试"})
				c.Abort()
				return
			}
		}

		if runtimeCfg.MaxBodyBytes > 0 && c.Request.Body != nil && c.Request.Body != http.NoBody {
			if c.Request.ContentLength > runtimeCfg.MaxBodyBytes {
				c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "请求体过大"})
				c.Abort()
				return
			}
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, runtimeCfg.MaxBodyBytes)
		}

		// 注意：
		// 之前这里对 query 参数与 URL 路径做黑名单关键词匹配（union select / ' or 1=1 等）。
		// 关键字 WAF 既容易被 bypass，又会误杀正常中英文内容（文档 slug / 搜索关键字）。
		// 真正的 SQL 注入防护应交给 ORM 参数化 + 业务层白名单校验，外层 WAF 由网关（Nginx ModSecurity / Cloudflare）负责。
		// 只保留对 query 参数的明显 XSS 载荷阻断（纵深防御），并移除对 URL 路径的扫描。
		for key, values := range c.Request.URL.Query() {
			for _, v := range values {
				if hasObviousXSSPayload(v) {
					c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request parameter: " + key})
					c.Abort()
					return
				}
			}
		}

		c.Next()
	}
}

func loadRuntimeWAFConfig(defaultCfg WAFConfig) WAFConfig {
	wafCacheMutex.RLock()
	if time.Since(wafCacheAt) < 30*time.Second {
		cached := wafCache
		wafCacheMutex.RUnlock()
		return cached
	}
	wafCacheMutex.RUnlock()

	if database.DB == nil {
		return defaultCfg
	}

	var rows []model.SystemSetting
	if err := database.DB.Where("key IN ?", []string{"waf_enabled", "waf_rate_limit"}).Find(&rows).Error; err != nil {
		return defaultCfg
	}

	merged := defaultCfg
	for _, row := range rows {
		value := strings.TrimSpace(row.Value)
		switch row.Key {
		case "waf_enabled":
			switch strings.ToLower(value) {
			case "true", "1", "yes", "on":
				merged.Enabled = true
			case "false", "0", "no", "off":
				merged.Enabled = false
			}
		case "waf_rate_limit":
			if parsed, err := strconv.Atoi(value); err == nil && parsed >= 0 {
				merged.RateLimitRPS = parsed
			}
		}
	}

	wafCacheMutex.Lock()
	wafCache = merged
	wafCacheAt = time.Now()
	wafCacheMutex.Unlock()

	return merged
}

func extractClientIP(c *gin.Context) string {
	if ip, ok := TrustedClientIP(c); ok {
		return ip
	}
	if deviceID := c.GetHeader(deviceHeaderName); deviceID != "" {
		return "device:" + strings.TrimSpace(deviceID)
	}
	ip, _, _ := net.SplitHostPort(c.Request.RemoteAddr)
	if ip != "" {
		return ip
	}
	return ""
}

func checkRateLimit(ip string, limit int) bool {
	rateLimitMutex.Lock()
	defer rateLimitMutex.Unlock()

	now := time.Now()

	// Periodic cleanup: every 1000 operations, purge expired entries
	rateLimitOps++
	if rateLimitOps >= 1000 {
		rateLimitOps = 0
		for k, e := range rateLimitMap {
			if now.Sub(e.lastSeen) > 2*time.Minute {
				delete(rateLimitMap, k)
			}
		}
	}

	// Hard cap: if the map grows too large, reject new IPs to prevent memory exhaustion
	const maxEntries = 100000
	entry, exists := rateLimitMap[ip]
	if !exists {
		if len(rateLimitMap) >= maxEntries {
			return false // shed load when map is at capacity
		}
		rateLimitMap[ip] = &rateLimitEntry{hits: []time.Time{now}, lastSeen: now}
		return true
	}

	windowStart := now.Add(-1 * time.Second)
	kept := entry.hits[:0]
	for _, hitAt := range entry.hits {
		if hitAt.After(windowStart) {
			kept = append(kept, hitAt)
		}
	}
	entry.hits = kept
	entry.lastSeen = now

	if len(entry.hits) >= limit {
		return false
	}
	entry.hits = append(entry.hits, now)
	return true
}

// hasObviousXSSPayload 仅检测明显 XSS 载荷特征（纵深防御）。
// 不再做 SQL 注入关键词黑名单——参数化查询已足够，黑名单只会带来误杀和虚假安全。
func hasObviousXSSPayload(s string) bool {
	lower := strings.ToLower(s)
	patterns := []string{
		"<script",
		"javascript:",
		"onerror=",
		"onload=",
		"onclick=",
	}
	for _, p := range patterns {
		if strings.Contains(lower, p) {
			return true
		}
	}
	return false
}

// CleanupRateLimiter periodically removes expired entries.
func CleanupRateLimiter() {
	ticker := time.NewTicker(5 * time.Minute)
	go func() {
		for range ticker.C {
			rateLimitMutex.Lock()
			now := time.Now()
			for ip, entry := range rateLimitMap {
				if now.Sub(entry.lastSeen) > 2*time.Minute {
					delete(rateLimitMap, ip)
				}
			}
			rateLimitMutex.Unlock()
		}
	}()
}
