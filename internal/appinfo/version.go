package appinfo

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

var stableVersionPattern = regexp.MustCompile(`^\d+\.\d+\.\d+$`)

type wailsConfiguration struct {
	Info struct {
		ProductVersion string `json:"productVersion"`
	} `json:"info"`
}

// ProductVersion extracts and validates the stable product version from the
// Wails configuration embedded by the application composition root.
func ProductVersion(configuration []byte) (string, error) {
	var decoded wailsConfiguration
	if err := json.Unmarshal(configuration, &decoded); err != nil {
		return "", fmt.Errorf("parse Wails configuration: %w", err)
	}

	version := strings.TrimSpace(decoded.Info.ProductVersion)
	if !stableVersionPattern.MatchString(version) {
		return "", fmt.Errorf("Wails product version %q is not MAJOR.MINOR.PATCH", version)
	}
	return version, nil
}
