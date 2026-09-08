package desktop

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"time"

	"figaro/internal/startup"
)

const retainedStartupLogs = 10

var startupLogName = regexp.MustCompile(`^startup-\d{8}T\d{6}\.\d{9}Z-[a-f0-9]{12}\.jsonl$`)

// Preserve the current launch even if the machine clock moved backwards.
func expiredStartupLogs(otherNames []string) []string {
	if len(otherNames) < retainedStartupLogs {
		return nil
	}
	names := append([]string(nil), otherNames...)
	sort.Strings(names)
	return names[:len(names)-retainedStartupLogs+1]
}

func startupLogsDirectory(cacheRoot string) string { return filepath.Join(cacheRoot, "Figaro", "logs") }

func openStartupLog(dir, version string, now time.Time) (io.WriteCloser, error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	var random [6]byte
	if _, err := rand.Read(random[:]); err != nil {
		return nil, err
	}
	name := "startup-" + now.UTC().Format("20060102T150405.000000000Z") + "-" + hex.EncodeToString(random[:]) + ".jsonl"
	file, err := root.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return nil, err
	}
	header, _ := json.Marshal(struct {
		Format   int    `json:"format"`
		Version  string `json:"version"`
		Platform string `json:"platform"`
		Arch     string `json:"arch"`
	}{1, version, runtime.GOOS, runtime.GOARCH})
	if _, err := file.Write(append(header, '\n')); err != nil {
		file.Close()
		return nil, err
	}
	// Remove only our regular log files. Symlinks and unrelated files stay put.
	entries, err := os.ReadDir(dir)
	if err == nil {
		var names []string
		for _, entry := range entries {
			if entry.Name() != name && entry.Type().IsRegular() && startupLogName.MatchString(entry.Name()) {
				names = append(names, entry.Name())
			}
		}
		for _, expired := range expiredStartupLogs(names) {
			_ = root.Remove(expired)
		}
	}
	return file, nil
}

// RecordStartupTiming accepts only fixed startup labels and finite durations.
// The recorder drops duplicates and stops normal recording after readiness.
func (a *App) RecordStartupTiming(timing startup.FrontendTiming) { a.startupTrace.Frontend(timing) }

// OpenStartupLogs grants access only to the configured local diagnostics folder.
func (a *App) OpenStartupLogs() (*SaveFileResult, error) {
	if a.startupLogDir == "" {
		return &SaveFileResult{Success: false, Error: "Startup log storage is unavailable."}, nil
	}
	if err := os.MkdirAll(a.startupLogDir, 0700); err != nil {
		return nil, fmt.Errorf("create startup log folder: %w", err)
	}
	command, err := fileManagerCommand(a.startupLogDir)
	if err != nil {
		return nil, err
	}
	if err := startFileManager(command); err != nil {
		return nil, fmt.Errorf("open startup log folder: %w", err)
	}
	return &SaveFileResult{Success: true}, nil
}
