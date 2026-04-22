package middleware

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestTrustedClientIPRejectsBFFProxyRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest("GET", "/", nil)
	c.Request.RemoteAddr = "127.0.0.1:12345"
	c.Request.Header.Set(proxyModeHeader, nextBFFProxyMode)
	c.Request.Header.Set(deviceHeaderName, "device-123")

	if ip, ok := TrustedClientIP(c); ok || ip != "" {
		t.Fatalf("expected proxied request to have no trusted client IP, got %q ok=%v", ip, ok)
	}
	if key := ClientNetworkKey(c); key != "device:device-123" {
		t.Fatalf("expected device-based network key, got %q", key)
	}
}
