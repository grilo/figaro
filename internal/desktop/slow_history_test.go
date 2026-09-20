package desktop

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSaveFileDoesNotWaitForHistoryPathLock(t *testing.T) {
	app, dir := newTestApp(t)
	defer os.RemoveAll(dir)
	writeTestFile(t, dir, "note.md", "old")
	// History holds a path read lock across Git I/O. A waiting rename must
	// acquire the exclusive path lock before it can hold the content lock.
	app.vaultPathMu.RLock()
	released := false
	defer func() {
		if !released {
			app.vaultPathMu.RUnlock()
		}
	}()
	renamed := make(chan error, 1)
	go func() {
		result, err := app.RenamePath("note.md", "renamed.md")
		if err == nil && !result.Success {
			err = fmt.Errorf("rename failed: %+v", result)
		}
		renamed <- err
	}()
	saved := make(chan error, 1)
	go func() {
		result, err := app.SaveFileToDisk("note.md", "new durable edit", 0)
		if err == nil && !result.Success {
			err = fmt.Errorf("save failed: %+v", result)
		}
		saved <- err
	}()
	select {
	case err := <-saved:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("save waited for history or rename")
	}
	app.vaultPathMu.RUnlock()
	released = true
	select {
	case err := <-renamed:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("rename did not resume")
	}
	data, err := os.ReadFile(filepath.Join(dir, "renamed.md"))
	if err != nil || string(data) != "new durable edit" {
		t.Fatalf("renamed content=%q, %v", data, err)
	}
}
