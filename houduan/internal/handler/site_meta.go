package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

func SiteMeta(c *gin.Context) {
	var rows []model.SystemSetting
	database.DB.Where("key IN ?", []string{"site_name", "site_subtitle"}).Find(&rows)

	values := map[string]string{}
	for _, row := range rows {
		values[row.Key] = strings.TrimSpace(row.Value)
	}

	siteName := values["site_name"]
	if siteName == "" {
		siteName = "ServerAI"
	}

	siteSubtitle := values["site_subtitle"]
	if siteSubtitle == "" {
		siteSubtitle = "智能服务器平台"
	}

	c.JSON(http.StatusOK, gin.H{
		"siteName":     siteName,
		"siteSubtitle": siteSubtitle,
	})
}