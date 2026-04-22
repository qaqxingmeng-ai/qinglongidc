package handler

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

func TestRedeemHonorsPerUserLimitAcrossMultipleClaims(t *testing.T) {
	restore := setupTempPostgresDB(t)
	defer restore()

	gin.SetMode(gin.TestMode)

	now := time.Now()
	user := model.User{
		ID:        "user_coupon_limit",
		NumericID: 20001,
		Email:     "coupon-limit@example.com",
		Password:  "hashed",
		Name:      "Coupon Limit User",
		Role:      "USER",
		Level:     "GUEST",
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := database.DB.Create(&user).Error; err != nil {
		t.Fatalf("failed to seed user: %v", err)
	}

	coupon := model.Coupon{
		ID:           "coupon_limit_twice",
		Code:         "LIMIT2",
		Name:         "limit two",
		Type:         "FIXED",
		Value:        10,
		StartAt:      now.Add(-time.Hour),
		EndAt:        now.Add(time.Hour),
		TotalCount:   -1,
		PerUserLimit: 2,
		IsActive:     true,
		Scope:        "ALL",
		ScopeIds:     "[]",
		CreatedBy:    "admin",
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := database.DB.Create(&coupon).Error; err != nil {
		t.Fatalf("failed to seed coupon: %v", err)
	}

	handler := NewCouponHandler()

	first := performRedeemRequest(t, handler, user.ID, `{"code":"LIMIT2"}`)
	if first.Code != http.StatusOK {
		t.Fatalf("first redeem failed: status=%d body=%s", first.Code, first.Body.String())
	}

	second := performRedeemRequest(t, handler, user.ID, `{"code":"LIMIT2"}`)
	if second.Code != http.StatusOK {
		t.Fatalf("second redeem should be allowed when perUserLimit=2: status=%d body=%s", second.Code, second.Body.String())
	}

	third := performRedeemRequest(t, handler, user.ID, `{"code":"LIMIT2"}`)
	if third.Code != http.StatusConflict {
		t.Fatalf("third redeem should be rejected after reaching perUserLimit: status=%d body=%s", third.Code, third.Body.String())
	}

	var count int64
	if err := database.DB.Model(&model.UserCoupon{}).Where("user_id = ? AND coupon_id = ?", user.ID, coupon.ID).Count(&count).Error; err != nil {
		t.Fatalf("failed to count user coupons: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected exactly 2 coupon claims, got %d", count)
	}
}

func TestRedeemDoesNotResetLimitWhenPreviousClaimExpired(t *testing.T) {
	restore := setupTempPostgresDB(t)
	defer restore()

	gin.SetMode(gin.TestMode)

	now := time.Now()
	user := model.User{
		ID:        "user_coupon_expired",
		NumericID: 20002,
		Email:     "coupon-expired@example.com",
		Password:  "hashed",
		Name:      "Coupon Expired User",
		Role:      "USER",
		Level:     "GUEST",
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := database.DB.Create(&user).Error; err != nil {
		t.Fatalf("failed to seed user: %v", err)
	}

	coupon := model.Coupon{
		ID:           "coupon_limit_once",
		Code:         "LIMIT1",
		Name:         "limit one",
		Type:         "FIXED",
		Value:        10,
		StartAt:      now.Add(-time.Hour),
		EndAt:        now.Add(time.Hour),
		TotalCount:   -1,
		PerUserLimit: 1,
		IsActive:     true,
		Scope:        "ALL",
		ScopeIds:     "[]",
		CreatedBy:    "admin",
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := database.DB.Create(&coupon).Error; err != nil {
		t.Fatalf("failed to seed coupon: %v", err)
	}

	expiredAt := now.Add(-2 * time.Hour)
	if err := database.DB.Create(&model.UserCoupon{
		ID:        "expired_claim",
		UserID:    user.ID,
		CouponID:  coupon.ID,
		Status:    "EXPIRED",
		UsedAt:    &expiredAt,
		CreatedAt: now.Add(-24 * time.Hour),
		UpdatedAt: now.Add(-24 * time.Hour),
	}).Error; err != nil {
		t.Fatalf("failed to seed expired coupon claim: %v", err)
	}

	handler := NewCouponHandler()
	res := performRedeemRequest(t, handler, user.ID, `{"code":"LIMIT1"}`)
	if res.Code != http.StatusConflict {
		t.Fatalf("expired history should still count toward perUserLimit: status=%d body=%s", res.Code, res.Body.String())
	}
}

func performRedeemRequest(t *testing.T, h *CouponHandler, userID, body string) *httptest.ResponseRecorder {
	t.Helper()

	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/dashboard/coupons/redeem", bytes.NewBufferString(body))
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("userId", userID)

	h.Redeem(ctx)
	return rec
}

func setupTempPostgresDB(t *testing.T) func() {
	t.Helper()

	originalDB := database.DB
	originalURL := os.Getenv("DATABASE_URL")
	if originalURL == "" {
		loadEnvForTests(t)
		originalURL = os.Getenv("DATABASE_URL")
	}
	if originalURL == "" {
		t.Fatal("DATABASE_URL is required for coupon integration tests")
	}

	adminDB, err := sql.Open("pgx", originalURL)
	if err != nil {
		t.Fatalf("failed to open admin connection: %v", err)
	}

	dbName := fmt.Sprintf("serverai_coupon_test_%d", time.Now().UnixNano())
	if _, err := adminDB.Exec(`CREATE DATABASE ` + quoteIdentifier(dbName)); err != nil {
		t.Fatalf("failed to create test database: %v", err)
	}

	testURL := replaceDatabaseName(t, originalURL, dbName)
	os.Setenv("DATABASE_URL", testURL)

	if err := database.Connect(testURL); err != nil {
		t.Fatalf("failed to connect test database: %v", err)
	}
	if err := database.Migrate(); err != nil {
		t.Fatalf("failed to migrate test database: %v", err)
	}

	return func() {
		if database.DB != nil {
			if sqlDB, err := database.DB.DB(); err == nil {
				_ = sqlDB.Close()
			}
		}
		os.Setenv("DATABASE_URL", originalURL)
		database.DB = originalDB

		_, _ = adminDB.Exec(`
			SELECT pg_terminate_backend(pid)
			FROM pg_stat_activity
			WHERE datname = $1 AND pid <> pg_backend_pid()
		`, dbName)
		_, _ = adminDB.Exec(`DROP DATABASE IF EXISTS ` + quoteIdentifier(dbName))
		_ = adminDB.Close()
	}
}

func loadEnvForTests(t *testing.T) {
	t.Helper()

	for _, path := range []string{
		"/Users/xingmeng/.config/serverai/backend.env",
		"/Users/xingmeng/Desktop/yuanma/houduan/.env.local",
		"/Users/xingmeng/Desktop/yuanma/houduan/.env",
	} {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		lines := strings.Split(string(data), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") || !strings.Contains(line, "=") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			_ = os.Setenv(strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]))
		}
	}
}

func replaceDatabaseName(t *testing.T, rawURL, dbName string) string {
	t.Helper()

	parsed, err := url.Parse(rawURL)
	if err != nil {
		t.Fatalf("failed to parse DATABASE_URL: %v", err)
	}
	parsed.Path = "/" + dbName
	return parsed.String()
}

func quoteIdentifier(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

func decodeJSONBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()

	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}
	return payload
}
