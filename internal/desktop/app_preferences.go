package desktop

import (
	"encoding/json"
	"fmt"
	"log"
	"os"

	settingsmodel "figaro/internal/settings"
)

// ============================================================================
// 12. Kanban Colors Persistence
// ============================================================================

func (a *App) loadColors() {
	data, err := a.readVaultFile(".config/kanban-colors.json")
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("[kanban] load colors: %v", err)
		}
		return
	}
	if err := json.Unmarshal(data, &a.kanbanColors); err != nil {
		log.Printf("[kanban] parse colors: %v", err)
		return
	}
	// Prune colors for columns that no longer exist
	for k := range a.kanbanColors {
		found := false
		for _, c := range a.kanbanColumns {
			if c == k {
				found = true
				break
			}
		}
		if !found {
			delete(a.kanbanColors, k)
		}
	}
}

func (a *App) saveColors() {
	// Prune dead colors
	for k := range a.kanbanColors {
		found := false
		for _, c := range a.kanbanColumns {
			if c == k {
				found = true
				break
			}
		}
		if !found {
			delete(a.kanbanColors, k)
		}
	}
	data, err := json.MarshalIndent(a.kanbanColors, "", "  ")
	if err != nil {
		log.Printf("[kanban] serialize colors: %v", err)
		return
	}
	if err := a.writeVaultFileAtomic(".config/kanban-colors.json", data, 0600); err != nil {
		log.Printf("[kanban] save colors: %v", err)
	}
}

// AutoSaveLoad returns the auto-save interval in seconds (0 = disabled).
func (a *App) AutoSaveLoad() int {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("[settings] load auto-save interval: %v", err)
		}
		return 300
	}
	return settingsmodel.AutoSaveSeconds(settings)
}

// AutoSaveSave persists the auto-save interval in seconds.
func (a *App) AutoSaveSave(seconds int) error {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return err
	}
	settings["auto_save_seconds"] = seconds
	return a.writeSettingsFile(settings)
}

// AutoCommitLoad reports whether successful saves should record that exact
// file in local history. It intentionally has no interval or vault-wide mode.
func (a *App) AutoCommitLoad() bool {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("[settings] load auto-commit setting: %v", err)
		}
		return true
	}
	return settingsmodel.AutoCommitEnabled(settings)
}

// AutoCommitSave persists the per-save, single-file history toggle.
func (a *App) AutoCommitSave(enabled bool) error {
	a.settingsMu.Lock()

	settings, err := a.readSettingsFile()
	if err != nil {
		a.settingsMu.Unlock()
		return err
	}
	settings["auto_commit_enabled"] = enabled
	delete(settings, "auto_commit_seconds")
	err = a.writeSettingsFile(settings)
	a.settingsMu.Unlock()
	return err
}

// ============================================================================
// History Methods (Wails Bindings)
// ============================================================================

// GetFileHistory returns the git commit history for a file.
func (a *App) GetFileHistory(relPath string) ([]HistoryEntry, error) {
	if a.history == nil {
		return nil, fmt.Errorf("history not available")
	}
	return a.history.GetFileHistory(relPath)
}

// GetFileVersion returns the content of a file at a specific commit.
func (a *App) GetFileVersion(relPath string, hash string) (string, error) {
	if a.history == nil {
		return "", fmt.Errorf("history not available")
	}
	return a.history.GetFileVersion(relPath, hash)
}

// GetCommitCount returns the number of commits for a file.
func (a *App) GetCommitCount(relPath string) (int, error) {
	if a.history == nil {
		return 0, fmt.Errorf("history not available")
	}
	return a.history.CommitCount(relPath)
}
