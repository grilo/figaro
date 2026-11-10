package desktop

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
)

const machineSettingsVersion = 1

// machineSettings contains preferences tied to software installed on this
// computer. It must never be synchronized through a vault.
type machineSettings struct {
	Version        int    `json:"version"`
	PDFBrowserPath string `json:"pdf_browser_path,omitempty"`
	// CheckForUpdates is the opt-in for contacting GitHub Releases at launch.
	CheckForUpdates bool `json:"check_for_updates,omitempty"`
}

func defaultMachineSettings() machineSettings {
	return machineSettings{Version: machineSettingsVersion}
}

func machineSettingsPath(configDir string) string {
	return filepath.Join(configDir, "figaro", "machine-settings.json")
}

func currentMachineSettingsPath() (string, error) {
	configDir, err := machineLocalConfigRoot()
	if err != nil {
		return "", err
	}
	return machineSettingsPath(configDir), nil
}

func normalizeMachineSettings(settings machineSettings) (machineSettings, error) {
	if settings.Version != machineSettingsVersion {
		return defaultMachineSettings(), fmt.Errorf("unsupported machine settings version %d", settings.Version)
	}
	settings.PDFBrowserPath = strings.TrimSpace(settings.PDFBrowserPath)
	return settings, nil
}

func loadMachineSettingsFile(path string) (machineSettings, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return defaultMachineSettings(), nil
	}
	if err != nil {
		return defaultMachineSettings(), fmt.Errorf("read machine settings: %w", err)
	}
	var settings machineSettings
	if err := json.Unmarshal(data, &settings); err != nil {
		return defaultMachineSettings(), fmt.Errorf("parse machine settings: %w", err)
	}
	return normalizeMachineSettings(settings)
}

func saveMachineSettingsFile(path string, settings machineSettings) error {
	settings.Version = machineSettingsVersion
	settings, err := normalizeMachineSettings(settings)
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return fmt.Errorf("encode machine settings: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return fmt.Errorf("create machine settings directory: %w", err)
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		return fmt.Errorf("write machine settings: %w", err)
	}
	if err := os.Chmod(path, 0600); err != nil {
		return fmt.Errorf("secure machine settings: %w", err)
	}
	return nil
}

func (a *App) configureMachineSettings(path string) {
	a.machineSettingsMu.Lock()
	defer a.machineSettingsMu.Unlock()
	a.machineSettingsPath = path
}

func (a *App) loadPDFBrowserPath() (string, error) {
	a.machineSettingsMu.RLock()
	defer a.machineSettingsMu.RUnlock()
	if a.machineSettingsPath == "" {
		return "", fmt.Errorf("machine-local settings are unavailable")
	}
	settings, err := loadMachineSettingsFile(a.machineSettingsPath)
	if err != nil {
		return "", err
	}
	return settings.PDFBrowserPath, nil
}

func (a *App) storePDFBrowserPath(path string) error {
	a.machineSettingsMu.Lock()
	defer a.machineSettingsMu.Unlock()
	if a.machineSettingsPath == "" {
		return fmt.Errorf("machine-local settings are unavailable")
	}
	settings, err := loadMachineSettingsFile(a.machineSettingsPath)
	if err != nil {
		// A newly selected browser can safely repair a malformed machine-local
		// record; no vault or note data is involved.
		log.Printf("[settings] Replacing invalid machine settings: %v", err)
		settings = defaultMachineSettings()
	}
	settings.PDFBrowserPath = strings.TrimSpace(path)
	return saveMachineSettingsFile(a.machineSettingsPath, settings)
}

func (a *App) loadUpdateChecksEnabled() (bool, error) {
	a.machineSettingsMu.RLock()
	defer a.machineSettingsMu.RUnlock()
	if a.machineSettingsPath == "" {
		return false, fmt.Errorf("machine-local settings are unavailable")
	}
	settings, err := loadMachineSettingsFile(a.machineSettingsPath)
	if err != nil {
		return false, err
	}
	return settings.CheckForUpdates, nil
}

func (a *App) storeUpdateChecksEnabled(enabled bool) error {
	a.machineSettingsMu.Lock()
	defer a.machineSettingsMu.Unlock()
	if a.machineSettingsPath == "" {
		return fmt.Errorf("machine-local settings are unavailable")
	}
	settings, err := loadMachineSettingsFile(a.machineSettingsPath)
	if err != nil {
		log.Printf("[settings] Replacing invalid machine settings: %v", err)
		settings = defaultMachineSettings()
	}
	settings.CheckForUpdates = enabled
	return saveMachineSettingsFile(a.machineSettingsPath, settings)
}

func (a *App) configuredPDFBrowserPath() string {
	path, err := a.loadPDFBrowserPath()
	if err != nil {
		log.Printf("[pdf-browser] Could not read configured browser path: %v", err)
		return ""
	}
	return path
}

// legacyPDFBrowserSettingKey is the vault setting that named the PDF browser
// before the preference became machine-local.
const legacyPDFBrowserSettingKey = "pdf_browser_path"

// discardLegacyPDFBrowserPreference removes the pre-machine-settings browser
// path from vault/.config/settings.json without adopting it. A vault travels:
// one that was downloaded or shared could name any executable, and PDF export
// starts the configured browser. The preference is therefore only ever set on
// this machine, through Settings, where the chosen browser is validated.
func (a *App) discardLegacyPDFBrowserPreference() {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	settings, err := a.readSettingsFile()
	if err != nil {
		return
	}
	if _, exists := settings[legacyPDFBrowserSettingKey]; !exists {
		return
	}
	delete(settings, legacyPDFBrowserSettingKey)
	if err := a.writeSettingsFile(settings); err != nil {
		log.Printf("[settings] Could not remove the legacy PDF browser path from vault settings: %v", err)
		return
	}
	log.Println("[settings] Removed the legacy PDF browser path from vault settings without adopting it; choose a browser in Settings if automatic discovery is not enough")
}
