package desktop

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"

	settingsmodel "figaro/internal/settings"
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
	if runtime.GOOS != "windows" && info.Mode().Perm()&0077 != 0 {
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

// writeLegacyVaultBrowserPreference stores the pre-machine-settings key the
// way an old Figaro, or the author of a shared vault, would have left it.
func writeLegacyVaultBrowserPreference(t *testing.T, app *App, value any) {
	t.Helper()
	app.settingsMu.Lock()
	defer app.settingsMu.Unlock()
	settings := settingsmodel.Defaults()
	settings["pdf_browser_path"] = value
	if err := app.writeSettingsFile(settings); err != nil {
		t.Fatal(err)
	}
}

func vaultSettingsForTest(t *testing.T, app *App) map[string]any {
	t.Helper()
	app.settingsMu.RLock()
	defer app.settingsMu.RUnlock()
	settings, err := app.readSettingsFile()
	if err != nil {
		t.Fatal(err)
	}
	return settings
}

// A vault can be downloaded or shared, and PDF export starts the configured
// browser. A browser path found in vault settings is therefore removed, never
// adopted as this machine's preference.
func TestLegacyVaultBrowserPreferenceIsRemovedWithoutBeingAdopted(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	machinePath := machineSettingsPath(t.TempDir())
	app.configureMachineSettings(machinePath)
	legacyPath := filepath.Join(vaultPath, "browser", "chrome.exe")
	writeLegacyVaultBrowserPreference(t, app, legacyPath)

	app.discardLegacyPDFBrowserPreference()

	if got := app.configuredPDFBrowserPath(); got != "" {
		t.Fatalf("the vault's browser path %q became this machine's PDF browser", got)
	}
	if _, err := os.Stat(machinePath); !os.IsNotExist(err) {
		t.Fatalf("discarding the legacy path wrote machine settings (stat error %v)", err)
	}
	vaultSettings := vaultSettingsForTest(t, app)
	if _, exists := vaultSettings["pdf_browser_path"]; exists {
		t.Fatalf("legacy browser path remains in vault settings: %#v", vaultSettings)
	}
	// Every other vault setting survives the removal.
	encoded, err := json.Marshal(settingsmodel.Defaults())
	if err != nil {
		t.Fatal(err)
	}
	var defaults map[string]any
	if err := json.Unmarshal(encoded, &defaults); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(vaultSettings, defaults) {
		t.Fatalf("vault settings = %#v, want the other settings kept as %#v", vaultSettings, defaults)
	}
}

func TestLegacyVaultBrowserPreferenceNeverReplacesTheMachinePreference(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	machinePath := machineSettingsPath(t.TempDir())
	app.configureMachineSettings(machinePath)
	if err := app.storePDFBrowserPath("/machine/chrome"); err != nil {
		t.Fatal(err)
	}
	writeLegacyVaultBrowserPreference(t, app, "/vault/chrome")

	app.discardLegacyPDFBrowserPreference()

	if got := app.configuredPDFBrowserPath(); got != "/machine/chrome" {
		t.Fatalf("machine preference = %q, want it untouched", got)
	}
	if _, exists := vaultSettingsForTest(t, app)["pdf_browser_path"]; exists {
		t.Fatal("legacy browser path remains in vault settings")
	}
}

// The key is dropped whatever it holds and whether or not machine-local
// storage is available: nothing is waiting to receive it.
func TestLegacyVaultBrowserPreferenceIsRemovedWithoutMachineStorageOrAStringValue(t *testing.T) {
	for _, value := range []any{"/vault/chrome", "", 42.0, []any{"/vault/chrome"}} {
		app, vaultPath := newTestApp(t)
		writeLegacyVaultBrowserPreference(t, app, value)

		app.discardLegacyPDFBrowserPreference()

		if got, exists := vaultSettingsForTest(t, app)["pdf_browser_path"]; exists {
			t.Fatalf("legacy value %#v remains in vault settings as %#v", value, got)
		}
		os.RemoveAll(vaultPath)
	}
}
