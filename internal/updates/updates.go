// Package updates holds the pure release-asset contract shared by Figaro's
// release workflow and its in-app updater.
//
// Release archives bundle the binary with README, LICENSE and notices for
// people downloading by hand. The updater swaps exactly one on-disk target,
// so every release also carries one "-update" archive per platform whose only
// top-level entry is the executable (or the macOS application bundle).
package updates

import (
	"strings"
)

// Repository is the GitHub repository that publishes Figaro releases.
const Repository = "grilo/figaro"

// ChecksumAsset is the release manifest of SHA-256 digests the updater uses
// to verify a downloaded archive.
const ChecksumAsset = "SHA256SUMS"

const updateSuffix = "-update"

// PlatformLabel names the release build for an operating system and
// architecture. macOS ships a single universal application.
func PlatformLabel(goos, goarch string) string {
	if goos == "darwin" {
		return "macos-universal"
	}
	return goos + "-" + goarch
}

// Published reports whether releases carry an update archive for the
// platform. Other builds can run but must be updated by hand.
func Published(goos, goarch string) bool {
	switch goos {
	case "darwin":
		return goarch == "amd64" || goarch == "arm64"
	case "linux", "windows":
		return goarch == "amd64"
	}
	return false
}

// archiveExtension is the archive format the updater can unpack on goos.
func archiveExtension(goos string) string {
	if goos == "linux" {
		return ".tar.gz"
	}
	return ".zip"
}

// ArchiveName is the update archive published for a release tag.
func ArchiveName(tag, goos, goarch string) string {
	return "figaro-" + tag + "-" + PlatformLabel(goos, goarch) + updateSuffix + archiveExtension(goos)
}

// MatchAsset returns the index of the update archive for goos/goarch among a
// release's asset names, or -1 when that release has none. Ordinary
// download archives are never selected: their top-level folder would replace
// the executable.
func MatchAsset(goos, goarch string, names []string) int {
	want := "-" + strings.ToLower(PlatformLabel(goos, goarch)) + updateSuffix + archiveExtension(goos)
	for i, name := range names {
		lower := strings.ToLower(name)
		if strings.HasPrefix(lower, "figaro-") && strings.HasSuffix(lower, want) {
			return i
		}
	}
	return -1
}

// CurrentVersion converts the product version to the form the updater
// compares with release tags. An unknown version cannot be updated safely.
func CurrentVersion(productVersion string) (string, bool) {
	version := strings.TrimPrefix(strings.TrimSpace(productVersion), "v")
	if version == "" {
		return "", false
	}
	return version, true
}
