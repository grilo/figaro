package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// isDrawioDiagramPath identifies Figaro's canonical editable SVG format. The
// double extension makes editable draw.io diagrams distinguishable from normal
// SVG assets while preserving normal image rendering in Markdown.
func isDrawioDiagramPath(path string) bool {
	return strings.HasSuffix(strings.ToLower(filepath.ToSlash(path)), ".drawio.svg")
}

// ReadDiagram reads an editable draw.io SVG. Markdown files continue to use
// ReadFile; the separate method avoids treating arbitrary SVGs as text notes.
func (a *App) ReadDiagram(relPath string) (*ReadFileResult, error) {
	if !isDrawioDiagramPath(relPath) {
		return nil, fmt.Errorf("not a draw.io SVG: %s", relPath)
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
