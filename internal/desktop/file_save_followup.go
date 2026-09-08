package desktop

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

type pendingFileSave struct {
	original, content string
	info              fs.FileInfo
	readError         error
}

func (r *vaultNoteSaveRepository) writeToDisk(content string) (float64, error) {
	original, readErr := r.root.ReadFile(r.cleanRel)
	if os.IsNotExist(readErr) {
		readErr = nil
	}
	if err := writeRootFileAtomic(r.root, r.cleanRel, []byte(content), 0644); err != nil {
		return 0, err
	}
	info, err := r.root.Stat(r.cleanRel)
	if err != nil {
		return 0, fmt.Errorf("inspect saved file: %w", err)
	}
	version := r.app.recordFileVersionLocked(r.abs, info)
	if r.app.pendingFileSaves == nil {
		r.app.pendingFileSaves = make(map[string]*pendingFileSave)
	}
	// Keep the oldest metadata baseline when several disk writes outrun Git.
	if previous, ok := r.app.pendingFileSaves[r.cleanRel]; ok {
		original, readErr = []byte(previous.original), previous.readError
	}
	r.app.pendingFileSaves[r.cleanRel] = &pendingFileSave{original: string(original), content: content, info: info, readError: readErr}
	if strings.EqualFold(filepath.Ext(r.cleanRel), ".md") {
		r.app.recordVaultIndexChangeLocked(r.cleanRel, vaultIndexChange{info: info, content: content})
	}
	r.app.markInternalVaultWriteLocked(r.cleanRel)
	return version, nil
}

// RefreshSavedFile follows the Git attempt (or the disk write when Auto-Commit
// is off). A metadata/index failure is secondary: the saved note stays intact.
func (a *App) RefreshSavedFile(relPath string) error {
	return a.refreshSavedFile(relPath, func(path, original, content string) error {
		return a.updateSavedTaskSchedules(path, original, content, func() error { return nil })
	})
}

func (a *App) refreshSavedFile(relPath string, updateMetadata func(string, string, string) error) error {
	path, err := vaultRelativePath(relPath)
	if err != nil {
		return err
	}
	a.fileSaveFollowupMu.Lock()
	defer a.fileSaveFollowupMu.Unlock()
	a.vaultMu.Lock()
	pending, ok := a.pendingFileSaves[path]
	current := ok
	if ok && !strings.EqualFold(filepath.Ext(path), ".md") {
		a.updateFileTreeCacheFileLocked(path, pending.info)
		delete(a.pendingFileSaves, path)
		a.vaultMu.Unlock()
		return nil
	}
	a.vaultMu.Unlock()
	if !current {
		return nil
	}
	err = pending.readError
	if err == nil {
		err = updateMetadata(path, pending.original, pending.content)
	}
	// Parse the saved text away from the lock needed by the next disk write.
	file, issue := prepareSavedIndexFile(path, pending.info, pending.content)
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()
	if a.pendingFileSaves[path] != pending {
		return err
	}
	a.updateFileTreeCacheFileLocked(path, pending.info)
	a.setVaultFileIssue(path, issue)
	a.recordVaultIndexChangeLocked(path, vaultIndexChange{info: pending.info, content: pending.content, removed: issue != nil, issue: issue})
	if a.vaultIndex != nil {
		if issue != nil {
			a.vaultIndex.removeFile(path)
		} else {
			a.vaultIndex.replaceFile(file)
		}
		a.publishVaultIndexLocked(a.vaultIndex)
	}
	if err == nil {
		delete(a.pendingFileSaves, path)
	}
	return err
}
