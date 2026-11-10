package desktop

import (
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"figaro/internal/vault"

	"github.com/fsnotify/fsnotify"
)

const internalVaultWriteTTL = 2 * time.Second

type internalVaultWriteAck struct {
	expiresAt time.Time
	remaining int
}

// markInternalVaultWriteLocked prevents the native watcher from doing the
// same work again after Figaro atomically saves a known note. The caller must
// hold vaultMu for writing.
func (a *App) markInternalVaultWriteLocked(rel string) {
	if a.internalVaultWrites == nil {
		a.internalVaultWrites = make(map[string]internalVaultWriteAck)
	}
	now := time.Now()
	for path, ack := range a.internalVaultWrites {
		if !ack.expiresAt.After(now) {
			delete(a.internalVaultWrites, path)
		}
	}
	ack := a.internalVaultWrites[rel]
	if !ack.expiresAt.After(now) {
		ack.remaining = 0
	}
	ack.remaining++
	ack.expiresAt = now.Add(internalVaultWriteTTL)
	a.internalVaultWrites[rel] = ack
}

// consumeInternalVaultWriteLocked reports whether a watcher event belongs to
// a recent Figaro save. The caller must hold vaultMu for writing.
func (a *App) consumeInternalVaultWriteLocked(rel string) bool {
	ack, ok := a.internalVaultWrites[rel]
	if !ok {
		return false
	}
	if !ack.expiresAt.After(time.Now()) {
		delete(a.internalVaultWrites, rel)
		return false
	}
	ack.remaining--
	if ack.remaining <= 0 {
		delete(a.internalVaultWrites, rel)
	} else {
		a.internalVaultWrites[rel] = ack
	}
	return true
}

// vaultWatchPathState is what one settled watcher path looks like on disk.
type vaultWatchPathState uint8

const (
	vaultWatchPathMissing vaultWatchPathState = iota
	vaultWatchPathRegularFile
	vaultWatchPathDirectory
	// vaultWatchPathOther is a symbolic link or special file. The vault never
	// lists or indexes one, so it counts as absent wherever notes are concerned.
	vaultWatchPathOther
)

func vaultWatchPathStateOf(info fs.FileInfo, err error) vaultWatchPathState {
	switch {
	case err != nil || info == nil:
		return vaultWatchPathMissing
	case info.Mode()&fs.ModeSymlink != 0:
		return vaultWatchPathOther
	case info.IsDir():
		return vaultWatchPathDirectory
	case info.Mode().IsRegular():
		return vaultWatchPathRegularFile
	default:
		return vaultWatchPathOther
	}
}

// vaultWatchPlan is the index and projection work one debounced path needs.
type vaultWatchPlan struct {
	// forgetSubtree drops every indexed note and file issue at or below the
	// path: it is gone, or no longer something the vault indexes.
	forgetSubtree bool
	// indexNote reads this one Markdown file again.
	indexNote bool
	// reconcileFolder indexes the Markdown beneath a folder that appeared.
	reconcileFolder bool
	// touchEntry refreshes the cached tree metadata of an entry the index
	// does not hold.
	touchEntry    bool
	treeChanged   bool
	kanbanChanged bool
}

// planVaultWatchChange decides what a coalesced watcher operation means from
// what the path is now, never from the operation alone. Operations are OR-ed
// over the debounce window, so a Remove or Rename bit says only that the name
// was vacated at some point: an editor that saves by remove-and-create, or
// "git checkout", leaves a note that still exists and must be read again, while
// a folder's new name arrives as a bare Create with no event for its notes.
func planVaultWatchChange(op fsnotify.Op, markdown bool, state vaultWatchPathState) vaultWatchPlan {
	created := op&fsnotify.Create != 0
	written := op&fsnotify.Write != 0
	vacated := op&(fsnotify.Remove|fsnotify.Rename) != 0
	if !created && !written && !vacated {
		return vaultWatchPlan{}
	}
	switch {
	case state == vaultWatchPathDirectory:
		if created || vacated {
			return vaultWatchPlan{reconcileFolder: true, treeChanged: true}
		}
		return vaultWatchPlan{touchEntry: true}
	case markdown && state == vaultWatchPathRegularFile:
		return vaultWatchPlan{indexNote: true, treeChanged: created || vacated, kanbanChanged: true}
	case markdown:
		return vaultWatchPlan{forgetSubtree: true, treeChanged: true, kanbanChanged: true}
	default:
		return vaultWatchPlan{
			forgetSubtree: vacated,
			touchEntry:    written && state == vaultWatchPathRegularFile,
			treeChanged:   created || vacated,
		}
	}
}

// maximumIncrementalWatchedNotes bounds how many notes one watcher batch may
// index or drop one at a time, whether they arrived as their own events (a
// "git pull" that rewrites hundreds of notes) or inside folders that appeared.
// Each incremental update re-sorts shared postings while the vault write lock
// is held, so beyond this a single rebuild is cheaper and blocks for less.
const maximumIncrementalWatchedNotes = 256

// vaultWatchBatch is the state shared by the paths of one debounced batch.
type vaultWatchBatch struct {
	// noteBudget is the remaining allowance of per-note index work.
	noteBudget int
	// listings holds each inspected folder's exact entry names, read at most
	// once per batch. A nil set records a folder that could not be listed.
	listings map[string]map[string]struct{}
}

func newVaultWatchBatch() *vaultWatchBatch {
	return &vaultWatchBatch{
		noteBudget: maximumIncrementalWatchedNotes,
		listings:   make(map[string]map[string]struct{}),
	}
}

// listsExactName reports whether rel's folder lists rel's final name with
// exactly this spelling. On a case-insensitive volume (the macOS and Windows
// defaults) a note renamed from "todo.md" to "Todo.md" still answers to its old
// name, so only the listing can tell that the old name was vacated. A folder
// that cannot be listed leaves the answer to the lookup that already succeeded.
func (batch *vaultWatchBatch) listsExactName(root *os.Root, rel string) bool {
	dir := filepath.Dir(rel)
	names, read := batch.listings[dir]
	if !read {
		if directory, err := root.Open(dir); err == nil {
			entries, readErr := directory.Readdirnames(-1)
			if closeErr := directory.Close(); readErr == nil && closeErr == nil {
				names = make(map[string]struct{}, len(entries))
				for _, name := range entries {
					names[name] = struct{}{}
				}
			}
		}
		batch.listings[dir] = names
	}
	if names == nil {
		return true
	}
	_, listed := names[filepath.Base(rel)]
	return listed
}

// applyVaultWatchChangeLocked carries out the plan for one external path and
// folds its effect into result. It reports false when the index was
// invalidated instead, after which the rest of the batch needs no per-path
// work. The caller must hold vaultMu for writing.
func (a *App) applyVaultWatchChangeLocked(
	root *os.Root,
	rel string,
	op fsnotify.Op,
	result *vaultFilesystemChangeResult,
	batch *vaultWatchBatch,
) bool {
	markdown := strings.EqualFold(filepath.Ext(rel), ".md")
	info, statErr := root.Lstat(rel)
	if statErr == nil && op&(fsnotify.Remove|fsnotify.Rename) != 0 && !batch.listsExactName(root, rel) {
		// The name was vacated and only a differently-cased entry answers to it.
		info, statErr = nil, fs.ErrNotExist
	}
	plan := planVaultWatchChange(op, markdown, vaultWatchPathStateOf(info, statErr))
	result.treeChanged = result.treeChanged || plan.treeChanged
	result.kanbanChanged = result.kanbanChanged || plan.kanbanChanged

	if plan.indexNote || (plan.forgetSubtree && markdown) {
		if batch.noteBudget--; batch.noteBudget < 0 {
			a.invalidateVaultIndexLocked()
			result.treeChanged = true
			result.kanbanChanged = true
			return false
		}
	}

	switch {
	case plan.forgetSubtree:
		if a.forgetWatchedPathLocked(rel, markdown) {
			result.kanbanChanged = true
		}
	case plan.indexNote:
		a.indexWatchedNoteLocked(root, rel, info)
	case plan.reconcileFolder:
		if op&(fsnotify.Remove|fsnotify.Rename) != 0 {
			a.removeVaultFileIssuesBelow(rel)
		}
		changed, withinBudget := a.reconcileWatchedFolderLocked(root, rel, &batch.noteBudget)
		if !withinBudget {
			a.invalidateVaultIndexLocked()
			result.treeChanged = true
			result.kanbanChanged = true
			return false
		}
		result.kanbanChanged = result.kanbanChanged || changed
	}
	if plan.touchEntry {
		a.updateFileTreeCacheFileLocked(rel, info)
	}
	return true
}

// indexWatchedNoteLocked admits one changed Markdown file by the rules of the
// cold index: a note that is too large, unreadable, binary or not UTF-8 is
// recorded as a file issue and kept out of the index.
func (a *App) indexWatchedNoteLocked(root *os.Root, rel string, info fs.FileInfo) {
	slashRel := filepath.ToSlash(rel)
	if issue := vaultFileMetadataIssue(slashRel, info); issue != nil {
		a.setVaultFileIssue(rel, issue)
		a.removeVaultIndexFileLocked(rel)
		return
	}
	content, err := root.ReadFile(rel)
	if err != nil {
		log.Printf("[watcher] read changed note %q: %v", rel, err)
		a.setVaultFileIssue(rel, vaultFileReadIssue(slashRel, err))
		a.removeVaultIndexFileLocked(rel)
		return
	}
	if issue := vaultFileContentIssue(slashRel, content); issue != nil {
		a.setVaultFileIssue(rel, issue)
		a.removeVaultIndexFileLocked(rel)
		return
	}
	a.updateVaultIndexFileLocked(rel, info, string(content))
}

// forgetWatchedPathLocked drops what the index knew at or below a path that
// was removed, renamed away, or replaced by something the vault does not
// index. It reports whether indexed notes may have gone with it.
func (a *App) forgetWatchedPathLocked(rel string, markdown bool) bool {
	if markdown {
		a.removeVaultIndexPathLocked(rel)
		return true
	}
	a.removeVaultFileIssuesBelow(rel)
	if a.vaultIndex == nil {
		// No published index records what the path held. A cold scan may
		// already have read notes beneath a folder that has now left, so it
		// starts over unless the cached tree knows the path was a plain file.
		if a.vaultIndexScan != nil && !a.fileTreeCacheHoldsFileLocked(rel) {
			a.vaultIndexScan.invalidated = true
		}
		return false
	}
	if !a.vaultIndex.holdsPathAtOrBelow(filepath.ToSlash(rel)) {
		return false
	}
	a.removeVaultIndexPathLocked(rel)
	return true
}

func (a *App) fileTreeCacheHoldsFileLocked(rel string) bool {
	clean, visible := visibleFileTreeCachePath(rel)
	if !visible || a.fileTreeEntries == nil {
		return false
	}
	entry, found := a.fileTreeEntries[clean]
	return found && entry.typeName == "file"
}

// reconcileWatchedFolderLocked brings the index in line with a folder that
// appeared: one that was created, is the new name of a rename, was moved into
// the vault, or replaced another of the same name. The watcher reports such a
// folder once and says nothing about the notes inside it. Notes whose indexed
// metadata still matches the disk are left alone, so a folder Figaro itself
// just moved costs one metadata walk and no reads.
//
// It reports whether the index changed, and false for withinBudget when the
// folder needs more per-note work than the batch allows or cannot be walked;
// the caller then invalidates the index for one rebuild.
func (a *App) reconcileWatchedFolderLocked(root *os.Root, rel string, noteBudget *int) (changed bool, withinBudget bool) {
	folder, visible := visibleFileTreeCachePath(rel)
	if !visible {
		return false, true
	}
	if a.vaultIndex == nil {
		if a.vaultIndexScan != nil {
			a.vaultIndexScan.invalidated = true
		}
		a.invalidateCalendarIndexLocked()
		return true, true
	}

	present := make(map[string]fs.FileInfo)
	err := fs.WalkDir(root.FS(), folder, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			if vault.IsSkippableWalkError(walkErr) {
				return nil
			}
			return walkErr
		}
		if entry.Type()&fs.ModeSymlink != 0 {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			if vault.IsSkippableWalkError(err) {
				return nil
			}
			return err
		}
		if info.Mode()&fs.ModeSymlink != 0 {
			return nil
		}
		if info.IsDir() {
			if path != folder && strings.HasPrefix(entry.Name(), ".") {
				return fs.SkipDir
			}
			return nil
		}
		if info.Mode().IsRegular() && strings.HasSuffix(strings.ToLower(entry.Name()), ".md") {
			present[path] = info
		}
		return nil
	})
	if err != nil {
		log.Printf("[watcher] walk new folder %q: %v", folder, err)
		return false, false
	}

	stale := make([]string, 0)
	for _, indexedPath := range a.vaultIndex.pathsAtOrBelow(folder) {
		if _, exists := present[indexedPath]; !exists {
			stale = append(stale, indexedPath)
		}
	}
	pending := make([]string, 0, len(present))
	for path, info := range present {
		if file, indexed := a.vaultIndex.files[path]; indexed && file.matchesMetadata(info) {
			continue
		}
		pending = append(pending, path)
	}
	*noteBudget -= len(stale) + len(pending)
	if *noteBudget < 0 {
		return false, false
	}
	sort.Strings(pending)
	for _, path := range stale {
		a.removeVaultIndexFileLocked(filepath.FromSlash(path))
	}
	for _, path := range pending {
		a.indexWatchedNoteLocked(root, filepath.FromSlash(path), present[path])
	}
	return len(stale)+len(pending) > 0, true
}
