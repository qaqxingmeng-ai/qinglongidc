package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	proxyModeHeader  = "X-Proxy-Mode"
	nextBFFProxyMode = "next-bff"
	deviceHeaderName = "X-Device-Id"
)

func IsBFFProxyRequest(c *gin.Context) bool {
	return strings.EqualFold(strings.TrimSpace(c.GetHeader(proxyModeHeader)), nextBFFProxyMode)
}

func TrustedClientIP(c *gin.Context) (string, bool) {
	if IsBFFProxyRequest(c) {
		return "", false
	}
	ip := strings.TrimSpace(c.ClientIP())
	return ip, ip != ""
}

func ClientNetworkKey(c *gin.Context) string {
	if ip, ok := TrustedClientIP(c); ok {
		return "ip:" + ip
	}
	if deviceID := strings.TrimSpace(c.GetHeader(deviceHeaderName)); deviceID != "" {
		return "device:" + deviceID
	}
	return "proxy"
}

func ClientIPForStorage(c *gin.Context) string {
	if ip, ok := TrustedClientIP(c); ok {
		return ip
	}
	return ""
}
