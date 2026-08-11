package desktop

import (
	"os"
	"path/filepath"
	"strings"
)

// ============================================================================
// 7. Merge Notes
// ============================================================================

// MergeNotesResult is the return value of MergeNotes.
type MergeNotesResult struct {
	Success bool     `json:"success"`
	Error   string   `json:"error,omitempty"`
	Master  string   `json:"master,omitempty"`
	Deleted []string `json:"deleted,omitempty"`
}

// MergeNotes merges source notes into the master (first in list).
func (a *App) MergeNotes(paths []string) (*MergeNotesResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	if len(paths) < 2 {
		return &MergeNotesResult{Success: false, Error: "Need at least 2 notes to merge"}, nil
	}

	masterRel, err := vaultRelativePath(paths[0])
	if err != nil {
		return nil, err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()

	masterData, err := root.ReadFile(masterRel)
	if err != nil {
		return nil, err
	}

	parts := []string{string(masterData)}
	var deleted []string

	for _, p := range paths[1:] {
		srcRel, err := vaultRelativePath(p)
		if err != nil {
			return nil, err
		}
		srcData, err := root.ReadFile(srcRel)
		if err != nil {
			return nil, err
		}
		trimmed := strings.TrimSpace(string(srcData))
		if trimmed != "" {
			// Avoid adding --- separator if master is also empty
			if len(parts) == 1 && strings.TrimSpace(parts[0]) == "" {
				parts[0] = trimmed
			} else {
				parts = append(parts, "\n\n---\n\n"+trimmed)
			}
		}
		deleted = append(deleted, filepath.ToSlash(srcRel))
	}

	merged := strings.Join(parts, "")
	if err := writeRootFileAtomic(root, masterRel, []byte(merged), 0644); err != nil {
		return nil, err
	}

	for _, p := range paths[1:] {
		srcRel, safeErr := vaultRelativePath(p)
		if safeErr != nil {
			return nil, safeErr
		}
		if err := root.Remove(srcRel); err != nil && !os.IsNotExist(err) {
			return nil, err
		}
	}

	a.invalidateFileTreeCacheLocked()
	a.resetFileVersionsLocked()
	a.syncKanbanColumnsLocked()
	return &MergeNotesResult{
		Success: true,
		Master:  paths[0],
		Deleted: deleted,
	}, nil
}
