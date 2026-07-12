//go:build linux

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLinuxDataHomePrefersAbsoluteXDGValue(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", "/tmp/figaro-xdg-data")
	if got := linuxDataHome("/home/example"); got != "/tmp/figaro-xdg-data" {
		t.Fatalf("linuxDataHome() = %q", got)
	}

	t.Setenv("XDG_DATA_HOME", "relative-data")
	if got, want := linuxDataHome("/home/example"), filepath.Join("/home/example", ".local", "share"); got != want {
		t.Fatalf("linuxDataHome() = %q, want %q", got, want)
	}
}

func TestLinuxDesktopEntryUsesDedicatedIconFile(t *testing.T) {
	entry := linuxDesktopEntry("/opt/figaro/figaro", "/tmp/icons/figaro.png")
	if !strings.Contains(entry, "Icon=/tmp/icons/figaro.png") {
		t.Fatalf("desktop entry did not use supplied icon path: %s", entry)
	}
	if !strings.Contains(entry, "StartupWMClass=figaro") {
		t.Fatalf("desktop entry did not preserve the window-manager class: %s", entry)
	}
}

func TestLinuxDesktopIconAssetNameChangesWithIconContent(t *testing.T) {
	first := linuxDesktopIconAssetName([]byte("first icon"))
	second := linuxDesktopIconAssetName([]byte("second icon"))
	if first == second {
		t.Fatalf("different icon contents produced the same resource name: %q", first)
	}
	if !strings.HasPrefix(first, linuxDesktopIconName+"-") {
		t.Fatalf("icon resource %q does not use the Figaro icon prefix", first)
	}
}

func TestRemoveStaleLinuxFigaroIconsPreservesCurrentAndUnrelatedFiles(t *testing.T) {
	iconRoot := t.TempDir()
	appsDir := filepath.Join(iconRoot, "256x256", "apps")
	if err := os.MkdirAll(appsDir, 0755); err != nil {
		t.Fatal(err)
	}
	current := linuxDesktopIconAssetName([]byte("current icon"))
	stale := []string{
		linuxLegacyDesktopIconName + ".png",
		linuxDesktopIconName + ".png",
		linuxDesktopIconName + "-oldrevision.png",
	}
	kept := []string{current + ".png", "other-application.png"}
	for _, name := range append(append([]string{}, stale...), kept...) {
		if err := os.WriteFile(filepath.Join(appsDir, name), []byte(name), 0644); err != nil {
			t.Fatal(err)
		}
	}

	if err := removeStaleLinuxFigaroIcons(iconRoot, current); err != nil {
		t.Fatalf("removeStaleLinuxFigaroIcons error: %v", err)
	}
	for _, name := range stale {
		if _, err := os.Stat(filepath.Join(appsDir, name)); !os.IsNotExist(err) {
			t.Errorf("stale icon %q was not removed; stat error = %v", name, err)
		}
	}
	for _, name := range kept {
		if _, err := os.Stat(filepath.Join(appsDir, name)); err != nil {
			t.Errorf("kept icon %q was removed: %v", name, err)
		}
	}
}
