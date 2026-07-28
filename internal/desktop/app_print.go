package desktop

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ============================================================================
// 10. Interactive PDF export helpers
// ============================================================================

func (a *App) resolvePrintStylesheet(sourceDir string, stylesheetRef string) (string, error) {
	ref := strings.TrimSpace(strings.ReplaceAll(stylesheetRef, "\\", "/"))
	if ref == "" {
		return "", fmt.Errorf("print stylesheet is empty")
	}
	lowerRef := strings.ToLower(ref)
	if strings.HasPrefix(ref, "/") || strings.HasPrefix(ref, "//") ||
		strings.Contains(lowerRef, "://") || strings.HasPrefix(lowerRef, "file:") ||
		(len(ref) > 1 && ref[1] == ':') {
		return "", fmt.Errorf("print stylesheet must be a vault-local relative CSS path")
	}
	if !strings.EqualFold(filepath.Ext(ref), ".css") {
		return "", fmt.Errorf("print stylesheet must reference a .css file")
	}

	return vaultRelativePath(filepath.ToSlash(filepath.Join(sourceDir, filepath.FromSlash(ref))))
}

func readPrintCSS(root *os.Root, rel string, label string, required bool) (string, error) {
	cssData, err := root.ReadFile(rel)
	if err != nil {
		if !required && os.IsNotExist(err) {
			return "", nil
		}
		if os.IsNotExist(err) {
			return "", fmt.Errorf("%s was not found", label)
		}
		return "", fmt.Errorf("read %s: %v", label, err)
	}
	if isBinaryFileContent(cssData) {
		return "", fmt.Errorf("%s must be a UTF-8 CSS file", label)
	}
	return string(cssData), nil
}
