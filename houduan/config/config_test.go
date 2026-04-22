package config

import "testing"

func TestValidateServerRuntimeRejectsPlaceholders(t *testing.T) {
	cfg := &Config{
		DatabaseURL:    "postgres://serverai:change-me@localhost:5432/serverai?sslmode=disable",
		JWTSecret:      "replace-with-a-strong-32-char-secret",
		InternalAPIKey: "replace-with-a-private-internal-key",
	}

	if err := ValidateServerRuntime(cfg); err == nil {
		t.Fatalf("expected placeholder config to be rejected")
	}
}

func TestValidateServerRuntimeAcceptsRealisticSecrets(t *testing.T) {
	cfg := &Config{
		DatabaseURL:    "postgres://serverai:db-example-secret-1234567890@localhost:5432/serverai?sslmode=disable",
		JWTSecret:      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		InternalAPIKey: "internal-key-example-1234567890abcdef",
	}

	if err := ValidateServerRuntime(cfg); err != nil {
		t.Fatalf("expected realistic config to pass validation: %v", err)
	}
}
