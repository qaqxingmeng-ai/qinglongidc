package middleware

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func WrapResponse() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Set security headers
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")

		if c.Request.URL.Path == "/ws" {
			c.Next()
			return
		}
		w := &wrappedWriter{
			ResponseWriter: c.Writer,
			body:           &bytes.Buffer{},
		}
		c.Writer = w
		c.Next()

		if w.passthrough {
			return
		}

		if w.body.Len() == 0 {
			return
		}

		ct := w.Header().Get("Content-Type")
		if !strings.Contains(ct, "application/json") {
			w.ResponseWriter.WriteHeader(w.code)
			w.ResponseWriter.Write(w.body.Bytes())
			return
		}

		raw := w.body.Bytes()
		var original interface{}
		if err := json.Unmarshal(raw, &original); err != nil {
			w.ResponseWriter.WriteHeader(w.code)
			w.ResponseWriter.Write(raw)
			return
		}

		if m, ok := original.(map[string]interface{}); ok {
			if _, hasSuccess := m["success"]; hasSuccess {
				w.ResponseWriter.WriteHeader(w.code)
				w.ResponseWriter.Write(raw)
				return
			}
		}

		var wrapped interface{}
		if w.code >= 200 && w.code < 300 {
			wrapped = map[string]interface{}{"success": true, "data": original}
		} else {
			errObj := normalizeError(original)
			wrapped = map[string]interface{}{"success": false, "error": errObj}
		}

		newData, err := json.Marshal(wrapped)
		if err != nil {
			w.ResponseWriter.WriteHeader(w.code)
			w.ResponseWriter.Write(raw)
			return
		}

		w.Header().Set("Content-Length", fmt.Sprintf("%d", len(newData)))
		w.ResponseWriter.WriteHeader(w.code)
		w.ResponseWriter.Write(newData)
	}
}

func normalizeError(original interface{}) map[string]interface{} {
	switch v := original.(type) {
	case string:
		return map[string]interface{}{"code": "ERROR", "message": v}
	case map[string]interface{}:
		result := map[string]interface{}{"code": "ERROR", "message": "请求失败"}
		if msg, ok := v["message"]; ok {
			result["message"] = fmt.Sprintf("%v", msg)
		} else if msg, ok := v["error"]; ok {
			switch m := msg.(type) {
			case string:
				result["message"] = m
			case map[string]interface{}:
				if c, ok := m["code"]; ok {
					result["code"] = fmt.Sprintf("%v", c)
				}
				if mg, ok := m["message"]; ok {
					result["message"] = fmt.Sprintf("%v", mg)
				}
			default:
				result["message"] = fmt.Sprintf("%v", m)
			}
		}
		if c, ok := v["code"]; ok {
			result["code"] = fmt.Sprintf("%v", c)
		}
		return result
	default:
		return map[string]interface{}{"code": "ERROR", "message": fmt.Sprintf("%v", original)}
	}
}

type wrappedWriter struct {
	gin.ResponseWriter
	body *bytes.Buffer
	code int
	passthrough bool
}

func (w *wrappedWriter) WriteHeader(code int) {
	w.code = code
	if w.shouldPassthrough() {
		w.passthrough = true
		w.ResponseWriter.WriteHeader(code)
	}
}

func (w *wrappedWriter) Write(data []byte) (int, error) {
	if w.code == 0 {
		w.code = http.StatusOK
	}
	if w.shouldPassthrough() {
		w.passthrough = true
		if !w.ResponseWriter.Written() {
			w.ResponseWriter.WriteHeader(w.code)
		}
		return w.ResponseWriter.Write(data)
	}
	return w.body.Write(data)
}

func (w *wrappedWriter) WriteString(s string) (int, error) {
	return w.Write([]byte(s))
}

func (w *wrappedWriter) Flush() {
	if flusher, ok := w.ResponseWriter.(http.Flusher); ok {
		if w.shouldPassthrough() {
			w.passthrough = true
			if w.body.Len() > 0 {
				if !w.ResponseWriter.Written() {
					w.ResponseWriter.WriteHeader(w.codeOrOK())
				}
				_, _ = io.Copy(w.ResponseWriter, w.body)
				w.body.Reset()
			}
			flusher.Flush()
			return
		}
	}
}

func (w *wrappedWriter) codeOrOK() int {
	if w.code == 0 {
		return http.StatusOK
	}
	return w.code
}

func (w *wrappedWriter) shouldPassthrough() bool {
	header := w.Header()
	if strings.TrimSpace(header.Get("Content-Disposition")) != "" {
		return true
	}
	ct := strings.ToLower(strings.TrimSpace(header.Get("Content-Type")))
	if ct == "" {
		return false
	}
	if strings.Contains(ct, "application/json") {
		return false
	}
	return true
}
