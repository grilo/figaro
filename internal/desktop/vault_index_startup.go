package desktop

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

var errVaultIndexLoading = errors.New("vault index is still loading; editing and saving remain available")

type vaultIndexRead func(*os.Root, string) ([]byte, error)
type vaultIndexChange struct {
	info    fs.FileInfo
	content string
	removed bool
	issue   *VaultFileIssue
}
type vaultIndexScan struct {
	changes     map[string]vaultIndexChange
	invalidated bool
	cancel      context.CancelFunc
}

// Known writes supersede the scan regardless of which file it happened to read
// first. Apply to private data; expensive parsing and derived indexes need no
// vault lock. Unknown subtree changes request a fresh scan instead.
func reconcileVaultIndex(index *vaultIndex, issues map[string]VaultFileIssue, changes map[string]vaultIndexChange) {
	for path, change := range changes {
		delete(issues, path)
		if change.issue != nil {
			issues[path] = *change.issue
		}
		if change.removed {
			delete(index.files, path)
		} else {
			file, issue := prepareSavedIndexFile(path, change.info, change.content)
			if issue != nil {
				delete(index.files, path)
				issues[path] = *issue
			} else {
				index.files[path] = file
			}
		}
	}
}

func prepareSavedIndexFile(path string, info fs.FileInfo, content string) (vaultIndexedFile, *VaultFileIssue) {
	if issue := vaultFileMetadataIssue(path, info); issue != nil {
		return vaultIndexedFile{}, issue
	}
	if issue := vaultFileContentIssue(path, []byte(content)); issue != nil {
		return vaultIndexedFile{}, issue
	}
	return indexMarkdownFile(path, info, []byte(content)), nil
}

func (a *App) recordVaultIndexChangeLocked(path string, change vaultIndexChange) {
	if a.vaultIndexScan != nil {
		a.vaultIndexScan.changes[filepath.ToSlash(path)] = change
	}
}

func (a *App) vaultIndexIssue(path string) *VaultFileIssue {
	a.fileIssuesMu.RLock()
	defer a.fileIssuesMu.RUnlock()
	if issue, ok := a.fileIssues[filepath.ToSlash(path)]; ok {
		return &issue
	}
	return nil
}

// Sidebar registrations can query indexes before the editor is revealed. The
// native startup hook closes that route to a synchronous cold scan as well.
func (a *App) deferInitialVaultIndex() {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()
	a.vaultStartupPending = a.vaultIndex == nil
}

// Mark the scan pending before launching it. Queries requiring a complete
// snapshot return a loading error instead of waiting while owning vaultMu.
func (a *App) startInitialVaultIndex(read vaultIndexRead) {
	a.vaultMu.Lock()
	a.vaultStartupPending = false
	if a.vaultIndex != nil || a.vaultIndexScan != nil {
		a.vaultMu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	scan := &vaultIndexScan{changes: make(map[string]vaultIndexChange), cancel: cancel}
	a.vaultIndexScan = scan
	a.vaultMu.Unlock()
	if read == nil {
		read = func(root *os.Root, path string) ([]byte, error) { return root.ReadFile(path) }
	}
	go a.runInitialVaultIndex(ctx, scan, read)
}

func (a *App) runInitialVaultIndex(ctx context.Context, scan *vaultIndexScan, read vaultIndexRead) {
	finish := a.startupTrace.Begin("vault-index")
	var failure error
	defer scan.cancel()
	defer func() {
		if failure == nil {
			failure = ctx.Err()
		}
		finish(failure)
	}()
	for ctx.Err() == nil {
		generation := a.beginVaultLoad()
		index, issues, err := a.readVaultIndex(generation, func(root *os.Root, path string) ([]byte, error) {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			return read(root, path)
		})
		if err != nil {
			failure = err
			a.vaultMu.Lock()
			if a.vaultIndexScan == scan {
				a.vaultIndexScan = nil
			}
			a.vaultMu.Unlock()
			return
		}
		a.setVaultLoadPhase(generation, VaultLoadFinalizing)
		for {
			a.vaultMu.Lock()
			if a.vaultIndexScan != scan || ctx.Err() != nil {
				a.vaultMu.Unlock()
				return
			}
			if scan.invalidated {
				scan.invalidated = false
				scan.changes = make(map[string]vaultIndexChange)
				a.vaultMu.Unlock()
				break
			}
			changes := scan.changes
			scan.changes = make(map[string]vaultIndexChange)
			a.vaultMu.Unlock()
			reconcileVaultIndex(index, issues, changes)
			index.rebuildDerived()
			a.vaultMu.Lock()
			if a.vaultIndexScan != scan || ctx.Err() != nil {
				a.vaultMu.Unlock()
				return
			}
			if scan.invalidated || len(scan.changes) > 0 {
				a.vaultMu.Unlock()
				continue
			}
			a.replaceVaultFileIssues(issues)
			a.publishVaultIndexLocked(index)
			a.vaultIndexScan = nil
			a.vaultMu.Unlock()
			a.setVaultLoadPhase(generation, VaultLoadReady)
			a.emitRuntimeEvent("vault:kanban-indexed")
			return
		}
	}
}
