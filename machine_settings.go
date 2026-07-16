package main

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

func (a *App) configuredPDFBrowserPath() string {
	path, err := a.loadPDFBrowserPath()
	if err != nil {
		log.Printf("[pdf-browser] Could not read configured browser path: %v", err)
		return ""
	}
	return path
}

// migrateLegacyPDFBrowserPreference moves the pre-machine-settings value out
// of vault/.config/settings.json. The legacy key is removed only after the
// local record is known to contain a value (or the user already has one).
func (a *App) migrateLegacyPDFBrowserPreference() {
	a.settingsMu.RLock()
	settings, err := a.readSettingsFile()
	legacyPath, exists := settings["pdf_browser_path"].(string)
	a.settingsMu.RUnlock()
	if err != nil || !exists {
		return
	}

	localPath, localErr := a.loadPDFBrowserPath()
	if localErr != nil {
		log.Printf("[settings] Could not inspect machine-local browser preference: %v", localErr)
	}
	if strings.TrimSpace(localPath) == "" && strings.TrimSpace(legacyPath) != "" {
		if err := a.storePDFBrowserPath(legacyPath); err != nil {
			log.Printf("[settings] Could not migrate PDF browser preference: %v", err)
			return
		}
	}

	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	settings, err = a.readSettingsFile()
	if err != nil {
		log.Printf("[settings] Could not remove legacy PDF browser preference: %v", err)
		return
	}
	delete(settings, "pdf_browser_path")
	if err := a.writeSettingsFile(settings); err != nil {
		log.Printf("[settings] Could not remove legacy PDF browser preference: %v", err)
	}
}
