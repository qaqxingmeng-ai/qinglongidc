package middleware

import (
	"bytes"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestWrappedWriterPassthroughsAttachmentWritesImmediately(t *testing.T) {
	gin.SetMode(gin.TestMode)

	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)

	writer := &wrappedWriter{
		ResponseWriter: ctx.Writer,
		body:           &bytes.Buffer{},
	}
	writer.Header().Set("Content-Disposition", `attachment; filename="report.csv"`)
	writer.Header().Set("Content-Type", "text/csv; charset=utf-8")

	if _, err := writer.Write([]byte("id,name\n1,alice\n")); err != nil {
		t.Fatalf("writer.Write returned error: %v", err)
	}

	if got := rec.Body.String(); got != "id,name\n1,alice\n" {
		t.Fatalf("expected attachment body to be written through immediately, got %q", got)
	}
	if writer.body.Len() != 0 {
		t.Fatalf("expected passthrough attachment writes to avoid buffering, buffered %d bytes", writer.body.Len())
	}
}

func TestWrapResponseStillWrapsJSONPayloads(t *testing.T) {
	gin.SetMode(gin.TestMode)

	r := gin.New()
	r.Use(WrapResponse())
	r.GET("/json", func(c *gin.Context) {
		c.JSON(200, gin.H{"hello": "world"})
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/json", nil)
	r.ServeHTTP(rec, req)

	want := `{"data":{"hello":"world"},"success":true}`
	if got := rec.Body.String(); got != want {
		t.Fatalf("unexpected wrapped body: got %s want %s", got, want)
	}
}
