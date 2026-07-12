//go:build linux

package main

import (
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
