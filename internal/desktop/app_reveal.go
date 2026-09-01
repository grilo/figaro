package desktop

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
)

// ============================================================================
// 8. Reveal in Explorer
// ============================================================================

// RevealInExplorer opens the system file manager at the given path.
func (a *App) RevealInExplorer(relPath string) (*SaveFileResult, error) {
	target := a.vaultPath
	if relPath != "" {
		cleanRel, err := vaultRelativePath(relPath)
		if err != nil {
			return nil, err
		}
		root, err := a.openVaultRoot()
		if err != nil {
			return nil, err
		}
		info, statErr := root.Stat(cleanRel)
		closeErr := root.Close()
		if closeErr != nil {
			return nil, fmt.Errorf("close vault root: %w", closeErr)
		}
		if statErr == nil {
			target = a.vaultAbsolutePath(cleanRel)
			if !info.IsDir() {
				target = filepath.Dir(target)
			}
		} else if !os.IsNotExist(statErr) {
			return nil, statErr
		}
	}

	command, err := fileManagerCommand(target)
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	if err := startFileManager(command); err != nil {
		return &SaveFileResult{Success: false, Error: fmt.Sprintf("open file manager: %v", err)}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

// OpenWithDefaultApplication asks the operating system to open one regular
// vault file with the application associated with its type. Validation stays
// root-scoped and rejects symlinked path components before the absolute path is
// handed to the platform launcher.
func (a *App) OpenWithDefaultApplication(relPath string) (*SaveFileResult, error) {
	cleanRel, err := vaultRelativePath(relPath)
	if err != nil {
		return nil, err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	validationErr := validateDefaultApplicationFile(root, cleanRel)
	closeErr := root.Close()
	if closeErr != nil {
		return nil, fmt.Errorf("close vault root: %w", closeErr)
	}
	if validationErr != nil {
		return &SaveFileResult{Success: false, Error: validationErr.Error()}, nil
	}

	if err := launchFileWithDefaultApplication(a.vaultAbsolutePath(cleanRel)); err != nil {
		return &SaveFileResult{Success: false, Error: fmt.Sprintf("open with default application: %v", err)}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

// OpenLaunchExternalFile uses the opaque capability created by an explicit
// operating-system launch; the frontend never gains arbitrary path-launch
// authority for files outside the vault.
func (a *App) OpenLaunchExternalFile(id string) (*SaveFileResult, error) {
	path, err := a.launchExternalFilePath(id)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		if err != nil {
			return &SaveFileResult{Success: false, Error: err.Error()}, nil
		}
		return &SaveFileResult{Success: false, Error: "external launch target is not a regular file"}, nil
	}
	if err := launchFileWithDefaultApplication(path); err != nil {
		return &SaveFileResult{Success: false, Error: fmt.Sprintf("open with default application: %v", err)}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

// RevealLaunchExternalFile reveals only a previously registered external
// launch target, preserving the same capability boundary as reads and saves.
func (a *App) RevealLaunchExternalFile(id string) (*SaveFileResult, error) {
	path, err := a.launchExternalFilePath(id)
	if err != nil {
		return nil, err
	}
	command, err := fileManagerCommand(filepath.Dir(path))
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	if err := startFileManager(command); err != nil {
		return &SaveFileResult{Success: false, Error: fmt.Sprintf("open file manager: %v", err)}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

var launchFileWithDefaultApplication = openFileInDefaultApplication

func validateDefaultApplicationFile(root *os.Root, relPath string) error {
	if relPath == "." {
		return fmt.Errorf("a file is required")
	}

	parts := strings.Split(filepath.ToSlash(relPath), "/")
	current := ""
	for index, part := range parts {
		current = filepath.Join(current, filepath.FromSlash(part))
		info, err := root.Lstat(current)
		if err != nil {
			if os.IsNotExist(err) {
				return fmt.Errorf("file not found")
			}
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("symbolic links cannot be opened")
		}
		if index < len(parts)-1 && !info.IsDir() {
			return fmt.Errorf("file not found")
		}
		if index == len(parts)-1 && !info.Mode().IsRegular() {
			return fmt.Errorf("only regular files can be opened")
		}
	}
	return nil
}

var startFileManager = func(command *exec.Cmd) error {
	return command.Start()
}

func fileManagerCommand(target string) (*exec.Cmd, error) {
	switch goruntime.GOOS {
	case "linux":
		return exec.Command("xdg-open", target), nil // #nosec G204 -- fixed program and root-validated local target; no shell is used.
	case "darwin":
		return exec.Command("open", target), nil // #nosec G204 -- fixed program and root-validated local target; no shell is used.
	case "windows":
		return exec.Command("explorer.exe", target), nil // #nosec G204 -- fixed program and root-validated local target; no shell is used.
	default:
		return nil, fmt.Errorf("revealing files is not supported on %s", goruntime.GOOS)
	}
}
