package admin

import (
	"bytes"
	"encoding/csv"
	"strings"
)

func sanitizeSpreadsheetCell(value string) string {
	if value == "" {
		return value
	}
	switch value[0] {
	case '=', '+', '-', '@':
		return "'" + value
	default:
		return value
	}
}

func buildCSVContent(rows [][]string) (string, error) {
	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)
	for _, row := range rows {
		sanitized := make([]string, 0, len(row))
		for _, cell := range row {
			sanitized = append(sanitized, sanitizeSpreadsheetCell(strings.ReplaceAll(cell, "\r\n", "\n")))
		}
		if err := writer.Write(sanitized); err != nil {
			return "", err
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return "", err
	}
	return buf.String(), nil
}
