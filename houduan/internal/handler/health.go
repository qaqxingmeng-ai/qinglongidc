package handler

import (
	"net/http"
	"runtime"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
)

var startTime = time.Now()

const buildVersion = "1.0.0"

// GET /api/health  (public, cached 10s)
func HealthCheck(c *gin.Context) {
	dbOK := true
	if sqlDB, err := database.DB.DB(); err != nil || sqlDB.Ping() != nil {
		dbOK = false
	}

	status := "ok"
	code := http.StatusOK
	if !dbOK {
		status = "degraded"
		code = http.StatusServiceUnavailable
	}

	c.JSON(code, gin.H{
		"status":    status,
		"db":        dbOK,
		"version":   buildVersion,
		"uptime":    time.Since(startTime).String(),
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// GET /api/admin/health  (admin only, registered under admin group)
func HealthDetailed(c *gin.Context) {
	sqlDB, err := database.DB.DB()
	dbOK := err == nil && sqlDB.Ping() == nil

	var dbStats gin.H
	if err == nil {
		s := sqlDB.Stats()
		dbStats = gin.H{
			"openConnections": s.OpenConnections,
			"inUse":           s.InUse,
			"idle":            s.Idle,
			"maxOpen":         s.MaxOpenConnections,
		}
	}

	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	status := "ok"
	if !dbOK {
		status = "degraded"
	}

	c.JSON(http.StatusOK, gin.H{
		"status":     status,
		"version":    buildVersion,
		"uptime":     time.Since(startTime).String(),
		"goroutines": runtime.NumGoroutine(),
		"memory": gin.H{
			"allocMB":       memStats.Alloc / 1024 / 1024,
			"sysMB":         memStats.Sys / 1024 / 1024,
			"numGC":         memStats.NumGC,
			"lastGCPauseMs": memStats.PauseNs[(memStats.NumGC+255)%256] / 1e6,
		},
		"db":        dbStats,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}
