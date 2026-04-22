package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

func TestTrackRefUsesVisitorKeyAndReturnsJSONRedirect(t *testing.T) {
	restore := setupTempPostgresDB(t)
	defer restore()

	gin.SetMode(gin.TestMode)

	now := time.Now()
	code := "REF123"
	agent := model.User{
		ID:         "agent_ref_test",
		NumericID:  30001,
		Email:      "agent-ref@example.com",
		Password:   "hashed",
		Name:       "Agent Ref",
		Role:       "AGENT",
		Level:      "GUEST",
		InviteCode: &code,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := database.DB.Create(&agent).Error; err != nil {
		t.Fatalf("failed to seed agent: %v", err)
	}

	handler := NewAgentHandler()

	makeRequest := func() *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Params = gin.Params{{Key: "code", Value: code}}
		ctx.Request = httptest.NewRequest(http.MethodGet, "/api/ref/"+code+"?format=json", nil)
		ctx.Request.Header.Set("Accept", "application/json")
		ctx.Request.Header.Set("X-Proxy-Mode", "next-bff")
		ctx.Request.Header.Set("X-Device-Id", "visitor-abc")
		handler.TrackRef(ctx)
		return rec
	}

	first := makeRequest()
	if first.Code != http.StatusOK {
		t.Fatalf("expected first request to succeed, got %d body=%s", first.Code, first.Body.String())
	}
	second := makeRequest()
	if second.Code != http.StatusOK {
		t.Fatalf("expected second request to succeed, got %d body=%s", second.Code, second.Body.String())
	}

	var rows []model.PromoClick
	if err := database.DB.Order("created_at asc").Find(&rows).Error; err != nil {
		t.Fatalf("failed to query promo clicks: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected 2 promo click rows, got %d", len(rows))
	}
	if rows[0].VisitorKey != "device:visitor-abc" || rows[1].VisitorKey != "device:visitor-abc" {
		t.Fatalf("expected visitor key to be device-based, got %+v", rows)
	}
	if !rows[0].IsUnique {
		t.Fatalf("expected first click to be unique")
	}
	if rows[1].IsUnique {
		t.Fatalf("expected second click to be non-unique for same visitor key")
	}
}
