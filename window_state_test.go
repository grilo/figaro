package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

func TestWindowStatePathUsesMachineConfigDirectory(t *testing.T) {
	configDir := filepath.Join(t.TempDir(), "platform-config")
	got := windowStatePath(configDir)
	want := filepath.Join(configDir, "figaro", "window-state.json")
	if got != want {
		t.Fatalf("window state path = %q, want %q", got, want)
	}
	if strings.Contains(got, filepath.Join("vault", ".config")) {
		t.Fatalf("window state path must not be vault-local: %q", got)
	}
}

func TestLoadWindowStateFileDefaultsWhenMissing(t *testing.T) {
	state, err := loadWindowStateFile(filepath.Join(t.TempDir(), "missing.json"))
	if err != nil {
		t.Fatalf("load missing window state: %v", err)
	}
	if !reflect.DeepEqual(state, defaultWindowState()) {
		t.Fatalf("missing state = %+v, want %+v", state, defaultWindowState())
	}
}

func TestSaveAndLoadWindowStateFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "figaro", "window-state.json")
	want := windowState{Version: windowStateVersion, Width: 1512, Height: 916, Maximized: true}
	if err := saveWindowStateFile(path, want); err != nil {
		t.Fatalf("save window state: %v", err)
	}
	got, err := loadWindowStateFile(path)
	if err != nil {
		t.Fatalf("load window state: %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("loaded state = %+v, want %+v", got, want)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read serialized state: %v", err)
	}
	var record map[string]interface{}
	if err := json.Unmarshal(data, &record); err != nil {
		t.Fatalf("parse serialized state: %v", err)
	}
	for _, key := range []string{"version", "width", "height", "maximized"} {
		if _, exists := record[key]; !exists {
			t.Errorf("serialized window state is missing %q", key)
		}
	}
	if len(record) != 4 {
		t.Fatalf("serialized window state contains position or another unexpected field: %v", record)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat window state: %v", err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0077 != 0 {
		t.Fatalf("window state permissions = %o, want no group/other access", info.Mode().Perm())
	}

	want = windowState{Version: windowStateVersion, Width: 1320, Height: 740}
	if err := saveWindowStateFile(path, want); err != nil {
		t.Fatalf("overwrite window state: %v", err)
	}
	got, err = loadWindowStateFile(path)
	if err != nil {
		t.Fatalf("load overwritten window state: %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("overwritten state = %+v, want %+v", got, want)
	}
}

func TestLoadWindowStateFileRejectsMalformedOrUnsafeValues(t *testing.T) {
	tests := map[string]string{
		"malformed":     `{not-json`,
		"old version":   `{"version":99,"width":1280,"height":800}`,
		"zero width":    `{"version":1,"width":0,"height":800}`,
		"absurd height": `{"version":1,"width":1280,"height":999999}`,
	}
	for name, content := range tests {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "window-state.json")
			if err := os.WriteFile(path, []byte(content), 0600); err != nil {
				t.Fatalf("write fixture: %v", err)
			}
			state, err := loadWindowStateFile(path)
			if err == nil {
				t.Fatal("expected invalid window state to return an error")
			}
			if !reflect.DeepEqual(state, defaultWindowState()) {
				t.Fatalf("invalid state fallback = %+v, want %+v", state, defaultWindowState())
			}
		})
	}
}

func TestUpdateWindowStateTracksOnlyNormalSizeAndMaximizedState(t *testing.T) {
	state := defaultWindowState()

	state, accepted := updateWindowState(state, windowSnapshot{
		Width: 1440, Height: 900, Normal: true,
	})
	if !accepted || state.Width != 1440 || state.Height != 900 || state.Maximized {
		t.Fatalf("normal snapshot was not recorded: accepted=%v state=%+v", accepted, state)
	}

	state, accepted = updateWindowState(state, windowSnapshot{Maximized: true})
	if !accepted || !state.Maximized || state.Width != 1440 || state.Height != 900 {
		t.Fatalf("maximized snapshot did not preserve normal bounds: accepted=%v state=%+v", accepted, state)
	}

	beforeMinimize := state
	state, accepted = updateWindowState(state, windowSnapshot{
		Width: 1, Height: 1, Minimized: true,
	})
	if accepted || !reflect.DeepEqual(state, beforeMinimize) {
		t.Fatalf("minimized snapshot changed persisted state: accepted=%v state=%+v", accepted, state)
	}

	state, accepted = updateWindowState(state, windowSnapshot{
		Width: 640, Height: 300, Normal: true,
	})
	if !accepted || state.Width != minimumWindowWidth || state.Height != minimumWindowHeight || state.Maximized {
		t.Fatalf("small normal snapshot was not clamped safely: accepted=%v state=%+v", accepted, state)
	}
}

func TestRememberWindowSnapshotPersistsOutsideVault(t *testing.T) {
	app, vaultPath := newTestApp(t)
	path := windowStatePath(filepath.Join(t.TempDir(), "machine-config"))
	app.configureWindowState(path, defaultWindowState())

	app.rememberWindowSnapshot(windowSnapshot{Width: 1366, Height: 768, Normal: true})
	app.rememberWindowSnapshot(windowSnapshot{Maximized: true})

	state, err := loadWindowStateFile(path)
	if err != nil {
		t.Fatalf("load persisted state: %v", err)
	}
	if state.Width != 1366 || state.Height != 768 || !state.Maximized {
		t.Fatalf("persisted state = %+v", state)
	}
	if strings.HasPrefix(path, vaultPath+string(filepath.Separator)) {
		t.Fatalf("window state was written beneath vault: %q", path)
	}
}

func TestWindowStateFrontendCapturesNativeResize(t *testing.T) {
	data, err := os.ReadFile("frontend/wails-compat-bridge.js")
	if err != nil {
		t.Fatalf("read compatibility bridge: %v", err)
	}
	content := string(data)
	for _, expected := range []string{
		"installWindowStateCapture",
		"window.addEventListener('resize'",
		"goApp.WindowCaptureState()",
	} {
		if !strings.Contains(content, expected) {
			t.Errorf("compatibility bridge is missing %q", expected)
		}
	}
}

func TestWindowStateFrontendDoesNotCaptureBeforeFirstNativeResize(t *testing.T) {
	data, err := os.ReadFile("frontend/wails-compat-bridge.js")
	if err != nil {
		t.Fatalf("read compatibility bridge: %v", err)
	}
	content := string(data)
	start := strings.Index(content, "function installWindowStateCapture")
	if start < 0 {
		t.Fatal("could not locate window-state capture installation")
	}
	end := strings.Index(content[start:], "// ── Install bridge")
	if end < 0 {
		t.Fatal("could not locate the end of window-state capture installation")
	}
	section := content[start : start+end]
	if strings.Contains(section, "scheduleCapture();") {
		t.Fatal("window-state capture still queries GTK eagerly during startup")
	}
}
