package desktop

import (
	"path/filepath"
	"strings"

	"figaro/internal/vault"
)

// planMentionPaths validates note identities and returns portable vault-index keys.
func planMentionPaths(sourcePath, targetPath string) (string, string, string) {
	sourcePath, err := vault.RelativePath(sourcePath)
	if err != nil || !strings.HasSuffix(strings.ToLower(sourcePath), ".md") {
		return "", "", "A Markdown source note is required"
	}
	targetPath, err = vault.RelativePath(targetPath)
	if err != nil || !strings.HasSuffix(strings.ToLower(targetPath), ".md") {
		return "", "", "A Markdown target note is required"
	}
	sourcePath, targetPath = filepath.ToSlash(sourcePath), filepath.ToSlash(targetPath)
	if sourcePath == targetPath {
		return "", "", "A note cannot link one of its own mentions"
	}
	return sourcePath, targetPath, ""
}
