package desktop

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/fsnotify/fsnotify"
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

func TestVaultWatcherSkipsUnreadableFoldersAndWatchesTheRest(t *testing.T) {
	if probe, err := newVaultWatcher(t.TempDir(), func() {}); err != nil {
		t.Skipf("native watcher unavailable in this test environment: %v", err)
	} else {
		probe.Close()
	}

	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "Projects", "2025"), 0755); err != nil {
		t.Fatal(err)
	}
	makeUnreadableVaultFolder(t, root, "lost+found")
	makeUnreadableVaultFolder(t, root, filepath.Join("Projects", "private"))

	watcher, err := newVaultWatcher(root, func() {})
	if err != nil {
		t.Fatalf("one unreadable folder left the whole vault unwatched: %v", err)
	}
	t.Cleanup(watcher.Close)
	for _, watched := range []string{root, filepath.Join(root, "Projects"), filepath.Join(root, "Projects", "2025")} {
		if !watcher.isWatched(watched) {
			t.Errorf("readable folder %q is not watched", watched)
		}
	}
	if watcher.isWatched(filepath.Join(root, "lost+found")) {
		t.Error("an unreadable folder was recorded as watched")
	}

	if err := os.MkdirAll(filepath.Join(root, "Imported", "open"), 0755); err != nil {
		t.Fatal(err)
	}
	makeUnreadableVaultFolder(t, root, filepath.Join("Imported", "sealed"))
	if err := watcher.addDirectoryTree(filepath.Join(root, "Imported")); err != nil {
		t.Fatalf("a new folder with an unreadable child could not be watched: %v", err)
	}
	if !watcher.isWatched(filepath.Join(root, "Imported", "open")) {
		t.Error("the readable part of a new folder is not watched")
	}
	if err := watcher.addDirectoryTree(filepath.Join(root, "Vanished")); err != nil {
		t.Fatalf("a folder that vanished before it could be watched failed the watcher: %v", err)
	}
	if err := watcher.syncDirectories(); err != nil {
		t.Fatalf("refreshing watches beside unreadable folders: %v", err)
	}
}

func TestNextVaultWatchDelayNeverPostponesABatchPastTheMaximum(t *testing.T) {
	cases := []struct {
		elapsed time.Duration
		want    time.Duration
	}{
		{0, vaultWatchDebounce},
		{time.Second, vaultWatchDebounce},
		{vaultWatchMaximumDelay - vaultWatchDebounce, vaultWatchDebounce},
		{vaultWatchMaximumDelay - 50*time.Millisecond, 50 * time.Millisecond},
		{vaultWatchMaximumDelay, 0},
		{vaultWatchMaximumDelay + time.Minute, 0},
	}
	for _, test := range cases {
		if got := nextVaultWatchDelay(test.elapsed); got != test.want {
			t.Errorf("nextVaultWatchDelay(%v) = %v, want %v", test.elapsed, got, test.want)
		}
	}
}

func startTestVaultWatcher(t *testing.T, root string) (*vaultWatcher, chan []vaultWatchChange) {
	t.Helper()
	batches := make(chan []vaultWatchChange, 16)
	watcher, err := newVaultWatcherWithChanges(root, func(changes []vaultWatchChange) {
		select {
		case batches <- changes:
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
	return watcher, batches
}

func TestVaultWatcherDeliversABatchWhileWritesKeepArriving(t *testing.T) {
	root := t.TempDir()
	_, batches := startTestVaultWatcher(t, root)
	note := filepath.Join(root, "log.md")

	// A writer that never pauses for the quiet period, like a sync client.
	stop := make(chan struct{})
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		for index := 0; ; index++ {
			select {
			case <-stop:
				return
			case <-time.After(vaultWatchDebounce / 4):
				_ = os.WriteFile(note, []byte(strings.Repeat("line\n", index%7+1)), 0644)
			}
		}
	}()
	defer func() {
		close(stop)
		<-finished
	}()

	select {
	case changes := <-batches:
		if len(changes) == 0 {
			t.Fatal("a continuous write was reported as an unknown-scope refresh")
		}
	case <-time.After(vaultWatchMaximumDelay + 3*time.Second):
		t.Fatal("no batch was delivered while writes kept arriving inside the quiet period")
	}
}

func TestVaultWatcherAsksForACompleteRefreshAfterLosingEvents(t *testing.T) {
	root := t.TempDir()
	watcher, batches := startTestVaultWatcher(t, root)

	select {
	case watcher.watcher.Errors <- fsnotify.ErrEventOverflow:
	case <-time.After(2 * time.Second):
		t.Fatal("watcher did not accept the overflow error")
	}

	select {
	case changes := <-batches:
		// An empty batch is the unknown-scope signal: App rebuilds the index
		// and the tree instead of trusting an incomplete list of paths.
		if len(changes) != 0 {
			t.Fatalf("overflow batch = %#v, want an unknown-scope refresh", changes)
		}
	case <-time.After(vaultWatchMaximumDelay + 2*time.Second):
		t.Fatal("an event overflow was only logged; no refresh was requested")
	}
}
