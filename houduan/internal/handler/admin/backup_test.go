package admin

import (
	"context"
	"strings"
	"testing"
)

func TestSanitizePostgresURLRemovesPassword(t *testing.T) {
	raw := "postgres://alice:super-secret@localhost:5432/serverai?sslmode=disable"

	sanitized, password, err := sanitizePostgresURL(raw)
	if err != nil {
		t.Fatalf("sanitizePostgresURL returned error: %v", err)
	}
	if password != "super-secret" {
		t.Fatalf("expected password to be extracted, got %q", password)
	}
	if strings.Contains(sanitized, "super-secret") {
		t.Fatalf("sanitized URL still contains original password: %s", sanitized)
	}
	if !strings.Contains(sanitized, "postgres://alice@localhost:5432/serverai?sslmode=disable") {
		t.Fatalf("sanitized URL did not preserve connection target: %s", sanitized)
	}
}

func TestBuildPgDumpCommandUsesPGPASSWORD(t *testing.T) {
	raw := "postgres://alice:super-secret@localhost:5432/serverai?sslmode=disable"

	cmd, err := buildPgDumpCommand(context.Background(), raw, "/tmp/backup.sql")
	if err != nil {
		t.Fatalf("buildPgDumpCommand returned error: %v", err)
	}

	if got := strings.Join(cmd.Args, " "); strings.Contains(got, "super-secret") {
		t.Fatalf("pg_dump command args still leak password: %s", got)
	}
	if !strings.Contains(strings.Join(cmd.Args, " "), "postgres://alice@localhost:5432/serverai?sslmode=disable") {
		t.Fatalf("pg_dump command args do not include sanitized URL: %v", cmd.Args)
	}

	found := false
	for _, entry := range cmd.Env {
		if entry == "PGPASSWORD=super-secret" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected PGPASSWORD to be set in command env")
	}
}
