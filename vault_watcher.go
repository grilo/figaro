package main

import (
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// vaultWatcher receives native filesystem notifications from the selected
// vault. fsnotify provides the platform-specific implementation on Linux,
// macOS, and Windows; this wrapper supplies the recursive directory handling
// those APIs intentionally leave to applications.
type vaultWatcher struct {
	root      string
	watcher   *fsnotify.Watcher
	onChanges func([]vaultWatchChange)

	mu      sync.Mutex
	watched map[string]struct{}
	stop    chan struct{}
	started chan struct{}
	done    chan struct{}
	close   sync.Once
	run     sync.Once
}

const vaultWatchDebounce = 180 * time.Millisecond

// vaultWatchChange records the settled path operations in one debounced
// filesystem batch. Passing paths through to App lets it update one indexed
// note instead of treating every save as a reason to rescan the vault.
type vaultWatchChange struct {
	Path string
	Op   fsnotify.Op
}

func newVaultWatcher(root string, onChange func()) (*vaultWatcher, error) {
	return newVaultWatcherWithChanges(root, func(_ []vaultWatchChange) {
		if onChange != nil {
			onChange()
		}
	})
}

func newVaultWatcherWithChanges(root string, onChanges func([]vaultWatchChange)) (*vaultWatcher, error) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	w := &vaultWatcher{
		root:      filepath.Clean(root),
		watcher:   watcher,
		onChanges: onChanges,
		watched:   make(map[string]struct{}),
		stop:      make(chan struct{}),
		started:   make(chan struct{}),
		done:      make(chan struct{}),
	}
	if err := w.syncDirectories(); err != nil {
		_ = watcher.Close()
		return nil, err
	}
	return w, nil
}

// Close stops the event loop and releases every native watch. It is safe to
// call more than once, which keeps App shutdown simple across all platforms.
func (w *vaultWatcher) Close() {
	if w == nil {
		return
	}
	w.close.Do(func() {
		close(w.stop)
		_ = w.watcher.Close()
		// A watcher can be constructed on a background startup goroutine and
		// be stopped before its event loop is scheduled. Waiting in that case
		// would deadlock shutdown; once Run has started, wait for it to finish.
		select {
		case <-w.started:
			<-w.done
		default:
		}
	})
}

func (w *vaultWatcher) Run() {
	ran := false
	w.run.Do(func() { ran = true })
	if !ran {
		return
	}
	close(w.started)
	defer close(w.done)

	var (
		debounceTimer *time.Timer
		debounceC     <-chan time.Time
		pending       bool
		pendingPaths  = make(map[string]fsnotify.Op)
		errors        = w.watcher.Errors
	)
	resetDebounce := func(event fsnotify.Event) {
		pending = true
		path := filepath.Clean(event.Name)
		pendingPaths[path] |= event.Op
		if debounceTimer == nil {
			debounceTimer = time.NewTimer(vaultWatchDebounce)
			debounceC = debounceTimer.C
			return
		}
		if !debounceTimer.Stop() {
			select {
			case <-debounceTimer.C:
			default:
			}
		}
		debounceTimer.Reset(vaultWatchDebounce)
		debounceC = debounceTimer.C
	}

	for {
		select {
		case <-w.stop:
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			return

		case event, ok := <-w.watcher.Events:
			if !ok {
				return
			}
			if !w.isRelevantPath(event.Name) {
				continue
			}

			// Add watches immediately for newly-created folders. For removed or
			// renamed directories, syncDirectories prunes stale watches after the
			// current event batch has settled.
			if event.Op&fsnotify.Create != 0 && isDirectory(event.Name) {
				if err := w.addDirectoryTree(event.Name); err != nil {
					log.Printf("[watcher] add directory watch: %v", err)
				}
			}
			if event.Op&(fsnotify.Remove|fsnotify.Rename) != 0 && w.isWatched(event.Name) {
				if err := w.syncDirectories(); err != nil {
					log.Printf("[watcher] refresh directory watches: %v", err)
				}
			}
			if event.Op&(fsnotify.Create|fsnotify.Write|fsnotify.Remove|fsnotify.Rename) != 0 {
				resetDebounce(event)
			}

		case <-debounceC:
			debounceC = nil
			if !pending {
				continue
			}
			pending = false
			if w.onChanges != nil {
				paths := make([]string, 0, len(pendingPaths))
				for path := range pendingPaths {
					paths = append(paths, path)
				}
				sort.Strings(paths)
				changes := make([]vaultWatchChange, 0, len(paths))
				for _, path := range paths {
					changes = append(changes, vaultWatchChange{Path: path, Op: pendingPaths[path]})
				}
				clear(pendingPaths)
				w.onChanges(changes)
			}

		case err, ok := <-errors:
			if !ok {
				errors = nil
				continue
			}
			if err != nil {
				log.Printf("[watcher] vault watch error: %v", err)
			}
		}
	}
}

func (w *vaultWatcher) syncDirectories() error {
	current := make(map[string]struct{})
	if err := filepath.WalkDir(w.root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path != w.root && isIgnoredVaultPath(w.root, path) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.Type()&fs.ModeSymlink != 0 || !entry.IsDir() {
			return nil
		}
		clean := filepath.Clean(path)
		current[clean] = struct{}{}
		return nil
	}); err != nil {
		return err
	}

	w.mu.Lock()
	defer w.mu.Unlock()
	for path := range current {
		if _, exists := w.watched[path]; exists {
			continue
		}
		if err := w.watcher.Add(path); err != nil {
			return err
		}
		w.watched[path] = struct{}{}
	}
	for path := range w.watched {
		if _, exists := current[path]; exists {
			continue
		}
		_ = w.watcher.Remove(path)
		delete(w.watched, path)
	}
	return nil
}

func (w *vaultWatcher) addDirectoryTree(dir string) error {
	if isIgnoredVaultPath(w.root, dir) {
		return nil
	}
	return filepath.WalkDir(dir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if isIgnoredVaultPath(w.root, path) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.Type()&fs.ModeSymlink != 0 || !entry.IsDir() {
			return nil
		}
		clean := filepath.Clean(path)
		w.mu.Lock()
		defer w.mu.Unlock()
		if _, exists := w.watched[clean]; exists {
			return nil
		}
		if err := w.watcher.Add(clean); err != nil {
			return err
		}
		w.watched[clean] = struct{}{}
		return nil
	})
}

func (w *vaultWatcher) isWatched(path string) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	_, watched := w.watched[filepath.Clean(path)]
	return watched
}

func (w *vaultWatcher) isRelevantPath(path string) bool {
	return !isIgnoredVaultPath(w.root, path)
}

func isDirectory(path string) bool {
	info, err := os.Lstat(path)
	return err == nil && info.IsDir() && info.Mode()&os.ModeSymlink == 0
}

// isIgnoredVaultPath keeps Figaro's own metadata and all hidden paths out of
// the watcher, matching the file-tree and Markdown-walk visibility rules.
func isIgnoredVaultPath(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	if err != nil || rel == "." {
		return false
	}
	for _, segment := range strings.FieldsFunc(rel, func(r rune) bool {
		return r == filepath.Separator || r == '/'
	}) {
		if strings.HasPrefix(segment, ".") {
			return true
		}
	}
	return false
}
