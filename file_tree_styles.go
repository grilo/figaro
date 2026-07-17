package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	fileTreeStylesPath    = ".config/file-tree-styles.json"
	fileTreeStylesVersion = 1
	maxRecentTreeIcons    = 10
)

var (
	fileTreeIconNameRE = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9]*$`)
	fileTreeColors     = map[string]struct{}{
		"#ef4444": {}, "#f97316": {}, "#f59e0b": {}, "#eab308": {},
		"#22c55e": {}, "#14b8a6": {}, "#3b82f6": {}, "#6366f1": {},
		"#a855f7": {}, "#ec4899": {}, "#6b7280": {},
	}
)

// FileTreeStyle is one path-specific visual override. Empty fields retain the
// normal file/folder icon or inherited theme color.
type FileTreeStyle struct {
	Icon  string `json:"icon,omitempty"`
	Color string `json:"color,omitempty"`
}

// FileTreeStyles is vault-scoped because entry paths and their presentation
// should travel together when the vault is moved to another computer.
type FileTreeStyles struct {
	Version     int                      `json:"version"`
	Entries     map[string]FileTreeStyle `json:"entries"`
	RecentIcons []string                 `json:"recent_icons,omitempty"`
}

func defaultFileTreeStyles() *FileTreeStyles {
	return &FileTreeStyles{Version: fileTreeStylesVersion, Entries: make(map[string]FileTreeStyle)}
}

func normalizeFileTreeStyle(style FileTreeStyle) (FileTreeStyle, error) {
	style.Icon = strings.TrimSpace(style.Icon)
	style.Color = strings.ToLower(strings.TrimSpace(style.Color))
	if style.Icon != "" && !fileTreeIconNameRE.MatchString(style.Icon) {
		return FileTreeStyle{}, fmt.Errorf("invalid Lucide icon name %q", style.Icon)
	}
	if style.Color != "" {
		if _, ok := fileTreeColors[style.Color]; !ok {
			return FileTreeStyle{}, fmt.Errorf("unsupported file-tree color %q", style.Color)
		}
	}
	return style, nil
}

func (a *App) loadFileTreeStylesLocked() (*FileTreeStyles, error) {
	data, err := a.readVaultFile(fileTreeStylesPath)
	if os.IsNotExist(err) {
		return defaultFileTreeStyles(), nil
	}
	if err != nil {
		return nil, err
	}
	styles := defaultFileTreeStyles()
	if err := json.Unmarshal(data, styles); err != nil {
		return nil, fmt.Errorf("parse file-tree styles: %w", err)
	}
	if styles.Version != fileTreeStylesVersion {
		return nil, fmt.Errorf("unsupported file-tree styles version %d", styles.Version)
	}
	if styles.Entries == nil {
		styles.Entries = make(map[string]FileTreeStyle)
	}
	return styles, nil
}

func (a *App) saveFileTreeStylesLocked(styles *FileTreeStyles) error {
	styles.Version = fileTreeStylesVersion
	if styles.Entries == nil {
		styles.Entries = make(map[string]FileTreeStyle)
	}
	data, err := json.MarshalIndent(styles, "", "  ")
	if err != nil {
		return fmt.Errorf("encode file-tree styles: %w", err)
	}
	return a.writeVaultFileAtomic(fileTreeStylesPath, data, 0600)
}

// GetFileTreeStyles returns all path overrides and the ten most recently used
// icons for the searchable picker.
func (a *App) GetFileTreeStyles() (*FileTreeStyles, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	return a.loadFileTreeStylesLocked()
}

// SetFileTreeStyle saves or resets one existing vault entry.
func (a *App) SetFileTreeStyle(relPath, icon, color string) (*FileTreeStyles, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	clean, err := vaultRelativePath(relPath)
	if err != nil {
		return nil, err
	}
	if clean == "." || strings.HasPrefix(filepath.ToSlash(clean), ".config/") {
		return nil, fmt.Errorf("a visible file or directory is required")
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	info, statErr := root.Lstat(clean)
	root.Close()
	if os.IsNotExist(statErr) {
		return nil, fmt.Errorf("file-tree entry no longer exists")
	}
	if statErr != nil {
		return nil, statErr
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("symbolic links cannot be styled")
	}

	style, err := normalizeFileTreeStyle(FileTreeStyle{Icon: icon, Color: color})
	if err != nil {
		return nil, err
	}
	styles, err := a.loadFileTreeStylesLocked()
	if err != nil {
		return nil, err
	}
	key := filepath.ToSlash(clean)
	if style.Icon == "" && style.Color == "" {
		delete(styles.Entries, key)
	} else {
		styles.Entries[key] = style
	}
	if style.Icon != "" {
		recent := []string{style.Icon}
		for _, existing := range styles.RecentIcons {
			if existing != style.Icon && fileTreeIconNameRE.MatchString(existing) {
				recent = append(recent, existing)
			}
			if len(recent) == maxRecentTreeIcons {
				break
			}
		}
		styles.RecentIcons = recent
	}
	if err := a.saveFileTreeStylesLocked(styles); err != nil {
		return nil, err
	}
	return styles, nil
}

func mappedFileTreeStylePath(value, oldPath, newPath string) (string, bool) {
	valuePath := filepath.Clean(filepath.FromSlash(value))
	oldPath = filepath.Clean(oldPath)
	newPath = filepath.Clean(newPath)
	if !vaultPathIsSameOrDescendant(oldPath, valuePath) {
		return "", false
	}
	relative, err := filepath.Rel(oldPath, valuePath)
	if err != nil {
		return "", false
	}
	mapped := newPath
	if relative != "." {
		mapped = filepath.Join(newPath, relative)
	}
	return filepath.ToSlash(mapped), true
}

func (a *App) rewriteFileTreeStylePathsLocked(oldPath, newPath string, copyStyles bool) error {
	return a.rewriteFileTreeStylePathsWithPolicyLocked(oldPath, newPath, copyStyles, false)
}

// mergeFileTreeStylePathsLocked moves source styles into a merged directory
// without replacing an appearance already attached to the destination. This
// mirrors the merge contract: destination entries win collisions, while
// source-only and collision-renamed entries retain their own appearance.
func (a *App) mergeFileTreeStylePathsLocked(oldPath, newPath string) error {
	return a.rewriteFileTreeStylePathsWithPolicyLocked(oldPath, newPath, false, true)
}

func (a *App) rewriteFileTreeStylePathsWithPolicyLocked(oldPath, newPath string, copyStyles, preserveDestination bool) error {
	styles, err := a.loadFileTreeStylesLocked()
	if err != nil {
		return err
	}
	updates := make(map[string]FileTreeStyle)
	changed := false
	for path, style := range styles.Entries {
		mapped, matches := mappedFileTreeStylePath(path, oldPath, newPath)
		if !matches {
			continue
		}
		if _, exists := styles.Entries[mapped]; !preserveDestination || !exists {
			updates[mapped] = style
		}
		if !copyStyles {
			delete(styles.Entries, path)
		}
		changed = true
	}
	if !changed {
		return nil
	}
	for path, style := range updates {
		styles.Entries[path] = style
	}
	return a.saveFileTreeStylesLocked(styles)
}

func (a *App) removeFileTreeStylePathsLocked(path string) error {
	styles, err := a.loadFileTreeStylesLocked()
	if err != nil {
		return err
	}
	changed := false
	for configuredPath := range styles.Entries {
		if _, matches := mappedFileTreeStylePath(configuredPath, path, path); matches {
			delete(styles.Entries, configuredPath)
			changed = true
		}
	}
	if !changed {
		return nil
	}
	return a.saveFileTreeStylesLocked(styles)
}
