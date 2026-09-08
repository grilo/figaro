package desktop

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"figaro/internal/startup"
)

func TestStartupLogsCaptureVaultAndHistoryOpeningBeforeWebview(t *testing.T) {
	var stages []string
	trace := startup.NewTrace(time.Now, func(e startup.Event) { stages = append(stages, e.Stage+":"+e.Phase) })
	app := openApp(t.TempDir(), trace)
	defer app.shutdown(context.Background())
	want := "vault-open:begin,history-open:begin,history-open:end,vault-open:end"
	if strings.Join(stages, ",") != want {
		t.Fatalf("vault opening stages = %v", stages)
	}
}

func TestStartupLogRetentionKeepsLatestNineOlderLaunchesWithoutMutatingInput(t *testing.T) {
	names := []string{"l", "k", "j", "i", "h", "g", "f", "e", "d", "c", "b", "a"}
	expired := expiredStartupLogs(names)
	if strings.Join(expired, "") != "abc" || names[0] != "l" {
		t.Fatalf("wrong retention plan: %v; input %v", expired, names)
	}
	if len(expiredStartupLogs(names[:9])) != 0 {
		t.Fatal("removed an in-budget launch")
	}
}

func TestStartupLogsUsePrivateFilesAndRetainTenLaunchesWithoutTouchingOtherFiles(t *testing.T) {
	base := t.TempDir()
	dir := startupLogsDirectory(base)
	now := time.Date(2026, 9, 8, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 12; i++ {
		file, err := openStartupLog(dir, "1.37.3", now.Add(time.Duration(i)*time.Hour))
		if err != nil {
			t.Fatal(err)
		}
		if err := file.Close(); err != nil {
			t.Fatal(err)
		}
	}
	unrelated := filepath.Join(dir, "keep-me.txt")
	if err := os.WriteFile(unrelated, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(base, "outside.txt")
	if err := os.WriteFile(outside, []byte("private"), 0600); err != nil {
		t.Fatal(err)
	}
	linkName := "startup-20200101T000000.000000000Z-111111111111.jsonl"
	linked := os.Symlink(outside, filepath.Join(dir, linkName)) == nil
	// A backwards clock must still keep this newly opened log plus nine others.
	current, err := openStartupLog(dir, "1.37.3", now.Add(-24*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	currentPath := current.(*os.File).Name()
	if err := current.Close(); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, entry := range entries {
		if entry.Type().IsRegular() && startupLogName.MatchString(entry.Name()) {
			count++
			if runtime.GOOS != "windows" {
				info, _ := entry.Info()
				if info.Mode().Perm() != 0600 {
					t.Errorf("log permissions = %o", info.Mode().Perm())
				}
			}
		}
	}
	if count != 10 {
		t.Fatalf("retained %d startup logs", count)
	}
	data, err := os.ReadFile(currentPath)
	if err != nil {
		t.Fatal("current launch removed:", err)
	}
	var header map[string]any
	if err := json.Unmarshal(data, &header); err != nil {
		t.Fatal(err)
	}
	if len(header) != 4 || header["version"] != "1.37.3" || header["format"] != float64(1) || header["platform"] != runtime.GOOS {
		t.Fatalf("unexpected header: %s", data)
	}
	if data, err := os.ReadFile(unrelated); err != nil || string(data) != "keep" {
		t.Fatal("unrelated file changed")
	}
	if linked {
		if info, err := os.Lstat(filepath.Join(dir, linkName)); err != nil || info.Mode()&os.ModeSymlink == 0 {
			t.Fatal("symlink removed")
		}
	}
	if data, err := os.ReadFile(outside); err != nil || string(data) != "private" {
		t.Fatal("outside file changed")
	}
}

func TestStartupLogsNeverOverwriteASameTimeLaunch(t *testing.T) {
	dir := t.TempDir()
	now := time.Now()
	first, err := openStartupLog(dir, "first", now)
	if err != nil {
		t.Fatal(err)
	}
	first.Close()
	second, err := openStartupLog(dir, "second", now)
	if err != nil {
		t.Fatal(err)
	}
	second.Close()
	if first.(*os.File).Name() == second.(*os.File).Name() {
		t.Fatal("same launch filename")
	}
	data, _ := os.ReadFile(first.(*os.File).Name())
	if !strings.Contains(string(data), "first") {
		t.Fatal("previous log overwritten")
	}
}

func TestOpenStartupLogsOpensOnlyConfiguredFolderAndReportsFailures(t *testing.T) {
	app := &App{startupLogDir: startupLogsDirectory(t.TempDir())}
	original := startFileManager
	t.Cleanup(func() { startFileManager = original })
	var launched *exec.Cmd
	startFileManager = func(cmd *exec.Cmd) error { launched = cmd; return nil }
	result, err := app.OpenStartupLogs()
	if err != nil || !result.Success || launched == nil {
		t.Fatalf("open logs: %+v %v", result, err)
	}
	if len(launched.Args) != 2 || launched.Args[1] != app.startupLogDir {
		t.Fatalf("wrong folder: %v", launched.Args)
	}
	if info, err := os.Stat(app.startupLogDir); err != nil || !info.IsDir() {
		t.Fatal("missing logs directory")
	}
	startFileManager = func(*exec.Cmd) error { return errors.New("launcher unavailable") }
	if _, err := app.OpenStartupLogs(); err == nil {
		t.Fatal("launcher failure hidden")
	}
	app.startupLogDir = ""
	if result, err := app.OpenStartupLogs(); err != nil || result.Success || result.Error == "" {
		t.Fatalf("unavailable storage: %+v %v", result, err)
	}
	blocked := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(blocked, nil, 0600); err != nil {
		t.Fatal(err)
	}
	app.startupLogDir = filepath.Join(blocked, "logs")
	if _, err := app.OpenStartupLogs(); err == nil {
		t.Fatal("directory failure hidden")
	}
}

func TestAppStartupTimingBridgeRejectsContentAndClosesAfterReady(t *testing.T) {
	var stages []string
	app := &App{startupTrace: startup.NewTrace(time.Now, func(e startup.Event) { stages = append(stages, fmt.Sprint(e.Source, ":", e.Stage)) })}
	app.RecordStartupTiming(startup.FrontendTiming{Stage: "private-note.md", Phase: "error"})
	app.RecordStartupTiming(startup.FrontendTiming{Stage: "ready", Phase: "mark", ElapsedMS: 1})
	app.RecordStartupTiming(startup.FrontendTiming{Stage: "editor", Phase: "mark", ElapsedMS: 2})
	if len(stages) != 1 || stages[0] != "webview:ready" {
		t.Fatalf("unexpected stages: %v", stages)
	}
}
