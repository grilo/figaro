//go:build linux

package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const (
	linuxDesktopIconName       = "io.github.figaro.Figaro"
	linuxLegacyDesktopIconName = "figaro"
)

var linuxDesktopIconSizes = []int{16, 22, 24, 32, 48, 64, 128, 256}

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

// linuxDesktopIconAssetName makes every rebuilt icon use a distinct launcher
// resource path. GNOME and other Linux shells often retain a decoded bitmap
// for an unchanged path even after gtk-update-icon-cache runs; a content-based
// filename makes an icon upgrade observable immediately on the next launch.
func linuxDesktopIconAssetName(icon []byte) string {
	digest := sha256.Sum256(icon)
	return linuxDesktopIconName + "-" + hex.EncodeToString(digest[:8])
}

func linuxIconDirectories(iconRoot string) []string {
	directories := make([]string, 0, len(linuxDesktopIconSizes)+1)
	for _, size := range linuxDesktopIconSizes {
		directories = append(directories, filepath.Join(iconRoot, fmt.Sprintf("%dx%d", size, size), "apps"))
	}
	return append(directories, filepath.Join(iconRoot, "scalable", "apps"))
}

func isStaleLinuxFigaroIcon(filename string, currentAssetName string) bool {
	if filename == linuxLegacyDesktopIconName+".png" || filename == linuxDesktopIconName+".png" {
		return true
	}
	return strings.HasPrefix(filename, linuxDesktopIconName+"-") &&
		strings.HasSuffix(filename, ".png") &&
		filename != currentAssetName+".png"
}

// removeStaleLinuxFigaroIcons clears only Figaro-managed legacy and superseded
// icon files. It never touches unrelated applications in the user's icon
// theme directories.
func removeStaleLinuxFigaroIcons(iconRoot string, currentAssetName string) error {
	var cleanupErrors []error
	for _, directory := range linuxIconDirectories(iconRoot) {
		entries, err := os.ReadDir(directory)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("read %s: %w", directory, err))
			continue
		}
		for _, entry := range entries {
			if entry.IsDir() || !isStaleLinuxFigaroIcon(entry.Name(), currentAssetName) {
				continue
			}
			if err := os.Remove(filepath.Join(directory, entry.Name())); err != nil && !os.IsNotExist(err) { // #nosec G703 -- directory and filenames are constrained to the user's XDG icon tree and Figaro-owned asset names.
				cleanupErrors = append(cleanupErrors, fmt.Errorf("remove stale icon %s: %w", entry.Name(), err))
			}
		}
	}
	return errors.Join(cleanupErrors...)
}

func readLinuxIconAsset(size int) ([]byte, error) {
	srcPath := fmt.Sprintf("frontend/icon-%d.png", size)
	data, err := assets.ReadFile(srcPath)
	if err == nil {
		return data, nil
	}
	data, fallbackErr := readProjectAsset(srcPath)
	if fallbackErr != nil {
		return nil, fmt.Errorf("read %s: embedded asset: %v; source fallback: %w", srcPath, err, fallbackErr)
	}
	return data, nil
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

	iconAssets := make(map[int][]byte, len(linuxDesktopIconSizes))
	for _, size := range linuxDesktopIconSizes {
		data, readErr := readLinuxIconAsset(size)
		if readErr != nil {
			log.Printf("[desktop] Cannot read icon-%d.png: %v", size, readErr)
			continue
		}
		iconAssets[size] = data
	}
	primaryIcon, ok := iconAssets[256]
	if !ok {
		log.Println("[desktop] Cannot refresh launcher: the 256px icon asset is unavailable")
		return
	}

	// GNOME monitors hicolor directly; this avoids silent xdg-icon-resource
	// failures. The public directories and files must remain readable by the
	// desktop shell, hence their conventional 0755/0644 modes.
	iconRoot := filepath.Join(dataHome, "icons", "hicolor")
	iconAssetName := linuxDesktopIconAssetName(primaryIcon)
	if err := removeStaleLinuxFigaroIcons(iconRoot, iconAssetName); err != nil {
		log.Printf("[desktop] Could not fully clean stale Figaro icon resources: %v", err)
	}

	for _, size := range linuxDesktopIconSizes {
		data, ok := iconAssets[size]
		if !ok {
			continue
		}
		destDir := filepath.Join(iconRoot, fmt.Sprintf("%dx%d", size, size), "apps")
		if err := os.MkdirAll(destDir, 0755); err != nil { // #nosec G301,G703 -- XDG public icon path beneath the current user's home.
			log.Printf("[desktop] Cannot create %s: %v", destDir, err)
			continue
		}
		destPath := filepath.Join(destDir, iconAssetName+".png")
		if err := os.WriteFile(destPath, data, 0644); err != nil { // #nosec G306,G703 -- desktop shells require readable icon files in the XDG icon path.
			log.Printf("[desktop] Cannot write %s: %v", destPath, err)
		}
	}

	scalableDir := filepath.Join(dataHome, "icons", "hicolor", "scalable", "apps")
	if err := os.MkdirAll(scalableDir, 0755); err != nil { // #nosec G301,G703 -- XDG public icon path beneath the current user's home.
		log.Printf("[desktop] Cannot create %s: %v", scalableDir, err)
	} else {
		if err := os.WriteFile(filepath.Join(scalableDir, iconAssetName+".png"), primaryIcon, 0644); err != nil { // #nosec G306,G703 -- desktop shells require readable icon files in the XDG icon path.
			log.Printf("[desktop] Cannot write scalable icon: %v", err)
		}
	}

	gtkCache := exec.Command("gtk-update-icon-cache", "-f", "-t", iconRoot) // #nosec G204 -- fixed Linux utility; no shell is used and iconRoot is from os.UserHomeDir.
	if out, err := gtkCache.CombinedOutput(); err != nil {
		log.Printf("[desktop] gtk-update-icon-cache: %s (non-critical)", string(out))
	}

	iconPath := filepath.Join(iconRoot, "256x256", "apps", iconAssetName+".png")
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

	log.Printf("[desktop] Desktop integration refreshed (%s)", iconAssetName)
}
