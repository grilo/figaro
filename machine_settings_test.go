package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestMachineSettingsPathUsesPerUserApplicationDirectory(t *testing.T) {
	root := filepath.Join(t.TempDir(), "platform-config")
	got := machineSettingsPath(root)
	want := filepath.Join(root, "figaro", "machine-settings.json")
	if got != want {
		t.Fatalf("machine settings path = %q, want %q", got, want)
	}
}

func TestMachineLocalConfigRootUsesLocalAppDataOnWindowsAndConfigElsewhere(t *testing.T) {
	configCalls := 0
	cacheCalls := 0
	configDir := func() (string, error) {
		configCalls++
		return "/user/config", nil
	}
	cacheDir := func() (string, error) {
		cacheCalls++
		return `C:\Users\Figaro\AppData\Local`, nil
	}

	got, err := machineLocalConfigRootFor("windows", configDir, cacheDir)
	if err != nil || got != `C:\Users\Figaro\AppData\Local` || configCalls != 0 || cacheCalls != 1 {
		t.Fatalf("Windows root = %q, config calls=%d, cache calls=%d, err=%v", got, configCalls, cacheCalls, err)
	}

	got, err = machineLocalConfigRootFor("darwin", configDir, cacheDir)
	if err != nil || got != "/user/config" || configCalls != 1 || cacheCalls != 1 {
		t.Fatalf("macOS root = %q, config calls=%d, cache calls=%d, err=%v", got, configCalls, cacheCalls, err)
	}

	wantErr := errors.New("config unavailable")
	_, err = machineLocalConfigRootFor("linux", func() (string, error) { return "", wantErr }, cacheDir)
	if !errors.Is(err, wantErr) {
		t.Fatalf("machine-local root error = %v, want wrapped %v", err, wantErr)
	}
}

func TestMachineSettingsSaveLoadAndRepair(t *testing.T) {
	path := machineSettingsPath(t.TempDir())
	want := machineSettings{
		Version:        machineSettingsVersion,
		PDFBrowserPath: filepath.Join("C:", "Program Files", "Google", "Chrome", "Application", "chrome.exe"),
	}
	if err := saveMachineSettingsFile(path, want); err != nil {
		t.Fatalf("save machine settings: %v", err)
	}
	got, err := loadMachineSettingsFile(path)
	if err != nil {
		t.Fatalf("load machine settings: %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("machine settings = %+v, want %+v", got, want)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm()&0077 != 0 {
		t.Fatalf("machine settings permissions = %o, want no group/other access", info.Mode().Perm())
	}

	if err := os.WriteFile(path, []byte("not json"), 0600); err != nil {
		t.Fatal(err)
	}
	app := NewApp(t.TempDir())
	app.configureMachineSettings(path)
	if err := app.storePDFBrowserPath(" /opt/chrome/chrome "); err != nil {
		t.Fatalf("repair malformed settings: %v", err)
	}
	got, err = loadMachineSettingsFile(path)
	if err != nil || got.PDFBrowserPath != "/opt/chrome/chrome" {
		t.Fatalf("repaired settings = %+v, err=%v", got, err)
	}
}

func TestLegacyVaultBrowserPreferenceMigratesOnceToMachineSettings(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	machinePath := machineSettingsPath(t.TempDir())
	app.configureMachineSettings(machinePath)
	legacyPath := filepath.Join(vaultPath, "browser", "chrome.exe")

	app.settingsMu.Lock()
	settings := defaultSettings()
	settings["pdf_browser_path"] = legacyPath
	if err := app.writeSettingsFile(settings); err != nil {
		app.settingsMu.Unlock()
		t.Fatal(err)
	}
	app.settingsMu.Unlock()

	app.migrateLegacyPDFBrowserPreference()
	if got := app.configuredPDFBrowserPath(); got != legacyPath {
		t.Fatalf("migrated browser path = %q, want %q", got, legacyPath)
	}

	app.settingsMu.RLock()
	vaultSettings, err := app.readSettingsFile()
	app.settingsMu.RUnlock()
	if err != nil {
		t.Fatal(err)
	}
	if _, exists := vaultSettings["pdf_browser_path"]; exists {
		t.Fatalf("legacy browser path remains in vault settings: %#v", vaultSettings)
	}

	data, err := os.ReadFile(machinePath)
	if err != nil {
		t.Fatal(err)
	}
	var record map[string]any
	if err := json.Unmarshal(data, &record); err != nil {
		t.Fatal(err)
	}
	if record["pdf_browser_path"] != legacyPath {
		t.Fatalf("machine record did not receive legacy path: %#v", record)
	}
}

func TestMigrationKeepsExistingMachineBrowserPreference(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	machinePath := machineSettingsPath(t.TempDir())
	app.configureMachineSettings(machinePath)
	if err := app.storePDFBrowserPath("/machine/chrome"); err != nil {
		t.Fatal(err)
	}

	app.settingsMu.Lock()
	settings := defaultSettings()
	settings["pdf_browser_path"] = "/vault/chrome"
	if err := app.writeSettingsFile(settings); err != nil {
		app.settingsMu.Unlock()
		t.Fatal(err)
	}
	app.settingsMu.Unlock()

	app.migrateLegacyPDFBrowserPreference()
	if got := app.configuredPDFBrowserPath(); got != "/machine/chrome" {
		t.Fatalf("migration overwrote machine preference with %q", got)
	}
}

func TestMigrationRetainsLegacyPreferenceWhenMachineStorageIsUnavailable(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	legacyPath := "/vault/chrome"

	app.settingsMu.Lock()
	settings := defaultSettings()
	settings["pdf_browser_path"] = legacyPath
	if err := app.writeSettingsFile(settings); err != nil {
		app.settingsMu.Unlock()
		t.Fatal(err)
	}
	app.settingsMu.Unlock()

	app.migrateLegacyPDFBrowserPreference()
	app.settingsMu.RLock()
	vaultSettings, err := app.readSettingsFile()
	app.settingsMu.RUnlock()
	if err != nil {
		t.Fatal(err)
	}
	if got := vaultSettings["pdf_browser_path"]; got != legacyPath {
		t.Fatalf("legacy preference = %#v, want %q retained for a later migration", got, legacyPath)
	}
}
