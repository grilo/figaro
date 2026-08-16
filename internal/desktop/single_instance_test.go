package desktop

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/wailsapp/wails/v2/pkg/options"
)

func TestSingleInstanceForwardsMarkdownAndFocusesExistingWindow(t *testing.T) {
	root := t.TempDir()
	initial := filepath.Join(root, "initial.md")
	if err := os.WriteFile(initial, []byte("# Initial"), 0644); err != nil {
		t.Fatal(err)
	}
	markdown := filepath.Join(root, "forwarded.md")
	if err := os.WriteFile(markdown, []byte("# Forwarded"), 0644); err != nil {
		t.Fatal(err)
	}

	app := NewApp(filepath.Join(root, "vault"))
	app.setLaunchExternalFiles([]string{initial})
	app.runtimeMu.Lock()
	app.ctx = context.Background()
	app.runtimeEventsReady = true
	focusCount := 0
	app.windowShow = func(context.Context) {
		focusCount++
	}
	app.runtimeMu.Unlock()

	var emittedName string
	var emittedFiles []*ExternalLaunchFile
	emitCount := 0
	app.eventEmitter = func(name string, data ...any) {
		emitCount++
		emittedName = name
		if len(data) == 1 {
			emittedFiles, _ = data[0].([]*ExternalLaunchFile)
		}
	}

	lock := figaroSingleInstanceLock(app)
	if lock == nil || lock.UniqueId != figaroSingleInstanceID || lock.OnSecondInstanceLaunch == nil {
		t.Fatalf("figaroSingleInstanceLock = %#v, want configured callback", lock)
	}

	lock.OnSecondInstanceLaunch(options.SecondInstanceData{
		Args:             []string{"forwarded.md", "forwarded.md", "missing.md", "ignored.txt"},
		WorkingDirectory: root,
	})

	if focusCount != 1 {
		t.Fatalf("window focus count = %d, want 1", focusCount)
	}
	if emittedName != externalLaunchEventName || emitCount != 1 {
		t.Fatalf("emitted event = %q (%d times), want %q once", emittedName, emitCount, externalLaunchEventName)
	}
	if len(emittedFiles) != 1 || emittedFiles[0].ID != "external-2" || emittedFiles[0].Path != markdown {
		t.Fatalf("emitted files = %#v, want one capability for %q", emittedFiles, markdown)
	}

	registered, err := app.GetLaunchExternalFiles()
	if err != nil {
		t.Fatal(err)
	}
	if len(registered) != 2 || registered[0].ID != "external-1" || registered[0].Path != initial ||
		registered[1].ID != emittedFiles[0].ID || registered[1].Path != markdown {
		t.Fatalf("registered files = %#v, want retained initial and emitted capabilities", registered)
	}

	lock.OnSecondInstanceLaunch(options.SecondInstanceData{
		Args:             []string{"--flag", "missing.md"},
		WorkingDirectory: root,
	})
	if focusCount != 2 {
		t.Fatalf("window focus count after empty launch = %d, want 2", focusCount)
	}
	if emitCount != 1 {
		t.Fatalf("event count after empty launch = %d, want 1", emitCount)
	}
}
