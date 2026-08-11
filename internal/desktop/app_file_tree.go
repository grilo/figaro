package desktop

import (
	"fmt"
	"io/fs"
	"math"
	"os"
	pathpkg "path"
	"path/filepath"
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

type fileTreeCacheEntry struct {
	typeName string
	mtime    float64
}

// GetFileTree returns the complete vault file tree.
func (a *App) GetFileTree() ([]*FileTreeItem, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()
	if a.fileTreeSnapshot != nil {
		return a.fileTreeSnapshot, nil
	}
	if a.fileTreeEntries != nil {
		a.fileTreeSnapshot = buildFileTreeFromEntries(a.fileTreeEntries)
		return a.fileTreeSnapshot, nil
	}

	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	tree, err := a.buildTree(root.FS(), ".")
	if err != nil {
		return nil, err
	}
	a.fileTreeEntries = fileTreeEntriesFromTree(tree)
	a.fileTreeSnapshot = tree
	return a.fileTreeSnapshot, nil
}

func fileTreeEntriesFromTree(tree []*FileTreeItem) map[string]fileTreeCacheEntry {
	entries := make(map[string]fileTreeCacheEntry)
	var collect func([]*FileTreeItem)
	collect = func(items []*FileTreeItem) {
		for _, item := range items {
			entries[item.Path] = fileTreeCacheEntry{typeName: item.Type, mtime: item.Mtime}
			collect(item.Children)
		}
	}
	collect(tree)
	return entries
}

// buildFileTreeFromEntries is the pure hierarchy projection used after known
// path mutations. It creates missing parents defensively so a move into a
// newly created target directory cannot orphan the moved subtree.
func buildFileTreeFromEntries(entries map[string]fileTreeCacheEntry) []*FileTreeItem {
	nodes := make(map[string]*FileTreeItem, len(entries))
	ensureDirectory := func(rel string) {}
	ensureDirectory = func(rel string) {
		if rel == "." || rel == "" {
			return
		}
		if _, found := nodes[rel]; found {
			return
		}
		parent := pathpkg.Dir(rel)
		ensureDirectory(parent)
		nodes[rel] = &FileTreeItem{
			Name: pathpkg.Base(rel),
			Path: rel,
			Type: "directory",
		}
	}

	for rel, entry := range entries {
		parent := pathpkg.Dir(rel)
		ensureDirectory(parent)
		nodes[rel] = &FileTreeItem{
			Name:  pathpkg.Base(rel),
			Path:  rel,
			Type:  entry.typeName,
			Mtime: entry.mtime,
		}
	}

	rootItems := make([]*FileTreeItem, 0)
	for rel, node := range nodes {
		parent := pathpkg.Dir(rel)
		if parent == "." {
			rootItems = append(rootItems, node)
			continue
		}
		parentNode := nodes[parent]
		parentNode.Children = append(parentNode.Children, node)
	}
	var sortItems func([]*FileTreeItem)
	sortItems = func(items []*FileTreeItem) {
		sort.Slice(items, func(i, j int) bool {
			if items[i].Type != items[j].Type {
				return items[i].Type == "directory"
			}
			left := strings.ToLower(items[i].Name)
			right := strings.ToLower(items[j].Name)
			if left != right {
				return left < right
			}
			return items[i].Name < items[j].Name
		})
		for _, item := range items {
			sortItems(item.Children)
		}
	}
	sortItems(rootItems)
	return rootItems
}

func (a *App) invalidateFileTreeCacheLocked() {
	a.fileTreeEntries = nil
	a.fileTreeSnapshot = nil
}

func visibleFileTreeCachePath(rel string) (string, bool) {
	rel = pathpkg.Clean(strings.Trim(filepath.ToSlash(rel), "/"))
	if rel == "." || rel == "" {
		return "", false
	}
	for _, part := range strings.Split(rel, "/") {
		if strings.HasPrefix(part, ".") {
			return "", false
		}
	}
	return rel, true
}

func (a *App) ensureFileTreeCacheDirectoriesLocked(rel string) {
	if a.fileTreeEntries == nil {
		return
	}
	for parent := pathpkg.Dir(rel); parent != "." && parent != ""; parent = pathpkg.Dir(parent) {
		if _, found := a.fileTreeEntries[parent]; !found {
			a.fileTreeEntries[parent] = fileTreeCacheEntry{typeName: "directory"}
		}
	}
}

func (a *App) updateFileTreeCacheFileLocked(rel string, info fs.FileInfo) {
	if a.fileTreeEntries == nil || info == nil {
		return
	}
	clean, visible := visibleFileTreeCachePath(rel)
	if !visible || info.Mode()&fs.ModeSymlink != 0 {
		return
	}
	typeName := "file"
	mtime := float64(info.ModTime().UnixNano()) / 1e9
	if info.IsDir() {
		typeName = "directory"
		mtime = 0
	}
	a.ensureFileTreeCacheDirectoriesLocked(clean)
	a.fileTreeEntries[clean] = fileTreeCacheEntry{typeName: typeName, mtime: mtime}
	a.fileTreeSnapshot = nil
}

func (a *App) refreshFileTreeCachePath(rel string) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()
	if a.fileTreeEntries == nil {
		return
	}
	root, err := a.openVaultRoot()
	if err != nil {
		a.invalidateFileTreeCacheLocked()
		return
	}
	defer root.Close()
	info, err := root.Lstat(filepath.FromSlash(rel))
	if err != nil {
		a.invalidateFileTreeCacheLocked()
		return
	}
	a.updateFileTreeCacheFileLocked(rel, info)
}

func (a *App) addFileTreeCacheDirectoryLocked(rel string) {
	if a.fileTreeEntries == nil {
		return
	}
	clean, visible := visibleFileTreeCachePath(rel)
	if !visible {
		return
	}
	a.ensureFileTreeCacheDirectoriesLocked(clean)
	a.fileTreeEntries[clean] = fileTreeCacheEntry{typeName: "directory"}
	a.fileTreeSnapshot = nil
}

func (a *App) removeFileTreeCachePathLocked(rel string) {
	if a.fileTreeEntries == nil {
		return
	}
	clean, visible := visibleFileTreeCachePath(rel)
	if !visible {
		return
	}
	for path := range a.fileTreeEntries {
		if path == clean || strings.HasPrefix(path, clean+"/") {
			delete(a.fileTreeEntries, path)
		}
	}
	a.fileTreeSnapshot = nil
}

func (a *App) remapFileTreeCachePathLocked(oldRel string, newRel string) {
	if a.fileTreeEntries == nil {
		return
	}
	oldClean, oldVisible := visibleFileTreeCachePath(oldRel)
	newClean, newVisible := visibleFileTreeCachePath(newRel)
	if !oldVisible || !newVisible {
		a.invalidateFileTreeCacheLocked()
		return
	}
	type movedEntry struct {
		oldPath string
		newPath string
		entry   fileTreeCacheEntry
	}
	moved := make([]movedEntry, 0)
	for path, entry := range a.fileTreeEntries {
		if path != oldClean && !strings.HasPrefix(path, oldClean+"/") {
			continue
		}
		moved = append(moved, movedEntry{
			oldPath: path,
			newPath: newClean + strings.TrimPrefix(path, oldClean),
			entry:   entry,
		})
	}
	for _, item := range moved {
		delete(a.fileTreeEntries, item.oldPath)
	}
	for _, item := range moved {
		a.fileTreeEntries[item.newPath] = item.entry
	}
	a.ensureFileTreeCacheDirectoriesLocked(newClean)
	a.fileTreeSnapshot = nil
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
