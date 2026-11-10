package desktop

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"figaro/internal/recovery"
)

// ============================================================================
// 7. Merge Notes
// ============================================================================

// MergeNotesResult is the return value of MergeNotes. DeletedIDs holds the
// Recently deleted record of each removed source, in the order of Deleted.
type MergeNotesResult struct {
	Success    bool     `json:"success"`
	Error      string   `json:"error,omitempty"`
	Master     string   `json:"master,omitempty"`
	Deleted    []string `json:"deleted,omitempty"`
	DeletedIDs []string `json:"deleted_ids,omitempty"`
}

// MergeNotes merges source notes into the master (first in list) and removes
// the sources. Like DeletePath, it removes nothing it could not first archive:
// each source is committed to local history and registered in Recently
// deleted before the master is rewritten, so a merged-away note can be
// restored exactly as it was.
func (a *App) MergeNotes(paths []string) (*MergeNotesResult, error) {
	a.vaultPathMu.Lock()
	defer a.vaultPathMu.Unlock()
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

	masterInfo, err := root.Stat(masterRel)
	if err != nil {
		return nil, err
	}

	parts := []string{string(masterData)}
	sources := make([]string, 0, len(paths)-1)
	var deleted []string
	// Every chosen note must be a different file. A note merged with itself
	// would be rewritten and then removed; compared by identity, so another
	// spelling of the same file on a case-folding volume is caught too.
	chosen := []os.FileInfo{masterInfo}

	for _, p := range paths[1:] {
		srcRel, err := vaultRelativePath(p)
		if err != nil {
			return nil, err
		}
		srcInfo, err := root.Stat(srcRel)
		if err != nil {
			return nil, err
		}
		for _, earlier := range chosen {
			if os.SameFile(earlier, srcInfo) {
				return &MergeNotesResult{
					Success: false,
					Error:   fmt.Sprintf("%q was chosen more than once. Nothing was merged.", filepath.ToSlash(srcRel)),
				}, nil
			}
		}
		chosen = append(chosen, srcInfo)
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
		sources = append(sources, srcRel)
		deleted = append(deleted, filepath.ToSlash(srcRel))
	}
	merged := strings.Join(parts, "")

	// Archive every source and record where to find it before anything in
	// the vault changes. A failure here leaves all notes as they were.
	if a.history == nil {
		return &MergeNotesResult{Success: false, Error: "Local history is unavailable. Nothing was merged."}, nil
	}
	registryBefore, err := a.readRecentlyDeletedLocked()
	if err != nil {
		return &MergeNotesResult{Success: false, Error: fmt.Sprintf("Could not read the recovery list: %v. Nothing was merged.", err)}, nil
	}
	registry := registryBefore
	deletedIDs := make([]string, 0, len(sources))
	for _, srcRel := range sources {
		snapshot, err := a.history.ArchivePathSnapshotWithVaultLocked(srcRel)
		if err != nil {
			return &MergeNotesResult{
				Success: false,
				Error:   fmt.Sprintf("Could not record %q in local history: %v. Nothing was merged.", filepath.ToSlash(srcRel), err),
			}, nil
		}
		item := newRecentlyDeletedItem(srcRel, "file", snapshot)
		item.ID = recovery.UniqueID(registry, item.ID)
		registry = recovery.Add(registry, item)
		deletedIDs = append(deletedIDs, item.ID)
	}
	if err := a.writeRecentlyDeletedLocked(registry); err != nil {
		return &MergeNotesResult{Success: false, Error: fmt.Sprintf("Could not update the recovery list: %v. Nothing was merged.", err)}, nil
	}

	if err := writeRootFileAtomic(root, masterRel, []byte(merged), 0644); err != nil {
		// No source was removed, so nothing is recoverable from these records.
		if restoreErr := a.writeRecentlyDeletedLocked(registryBefore); restoreErr != nil {
			log.Printf("[recovery] Could not withdraw the records of a failed merge: %v", restoreErr)
		}
		return nil, err
	}
	a.resetFileVersionsLocked()
	a.markInternalVaultWriteLocked(masterRel)
	if info, statErr := root.Stat(masterRel); statErr == nil {
		a.updateVaultIndexFileLocked(masterRel, info, merged)
	} else {
		// The merged note is on disk; only a rebuild can describe it now.
		log.Printf("[vault-index] Could not inspect merged note %q: %v", filepath.ToSlash(masterRel), statErr)
		a.syncKanbanColumnsLocked()
	}

	for index, srcRel := range sources {
		if err := root.Remove(srcRel); err != nil && !os.IsNotExist(err) {
			// The remaining sources are still in the vault: withdraw their
			// records so Recently deleted lists only what was removed.
			kept := registry
			for _, id := range deletedIDs[index:] {
				kept, _ = recovery.Remove(kept, id)
			}
			if restoreErr := a.writeRecentlyDeletedLocked(kept); restoreErr != nil {
				log.Printf("[recovery] Could not withdraw the records of an interrupted merge: %v", restoreErr)
			}
			return nil, err
		}
		a.forgetRemovedVaultPathLocked(srcRel)
	}

	return &MergeNotesResult{
		Success:    true,
		Master:     paths[0],
		Deleted:    deleted,
		DeletedIDs: deletedIDs,
	}, nil
}
