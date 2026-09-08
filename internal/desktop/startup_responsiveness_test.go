package desktop

import (
	"context"
	"errors"
	"figaro/internal/writing"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func awaitStartupTest[T any](t *testing.T, done <-chan T) T {
	t.Helper()
	select {
	case value := <-done:
		return value
	case <-time.After(3 * time.Second):
		t.Fatal("operation waited for an unrelated startup service")
		var zero T
		return zero
	}
}

func TestStartupIndexAllowsDiskSaveAndReconcilesChangesReadBeforeSave(t *testing.T) {
	a, vault := newTestApp(t)
	writeTestFile(t, vault, "active.md", "old text #old")
	writeTestFile(t, vault, "blocked.md", "slow note")
	writeTestFile(t, vault, "removed.md", "remove this")
	blocked, release, ready := make(chan bool, 1), make(chan struct{}), make(chan bool, 1)
	a.desktopRuntime.configureForTest(nil, false, nil, func(name string, _ ...any) {
		if name == "vault:kanban-indexed" {
			ready <- true
		}
	})
	a.startInitialVaultIndex(func(root *os.Root, path string) ([]byte, error) {
		if path == "blocked.md" {
			blocked <- true
			<-release
		}
		return root.ReadFile(path)
	})
	awaitStartupTest(t, blocked)
	defer a.shutdown(context.Background())
	defer close(release)
	saved := make(chan error, 1)
	go func() {
		result, err := a.SaveFileToDisk("active.md", "new text #new", 0)
		if err == nil && !result.Success {
			err = errors.New(result.Error)
		}
		saved <- err
	}()
	if err := awaitStartupTest(t, saved); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(vault, "active.md"))
	if err != nil || string(data) != "new text #new" {
		t.Fatal("disk write did not complete", string(data), err)
	}
	// An index-dependent query must not queue behind the scan with vaultMu held.
	queried := make(chan error, 1)
	go func() { _, err := a.SearchNotes("old", NoteSearchRequest{}); queried <- err }()
	if err := awaitStartupTest(t, queried); !errors.Is(err, errVaultIndexLoading) {
		t.Fatal(err)
	}
	if _, err := a.CreateFile("created.md", "created during scan"); err != nil {
		t.Fatal(err)
	}
	a.vaultMu.Lock()
	if err := os.Remove(filepath.Join(vault, "removed.md")); err != nil {
		t.Fatal(err)
	}
	a.removeVaultIndexFileLocked("removed.md")
	a.vaultMu.Unlock()
	// Unblock without double-closing the deferred release.
	release <- struct{}{}
	awaitStartupTest(t, ready)
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	if a.vaultIndex.files["active.md"].content != "new text #new" || a.vaultIndex.files["created.md"].content != "created during scan" {
		t.Fatal("scan lost concurrent writes")
	}
	if _, found := a.vaultIndex.files["removed.md"]; found {
		t.Fatal("scan resurrected removed note")
	}
}

func TestWritingPreparationDoesNotBlockCancellationOrShutdown(t *testing.T) {
	a, _ := newTestApp(t)
	started, release, initialized := make(chan bool, 1), make(chan struct{}), make(chan error, 1)
	go func() {
		initialized <- a.initializeWriting(func() (*writing.Engine, error) { started <- true; <-release; return &writing.Engine{}, nil })
	}()
	awaitStartupTest(t, started)
	done := make(chan bool, 1)
	go func() { a.WritingCancel("pending"); a.shutdown(context.Background()); done <- true }()
	awaitStartupTest(t, done)
	close(release)
	if err := awaitStartupTest(t, initialized); err == nil {
		t.Fatal("initialization published an engine after shutdown")
	}
	if a.writingEngine != nil {
		t.Fatal("late writing engine retained")
	}
}

func TestEarlySidebarQueryCannotStartSynchronousIndexBeforeEditorReveal(t *testing.T) {
	a, vault := newTestApp(t)
	writeTestFile(t, vault, "note.md", "text")
	a.deferInitialVaultIndex()
	if _, err := a.GetKanbanBoard(); !errors.Is(err, errVaultIndexLoading) {
		t.Fatal(err)
	}
	if a.vaultIndex != nil || a.GetVaultLoadStatus().Phase != VaultLoadPending {
		t.Fatal("sidebar query started discovery before StartVaultLoad")
	}
	if result, err := a.SaveFileToDisk("note.md", "early save", 0); err != nil || !result.Success {
		t.Fatal(result, err)
	}
}

func TestDeferredDiskSaveKeepsDrawioOutOfMarkdownIndex(t *testing.T) {
	a, vault := newTestApp(t)
	writeTestFile(t, vault, "note.md", "note")
	if _, err := a.SearchNotes("note", NoteSearchRequest{}); err != nil {
		t.Fatal(err)
	}
	if _, err := a.SaveFileToDisk("diagram.drawio", "<xml>diagram #todo</xml>", 0); err != nil {
		t.Fatal(err)
	}
	if err := a.RefreshSavedFile("diagram.drawio"); err != nil {
		t.Fatal(err)
	}
	if _, exists := a.vaultIndex.files["diagram.drawio"]; exists {
		t.Fatal("saved non-Markdown file entered prose index")
	}
}

func TestDiskSavePrecedesTaskMetadataAndIndexAndSurvivesMetadataFailure(t *testing.T) {
	a, vault := newTestApp(t)
	writeTestFile(t, vault, "note.md", "- [ ] Task #todo\n")
	if _, err := a.SearchNotes("Task", NoteSearchRequest{}); err != nil {
		t.Fatal(err)
	}
	result, err := a.SaveFileToDisk("note.md", "- [ ] Task #wip\n", 0)
	if err != nil || !result.Success {
		t.Fatal(result, err)
	}
	data, err := os.ReadFile(filepath.Join(vault, "note.md"))
	if err != nil || string(data) != "- [ ] Task #wip\n" {
		t.Fatal(string(data), err)
	}
	if a.vaultIndex.files["note.md"].content != "- [ ] Task #todo\n" {
		t.Fatal("disk save performed index work before the Git stage")
	}
	// Force a secondary failure through the captured metadata-read boundary.
	pending := a.pendingFileSaves["note.md"]
	pending.readError = errors.New("metadata temporarily unavailable")
	a.pendingFileSaves["note.md"] = pending
	if err := a.RefreshSavedFile("note.md"); err == nil {
		t.Fatal("metadata failure was hidden")
	}
	data, _ = os.ReadFile(filepath.Join(vault, "note.md"))
	if string(data) != "- [ ] Task #wip\n" || a.vaultIndex.files["note.md"].content != string(data) {
		t.Fatal("secondary failure lost saved text or prevented indexing")
	}
}

func TestDelayedSaveProjectionSurvivesOwnWatcherAcknowledgementAndUsesLatestWrite(t *testing.T) {
	a, vault := newTestApp(t)
	writeTestFile(t, vault, "note.md", "old")
	if _, err := a.SearchNotes("old", NoteSearchRequest{}); err != nil {
		t.Fatal(err)
	}
	for _, content := range []string{"first", "latest"} {
		if result, err := a.SaveFileToDisk("note.md", content, 0); err != nil || !result.Success {
			t.Fatal(result, err)
		}
	}
	// The watcher resets its optimistic-version cache even for acknowledged
	// internal events. A pending save is owned independently of that cache.
	a.vaultMu.Lock()
	a.resetFileVersionsLocked()
	a.vaultMu.Unlock()
	if err := a.RefreshSavedFile("note.md"); err != nil {
		t.Fatal(err)
	}
	if a.vaultIndex.files["note.md"].content != "latest" {
		t.Fatal("lost newest disk write after watcher acknowledgement")
	}
	if result, err := a.SaveFileToDisk("note.md", "do not resurrect", 0); err != nil || !result.Success {
		t.Fatal(result, err)
	}
	a.vaultMu.Lock()
	a.removeVaultIndexPathLocked("note.md")
	a.vaultMu.Unlock()
	if err := a.RefreshSavedFile("note.md"); err != nil {
		t.Fatal(err)
	}
	if _, exists := a.vaultIndex.files["note.md"]; exists {
		t.Fatal("late follow-up resurrected a removed note")
	}
}

func TestSecondaryTaskMetadataCannotHoldUpTheNextDiskSave(t *testing.T) {
	a, vault := newTestApp(t)
	writeTestFile(t, vault, "note.md", "Task #todo\n")
	if _, err := a.SaveFileToDisk("note.md", "Task #wip\n", 0); err != nil {
		t.Fatal(err)
	}
	started, release := make(chan bool, 1), make(chan struct{})
	followed := make(chan error, 1)
	go func() {
		followed <- a.refreshSavedFile("note.md", func(path, original, content string) error {
			started <- true
			<-release
			return a.updateSavedTaskSchedules(path, original, content, func() error { return nil })
		})
	}()
	awaitStartupTest(t, started)
	saved := make(chan error, 1)
	go func() { _, err := a.SaveFileToDisk("note.md", "Task #wip\nNew paragraph.\n", 0); saved <- err }()
	err := func() error { defer close(release); return awaitStartupTest(t, saved) }()
	if err != nil {
		t.Fatal(err)
	}
	if err := awaitStartupTest(t, followed); err != nil {
		t.Fatal(err)
	}
	if err := a.RefreshSavedFile("note.md"); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(filepath.Join(vault, "note.md"))
	if string(data) != "Task #wip\nNew paragraph.\n" {
		t.Fatal("metadata follow-up replaced newer text")
	}
}

func TestStartupIndexRestartsAfterUnknownChangesAndStopsWithoutWaitingForRead(t *testing.T) {
	a, vault := newTestApp(t)
	writeTestFile(t, vault, "note.md", "old")
	blocked, release, ready := make(chan bool, 1), make(chan struct{}), make(chan bool, 1)
	a.desktopRuntime.configureForTest(nil, false, nil, func(name string, _ ...any) {
		if name == "vault:kanban-indexed" {
			ready <- true
		}
	})
	first := true
	a.startInitialVaultIndex(func(root *os.Root, path string) ([]byte, error) {
		data, err := root.ReadFile(path)
		if first {
			first = false
			blocked <- true
			<-release
		}
		return data, err
	})
	awaitStartupTest(t, blocked)
	writeTestFile(t, vault, "note.md", "external change")
	a.vaultMu.Lock()
	a.invalidateVaultIndexLocked()
	a.vaultMu.Unlock()
	close(release)
	awaitStartupTest(t, ready)
	if a.vaultIndex.files["note.md"].content != "external change" {
		t.Fatal("unknown change did not restart discovery")
	}
	if a.GetVaultLoadStatus().Generation < 2 {
		t.Fatal("restart did not advance the progress generation")
	}
	a.shutdown(context.Background())

	b, vault := newTestApp(t)
	writeTestFile(t, vault, "note.md", "text")
	blocked, release = make(chan bool, 1), make(chan struct{})
	b.startInitialVaultIndex(func(root *os.Root, path string) ([]byte, error) {
		blocked <- true
		<-release
		return root.ReadFile(path)
	})
	awaitStartupTest(t, blocked)
	done := make(chan bool, 1)
	go func() { b.shutdown(context.Background()); done <- true }()
	awaitStartupTest(t, done)
	close(release)
	b.vaultMu.RLock()
	defer b.vaultMu.RUnlock()
	if b.vaultIndex != nil || b.vaultIndexScan != nil {
		t.Fatal("cancelled scan was published")
	}
}
