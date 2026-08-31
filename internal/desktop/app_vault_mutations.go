package desktop

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	goruntime "runtime"
	"sort"

	"figaro/internal/mutations"
	"figaro/internal/recovery"
)

// CreateDirectory creates a new folder in the vault.
func (a *App) CreateDirectory(relPath string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	cleanRel, err := vaultRelativePath(relPath)
	if err != nil {
		return nil, err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if err := root.MkdirAll(cleanRel, 0755); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	a.addFileTreeCacheDirectoryLocked(cleanRel)
	return &SaveFileResult{Success: true, Path: relPath}, nil
}

// DeletePath deletes a file or directory (recursive).
func (a *App) DeletePath(relPath string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	cleanRel, err := vaultRelativePath(relPath)
	if err != nil {
		return nil, err
	}
	if cleanRel == "." {
		return &SaveFileResult{Success: false, Error: "Cannot delete vault root"}, nil
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	pathInfo, err := root.Lstat(cleanRel)
	if os.IsNotExist(err) {
		return &SaveFileResult{Success: false, Error: "Path not found"}, nil
	} else if err != nil {
		return nil, err
	}
	if a.history == nil {
		return &SaveFileResult{Success: false, Error: "Local history is unavailable. Nothing was deleted."}, nil
	}
	snapshot, err := a.history.ArchivePathSnapshotWithVaultLocked(cleanRel)
	if err != nil {
		return &SaveFileResult{
			Success: false,
			Error:   fmt.Sprintf("Could not record the current contents in local history: %v. Nothing was deleted.", err),
		}, nil
	}
	kind := "file"
	if pathInfo.IsDir() {
		kind = "directory"
	}
	deleted := newRecentlyDeletedItem(cleanRel, kind, snapshot)
	items, err := a.readRecentlyDeletedLocked()
	if err != nil {
		return &SaveFileResult{Success: false, Error: fmt.Sprintf("Could not read the recovery list: %v. Nothing was deleted.", err)}, nil
	}
	if err := a.writeRecentlyDeletedLocked(recovery.Add(items, deleted)); err != nil {
		return &SaveFileResult{Success: false, Error: fmt.Sprintf("Could not update the recovery list: %v. Nothing was deleted.", err)}, nil
	}
	if err := root.RemoveAll(cleanRel); err != nil {
		return nil, err
	}
	a.removeFileTreeCachePathLocked(cleanRel)
	if err := a.removeFileTreeStylePathsLocked(cleanRel); err != nil {
		log.Printf("[file-tree] Could not remove styles for deleted path %q: %v", filepath.ToSlash(cleanRel), err)
	}
	if err := a.rewriteKanbanOrderPaths(cleanRel, "", true); err != nil {
		log.Printf("[kanban] Could not remove card-order paths beneath %q: %v", filepath.ToSlash(cleanRel), err)
	}
	a.resetFileVersionsLocked()
	a.syncKanbanColumnsLocked()
	return &SaveFileResult{Success: true, DeletedID: deleted.ID}, nil
}

// RenamePath renames/moves a file or folder.
func (a *App) RenamePath(oldRel string, newRel string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()
	return a.renamePathLocked(oldRel, newRel, true)
}

// RenamePathWithLinkUpdates applies the explicit reference choice made by the
// file-tree rename flow. Moves retain RenamePath's link-preserving default.
func (a *App) RenamePathWithLinkUpdates(oldRel string, newRel string, updateLinks bool) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()
	return a.renamePathLocked(oldRel, newRel, updateLinks)
}

// PreviewRenamePath reports the Markdown files whose exact links would change
// without mutating the vault. The renamed Markdown file itself is excluded: a
// prompt is required only for references authored by another note.
func (a *App) PreviewRenamePath(oldRel string, newRel string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	oldClean, err := vaultRelativePath(oldRel)
	if err != nil {
		return nil, err
	}
	newClean, err := vaultRelativePath(newRel)
	if err != nil {
		return nil, err
	}
	if oldClean == "." || newClean == "." {
		return &SaveFileResult{Success: false, Error: "Cannot rename vault root"}, nil
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	info, err := root.Stat(oldClean)
	if os.IsNotExist(err) {
		return &SaveFileResult{Success: false, Error: "Source not found"}, nil
	} else if err != nil {
		return nil, err
	}
	if info.IsDir() {
		return &SaveFileResult{Success: true, OldPath: oldRel, Path: newRel, UpdatedLinks: []string{}}, nil
	}
	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, fmt.Errorf("index links for rename preview: %w", err)
	}
	rewrites, _, err := collectVaultLinkRewritesIndexed(root, index, oldClean, newClean)
	if err != nil {
		return nil, fmt.Errorf("collect links for rename preview: %w", err)
	}
	updated := make(map[string]struct{}, len(rewrites))
	for _, rewrite := range rewrites {
		path := filepath.ToSlash(rewrite.path)
		if path == filepath.ToSlash(oldClean) || path == filepath.ToSlash(newClean) {
			continue
		}
		updated[path] = struct{}{}
	}
	updatedLinks := make([]string, 0, len(updated))
	for path := range updated {
		updatedLinks = append(updatedLinks, path)
	}
	sort.Strings(updatedLinks)
	return &SaveFileResult{
		Success:      true,
		OldPath:      oldRel,
		Path:         newRel,
		UpdatedLinks: updatedLinks,
	}, nil
}

func (a *App) renamePathLocked(oldRel string, newRel string, updateLinks bool) (*SaveFileResult, error) {
	oldClean, err := vaultRelativePath(oldRel)
	if err != nil {
		return nil, err
	}
	newClean, err := vaultRelativePath(newRel)
	if err != nil {
		return nil, err
	}
	if oldClean == "." || newClean == "." {
		return &SaveFileResult{Success: false, Error: "Cannot rename vault root"}, nil
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if _, err := root.Stat(oldClean); os.IsNotExist(err) {
		return &SaveFileResult{Success: false, Error: "Source not found"}, nil
	} else if err != nil {
		return nil, err
	}
	if _, err := root.Stat(newClean); err == nil {
		return &SaveFileResult{Success: false, Error: "Destination exists"}, nil
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	if err := root.MkdirAll(filepath.Dir(newClean), 0755); err != nil {
		return nil, err
	}
	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, fmt.Errorf("index links for move: %w", err)
	}
	linkRewrites := make([]vaultLinkRewrite, 0)
	indexCurrent := false
	if updateLinks {
		linkRewrites, indexCurrent, err = collectVaultLinkRewritesIndexed(root, index, oldClean, newClean)
		if err != nil {
			return nil, fmt.Errorf("collect links for move: %w", err)
		}
	} else {
		indexCurrent, err = vaultIndexMatchesMarkdownFiles(root, index)
		if err != nil {
			return nil, fmt.Errorf("validate link index for move: %w", err)
		}
	}
	if err := root.Rename(oldClean, newClean); err != nil {
		return nil, err
	}
	if applied, err := applyVaultLinkRewrites(root, linkRewrites); err != nil {
		restoreErr := restoreVaultLinkRewrites(root, applied)
		renameErr := root.Rename(newClean, oldClean)
		a.resetFileVersionsLocked()
		if restoreErr != nil || renameErr != nil {
			return nil, fmt.Errorf("%w (rollback links: %v; rollback move: %v)", err, restoreErr, renameErr)
		}
		return nil, err
	}
	if indexCurrent {
		a.remapFileTreeCachePathLocked(oldClean, newClean)
	} else {
		a.invalidateFileTreeCacheLocked()
	}
	a.resetFileVersionsLocked()
	if !indexCurrent {
		a.syncKanbanColumnsLocked()
	} else if err := a.refreshVaultIndexAfterMoveLocked(root, oldClean, newClean, linkRewrites); err != nil {
		log.Printf("[vault-index] Could not update moved paths incrementally: %v", err)
		a.syncKanbanColumnsLocked()
	}
	if err := a.rewriteFileTreeStylePathsLocked(oldClean, newClean, false); err != nil {
		log.Printf("[file-tree] Could not move styles from %q to %q: %v", filepath.ToSlash(oldClean), filepath.ToSlash(newClean), err)
	}
	if err := a.rewriteKanbanOrderPaths(oldClean, newClean, false); err != nil {
		log.Printf("[kanban] Could not move card-order paths from %q to %q: %v", filepath.ToSlash(oldClean), filepath.ToSlash(newClean), err)
	}
	updatedLinks := make([]string, 0, len(linkRewrites))
	for _, rewrite := range linkRewrites {
		updatedLinks = append(updatedLinks, filepath.ToSlash(rewrite.path))
	}
	return &SaveFileResult{Success: true, OldPath: oldRel, Path: newRel, UpdatedLinks: updatedLinks}, nil
}

// MovePath moves a file or directory into a target directory.
func (a *App) MovePath(sourceRel string, targetDirRel string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	sourceClean, err := vaultRelativePath(sourceRel)
	if err != nil {
		return nil, err
	}
	targetClean, err := vaultRelativePath(targetDirRel)
	if err != nil {
		return nil, err
	}
	if sourceClean == "." {
		return &SaveFileResult{Success: false, Error: "Cannot move vault root"}, nil
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	sourceInfo, err := root.Stat(sourceClean)
	if os.IsNotExist(err) {
		return &SaveFileResult{Success: false, Error: "Source not found"}, nil
	}
	if err != nil {
		return nil, err
	}
	if sourceInfo.IsDir() && mutations.IsSameOrDescendant(
		sourceClean,
		targetClean,
		goruntime.GOOS == "windows",
	) {
		return &SaveFileResult{Success: false, Error: "Cannot move a directory into itself"}, nil
	}
	if err := root.MkdirAll(targetClean, 0755); err != nil {
		return nil, err
	}

	newRel := mutations.Destination(sourceClean, targetClean)
	destinationExists := false
	destinationIsDirectory := false
	if destinationInfo, destinationErr := root.Lstat(newRel); destinationErr == nil {
		destinationExists = true
		destinationIsDirectory = destinationInfo.IsDir()
	} else if !os.IsNotExist(destinationErr) {
		return nil, destinationErr
	}
	plan := mutations.PlanMove(
		sourceClean,
		targetClean,
		sourceInfo.IsDir(),
		destinationExists,
		destinationIsDirectory,
		goruntime.GOOS == "windows",
	)
	if plan.Error != "" {
		return &SaveFileResult{
			Success:        false,
			Error:          plan.Error,
			OldPath:        filepath.ToSlash(sourceClean),
			Path:           filepath.ToSlash(plan.Destination),
			MergeAvailable: plan.MergeAvailable,
		}, nil
	}
	return a.renamePathLocked(sourceClean, newRel, true)
}

type directoryMergeRename struct {
	oldPath string
	newPath string
}

// MergeDirectory moves one vault directory into an existing same-named
// destination directory. Existing subdirectories are merged recursively and
// colliding files receive " (copy)", " (copy 2)", and so on. The frontend
// calls this only after the user confirms the merge offered by MovePath.
func (a *App) MergeDirectory(sourceRel string, targetDirRel string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	sourceClean, err := vaultRelativePath(sourceRel)
	if err != nil {
		return nil, err
	}
	targetClean, err := vaultRelativePath(targetDirRel)
	if err != nil {
		return nil, err
	}
	if sourceClean == "." {
		return &SaveFileResult{Success: false, Error: "Cannot merge vault root"}, nil
	}
	if mutations.IsSameOrDescendant(sourceClean, targetClean, goruntime.GOOS == "windows") {
		return &SaveFileResult{Success: false, Error: "Cannot move a directory into itself"}, nil
	}

	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	sourceInfo, err := root.Lstat(sourceClean)
	if os.IsNotExist(err) {
		return &SaveFileResult{Success: false, Error: "Source not found"}, nil
	}
	if err != nil {
		return nil, err
	}
	destination := mutations.Destination(sourceClean, targetClean)
	destinationInfo, err := root.Lstat(destination)
	if os.IsNotExist(err) {
		return &SaveFileResult{Success: false, Error: "Destination directory no longer exists"}, nil
	}
	if err != nil {
		return nil, err
	}
	if !sourceInfo.IsDir() || !destinationInfo.IsDir() {
		return &SaveFileResult{Success: false, Error: "Both merge paths must be directories"}, nil
	}

	renames := make([]directoryMergeRename, 0)
	movedPaths := make(map[string]string)
	updatedLinkSet := make(map[string]struct{})
	if err := a.prepareDirectoryMergeCollisionsLocked(root, sourceClean, destination, &renames, movedPaths, updatedLinkSet); err != nil {
		rollbackErr := a.rollbackDirectoryMergeRenamesLocked(renames)
		return &SaveFileResult{Success: false, Error: errors.Join(err, rollbackErr).Error()}, nil
	}

	linkRewrites, err := collectVaultLinkRewrites(root, sourceClean, destination)
	if err != nil {
		rollbackErr := a.rollbackDirectoryMergeRenamesLocked(renames)
		return &SaveFileResult{Success: false, Error: errors.Join(fmt.Errorf("collect links for merge: %w", err), rollbackErr).Error()}, nil
	}
	createdPaths := make([]string, 0)
	if err := copyPreparedDirectoryMerge(root, sourceClean, destination, &createdPaths); err != nil {
		cleanupErr := removeMergedPaths(root, createdPaths)
		rollbackErr := a.rollbackDirectoryMergeRenamesLocked(renames)
		return &SaveFileResult{Success: false, Error: errors.Join(fmt.Errorf("copy merged directory: %w", err), cleanupErr, rollbackErr).Error()}, nil
	}
	applied, err := applyVaultLinkRewrites(root, linkRewrites)
	if err != nil {
		restoreErr := restoreVaultLinkRewrites(root, applied)
		cleanupErr := removeMergedPaths(root, createdPaths)
		rollbackErr := a.rollbackDirectoryMergeRenamesLocked(renames)
		return &SaveFileResult{Success: false, Error: errors.Join(err, restoreErr, cleanupErr, rollbackErr).Error()}, nil
	}
	if err := root.RemoveAll(sourceClean); err != nil {
		return &SaveFileResult{Success: false, Error: fmt.Sprintf("Merged contents were copied, but the source folder could not be removed: %v", err)}, nil
	}
	a.invalidateFileTreeCacheLocked()

	finalUpdatedLinkSet := make(map[string]struct{}, len(updatedLinkSet)+len(linkRewrites))
	for path := range updatedLinkSet {
		cleanPath := filepath.Clean(filepath.FromSlash(path))
		if vaultPathIsSameOrDescendant(sourceClean, cleanPath) {
			relative, relativeErr := filepath.Rel(sourceClean, cleanPath)
			if relativeErr == nil {
				cleanPath = destination
				if relative != "." {
					cleanPath = filepath.Join(destination, relative)
				}
			}
		}
		finalUpdatedLinkSet[filepath.ToSlash(cleanPath)] = struct{}{}
	}
	for _, rewrite := range linkRewrites {
		finalUpdatedLinkSet[filepath.ToSlash(rewrite.path)] = struct{}{}
	}
	updatedLinks := make([]string, 0, len(finalUpdatedLinkSet))
	for path := range finalUpdatedLinkSet {
		updatedLinks = append(updatedLinks, path)
	}
	sort.Strings(updatedLinks)
	a.resetFileVersionsLocked()
	a.syncKanbanColumnsLocked()
	if err := a.mergeFileTreeStylePathsLocked(sourceClean, destination); err != nil {
		log.Printf("[file-tree] Could not preserve styles after directory merge: %v", err)
	}
	return &SaveFileResult{
		Success:      true,
		OldPath:      filepath.ToSlash(sourceClean),
		Path:         filepath.ToSlash(destination),
		MovedPaths:   movedPaths,
		UpdatedLinks: updatedLinks,
	}, nil
}

func (a *App) prepareDirectoryMergeCollisionsLocked(
	root *os.Root,
	sourceDir string,
	destinationDir string,
	renames *[]directoryMergeRename,
	movedPaths map[string]string,
	updatedLinks map[string]struct{},
) error {
	directory, err := root.Open(sourceDir)
	if err != nil {
		return err
	}
	entries, readErr := directory.ReadDir(-1)
	closeErr := directory.Close()
	if readErr != nil || closeErr != nil {
		return errors.Join(readErr, closeErr)
	}
	for _, entry := range entries {
		sourcePath := filepath.Join(sourceDir, entry.Name())
		destinationPath := filepath.Join(destinationDir, entry.Name())
		sourceInfo, err := root.Lstat(sourcePath)
		if err != nil {
			return err
		}
		destinationInfo, destinationErr := root.Lstat(destinationPath)
		if os.IsNotExist(destinationErr) {
			continue
		}
		if destinationErr != nil {
			return destinationErr
		}
		if sourceInfo.IsDir() && destinationInfo.IsDir() {
			if err := a.prepareDirectoryMergeCollisionsLocked(root, sourcePath, destinationPath, renames, movedPaths, updatedLinks); err != nil {
				return err
			}
			continue
		}

		renamedSource, err := nextParenthesizedMergePath(root, sourcePath, destinationDir, sourceInfo.IsDir())
		if err != nil {
			return err
		}
		result, err := a.renamePathLocked(sourcePath, renamedSource, true)
		if err != nil {
			return err
		}
		if !result.Success {
			return errors.New(result.Error)
		}
		*renames = append(*renames, directoryMergeRename{oldPath: sourcePath, newPath: renamedSource})
		finalPath := filepath.Join(destinationDir, filepath.Base(renamedSource))
		movedPaths[filepath.ToSlash(sourcePath)] = filepath.ToSlash(finalPath)
		for _, path := range result.UpdatedLinks {
			updatedLinks[path] = struct{}{}
		}
	}
	return nil
}

func (a *App) rollbackDirectoryMergeRenamesLocked(renames []directoryMergeRename) error {
	var rollbackErrors []error
	for index := len(renames) - 1; index >= 0; index-- {
		rename := renames[index]
		result, err := a.renamePathLocked(rename.newPath, rename.oldPath, true)
		if err != nil {
			rollbackErrors = append(rollbackErrors, err)
		} else if !result.Success {
			rollbackErrors = append(rollbackErrors, errors.New(result.Error))
		}
	}
	return errors.Join(rollbackErrors...)
}

func nextParenthesizedMergePath(root *os.Root, sourcePath string, destinationDir string, isDirectory bool) (string, error) {
	name := filepath.Base(sourcePath)
	sourceDir := filepath.Dir(sourcePath)
	for index := 1; index < 10000; index++ {
		candidateName := parenthesizedCopyCollisionName(name, isDirectory, index)
		sourceCandidate := filepath.Join(sourceDir, candidateName)
		destinationCandidate := filepath.Join(destinationDir, candidateName)
		sourceAvailable, err := rootPathAvailable(root, sourceCandidate)
		if err != nil {
			return "", err
		}
		destinationAvailable, err := rootPathAvailable(root, destinationCandidate)
		if err != nil {
			return "", err
		}
		if sourceAvailable && destinationAvailable {
			return sourceCandidate, nil
		}
	}
	return "", fmt.Errorf("could not find an available merge name for %q", name)
}

func rootPathAvailable(root *os.Root, path string) (bool, error) {
	if _, err := root.Lstat(path); os.IsNotExist(err) {
		return true, nil
	} else if err != nil {
		return false, err
	}
	return false, nil
}

func parenthesizedCopyCollisionName(name string, isDirectory bool, index int) string {
	return mutations.ParenthesizedCopyCollisionName(name, isDirectory, index)
}

func copyPreparedDirectoryMerge(root *os.Root, sourceDir string, destinationDir string, createdPaths *[]string) error {
	directory, err := root.Open(sourceDir)
	if err != nil {
		return err
	}
	entries, readErr := directory.ReadDir(-1)
	closeErr := directory.Close()
	if readErr != nil || closeErr != nil {
		return errors.Join(readErr, closeErr)
	}
	for _, entry := range entries {
		sourcePath := filepath.Join(sourceDir, entry.Name())
		destinationPath := filepath.Join(destinationDir, entry.Name())
		sourceInfo, err := root.Lstat(sourcePath)
		if err != nil {
			return err
		}
		destinationInfo, destinationErr := root.Lstat(destinationPath)
		if destinationErr == nil && sourceInfo.IsDir() && destinationInfo.IsDir() {
			if err := copyPreparedDirectoryMerge(root, sourcePath, destinationPath, createdPaths); err != nil {
				return err
			}
			continue
		}
		if destinationErr == nil {
			return fmt.Errorf("merge collision was not resolved for %q", filepath.ToSlash(sourcePath))
		}
		if !os.IsNotExist(destinationErr) {
			return destinationErr
		}
		created, err := copyVaultTree(root, sourcePath, destinationPath)
		if created {
			*createdPaths = append(*createdPaths, destinationPath)
		}
		if err != nil {
			return err
		}
	}
	return nil
}

func removeMergedPaths(root *os.Root, paths []string) error {
	var cleanupErrors []error
	for index := len(paths) - 1; index >= 0; index-- {
		if err := root.RemoveAll(paths[index]); err != nil && !os.IsNotExist(err) {
			cleanupErrors = append(cleanupErrors, err)
		}
	}
	return errors.Join(cleanupErrors...)
}

const recursiveCopyError = mutations.RecursiveCopyError

// CopyPath copies one vault file or directory into an existing vault
// directory. Existing entries are never replaced: a collision receives a
// descriptive copy suffix (for example, "Notes copy" or "note copy 2.md").
func (a *App) CopyPath(sourceRel string, targetDirRel string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	sourceClean, err := vaultRelativePath(sourceRel)
	if err != nil {
		return nil, err
	}
	targetClean, err := vaultRelativePath(targetDirRel)
	if err != nil {
		return nil, err
	}
	if sourceClean == "." {
		return &SaveFileResult{Success: false, Error: "Cannot copy vault root"}, nil
	}

	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()

	sourceInfo, err := root.Lstat(sourceClean)
	if os.IsNotExist(err) {
		return &SaveFileResult{Success: false, Error: "Source not found"}, nil
	}
	if err != nil {
		return nil, err
	}
	if sourceInfo.Mode()&fs.ModeSymlink != 0 {
		return &SaveFileResult{Success: false, Error: "Cannot copy symbolic links"}, nil
	}
	if !sourceInfo.IsDir() && !sourceInfo.Mode().IsRegular() {
		return &SaveFileResult{Success: false, Error: "Cannot copy special files"}, nil
	}

	targetInfo, err := root.Lstat(targetClean)
	if os.IsNotExist(err) {
		return &SaveFileResult{Success: false, Error: "Paste destination no longer exists"}, nil
	}
	if err != nil {
		return nil, err
	}
	if targetInfo.Mode()&fs.ModeSymlink != 0 || !targetInfo.IsDir() {
		return &SaveFileResult{Success: false, Error: "Paste destination is not a folder"}, nil
	}
	if validationError := mutations.ValidateCopy(
		sourceClean,
		targetClean,
		sourceInfo.IsDir(),
		goruntime.GOOS == "windows",
	); validationError != "" {
		return &SaveFileResult{Success: false, Error: validationError}, nil
	}

	destination, err := nextCopyDestination(root, sourceClean, targetClean, sourceInfo.IsDir())
	if err != nil {
		return nil, err
	}
	createdDestination, copyErr := copyVaultTree(root, sourceClean, destination)
	if copyErr != nil {
		if createdDestination {
			if cleanupErr := root.RemoveAll(destination); cleanupErr != nil {
				log.Printf("[file-copy] Could not remove incomplete copy %q: %v", destination, cleanupErr)
			}
		}
		return &SaveFileResult{Success: false, Error: fmt.Sprintf("Could not copy %q: %v", filepath.Base(sourceClean), copyErr)}, nil
	}
	updatedLinks, rewriteErr := rewriteCopiedMarkdownLinks(root, sourceClean, destination)
	if rewriteErr != nil {
		if cleanupErr := root.RemoveAll(destination); cleanupErr != nil {
			log.Printf("[file-copy] Could not remove copy after link rewrite failure %q: %v", destination, cleanupErr)
		}
		return &SaveFileResult{Success: false, Error: fmt.Sprintf("Could not preserve links in copied item %q: %v", filepath.Base(sourceClean), rewriteErr)}, nil
	}

	indexCurrent, validationErr := vaultIndexMatchesMarkdownFilesExcluding(root, a.vaultIndex, destination)
	if validationErr != nil {
		log.Printf("[vault-index] Could not validate the warm index after copying %q: %v", filepath.ToSlash(destination), validationErr)
		indexCurrent = false
	}
	copiedPaths, refreshErr := a.refreshVaultStateAfterCopyLocked(root, destination, indexCurrent)
	if refreshErr != nil {
		log.Printf("[vault-index] Could not update copied paths incrementally: %v", refreshErr)
		indexCurrent = false
	}
	if !indexCurrent {
		a.syncKanbanColumnsLocked()
	}
	for _, copiedPath := range copiedPaths {
		a.markInternalVaultWriteLocked(copiedPath)
	}
	// A copied Markdown file whose destinations change is first created by the
	// tree copy and then atomically replaced by the link rewrite. Those events
	// can settle in separate native batches on a large copy.
	for _, updatedPath := range updatedLinks {
		a.markInternalVaultWriteLocked(filepath.Clean(filepath.FromSlash(updatedPath)))
	}
	if err := a.rewriteFileTreeStylePathsLocked(sourceClean, destination, true); err != nil {
		log.Printf("[file-tree] Could not copy styles from %q to %q: %v", filepath.ToSlash(sourceClean), filepath.ToSlash(destination), err)
	}
	return &SaveFileResult{Success: true, Path: filepath.ToSlash(destination), UpdatedLinks: updatedLinks}, nil
}

func vaultPathIsSameOrDescendant(parent, candidate string) bool {
	return mutations.IsSameOrDescendant(parent, candidate, goruntime.GOOS == "windows")
}

func nextCopyDestination(root *os.Root, source, targetDirectory string, isDirectory bool) (string, error) {
	name := filepath.Base(source)
	for index := 0; index < 10000; index++ {
		candidateName := name
		if index > 0 {
			candidateName = copyCollisionName(name, isDirectory, index)
		}
		candidate := candidateName
		if targetDirectory != "." {
			candidate = filepath.Join(targetDirectory, candidateName)
		}
		if _, err := root.Lstat(candidate); os.IsNotExist(err) {
			return candidate, nil
		} else if err != nil {
			return "", err
		}
	}
	return "", fmt.Errorf("could not find an available copy name for %q", name)
}

func copyCollisionName(name string, isDirectory bool, index int) string {
	return mutations.CopyCollisionName(name, isDirectory, index)
}

func copyVaultTree(root *os.Root, source, destination string) (bool, error) {
	info, err := root.Lstat(source)
	if err != nil {
		return false, err
	}
	if info.Mode()&fs.ModeSymlink != 0 {
		return false, fmt.Errorf("source contains symbolic link %q", filepath.Base(source))
	}
	if info.IsDir() {
		input, err := root.Open(source)
		if err != nil {
			return false, err
		}
		defer input.Close()
		openedInfo, err := input.Stat()
		if err != nil || !openedInfo.IsDir() || !os.SameFile(info, openedInfo) {
			return false, fmt.Errorf("source folder changed while it was being copied")
		}
		if err := root.Mkdir(destination, info.Mode().Perm()|0700); err != nil {
			return false, err
		}
		entries, err := input.ReadDir(-1)
		if err != nil {
			return true, err
		}
		for _, entry := range entries {
			if _, err := copyVaultTree(root, filepath.Join(source, entry.Name()), filepath.Join(destination, entry.Name())); err != nil {
				return true, err
			}
		}
		return true, nil
	}
	if !info.Mode().IsRegular() {
		return false, fmt.Errorf("source contains special file %q", filepath.Base(source))
	}

	input, err := root.Open(source)
	if err != nil {
		return false, err
	}
	defer input.Close()
	openedInfo, err := input.Stat()
	if err != nil || !openedInfo.Mode().IsRegular() || !os.SameFile(info, openedInfo) {
		return false, fmt.Errorf("source file changed while it was being copied")
	}
	output, err := root.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, info.Mode().Perm())
	if err != nil {
		return false, err
	}
	removeIncomplete := true
	defer func() {
		_ = output.Close()
		if removeIncomplete {
			_ = root.Remove(destination)
		}
	}()
	if _, err := io.Copy(output, input); err != nil {
		return true, err
	}
	if err := output.Sync(); err != nil {
		return true, err
	}
	if err := output.Close(); err != nil {
		return true, err
	}
	removeIncomplete = false
	return true, nil
}
