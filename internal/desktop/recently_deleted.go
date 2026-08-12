package desktop

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	backendhistory "figaro/internal/history"
	"figaro/internal/recovery"
)

const recentlyDeletedRegistryPath = ".config/recently-deleted.json"

type recentlyDeletedRegistry struct {
	Version int             `json:"version"`
	Items   []recovery.Item `json:"items"`
}

// RecentlyDeletedItem is the Wails-facing durable recovery record.
type RecentlyDeletedItem = recovery.Item

func (a *App) readRecentlyDeletedLocked() ([]recovery.Item, error) {
	data, err := a.readVaultFile(recentlyDeletedRegistryPath)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read recently deleted registry: %w", err)
	}
	var registry recentlyDeletedRegistry
	if err := json.Unmarshal(data, &registry); err != nil {
		return nil, fmt.Errorf("parse recently deleted registry: %w", err)
	}
	if registry.Version != 1 {
		return nil, fmt.Errorf("unsupported recently deleted registry version %d", registry.Version)
	}
	items := make([]recovery.Item, 0, len(registry.Items))
	for _, item := range registry.Items {
		clean, err := vaultRelativePath(item.Path)
		if err != nil || clean == "." || !validRecoveryID(item.ID) || (item.Kind != "file" && item.Kind != "directory") {
			return nil, fmt.Errorf("recently deleted registry contains an invalid record")
		}
		item.Path = filepath.ToSlash(clean)
		items = append(items, item)
	}
	return recovery.Sorted(items), nil
}

func validRecoveryID(id string) bool {
	if id == "" {
		return false
	}
	for _, character := range id {
		if (character < 'a' || character > 'z') &&
			(character < 'A' || character > 'Z') &&
			(character < '0' || character > '9') && character != '-' && character != '_' {
			return false
		}
	}
	return true
}

func (a *App) writeRecentlyDeletedLocked(items []recovery.Item) error {
	data, err := json.MarshalIndent(recentlyDeletedRegistry{Version: 1, Items: items}, "", "  ")
	if err != nil {
		return fmt.Errorf("encode recently deleted registry: %w", err)
	}
	if err := a.writeVaultFileAtomic(recentlyDeletedRegistryPath, data, 0600); err != nil {
		return fmt.Errorf("write recently deleted registry: %w", err)
	}
	return nil
}

func newRecentlyDeletedItem(path, kind, snapshot string) recovery.Item {
	now := time.Now()
	return recovery.Item{
		ID:        fmt.Sprintf("%d", now.UnixNano()),
		Path:      filepath.ToSlash(path),
		Kind:      kind,
		Snapshot:  snapshot,
		DeletedAt: float64(now.UnixNano()) / 1e9,
	}
}

// GetRecentlyDeleted returns the vault's durable, newest-first recovery list.
func (a *App) GetRecentlyDeleted() ([]RecentlyDeletedItem, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	return a.readRecentlyDeletedLocked()
}

// RestoreRecentlyDeleted reconstructs one archived path without replacing any
// current vault entry. The snapshot is built under a root-scoped sibling path
// and published with one rename, so extraction failure cannot expose a partial
// restored directory.
func (a *App) RestoreRecentlyDeleted(id string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	items, err := a.readRecentlyDeletedLocked()
	if err != nil {
		return nil, err
	}
	item, found := recovery.Find(items, id)
	if !found {
		return &SaveFileResult{Success: false, Error: "Recently deleted item not found"}, nil
	}
	clean, err := vaultRelativePath(item.Path)
	if err != nil || clean == "." {
		return &SaveFileResult{Success: false, Error: "Recently deleted path is invalid"}, nil
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if _, err := root.Lstat(clean); err == nil {
		return &SaveFileResult{Success: false, Error: "A file or folder already exists at the original location. Move or rename it before restoring."}, nil
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	parent := filepath.Dir(clean)
	parentInfo, err := root.Lstat(parent)
	if err != nil || !parentInfo.IsDir() {
		return &SaveFileResult{Success: false, Error: "The original parent folder no longer exists. Restore or recreate it first."}, nil
	}

	var snapshot []backendhistory.SnapshotFile
	if item.Snapshot != "" {
		if a.history == nil {
			return &SaveFileResult{Success: false, Error: "Local history is unavailable, so this item cannot be restored right now."}, nil
		}
		snapshot, err = a.history.GetPathSnapshotWithVaultLocked(clean, item.Snapshot)
		if err != nil {
			return &SaveFileResult{Success: false, Error: fmt.Sprintf("Could not read the archived contents: %v", err)}, nil
		}
	}
	if item.Kind == "file" && len(snapshot) != 1 {
		return &SaveFileResult{Success: false, Error: "The archived file snapshot is incomplete."}, nil
	}

	stage, err := availableRestoreStagePath(root, parent, item.ID)
	if err != nil {
		return nil, err
	}
	if err := writeRestoreStage(root, stage, clean, item.Kind, snapshot); err != nil {
		_ = root.RemoveAll(stage)
		return &SaveFileResult{Success: false, Error: fmt.Sprintf("Could not reconstruct the archived item: %v", err)}, nil
	}
	if err := root.Rename(stage, clean); err != nil {
		_ = root.RemoveAll(stage)
		return &SaveFileResult{Success: false, Error: fmt.Sprintf("Could not publish the restored item: %v", err)}, nil
	}

	remaining, _ := recovery.Remove(items, item.ID)
	if err := a.writeRecentlyDeletedLocked(remaining); err != nil {
		// The path is already safely restored. Retaining a stale recovery record
		// is preferable to reporting a false failure after the visible success.
		log.Printf("[recovery] Could not remove restored record %q: %v", item.ID, err)
	}
	a.invalidateFileTreeCacheLocked()
	a.resetFileVersionsLocked()
	a.syncKanbanColumnsLocked()
	return &SaveFileResult{Success: true, Path: filepath.ToSlash(clean)}, nil
}

func availableRestoreStagePath(root *os.Root, parent, id string) (string, error) {
	base := ".figaro-restore-" + id
	for index := 0; index < 1000; index++ {
		name := base
		if index > 0 {
			name = fmt.Sprintf("%s-%d", base, index)
		}
		candidate := name
		if parent != "." {
			candidate = filepath.Join(parent, name)
		}
		if _, err := root.Lstat(candidate); os.IsNotExist(err) {
			return candidate, nil
		} else if err != nil {
			return "", err
		}
	}
	return "", fmt.Errorf("could not allocate a temporary restore path")
}

func writeRestoreStage(root *os.Root, stage, original, kind string, files []backendhistory.SnapshotFile) error {
	if kind == "directory" {
		if err := root.Mkdir(stage, 0755); err != nil {
			return err
		}
		prefix := filepath.ToSlash(original) + "/"
		for _, file := range files {
			if !strings.HasPrefix(file.Path, prefix) {
				return fmt.Errorf("archive path %q is outside %q", file.Path, original)
			}
			relative := strings.TrimPrefix(file.Path, prefix)
			cleanRelative, err := vaultRelativePath(relative)
			if err != nil || cleanRelative == "." {
				return fmt.Errorf("archive contains an invalid path %q", file.Path)
			}
			destination := filepath.Join(stage, cleanRelative)
			if err := root.MkdirAll(filepath.Dir(destination), 0755); err != nil {
				return err
			}
			if err := writeArchivedFile(root, destination, file); err != nil {
				return err
			}
		}
		return nil
	}
	return writeArchivedFile(root, stage, files[0])
}

func writeArchivedFile(root *os.Root, destination string, file backendhistory.SnapshotFile) error {
	if file.SymbolicLink {
		return root.Symlink(string(file.Data), destination)
	}
	output, err := root.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, file.Mode.Perm())
	if err != nil {
		return err
	}
	removeIncomplete := true
	defer func() {
		_ = output.Close()
		if removeIncomplete {
			_ = root.Remove(destination)
		}
	}()
	if _, err := io.Copy(output, bytes.NewReader(file.Data)); err != nil {
		return err
	}
	if err := output.Sync(); err != nil {
		return err
	}
	if err := output.Close(); err != nil {
		return err
	}
	removeIncomplete = false
	return nil
}
