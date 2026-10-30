package desktop

import (
	"fmt"
	"os"
	"path/filepath"

	"figaro/internal/mutations"
)

// isEditableDiagramPath identifies Figaro's editable SVG formats: Draw.io
// (.drawio.svg) and Excalidraw (.excalidraw.svg). The double extension makes
// them distinguishable from normal SVG assets while preserving normal image
// rendering in Markdown.
func isEditableDiagramPath(path string) bool {
	return mutations.EditableDiagramSuffix(filepath.ToSlash(path)) != ""
}

// ReadDiagram reads an editable Draw.io or Excalidraw SVG. Markdown files
// continue to use ReadFile; the separate method avoids treating arbitrary SVGs
// as text notes.
func (a *App) ReadDiagram(relPath string) (*ReadFileResult, error) {
	if !isEditableDiagramPath(relPath) {
		return nil, fmt.Errorf("not an editable diagram SVG: %s", relPath)
	}

	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()

	cleanRel, err := vaultRelativePath(relPath)
	if err != nil {
		return nil, err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	info, err := root.Stat(cleanRel)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if info.IsDir() {
		return nil, fmt.Errorf("diagram path is a directory: %s", relPath)
	}

	data, err := root.ReadFile(cleanRel)
	if err != nil {
		return nil, err
	}
	return &ReadFileResult{
		Content: string(data),
		Mtime:   a.currentFileVersionLocked(a.vaultAbsolutePath(cleanRel), info),
		Path:    relPath,
	}, nil
}
