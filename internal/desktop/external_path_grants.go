package desktop

import (
	"container/list"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
)

// externalPathGrantLimit is how many dropped paths stay importable. A drop
// names only its top-level items (a dropped folder is one path), so this is
// far more than a session of ordinary drops.
const externalPathGrantLimit = 4096

// externalPathGrants is the process-local ledger of absolute paths a file drop
// handed to the window. The import bindings take absolute source paths from
// the page; they act only on a path recorded here or registered in
// externalFileRegistry, so the page cannot name a file of its own choosing.
//
// The ledger is as trustworthy as the drop event that fills it. Wails v3.1.0
// routes every native drop through the page before raising
// WindowFilesDropped, on every platform, so a script already running in the
// window can still forge that event; see the note above
// OpenDroppedMarkdownFiles. The ledger confines the bindings to dropped paths
// and is the single place a native-only drop source would plug into.
//
// It keeps the most recent paths up to its limit. The newest drop is always
// kept whole, however large, so one drop is never partly refused.
type externalPathGrants struct {
	mu       sync.Mutex
	limit    int
	foldCase bool
	order    *list.List
	byKey    map[string]*list.Element
}

func newExternalPathGrants(limit int) *externalPathGrants {
	return &externalPathGrants{
		limit:    limit,
		foldCase: goruntime.GOOS == "windows",
		order:    list.New(),
		byKey:    make(map[string]*list.Element),
	}
}

// externalPathGrantKey is the form in which a path is recorded and looked up:
// trimmed, cleaned and absolute, without regard to letter case where the
// platform's paths have none. It reports false for a path that is not
// absolute, which no drop delivers and no grant can cover.
func externalPathGrantKey(path string, foldCase bool) (string, bool) {
	clean := filepath.Clean(strings.TrimSpace(path))
	if clean == "." || !filepath.IsAbs(clean) {
		return "", false
	}
	if foldCase {
		clean = strings.ToLower(clean)
	}
	return clean, true
}

// grant records the paths of one drop as the newest grants.
func (g *externalPathGrants) grant(paths []string) {
	if g == nil {
		return
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	dropped := 0
	seen := make(map[string]struct{}, len(paths))
	for _, path := range paths {
		key, ok := externalPathGrantKey(path, g.foldCase)
		if !ok {
			continue
		}
		if _, repeated := seen[key]; repeated {
			continue
		}
		seen[key] = struct{}{}
		dropped++
		if element, known := g.byKey[key]; known {
			g.order.MoveToBack(element)
			continue
		}
		g.byKey[key] = g.order.PushBack(key)
	}
	for keep := max(g.limit, dropped); g.order.Len() > keep; {
		oldest := g.order.Front()
		delete(g.byKey, oldest.Value.(string))
		g.order.Remove(oldest)
	}
}

// granted reports whether path was delivered by a drop still in the ledger.
func (g *externalPathGrants) granted(path string) bool {
	if g == nil {
		return false
	}
	key, ok := externalPathGrantKey(path, g.foldCase)
	if !ok {
		return false
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	_, known := g.byKey[key]
	return known
}

// len reports how many paths the ledger holds.
func (g *externalPathGrants) len() int {
	if g == nil {
		return 0
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.order.Len()
}

// grantDroppedPaths makes the paths of one file drop eligible for
// CopyExternalPaths, MergeExternalPaths and OpenDroppedMarkdownFiles. The
// window's drop handler calls it before the page hears about the drop.
func (a *App) grantDroppedPaths(paths []string) {
	a.droppedPaths.grant(paths)
}

// externalSourceGranted reports whether Figaro was handed path from outside
// the page: by a file drop, or as a file the operating system opened (which
// the page imports through its registered capability).
func (a *App) externalSourceGranted(path string) bool {
	if a.droppedPaths.granted(path) {
		return true
	}
	if a.externalFiles == nil {
		return false
	}
	_, registered := a.externalFiles.idForPath(filepath.Clean(strings.TrimSpace(path)))
	return registered
}

// ungrantedExternalSourceError is what the user reads when an import names a
// path Figaro was never handed.
func ungrantedExternalSourceError(path string) string {
	return "Figaro can import only files and folders that were dropped onto its window or opened with it. Drop " +
		quotedBaseName(path) + " onto Figaro again to import it."
}

func quotedBaseName(path string) string {
	name := filepath.Base(filepath.Clean(strings.TrimSpace(path)))
	if name == "." || name == string(filepath.Separator) || name == "" {
		return "the item"
	}
	return "“" + name + "”"
}
