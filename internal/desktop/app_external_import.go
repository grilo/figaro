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
	"strings"
	"time"
)

// CopyExternalResult reports the vault-relative top-level paths imported from
// a native file manager drop. Sources are never removed.
type CopyExternalResult struct {
	Success            bool     `json:"success"`
	Paths              []string `json:"paths,omitempty"`
	Conflicts          []string `json:"conflicts,omitempty"`
	DirectoryConflicts []string `json:"directory_conflicts,omitempty"`
	Error              string   `json:"error,omitempty"`
}

type externalCopyPlan struct {
	source      string
	destination string
	replace     bool
}

type externalCopyBackup struct {
	destination string
	backup      string
}

// CopyExternalPaths copies files or folders supplied by Wails' native file
// drop channel into an existing vault directory. It preflights the complete
// batch and only replaces existing entries after the frontend has received
// their paths and obtained explicit user confirmation.
func (a *App) CopyExternalPaths(sourcePaths []string, targetDirRel string, replaceExisting bool) (*CopyExternalResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	if len(sourcePaths) == 0 {
		return &CopyExternalResult{Success: false, Error: "No files or folders were dropped"}, nil
	}
	targetClean, err := vaultRelativePath(targetDirRel)
	if err != nil {
		return &CopyExternalResult{Success: false, Error: err.Error()}, nil
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	targetInfo, err := root.Stat(targetClean)
	if os.IsNotExist(err) {
		return &CopyExternalResult{Success: false, Error: "Drop destination no longer exists"}, nil
	}
	if err != nil {
		return nil, err
	}
	if !targetInfo.IsDir() {
		return &CopyExternalResult{Success: false, Error: "Drop destination is not a folder"}, nil
	}

	targetAbsolute, err := filepath.EvalSymlinks(a.vaultAbsolutePath(targetClean))
	if err != nil {
		return nil, fmt.Errorf("resolve drop destination: %w", err)
	}
	plans := make([]externalCopyPlan, 0, len(sourcePaths))
	conflicts := make([]string, 0)
	directoryConflicts := make([]string, 0)
	seenDestinations := make(map[string]struct{}, len(sourcePaths))
	for _, suppliedPath := range sourcePaths {
		source := filepath.Clean(strings.TrimSpace(suppliedPath))
		if source == "." || !filepath.IsAbs(source) {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Dropped path must be absolute: %q", suppliedPath)}, nil
		}
		info, err := os.Lstat(source)
		if err != nil {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot inspect %q: %v", filepath.Base(source), err)}, nil
		}
		if info.Mode()&fs.ModeSymlink != 0 {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot import symbolic link %q", filepath.Base(source))}, nil
		}
		if !info.IsDir() && !info.Mode().IsRegular() {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot import special file %q", filepath.Base(source))}, nil
		}
		if err := validateExternalCopyTree(source); err != nil {
			return &CopyExternalResult{Success: false, Error: err.Error()}, nil
		}

		destination := filepath.Join(targetClean, filepath.Base(source))
		if targetClean == "." {
			destination = filepath.Base(source)
		}
		key := filepath.Clean(destination)
		if goruntime.GOOS == "windows" {
			key = strings.ToLower(key)
		}
		if _, duplicate := seenDestinations[key]; duplicate {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("More than one dropped item is named %q", filepath.Base(source))}, nil
		}
		seenDestinations[key] = struct{}{}
		destinationInfo, destinationErr := root.Stat(destination)
		replace := false
		if destinationErr == nil {
			if os.SameFile(info, destinationInfo) {
				return &CopyExternalResult{Success: false, Error: fmt.Sprintf("%q is already at the destination", filepath.Base(source))}, nil
			}
			replace = true
			conflicts = append(conflicts, filepath.ToSlash(destination))
			if info.IsDir() && destinationInfo.IsDir() {
				directoryConflicts = append(directoryConflicts, filepath.ToSlash(destination))
			}
		} else if !os.IsNotExist(destinationErr) {
			return nil, destinationErr
		}

		resolvedSource, err := filepath.EvalSymlinks(source)
		if err != nil {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot resolve %q: %v", filepath.Base(source), err)}, nil
		}
		if info.IsDir() && pathIsWithin(resolvedSource, filepath.Join(targetAbsolute, filepath.Base(source))) {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot copy folder %q into itself", filepath.Base(source))}, nil
		}
		plans = append(plans, externalCopyPlan{source: source, destination: destination, replace: replace})
	}
	if len(conflicts) > 0 && !replaceExisting {
		return &CopyExternalResult{
			Success:            false,
			Conflicts:          conflicts,
			DirectoryConflicts: directoryConflicts,
			Error:              "One or more items already exist in the destination",
		}, nil
	}

	backupRoot := ""
	backups := make([]externalCopyBackup, 0, len(conflicts))
	if len(conflicts) > 0 {
		backupRoot, err = createExternalCopyBackupRoot(root)
		if err != nil {
			return nil, fmt.Errorf("prepare replacement backup: %w", err)
		}
		for index, plan := range plans {
			if !plan.replace {
				continue
			}
			backup := filepath.Join(backupRoot, fmt.Sprintf("%d", index))
			if err := root.Rename(plan.destination, backup); err != nil {
				restoreErr := restoreExternalCopyBackups(root, backups)
				if restoreErr == nil {
					_ = root.RemoveAll(backupRoot)
				}
				return &CopyExternalResult{Success: false, Error: errors.Join(
					fmt.Errorf("could not prepare replacement for %q: %w", filepath.Base(plan.destination), err),
					restoreErr,
				).Error()}, nil
			}
			backups = append(backups, externalCopyBackup{destination: plan.destination, backup: backup})
		}
	}

	copied := make([]string, 0, len(plans))
	for _, plan := range plans {
		log.Printf("[file-drop] Copying %q into vault path %q", plan.source, filepath.ToSlash(plan.destination))
		createdDestination, err := copyExternalTree(root, plan.source, plan.destination)
		if err != nil {
			if createdDestination {
				copied = append(copied, plan.destination)
			}
			for index := len(copied) - 1; index >= 0; index-- {
				if cleanupErr := root.RemoveAll(copied[index]); cleanupErr != nil {
					log.Printf("[file-drop] Could not roll back incomplete import %q: %v", copied[index], cleanupErr)
				}
			}
			restoreErr := restoreExternalCopyBackups(root, backups)
			if backupRoot != "" && restoreErr == nil {
				_ = root.RemoveAll(backupRoot)
			}
			return &CopyExternalResult{Success: false, Error: errors.Join(
				fmt.Errorf("could not copy %q: %w", filepath.Base(plan.source), err),
				restoreErr,
			).Error()}, nil
		}
		copied = append(copied, plan.destination)
	}
	if backupRoot != "" {
		if err := root.RemoveAll(backupRoot); err != nil {
			log.Printf("[file-drop] Could not remove completed replacement backup %q: %v", backupRoot, err)
		}
	}
	a.invalidateFileTreeCacheLocked()
	a.syncKanbanColumnsLocked()
	paths := make([]string, len(copied))
	for index, path := range copied {
		paths[index] = filepath.ToSlash(path)
	}
	return &CopyExternalResult{Success: true, Paths: paths}, nil
}

// MergeExternalPaths imports native files and directories without replacing
// anything already in the vault. Existing same-named directories merge
// recursively; every other collision receives a parenthesized copy suffix.
func (a *App) MergeExternalPaths(sourcePaths []string, targetDirRel string) (*CopyExternalResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	if len(sourcePaths) == 0 {
		return &CopyExternalResult{Success: false, Error: "No files or folders were dropped"}, nil
	}
	targetClean, err := vaultRelativePath(targetDirRel)
	if err != nil {
		return &CopyExternalResult{Success: false, Error: err.Error()}, nil
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	targetInfo, err := root.Lstat(targetClean)
	if err != nil {
		return &CopyExternalResult{Success: false, Error: "Drop destination no longer exists"}, nil
	}
	if !targetInfo.IsDir() {
		return &CopyExternalResult{Success: false, Error: "Drop destination is not a folder"}, nil
	}
	targetAbsolute, err := filepath.EvalSymlinks(a.vaultAbsolutePath(targetClean))
	if err != nil {
		return nil, fmt.Errorf("resolve drop destination: %w", err)
	}

	seenNames := make(map[string]struct{}, len(sourcePaths))
	sources := make([]string, 0, len(sourcePaths))
	for _, suppliedPath := range sourcePaths {
		source := filepath.Clean(strings.TrimSpace(suppliedPath))
		if source == "." || !filepath.IsAbs(source) {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Dropped path must be absolute: %q", suppliedPath)}, nil
		}
		info, err := os.Lstat(source)
		if err != nil {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot inspect %q: %v", filepath.Base(source), err)}, nil
		}
		if info.Mode()&fs.ModeSymlink != 0 || (!info.IsDir() && !info.Mode().IsRegular()) {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot import unsupported path %q", filepath.Base(source))}, nil
		}
		if err := validateExternalCopyTree(source); err != nil {
			return &CopyExternalResult{Success: false, Error: err.Error()}, nil
		}
		nameKey := filepath.Base(source)
		if goruntime.GOOS == "windows" {
			nameKey = strings.ToLower(nameKey)
		}
		if _, duplicate := seenNames[nameKey]; duplicate {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("More than one dropped item is named %q", filepath.Base(source))}, nil
		}
		seenNames[nameKey] = struct{}{}
		resolvedSource, err := filepath.EvalSymlinks(source)
		if err != nil {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot resolve %q: %v", filepath.Base(source), err)}, nil
		}
		if info.IsDir() && pathIsWithin(resolvedSource, filepath.Join(targetAbsolute, filepath.Base(source))) {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot copy folder %q into itself", filepath.Base(source))}, nil
		}
		sources = append(sources, source)
	}

	createdPaths := make([]string, 0)
	paths := make([]string, 0, len(sources))
	for _, source := range sources {
		destination := filepath.Join(targetClean, filepath.Base(source))
		if targetClean == "." {
			destination = filepath.Base(source)
		}
		actualDestination, err := copyExternalTreeMerged(root, source, destination, &createdPaths)
		if err != nil {
			cleanupErr := removeMergedPaths(root, createdPaths)
			return &CopyExternalResult{Success: false, Error: errors.Join(fmt.Errorf("could not merge %q: %w", filepath.Base(source), err), cleanupErr).Error()}, nil
		}
		paths = append(paths, filepath.ToSlash(actualDestination))
	}
	a.syncKanbanColumnsLocked()
	return &CopyExternalResult{Success: true, Paths: paths}, nil
}

func copyExternalTreeMerged(root *os.Root, source string, destination string, createdPaths *[]string) (string, error) {
	sourceInfo, err := os.Lstat(source)
	if err != nil {
		return "", err
	}
	destinationInfo, destinationErr := root.Lstat(destination)
	if destinationErr == nil && sourceInfo.IsDir() && destinationInfo.IsDir() {
		entries, err := os.ReadDir(source)
		if err != nil {
			return "", err
		}
		for _, entry := range entries {
			if _, err := copyExternalTreeMerged(root, filepath.Join(source, entry.Name()), filepath.Join(destination, entry.Name()), createdPaths); err != nil {
				return "", err
			}
		}
		return destination, nil
	}
	actualDestination := destination
	if destinationErr == nil {
		actualDestination, err = nextParenthesizedExternalDestination(root, destination, sourceInfo.IsDir())
		if err != nil {
			return "", err
		}
	} else if !os.IsNotExist(destinationErr) {
		return "", destinationErr
	}
	created, err := copyExternalTree(root, source, actualDestination)
	if created {
		*createdPaths = append(*createdPaths, actualDestination)
	}
	return actualDestination, err
}

func nextParenthesizedExternalDestination(root *os.Root, destination string, isDirectory bool) (string, error) {
	directory := filepath.Dir(destination)
	name := filepath.Base(destination)
	for index := 1; index < 10000; index++ {
		candidate := filepath.Join(directory, parenthesizedCopyCollisionName(name, isDirectory, index))
		available, err := rootPathAvailable(root, candidate)
		if err != nil {
			return "", err
		}
		if available {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("could not find an available merge name for %q", name)
}

func createExternalCopyBackupRoot(root *os.Root) (string, error) {
	if err := root.MkdirAll(".config", 0700); err != nil {
		return "", err
	}
	for attempt := 0; attempt < 16; attempt++ {
		rel := filepath.Join(".config", fmt.Sprintf(".file-drop-backup-%d-%d", time.Now().UnixNano(), attempt))
		if err := root.Mkdir(rel, 0700); os.IsExist(err) {
			continue
		} else if err != nil {
			return "", err
		}
		return rel, nil
	}
	return "", errors.New("could not create a unique file-drop backup directory")
}

func restoreExternalCopyBackups(root *os.Root, backups []externalCopyBackup) error {
	var restoreErrors []error
	for index := len(backups) - 1; index >= 0; index-- {
		backup := backups[index]
		if err := root.Rename(backup.backup, backup.destination); err != nil {
			log.Printf("[file-drop] Could not restore replaced vault path %q from %q: %v", backup.destination, backup.backup, err)
			restoreErrors = append(restoreErrors, fmt.Errorf("could not restore original %q: %w", filepath.Base(backup.destination), err))
		}
	}
	return errors.Join(restoreErrors...)
}

func validateExternalCopyTree(source string) error {
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return fmt.Errorf("Cannot read %q: %w", filepath.Base(path), walkErr)
		}
		if entry.Type()&fs.ModeSymlink != 0 {
			return fmt.Errorf("Cannot import symbolic link %q", filepath.Base(path))
		}
		info, err := entry.Info()
		if err != nil {
			return fmt.Errorf("Cannot inspect %q: %w", filepath.Base(path), err)
		}
		if !info.IsDir() && !info.Mode().IsRegular() {
			return fmt.Errorf("Cannot import special file %q", filepath.Base(path))
		}
		return nil
	})
}

func copyExternalTree(root *os.Root, source, destination string) (bool, error) {
	info, err := os.Lstat(source)
	if err != nil {
		return false, err
	}
	if info.Mode()&fs.ModeSymlink != 0 {
		return false, fmt.Errorf("source changed into a symbolic link")
	}
	if info.IsDir() {
		// Ensure the importing user can populate a read-only source directory.
		// Files keep their source mode; vault folders retain at least owner access.
		if err := root.Mkdir(destination, info.Mode().Perm()|0700); err != nil {
			return false, err
		}
		entries, err := os.ReadDir(source)
		if err != nil {
			return true, err
		}
		for _, entry := range entries {
			if _, err := copyExternalTree(root, filepath.Join(source, entry.Name()), filepath.Join(destination, entry.Name())); err != nil {
				return true, err
			}
		}
		return true, nil
	}
	if !info.Mode().IsRegular() {
		return false, fmt.Errorf("source is not a regular file")
	}
	input, err := os.Open(source) // #nosec G304 -- source is an absolute path explicitly supplied by the native desktop file-drop API.
	if err != nil {
		return false, err
	}
	defer input.Close()
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

func pathIsWithin(parent, child string) bool {
	relative, err := filepath.Rel(parent, child)
	if err != nil {
		return false
	}
	return relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)))
}
