//go:build linux

package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
)

// ensureDesktopIntegration installs the Linux launcher and icon assets on
// first run. Keeping it in a Linux-only compilation unit prevents other
// desktop targets from carrying GNOME/XDG command paths at all.
func (a *App) ensureDesktopIntegration() {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		log.Printf("[desktop] Cannot get home dir: %v", err)
		return
	}
	desktopFile := filepath.Join(homeDir, ".local", "share", "applications", "figaro.desktop")

	if _, err := os.Stat(desktopFile); err == nil {
		log.Printf("[desktop] Already installed at %s — skipping", desktopFile)
		return
	} else if !os.IsNotExist(err) {
		log.Printf("[desktop] Cannot inspect %s: %v", desktopFile, err)
		return
	}
	log.Printf("[desktop] No desktop file at %s — installing...", desktopFile)

	exePath, err := os.Executable()
	if err != nil {
		log.Printf("[desktop] Cannot resolve executable path: %v; using figaro from PATH", err)
		exePath = "figaro"
	}

	// GNOME monitors hicolor directly; this avoids silent xdg-icon-resource
	// failures. The public directories and files must remain readable by the
	// desktop shell, hence their conventional 0755/0644 modes.
	iconSizes := []int{16, 22, 24, 32, 48, 64, 128, 256}
	for _, size := range iconSizes {
		srcPath := fmt.Sprintf("frontend/icon-%d.png", size)
		data, readErr := assets.ReadFile(srcPath)
		if readErr != nil {
			data, readErr = readProjectAsset(srcPath)
			if readErr != nil {
				log.Printf("[desktop] Cannot read %s: %v", srcPath, readErr)
				continue
			}
		}

		destDir := filepath.Join(homeDir, ".local", "share", "icons", "hicolor", fmt.Sprintf("%dx%d", size, size), "apps")
		if err := os.MkdirAll(destDir, 0755); err != nil { // #nosec G301,G703 -- XDG public icon path beneath the current user's home.
			log.Printf("[desktop] Cannot create %s: %v", destDir, err)
			continue
		}
		destPath := filepath.Join(destDir, "figaro.png")
		if err := os.WriteFile(destPath, data, 0644); err != nil { // #nosec G306,G703 -- desktop shells require readable icon files in the XDG icon path.
			log.Printf("[desktop] Cannot write %s: %v", destPath, err)
		}
	}

	scalableDir := filepath.Join(homeDir, ".local", "share", "icons", "hicolor", "scalable", "apps")
	if err := os.MkdirAll(scalableDir, 0755); err != nil { // #nosec G301,G703 -- XDG public icon path beneath the current user's home.
		log.Printf("[desktop] Cannot create %s: %v", scalableDir, err)
	} else {
		scalableSrc := "frontend/icon-256.png"
		data, readErr := assets.ReadFile(scalableSrc)
		if readErr != nil {
			data, readErr = readProjectAsset(scalableSrc)
		}
		if readErr != nil {
			log.Printf("[desktop] Cannot read scalable icon: %v", readErr)
		} else if err := os.WriteFile(filepath.Join(scalableDir, "figaro.png"), data, 0644); err != nil { // #nosec G306,G703 -- desktop shells require readable icon files in the XDG icon path.
			log.Printf("[desktop] Cannot write scalable icon: %v", err)
		}
	}

	iconRoot := filepath.Join(homeDir, ".local", "share", "icons", "hicolor")
	gtkCache := exec.Command("gtk-update-icon-cache", "-f", "-t", iconRoot) // #nosec G204 -- fixed Linux utility; no shell is used and iconRoot is from os.UserHomeDir.
	if out, err := gtkCache.CombinedOutput(); err != nil {
		log.Printf("[desktop] gtk-update-icon-cache: %s (non-critical)", string(out))
	}

	desktopContent := fmt.Sprintf(`[Desktop Entry]
Type=Application
Name=figaro
Comment=Local Markdown Knowledge Base
Exec=%s %%U
Icon=figaro
Terminal=false
Categories=Office;TextEditor;Utility;
StartupWMClass=figaro
MimeType=text/markdown;
`, exePath)

	if err := os.MkdirAll(filepath.Dir(desktopFile), 0755); err != nil { // #nosec G301,G703 -- XDG application path beneath the current user's home.
		log.Printf("[desktop] Cannot create application directory: %v", err)
		return
	}
	if err := os.WriteFile(desktopFile, []byte(desktopContent), 0644); err != nil { // #nosec G306,G703 -- .desktop files must be readable by the desktop shell.
		log.Printf("[desktop] Cannot write .desktop file: %v", err)
		return
	}

	applicationsDir := filepath.Join(homeDir, ".local", "share", "applications")
	if out, err := exec.Command("update-desktop-database", applicationsDir).CombinedOutput(); err != nil { // #nosec G204 -- fixed Linux utility; no shell is used and applicationsDir is from os.UserHomeDir.
		log.Printf("[desktop] update-desktop-database: %s (non-critical)", string(out))
	}

	log.Println("[desktop] Desktop integration installed")
}
