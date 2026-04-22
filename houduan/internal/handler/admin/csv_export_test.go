package admin

import (
	"encoding/csv"
	"strings"
	"testing"
)

func TestSanitizeSpreadsheetCellNeutralizesFormulaPrefixes(t *testing.T) {
	cases := map[string]string{
		"=1+1":      "'=1+1",
		"+SUM(A1)":  "'+SUM(A1)",
		"-10+20":    "'-10+20",
		"@cmd":      "'@cmd",
		"normal":    "normal",
		"  =trim?":  "  =trim?",
		"":          "",
	}

	for input, expected := range cases {
		if got := sanitizeSpreadsheetCell(input); got != expected {
			t.Fatalf("sanitizeSpreadsheetCell(%q) = %q, want %q", input, got, expected)
		}
	}
}

func TestBuildCSVContentEscapesAndSanitizesCells(t *testing.T) {
	content, err := buildCSVContent([][]string{
		{"name", "note"},
		{"=HYPERLINK(\"http://evil\")", "hello,world"},
		{"multi\nline", "quote\"me"},
	})
	if err != nil {
		t.Fatalf("buildCSVContent returned error: %v", err)
	}

	reader := csv.NewReader(strings.NewReader(content))
	rows, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("generated CSV is not parseable: %v", err)
	}

	if got, want := rows[1][0], "'=HYPERLINK(\"http://evil\")"; got != want {
		t.Fatalf("expected formula cell to be neutralized, got %q want %q", got, want)
	}
	if got, want := rows[1][1], "hello,world"; got != want {
		t.Fatalf("expected comma cell to survive roundtrip, got %q want %q", got, want)
	}
	if got, want := rows[2][0], "multi\nline"; got != want {
		t.Fatalf("expected newline cell to survive roundtrip, got %q want %q", got, want)
	}
	if got, want := rows[2][1], "quote\"me"; got != want {
		t.Fatalf("expected quote cell to survive roundtrip, got %q want %q", got, want)
	}
}
