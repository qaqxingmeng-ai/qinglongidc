package admin

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/config"
	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type BackupHandler struct {
	cfg *config.Config
}

func NewBackupHandler(cfg *config.Config) *BackupHandler { return &BackupHandler{cfg: cfg} }

func sanitizePostgresURL(dbURL string) (string, string, error) {
	parsed, err := url.Parse(dbURL)
	if err != nil {
		return "", "", err
	}
	if parsed.User == nil {
		return dbURL, "", nil
	}

	password, _ := parsed.User.Password()
	if password == "" {
		parsed.User = url.User(parsed.User.Username())
		return parsed.String(), "", nil
	}

	parsed.User = url.User(parsed.User.Username())
	return parsed.String(), password, nil
}

func buildPgDumpCommand(ctx context.Context, dbURL, filePath string) (*exec.Cmd, error) {
	sanitizedURL, password, err := sanitizePostgresURL(dbURL)
	if err != nil {
		return nil, err
	}

	var cmd *exec.Cmd
	if ctx != nil {
		cmd = exec.CommandContext(ctx, "pg_dump", "--no-password", "-f", filePath, sanitizedURL)
	} else {
		cmd = exec.Command("pg_dump", "--no-password", "-f", filePath, sanitizedURL)
	}
	cmd.Env = os.Environ()
	if password != "" {
		cmd.Env = append(cmd.Env, "PGPASSWORD="+password)
	}
	return cmd, nil
}

// backupDir returns the configured backup directory from SystemSetting, constrained to the project root.
func backupDir() (string, error) {
	var s model.SystemSetting
	if err := database.DB.First(&s, "key = ?", "backup_dir").Error; err == nil && s.Value != "" {
		return resolveProjectPath(s.Value, defaultBackupDir)
	}
	return resolveProjectPath("", defaultBackupDir)
}

func validateBackupRecordPath(record model.BackupRecord) (string, string, error) {
	dir, err := backupDir()
	if err != nil {
		return "", "", err
	}

	target := filepath.Join(dir, filepath.Base(record.Filename))
	if filepath.Base(record.Filename) == "" || !pathWithinDir(dir, target) {
		return "", "", fmt.Errorf("invalid backup filename")
	}
	if record.FilePath != "" {
		candidate := filepath.Clean(record.FilePath)
		if candidate != target {
			return "", "", fmt.Errorf("backup path mismatch")
		}
	}

	return dir, target, nil
}

// GET /api/admin/backups?page=&pageSize=
func (h *BackupHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	var total int64
	database.DB.Model(&model.BackupRecord{}).Count(&total)

	var records []model.BackupRecord
	database.DB.Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&records)

	c.JSON(http.StatusOK, gin.H{
		"records":  records,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// POST /api/admin/backups  — trigger manual pg_dump
func (h *BackupHandler) Create(c *gin.Context) {
	operatorID := middleware.GetUserID(c)

	dbURL := h.cfg.DatabaseURL
	if dbURL == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": "DATABASE_URL 未配置"}})
		return
	}

	dir, err := backupDir()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "备份目录配置无效，必须位于项目目录内"}})
		return
	}
	if err := os.MkdirAll(dir, 0750); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": "备份目录创建失败"}})
		return
	}

	filename := fmt.Sprintf("backup_%s.sql", time.Now().Format("20060102_150405"))
	filePath := filepath.Join(dir, filename)

	// Create record in RUNNING state
	record := model.BackupRecord{
		ID:        service.GenerateID(),
		Filename:  filename,
		FilePath:  filePath,
		Status:    "RUNNING",
		Trigger:   "MANUAL",
		CreatedBy: &operatorID,
		CreatedAt: time.Now(),
	}
	database.DB.Create(&record)

	// Run pg_dump asynchronously with timeout
	go func(rec model.BackupRecord, dbURL, filePath string) {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()

		cmd, err := buildPgDumpCommand(ctx, dbURL, filePath)
		if err != nil {
			errMsg := err.Error()
			database.DB.Model(&model.BackupRecord{}).Where("id = ?", rec.ID).Updates(map[string]interface{}{
				"status":    "FAILED",
				"error_msg": errMsg,
			})
			return
		}
		if err := cmd.Run(); err != nil {
			errMsg := err.Error()
			database.DB.Model(&model.BackupRecord{}).Where("id = ?", rec.ID).Updates(map[string]interface{}{
				"status":    "FAILED",
				"error_msg": errMsg,
			})
			return
		}
		// Get file size
		info, _ := os.Stat(filePath)
		var size int64
		if info != nil {
			size = info.Size()
		}
		database.DB.Model(&model.BackupRecord{}).Where("id = ?", rec.ID).Updates(map[string]interface{}{
			"status":     "SUCCESS",
			"size_bytes": size,
		})
	}(record, dbURL, filePath)

	c.JSON(http.StatusOK, gin.H{"record": record})
}

// GET /api/admin/backups/:id/download
func (h *BackupHandler) Download(c *gin.Context) {
	id := c.Param("id")
	var record model.BackupRecord
	if err := database.DB.First(&record, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"message": "备份记录不存在"}})
		return
	}
	if record.Status != "SUCCESS" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "备份尚未完成或已失败"}})
		return
	}

	_, targetPath, err := validateBackupRecordPath(record)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "备份文件路径异常"}})
		return
	}

	f, err := os.Open(targetPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": "文件读取失败"}})
		return
	}
	defer f.Close()

	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, record.Filename))
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Length", strconv.FormatInt(record.SizeBytes, 10))
	c.Status(http.StatusOK)
	io.Copy(c.Writer, f)
}

// DELETE /api/admin/backups/:id
func (h *BackupHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	var record model.BackupRecord
	if err := database.DB.First(&record, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"message": "备份记录不存在"}})
		return
	}

	dir, targetPath, err := validateBackupRecordPath(record)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "备份文件路径异常，已拒绝删除"}})
		return
	}
	if err := safeRemoveWithinDir(dir, targetPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": "备份文件删除失败"}})
		return
	}

	database.DB.Delete(&model.BackupRecord{}, "id = ?", id)
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// RunAutoBackup is called by cron: pg_dump + keep latest 30 backups.
func RunAutoBackup(cfg *config.Config) {
	dbURL := cfg.DatabaseURL
	if dbURL == "" {
		return
	}

	dir, err := backupDir()
	if err != nil {
		log.Printf("[backup] invalid backup dir: %v", err)
		return
	}
	if err := os.MkdirAll(dir, 0750); err != nil {
		return
	}

	filename := fmt.Sprintf("backup_%s_auto.sql", time.Now().Format("20060102_150405"))
	filePath := filepath.Join(dir, filename)

	record := model.BackupRecord{
		ID:        service.GenerateID(),
		Filename:  filename,
		FilePath:  filePath,
		Status:    "RUNNING",
		Trigger:   "AUTO",
		CreatedAt: time.Now(),
	}
	database.DB.Create(&record)

	cmd, err := buildPgDumpCommand(nil, dbURL, filePath)
	if err != nil {
		errMsg := err.Error()
		database.DB.Model(&model.BackupRecord{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
			"status":    "FAILED",
			"error_msg": errMsg,
		})
		return
	}
	if err := cmd.Run(); err != nil {
		errMsg := err.Error()
		database.DB.Model(&model.BackupRecord{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
			"status":    "FAILED",
			"error_msg": errMsg,
		})
		return
	}

	info, _ := os.Stat(filePath)
	var size int64
	if info != nil {
		size = info.Size()
	}
	database.DB.Model(&model.BackupRecord{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
		"status":     "SUCCESS",
		"size_bytes": size,
	})

	// Keep only 30 newest successful backups; delete older ones
	var old []model.BackupRecord
	database.DB.Where("status = ? AND trigger = ?", "SUCCESS", "AUTO").
		Order("created_at ASC").
		Find(&old)

	if len(old) > 30 {
		for _, r := range old[:len(old)-30] {
			if _, targetPath, err := validateBackupRecordPath(r); err != nil {
				log.Printf("[backup] skip unsafe cleanup for %s: %v", r.ID, err)
				continue
			} else if err := safeRemoveWithinDir(dir, targetPath); err != nil {
				log.Printf("[backup] failed to remove %s: %v", targetPath, err)
				continue
			}
			database.DB.Delete(&model.BackupRecord{}, "id = ?", r.ID)
		}
	}
}
