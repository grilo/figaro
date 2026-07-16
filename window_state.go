package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	goruntime "runtime"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	defaultWindowWidth  = 1280
	defaultWindowHeight = 800
	minimumWindowWidth  = 800
	minimumWindowHeight = 500
	windowStateVersion  = 1

	// This is only a corruption guard. Normal resizing is still governed by
	// the native window manager and Figaro's minimum dimensions.
	maximumRememberedWindowDimension = 32768
)

// windowState is deliberately machine-local. A vault may be opened or synced
// on computers with completely different display layouts, so its settings file
// must not carry native window state between those machines.
type windowState struct {
	Version   int  `json:"version"`
	Width     int  `json:"width"`
	Height    int  `json:"height"`
	Maximized bool `json:"maximized"`
}

type windowSnapshot struct {
	Width     int
	Height    int
	Normal    bool
	Maximized bool
	Minimized bool
}

func defaultWindowState() windowState {
	return windowState{
		Version: windowStateVersion,
		Width:   defaultWindowWidth,
		Height:  defaultWindowHeight,
	}
}

func normalizeWindowState(state windowState) (windowState, error) {
	if state.Version != windowStateVersion {
		return defaultWindowState(), fmt.Errorf("unsupported window state version %d", state.Version)
	}
	if state.Width <= 0 || state.Height <= 0 ||
		state.Width > maximumRememberedWindowDimension ||
		state.Height > maximumRememberedWindowDimension {
		return defaultWindowState(), fmt.Errorf("invalid window dimensions %dx%d", state.Width, state.Height)
	}
	if state.Width < minimumWindowWidth {
		state.Width = minimumWindowWidth
	}
	if state.Height < minimumWindowHeight {
		state.Height = minimumWindowHeight
	}
	return state, nil
}

func windowStatePath(configDir string) string {
	return filepath.Join(configDir, "figaro", "window-state.json")
}

// machineLocalConfigRoot uses the platform-specific, per-user local root:
// XDG_CONFIG_HOME on Linux, Library/Application Support on macOS, and
// LocalAppData on Windows. Windows' UserConfigDir points at roaming AppData,
// which is intentionally unsuitable for device-specific application state.
func machineLocalConfigRoot() (string, error) {
	return machineLocalConfigRootFor(goruntime.GOOS, os.UserConfigDir, os.UserCacheDir)
}

func machineLocalConfigRootFor(goos string, userConfigDir func() (string, error), userCacheDir func() (string, error)) (string, error) {
	var configDir string
	var err error
	if goos == "windows" {
		// UserCacheDir is backed by LocalAppData on Windows. The record remains
		// ordinary application data; this choice prevents it roaming to a PC
		// with a different display configuration.
		configDir, err = userCacheDir()
	} else {
		configDir, err = userConfigDir()
	}
	if err != nil {
		return "", fmt.Errorf("locate machine-local user directory: %w", err)
	}
	return configDir, nil
}

func machineWindowStatePath() (string, error) {
	configDir, err := machineLocalConfigRoot()
	if err != nil {
		return "", err
	}
	return windowStatePath(configDir), nil
}

func loadMachineWindowState() (windowState, string, error) {
	path, err := machineWindowStatePath()
	if err != nil {
		return defaultWindowState(), "", err
	}
	state, err := loadWindowStateFile(path)
	return state, path, err
}

func loadWindowStateFile(path string) (windowState, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return defaultWindowState(), nil
	}
	if err != nil {
		return defaultWindowState(), fmt.Errorf("read window state: %w", err)
	}

	var state windowState
	if err := json.Unmarshal(data, &state); err != nil {
		return defaultWindowState(), fmt.Errorf("parse window state: %w", err)
	}
	state, err = normalizeWindowState(state)
	if err != nil {
		return defaultWindowState(), err
	}
	return state, nil
}

func saveWindowStateFile(path string, state windowState) error {
	state.Version = windowStateVersion
	state, err := normalizeWindowState(state)
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("encode window state: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return fmt.Errorf("create window state directory: %w", err)
	}
	// These standard-library filesystem operations are portable across all
	// supported platforms. A truncated/corrupt record is harmless: the loader
	// rejects it and falls back to safe defaults on the next launch.
	if err := os.WriteFile(path, data, 0600); err != nil {
		return fmt.Errorf("write window state: %w", err)
	}
	if err := os.Chmod(path, 0600); err != nil {
		return fmt.Errorf("secure window state: %w", err)
	}
	return nil
}

func updateWindowState(previous windowState, snapshot windowSnapshot) (windowState, bool) {
	if previous.Version != windowStateVersion {
		previous = defaultWindowState()
	}
	// Minimized (and transitional/fullscreen) dimensions are never useful
	// restore geometry. Preserve the last normal/maximized state instead.
	if snapshot.Minimized {
		return previous, false
	}
	if snapshot.Maximized {
		previous.Maximized = true
		return previous, true
	}
	if !snapshot.Normal {
		return previous, false
	}

	previous.Width = snapshot.Width
	previous.Height = snapshot.Height
	previous.Maximized = false
	normalized, err := normalizeWindowState(previous)
	if err != nil {
		return previous, false
	}
	return normalized, true
}

func (a *App) configureWindowState(path string, state windowState) {
	a.windowStateMu.Lock()
	defer a.windowStateMu.Unlock()
	a.windowStatePath = path
	a.windowState = state
}

func currentWindowSnapshot(ctx context.Context) (snapshot windowSnapshot, ok bool) {
	if ctx == nil {
		return windowSnapshot{}, false
	}
	defer func() {
		if recover() != nil {
			ok = false
		}
	}()

	snapshot.Minimized = runtime.WindowIsMinimised(ctx)
	if snapshot.Minimized {
		return snapshot, true
	}
	snapshot.Maximized = runtime.WindowIsMaximised(ctx)
	if snapshot.Maximized {
		return snapshot, true
	}
	snapshot.Normal = runtime.WindowIsNormal(ctx)
	if snapshot.Normal {
		snapshot.Width, snapshot.Height = runtime.WindowGetSize(ctx)
	}
	return snapshot, true
}

func (a *App) rememberWindowSnapshot(snapshot windowSnapshot) {
	a.windowStateMu.Lock()
	defer a.windowStateMu.Unlock()

	state, accepted := updateWindowState(a.windowState, snapshot)
	if !accepted {
		return
	}
	a.windowState = state
	if a.windowStatePath == "" {
		return
	}
	if err := saveWindowStateFile(a.windowStatePath, state); err != nil {
		log.Printf("[window] Could not save window state: %v", err)
	}
}

func (a *App) captureWindowState(ctx context.Context) {
	snapshot, ok := currentWindowSnapshot(ctx)
	if !ok {
		return
	}
	a.rememberWindowSnapshot(snapshot)
}

// WindowCaptureState records a debounced native resize/maximize observation
// from the frontend. It is also called during shutdown, so this method never
// treats minimization as a launch state.
func (a *App) WindowCaptureState() {
	a.captureWindowState(a.ctx)
}
