package config

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	// Server
	Port string
	// Trust forwarding headers only from these proxy CIDRs / IPs
	TrustedProxies []string

	// Database
	DatabaseURL string

	// JWT
	JWTSecret string

	// Internal API Key (BFF -> Go)
	InternalAPIKey string

	// OpenAI
	OpenAIKey               string
	OpenAIBaseURL           string
	OpenAIModel             string
	OpenAISelectorModel     string
	OpenAIFallbackModel     string
	ReasoningEffort         string
	SelectorReasoningEffort string

	// SMTP
	SMTPHost     string
	SMTPPort     string
	SMTPUser     string
	SMTPPassword string
	SMTPFrom     string
	AdminEmail   string

	// WAF
	WAFEnabled      bool
	IPWhitelist     []string
	IPBlacklist     []string
	RateLimitPerSec int
	MaxBodyBytes    int64

	// CORS
	AllowedOrigins []string

	// Cookie
	CookieSecure bool
	CookieDomain string

	// Web Push
	WebPushPublicKey  string
	WebPushPrivateKey string
	WebPushSubject    string
}

func Load() *Config {
	return &Config{
		Port:           envOr("PORT", "8080"),
		TrustedProxies: splitCSV(envOr("TRUSTED_PROXIES", "127.0.0.1,::1")),
		DatabaseURL:    envOr("DATABASE_URL", "postgres://serverai:serverai@localhost:5432/serverai?sslmode=disable"),
		JWTSecret:      mustJWTSecret(),

		InternalAPIKey: envOr("INTERNAL_API_KEY", ""),

		OpenAIKey:               os.Getenv("OPENAI_API_KEY"),
		OpenAIBaseURL:           envOr("OPENAI_BASE_URL", "https://api.openai.com/v1"),
		OpenAIModel:             envOr("OPENAI_MODEL", "gpt-4o"),
		OpenAISelectorModel:     envOr("OPENAI_SELECTOR_MODEL", ""),
		OpenAIFallbackModel:     envOr("OPENAI_FALLBACK_MODEL", "gpt-4o-mini"),
		ReasoningEffort:         envOr("OPENAI_REASONING_EFFORT", "high"),
		SelectorReasoningEffort: envOr("OPENAI_SELECTOR_REASONING_EFFORT", ""),

		SMTPHost:     os.Getenv("SMTP_HOST"),
		SMTPPort:     envOr("SMTP_PORT", "587"),
		SMTPUser:     os.Getenv("SMTP_USER"),
		SMTPPassword: os.Getenv("SMTP_PASSWORD"),
		SMTPFrom:     os.Getenv("SMTP_FROM"),
		AdminEmail:   os.Getenv("ADMIN_EMAIL"),

		WAFEnabled:      envOr("WAF_ENABLED", "true") == "true",
		IPWhitelist:     splitCSV(os.Getenv("WAF_IP_WHITELIST")),
		IPBlacklist:     splitCSV(os.Getenv("WAF_IP_BLACKLIST")),
		RateLimitPerSec: envInt("WAF_RATE_LIMIT_PER_SEC", 60),
		MaxBodyBytes:    envInt64("WAF_MAX_BODY_BYTES", 25*1024*1024),

		AllowedOrigins: splitCSV(envOr("CORS_ALLOWED_ORIGINS", "http://localhost:3000")),

		CookieSecure: envOr("COOKIE_SECURE", "false") == "true",
		CookieDomain: os.Getenv("COOKIE_DOMAIN"),

		WebPushPublicKey:  os.Getenv("WEB_PUSH_PUBLIC_KEY"),
		WebPushPrivateKey: os.Getenv("WEB_PUSH_PRIVATE_KEY"),
		WebPushSubject:    os.Getenv("WEB_PUSH_SUBJECT"),
	}
}

func ValidateServerRuntime(cfg *Config) error {
	if cfg == nil {
		return fmt.Errorf("missing config")
	}
	if isPlaceholderDatabaseURL(cfg.DatabaseURL) {
		return fmt.Errorf("DATABASE_URL is missing or still uses a placeholder/default credential")
	}
	if isPlaceholderSecret(cfg.JWTSecret) {
		return fmt.Errorf("JWT_SECRET is missing or still uses a placeholder value")
	}
	if isPlaceholderSecret(cfg.InternalAPIKey) {
		return fmt.Errorf("INTERNAL_API_KEY is missing or still uses a placeholder value")
	}
	return nil
}

// mustJWTSecret 确保生产环境必须显式配置强 JWT 密钥，默认弱密钥仅允许 APP_ENV=development。
func mustJWTSecret() string {
	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	env := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	if secret == "" || secret == "change-me-in-production" {
		if env == "development" || env == "dev" || env == "" && os.Getenv("GO_TEST") != "" {
			log.Println("[WARN] JWT_SECRET 未设置，使用开发环境临时密钥")
			return "change-me-in-production"
		}
		log.Fatal("[FATAL] JWT_SECRET 未设置或为默认弱密钥，拒绝启动；请在环境变量中配置强随机密钥")
	}
	if len(secret) < 32 {
		log.Fatal("[FATAL] JWT_SECRET 长度不足 32 字符，拒绝启动")
	}
	return secret
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func envInt64(key string, fallback int64) int64 {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return fallback
	}
	return n
}

func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

func isPlaceholderSecret(value string) bool {
	v := strings.ToLower(strings.TrimSpace(value))
	if v == "" {
		return true
	}
	for _, marker := range []string{
		"change-me",
		"replace-with",
		"your-internal-api-key",
		"your-internal",
		"your-",
		"dev-internal-key-12345",
	} {
		if strings.Contains(v, marker) {
			return true
		}
	}
	return false
}

func isPlaceholderDatabaseURL(value string) bool {
	v := strings.ToLower(strings.TrimSpace(value))
	if v == "" {
		return true
	}
	if strings.Contains(v, "change-me") || strings.Contains(v, "replace-with") {
		return true
	}
	return v == "postgres://serverai:serverai@localhost:5432/serverai?sslmode=disable"
}
