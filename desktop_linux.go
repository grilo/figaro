//go:build linux

package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const linuxDesktopIconName = "io.github.figaro.Figaro"

func linuxDataHome(homeDir string) string {
	if configured := strings.TrimSpace(os.Getenv("XDG_DATA_HOME")); configured != "" && filepath.IsAbs(configured) {
		return configured
	}
	return filepath.Join(homeDir, ".local", "share")
}

func linuxDesktopEntry(exePath string, iconPath string) string {
	return fmt.Sprintf(`[Desktop Entry]
Type=Application
Name=figaro
Comment=Local Markdown Knowledge Base
Exec=%s %%U
Icon=%s
Terminal=false
Categories=Office;TextEditor;Utility;
StartupWMClass=figaro
MimeType=text/markdown;
`, exePath, iconPath)
}

// ensureDesktopIntegration refreshes the Linux launcher and icon assets on
// every launch. The earlier "already installed" shortcut meant old generic
// icon metadata survived upgrades indefinitely. Keeping it in a Linux-only
// compilation unit prevents other desktop targets from carrying GNOME/XDG
// command paths at all.
func (a *App) ensureDesktopIntegration() {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		log.Printf("[desktop] Cannot get home dir: %v", err)
		return
	}
	dataHome := linuxDataHome(homeDir)
	desktopFile := filepath.Join(dataHome, "applications", "figaro.desktop")

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

		destDir := filepath.Join(dataHome, "icons", "hicolor", fmt.Sprintf("%dx%d", size, size), "apps")
		if err := os.MkdirAll(destDir, 0755); err != nil { // #nosec G301,G703 -- XDG public icon path beneath the current user's home.
			log.Printf("[desktop] Cannot create %s: %v", destDir, err)
			continue
		}
		destPath := filepath.Join(destDir, linuxDesktopIconName+".png")
		if err := os.WriteFile(destPath, data, 0644); err != nil { // #nosec G306,G703 -- desktop shells require readable icon files in the XDG icon path.
			log.Printf("[desktop] Cannot write %s: %v", destPath, err)
		}
	}

	scalableDir := filepath.Join(dataHome, "icons", "hicolor", "scalable", "apps")
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
		} else if err := os.WriteFile(filepath.Join(scalableDir, linuxDesktopIconName+".png"), data, 0644); err != nil { // #nosec G306,G703 -- desktop shells require readable icon files in the XDG icon path.
			log.Printf("[desktop] Cannot write scalable icon: %v", err)
		}
	}

	iconRoot := filepath.Join(dataHome, "icons", "hicolor")
	gtkCache := exec.Command("gtk-update-icon-cache", "-f", "-t", iconRoot) // #nosec G204 -- fixed Linux utility; no shell is used and iconRoot is from os.UserHomeDir.
	if out, err := gtkCache.CombinedOutput(); err != nil {
		log.Printf("[desktop] gtk-update-icon-cache: %s (non-critical)", string(out))
	}

	iconPath := filepath.Join(iconRoot, "256x256", "apps", linuxDesktopIconName+".png")
	desktopContent := linuxDesktopEntry(exePath, iconPath)

	if err := os.MkdirAll(filepath.Dir(desktopFile), 0755); err != nil { // #nosec G301,G703 -- XDG application path beneath the current user's home.
		log.Printf("[desktop] Cannot create application directory: %v", err)
		return
	}
	if err := os.WriteFile(desktopFile, []byte(desktopContent), 0644); err != nil { // #nosec G306,G703 -- .desktop files must be readable by the desktop shell.
		log.Printf("[desktop] Cannot write .desktop file: %v", err)
		return
	}

	applicationsDir := filepath.Join(dataHome, "applications")
	if out, err := exec.Command("update-desktop-database", applicationsDir).CombinedOutput(); err != nil { // #nosec G204 -- fixed Linux utility; no shell is used and applicationsDir is from os.UserHomeDir.
		log.Printf("[desktop] update-desktop-database: %s (non-critical)", string(out))
	}

	log.Println("[desktop] Desktop integration refreshed")
}
