package desktop

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
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
