package service

import (
	"strconv"
	"strings"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

func loadRuntimeSettings(keys ...string) map[string]string {
	values := make(map[string]string, len(keys))
	if len(keys) == 0 || database.DB == nil {
		return values
	}

	var rows []model.SystemSetting
	if err := database.DB.Where("key IN ?", keys).Find(&rows).Error; err != nil {
		return values
	}

	for _, row := range rows {
		values[row.Key] = strings.TrimSpace(row.Value)
	}
	return values
}

func runtimeSettingOr(values map[string]string, key, fallback string) string {
	if value, ok := values[key]; ok && value != "" {
		return value
	}
	return fallback
}

func parseRuntimeBool(value string, fallback bool) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "true", "1", "yes", "on":
		return true
	case "false", "0", "no", "off":
		return false
	default:
		return fallback
	}
}

func parseRuntimeInt(value string, fallback int) int {
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return fallback
	}
	return parsed
}
