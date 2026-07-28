package desktop

import (
	"fmt"
	"io/fs"
	"math"
	"os"
	pathpkg "path"
	"sort"
	"strings"
)

// ============================================================================
// Path Safety
// ============================================================================

func (a *App) safePath(rel string) (string, error) {
	cleanRel, err := vaultRelativePath(rel)
	if err != nil {
		return "", err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return "", err
	}
	defer root.Close()
	if err := validateRootPath(root, cleanRel); err != nil {
		return "", fmt.Errorf("path escapes vault: %w", err)
	}
	return a.vaultAbsolutePath(cleanRel), nil
}

func (a *App) currentFileVersionLocked(path string, info os.FileInfo) float64 {
	actual := float64(info.ModTime().UnixNano()) / 1e9
	if known, ok := a.fileVersions[path]; ok && known > actual {
		return known
	}
	return actual
}

func (a *App) recordFileVersionLocked(path string, info os.FileInfo) float64 {
	version := float64(info.ModTime().UnixNano()) / 1e9
	if known, ok := a.fileVersions[path]; ok && version <= known {
		version = math.Nextafter(known, math.Inf(1))
	}
	a.fileVersions[path] = version
	return version
}

func (a *App) resetFileVersionsLocked() {
	a.fileVersions = make(map[string]float64)
}

// ============================================================================
// 1. File Tree
// ============================================================================

// FileTreeItem represents an item in the vault file tree.
type FileTreeItem struct {
	Name     string          `json:"name"`
	Path     string          `json:"path"`
	Type     string          `json:"type"` // "file" or "directory"
	Mtime    float64         `json:"mtime,omitempty"`
	Children []*FileTreeItem `json:"children,omitempty"`
}

// GetFileTree returns the complete vault file tree.
func (a *App) GetFileTree() ([]*FileTreeItem, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()

	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	return a.buildTree(root.FS(), ".")
}

func (a *App) buildTree(vaultFS fs.FS, dir string) ([]*FileTreeItem, error) {
	entries, err := fs.ReadDir(vaultFS, dir)
	if err != nil {
		return nil, err
	}

	items := make([]*FileTreeItem, 0, len(entries))
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		// Type may be unknown on some filesystems, so inspect the entry before
		// deciding whether it is a directory. Info reports the link itself (not
		// its target), which lets the tree consistently omit symlinks.
		info, err := e.Info()
		if err != nil {
			return nil, err
		}
		if info.Mode()&fs.ModeSymlink != 0 {
			continue
		}
		rel := name
		if dir != "." {
			rel = pathpkg.Join(dir, name)
		}
		if info.IsDir() {
			children, err := a.buildTree(vaultFS, rel)
			if err != nil {
				return nil, err
			}
			items = append(items, &FileTreeItem{
				Name:     name,
				Path:     rel,
				Type:     "directory",
				Children: children,
			})
		} else {
			mtime := float64(0)
			mtime = float64(info.ModTime().UnixNano()) / 1e9
			items = append(items, &FileTreeItem{
				Name:  name,
				Path:  rel,
				Type:  "file",
				Mtime: mtime,
			})
		}
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Type != items[j].Type {
			return items[i].Type == "directory"
		}
		return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name)
	})

	return items, nil
}
