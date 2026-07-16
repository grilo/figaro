package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func waitForVaultChange(t *testing.T, changes <-chan struct{}) {
	t.Helper()
	select {
	case <-changes:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for a native vault filesystem event")
	}
}

func TestVaultWatcherTracksNewNestedDirectories(t *testing.T) {
	root := t.TempDir()
	changes := make(chan struct{}, 4)

	watcher, err := newVaultWatcher(root, func() {
		select {
		case changes <- struct{}{}:
		default:
		}
	})
	if err != nil {
		t.Skipf("native watcher unavailable in this test environment: %v", err)
	}
	go watcher.Run()
	t.Cleanup(watcher.Close)

	select {
	case <-watcher.started:
	case <-time.After(time.Second):
		t.Fatal("watcher event loop did not start")
	}

	nested := filepath.Join(root, "Projects", "2025")
	if err := os.MkdirAll(nested, 0755); err != nil {
		t.Fatalf("create nested directory: %v", err)
	}
	// The directory creation notification is only emitted after Run has added
	// the recursive watches, so the subsequent write exercises the new watch.
	waitForVaultChange(t, changes)
	if !watcher.isWatched(nested) {
		t.Fatalf("new nested directory %q was not added to the watch set", nested)
	}
	select {
	case <-watcher.done:
		t.Fatal("watcher event loop stopped before the nested file write")
	default:
	}

	if err := os.WriteFile(filepath.Join(nested, "roadmap.md"), []byte("# roadmap\n"), 0644); err != nil {
		t.Fatalf("write nested Markdown file: %v", err)
	}
	waitForVaultChange(t, changes)
}

func TestIgnoredVaultPathRecognizesHiddenMetadataOnEveryPlatform(t *testing.T) {
	root := filepath.Join("vault", "notes")
	for _, path := range []string{
		filepath.Join(root, ".config", "session.json"),
		filepath.Join(root, "Projects", ".cache", "index"),
	} {
		if !isIgnoredVaultPath(root, path) {
			t.Errorf("isIgnoredVaultPath(%q) = false, want true", path)
		}
	}
	if isIgnoredVaultPath(root, filepath.Join(root, "Projects", "note.md")) {
		t.Error("ordinary vault Markdown path was incorrectly ignored")
	}
}
