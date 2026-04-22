package admin

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	defaultBackupDir = "backups"
	defaultExportDir = "exports"
)

func projectRootDir() (string, error) {
	root, err := os.Getwd()
	if err != nil {
		return "", err
	}
	return filepath.Clean(root), nil
}

func resolveProjectPath(rawPath, fallback string) (string, error) {
	root, err := projectRootDir()
	if err != nil {
		return "", err
	}

	target := strings.TrimSpace(rawPath)
	if target == "" {
		target = fallback
	}
	if !filepath.IsAbs(target) {
		target = filepath.Join(root, target)
	}
	target = filepath.Clean(target)

	if !pathWithinDir(root, target) {
		return "", fmt.Errorf("path must stay within project directory")
	}

	return target, nil
}

func pathWithinDir(root, target string) bool {
	root = filepath.Clean(root)
	target = filepath.Clean(target)

	rel, err := filepath.Rel(root, target)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(os.PathSeparator))
}

func safeRemoveWithinDir(root, target string) error {
	if !pathWithinDir(root, target) {
		return fmt.Errorf("refuse to delete file outside %s", root)
	}
	if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
