package desktop

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"regexp"
	goruntime "runtime"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/fsnotify/fsnotify"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ============================================================================
// App — the bound backend struct whose exported methods become the JS API
// ============================================================================

// App is the primary backend struct bound to the Wails frontend.
// All exported receiver methods with signature (ctx context.Context, ...) (T, error)
// are automatically exposed as async JS functions on the Go binding object.
type App struct {
	ctx                 context.Context
	vaultPath           string
	devInspectorAddress string
	vaultMu             sync.RWMutex
	sessionMu           sync.RWMutex
	mu                  sync.RWMutex
	externalFilesMu     sync.RWMutex
	launchExternalFiles map[string]string
	launchExternalIDs   []string
	settingsMu          sync.RWMutex
	machineSettingsMu   sync.RWMutex
	windowStateMu       sync.Mutex
	calendarMu          sync.Mutex
	watcherMu           sync.Mutex
	vaultIndexBuildMu   sync.Mutex
	fileVersions        map[string]float64
	kanbanColumns       []string
	kanbanColors        map[string]string
	calendarIndex       *calendarDateIndex
	vaultIndex          *vaultIndex
	fileTreeEntries     map[string]fileTreeCacheEntry
	fileTreeSnapshot    []*FileTreeItem
	internalVaultWrites map[string]time.Time
	vaultWatcher        *vaultWatcher
	watcherStopping     bool
	history             *HistoryService
	windowStatePath     string
	windowState         windowState
	machineSettingsPath string
	applicationVersion  string
}

// SystemColumns are the three built-in kanban columns always present.
var SystemColumns = []string{"todo", "wip", "done"}

// hashtagRe matches #tagname (bare, without boundary checks).
// Use findHashtags() / replaceHashtag() / removeHashtag() for standalone-tag
// boundary validation.
var hashtagRe = regexp.MustCompile(`#([a-zA-Z][a-zA-Z0-9_-]*)\b`)

// isHexColor checks if a tag looks like a hex color (#RGB or #RRGGBB).
var hexColorRe = regexp.MustCompile(`^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$`)

var themeIDRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)

// isHashtagBoundaryOK reports whether a hashtag is a standalone token. Tags
// must be surrounded by whitespace (or a document boundary), so markdown
// anchors such as [guide](#section) are never treated as Kanban hashtags.
func isHashtagBoundaryOK(s string, matchStart, matchEnd int) bool {
	if matchStart > 0 {
		previous, _ := utf8.DecodeLastRuneInString(s[:matchStart])
		if !unicode.IsSpace(previous) {
			return false
		}
	}
	if matchEnd < len(s) {
		next, _ := utf8.DecodeRuneInString(s[matchEnd:])
		if !unicode.IsSpace(next) {
			return false
		}
	}
	return true
}

// findHashtags extracts valid standalone hashtags from content.
func findHashtags(content string) []string {
	seen := make(map[string]bool)
	var tags []string
	for _, idx := range hashtagRe.FindAllStringSubmatchIndex(content, -1) {
		if len(idx) >= 4 && isHashtagBoundaryOK(content, idx[0], idx[1]) {
			tag := strings.ToLower(content[idx[2]:idx[3]])
			if !seen[tag] && !hexColorRe.MatchString(tag) {
				seen[tag] = true
				tags = append(tags, tag)
			}
		}
	}
	return tags
}

// replaceHashtag replaces all occurrences of #oldTag with #newTag, respecting boundaries.
func replaceHashtag(content, oldTag, newTag string) string {
	pat := regexp.MustCompile(`#` + regexp.QuoteMeta(oldTag) + `\b`)
	var result strings.Builder
	last := 0
	for _, idx := range pat.FindAllStringSubmatchIndex(content, -1) {
		if isHashtagBoundaryOK(content, idx[0], idx[1]) {
			result.WriteString(content[last:idx[0]])
			result.WriteString("#" + newTag)
			last = idx[1]
		}
	}
	result.WriteString(content[last:])
	return result.String()
}

// removeHashtag removes all standalone occurrences of #tag with trailing whitespace.
func removeHashtag(content, tag string) string {
	pat := regexp.MustCompile(`#` + regexp.QuoteMeta(tag) + `\b`)
	var result strings.Builder
	last := 0
	for _, idx := range pat.FindAllStringSubmatchIndex(content, -1) {
		if isHashtagBoundaryOK(content, idx[0], idx[1]) {
			result.WriteString(content[last:idx[0]])
			last = idx[1]
			for last < len(content) {
				r, size := utf8.DecodeRuneInString(content[last:])
				if !unicode.IsSpace(r) {
					break
				}
				last += size
			}
		}
	}
	result.WriteString(content[last:])
	return result.String()
}

// NewApp creates the App instance. Called once in main().
func NewApp(vaultPath string) *App {
	absPath, err := filepath.Abs(vaultPath)
	if err != nil {
		log.Printf("[vault] Cannot resolve vault path: %v", err)
		absPath = vaultPath
	}
	if err := os.MkdirAll(absPath, 0700); err != nil { // #nosec G703 -- the vault root is explicitly selected by this local user.
		log.Printf("[vault] Cannot create vault directory: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(absPath, ".config"), 0700); err != nil { // #nosec G703 -- configuration is created only beneath the explicitly selected vault root.
		log.Printf("[vault] Cannot create vault configuration directory: %v", err)
	}
	if resolved, err := filepath.EvalSymlinks(absPath); err == nil {
		absPath = resolved
	}

	a := &App{
		vaultPath:           absPath,
		fileVersions:        make(map[string]float64),
		kanbanColors:        make(map[string]string),
		kanbanColumns:       append([]string{}, SystemColumns...),
		internalVaultWrites: make(map[string]time.Time),
		windowState:         defaultWindowState(),
	}
	a.loadColors()

	// Initialize git history service
	hs, err := NewHistoryService(absPath)
	if err != nil {
		log.Println("[history] Failed to init:", err)
	} else {
		hs.SetVaultReadLocker(&a.vaultMu)
		hs.SetCommitCallback(func() { a.emitRuntimeEvent("vault:history-changed") })
		a.history = hs
	}

	return a
}

func (a *App) configureApplicationVersion(version string) {
	a.applicationVersion = version
}

// GetApplicationVersion returns the build version injected from the embedded
// Wails product metadata during application startup.
func (a *App) GetApplicationVersion() string {
	return a.applicationVersion
}

const welcomeContent = `# Welcome to Figaro ✨

**Figaro** is a local Markdown knowledge base designed to keep your notes focused, capable, and portable.

It's fast, private, and runs entirely on your machine. All your notes live in a plain folder (the **vault**) — no lock-in, no proprietary format.

**Repository:** [github.com/grilo/figaro](https://github.com/grilo/figaro)

---

## What Figaro supports

### Headings
` + "`" + "`" + "`" + `
# H1
## H2
### H3
#### H4
##### H5
###### H6
` + "`" + "`" + "`" + `

### Text formatting
**bold** · *italic* · ~~strikethrough~~ · ` + "`" + `inline code` + "`" + ` · ==highlight==

### Links
- [Link to note](Welcome.md) — standard markdown links
- [[wikilinks]] — Obsidian-compatible wikilinks
- https://example.com — auto-linked URLs

### Code blocks

` + "`" + "`" + "`" + `javascript
function greet(name) {
    console.log("Hello, " + name + "!");
}
` + "`" + "`" + "`" + `

` + "`" + "`" + "`" + `python
from dataclasses import dataclass

@dataclass
class Note:
    title: str
    content: str = ""
` + "`" + "`" + "`" + `

### Tables

| Feature | Status | Shortcut |
|---------|--------|----------|
| File tree | ✅ | Ctrl+B |
| Search | ✅ | Ctrl+Shift+F |
| Vim mode | ⚙️ | Settings |
| Calendar | ✅ | Top bar |
| Kanban | ✅ | Top bar |

### Lists
- Unordered items
    - Nested items
    - More nesting
- Task lists
    - [x] Completed task
    - [ ] Pending task

1. Ordered lists
2. With numbering
    1. Nested ordered

### Blockquotes & Callouts
> This is a blockquote. Useful for quoting or emphasizing text.

> [!note] Callouts: > [!note], > [!warning], > [!info], > [!tip], > [!danger], > [!example]

### Horizontal rules
---

### Math (KaTeX)
Inline: $E = mc^2$

Block: $$\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}$$

### Footnotes
Footnote reference[^1] and another[^2].

[^1]: This is the first footnote.
[^2]: This is the second footnote.

### Hashtags
Use #tagname to create tags — they automatically become kanban columns.

---

## Getting Started

1. **Create a new note** — Right-click in the file tree or use Ctrl+N
2. **Link notes together** — Use [title](file.md) or [[wikilinks]]
3. **Organize with folders** — Create directories in the file tree
4. **Search everything** — Ctrl+Shift+F searches all notes
5. **Track changes** — Git history is automatic (click "0 changes" in the status bar)
6. **Export** — Right-click → Export to HTML

---

*Built with ❤️ using Go, Wails, and CodeMirror 6.*
`

// ensureWelcomeNote creates Welcome.md if the vault has no markdown files yet.
func (a *App) ensureWelcomeNote() {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	root, err := a.openVaultRoot()
	if err != nil {
		log.Printf("[vault] Cannot open vault root: %v", err)
		return
	}
	defer root.Close()
	entries, err := fs.ReadDir(root.FS(), ".")
	if err != nil {
		log.Printf("[vault] Cannot read vault: %v", err)
		return
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".md") {
			return
		}
	}
	if err := writeRootFileAtomic(root, "Welcome.md", []byte(welcomeContent), 0644); err != nil {
		log.Printf("[vault] Cannot create Welcome.md: %v", err)
	} else {
		log.Println("[vault] Created Welcome.md — empty vault, welcome to figaro!")
	}
}

// startup captures the Wails context.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	log.Println("[go] App.startup() — Wails context captured")
	a.migrateLegacyPDFBrowserPreference()
	a.ensureSettingsDefaults()

	// Desktop integration uses Linux's XDG/GNOME conventions. Other Wails
	// platforms provide their own app registration model.
	if goruntime.GOOS == "linux" {
		go a.ensureDesktopIntegration()
	}
	a.ensureWelcomeNote()
	a.watcherMu.Lock()
	a.watcherStopping = false
	a.watcherMu.Unlock()

	// Recursively registering native directory watches can touch a large vault.
	// Do it after startup returns so the first Wails window is never held up by
	// filesystem enumeration.
	go a.startVaultWatcher()

	// Scanning a large vault for Kanban tags must not delay the first window.
	// The frontend starts with the built-in columns and refreshes when this
	// background index is ready.
	go func() {
		a.syncKanbanColumns()
		a.emitRuntimeEvent("vault:kanban-indexed")
	}()
}

// setLaunchExternalFiles retains the Markdown files supplied by the operating
// system at process launch. The frontend receives opaque IDs rather than
// arbitrary filesystem paths it could use to request unrelated files.
func (a *App) setLaunchExternalFiles(paths []string) {
	files := make(map[string]string)
	ids := make([]string, 0, len(paths))
	knownPaths := make(map[string]struct{})
	for _, path := range paths {
		if path == "" {
			continue
		}
		if _, exists := knownPaths[path]; exists {
			continue
		}
		knownPaths[path] = struct{}{}
		id := fmt.Sprintf("external-%d", len(ids)+1)
		files[id] = path
		ids = append(ids, id)
	}

	a.externalFilesMu.Lock()
	a.launchExternalFiles = files
	a.launchExternalIDs = ids
	a.externalFilesMu.Unlock()
}

func (a *App) launchExternalFilePath(id string) (string, error) {
	a.externalFilesMu.RLock()
	path, ok := a.launchExternalFiles[id]
	a.externalFilesMu.RUnlock()
	if !ok || path == "" {
		return "", fmt.Errorf("external launch file is not available")
	}
	return path, nil
}

// domReady is called from OnDomReady; defined in run.go.
// shutdown is called from OnShutdown.
func (a *App) shutdown(ctx context.Context) {
	a.stopVaultWatcher()
}

func (a *App) startVaultWatcher() {
	watcher, err := newVaultWatcherWithChanges(a.vaultPath, a.handleVaultFilesystemChanges)
	if err != nil {
		// A vault can live on a filesystem which does not expose native watch
		// support. The application remains fully usable; only external-change
		// updates require a manual refresh in that case.
		log.Printf("[watcher] native vault watcher unavailable: %v", err)
		return
	}

	a.watcherMu.Lock()
	if a.watcherStopping {
		a.watcherMu.Unlock()
		watcher.Close()
		return
	}
	previous := a.vaultWatcher
	a.vaultWatcher = watcher
	a.watcherMu.Unlock()
	if previous != nil {
		previous.Close()
	}
	go watcher.Run()
}

func (a *App) stopVaultWatcher() {
	a.watcherMu.Lock()
	a.watcherStopping = true
	watcher := a.vaultWatcher
	a.vaultWatcher = nil
	a.watcherMu.Unlock()
	if watcher != nil {
		watcher.Close()
	}
}

func (a *App) handleVaultFilesystemChange() {
	a.handleVaultFilesystemChanges(nil)
}

type vaultFilesystemChangeResult struct {
	treeChanged   bool
	kanbanChanged bool
}

// handleVaultFilesystemChanges applies the debounced native event batch to
// the shared index and publishes only the UI work which is actually needed.
// A normal external save reads only the changed Markdown file; unscoped
// notifications remain a safe fallback that rebuilds once.
func (a *App) handleVaultFilesystemChanges(changes []vaultWatchChange) {
	result := a.applyVaultFilesystemChanges(changes)
	a.emitRuntimeEventData("vault:changed", map[string]bool{
		"tree_changed":   result.treeChanged,
		"kanban_changed": result.kanbanChanged,
	})
}

// applyVaultFilesystemChanges updates the shared index and returns the
// affected frontend projections. Keeping the result separate from Wails event
// emission makes the internal-write fast path observable in tests.
func (a *App) applyVaultFilesystemChanges(changes []vaultWatchChange) vaultFilesystemChangeResult {
	result := vaultFilesystemChangeResult{
		treeChanged:   len(changes) == 0,
		kanbanChanged: len(changes) == 0,
	}
	a.vaultMu.Lock()
	a.resetFileVersionsLocked()

	if len(changes) == 0 {
		a.invalidateFileTreeCacheLocked()
		a.invalidateVaultIndexLocked()
	} else {
		root, err := a.openVaultRoot()
		if err != nil {
			log.Printf("[watcher] open vault after filesystem change: %v", err)
			a.invalidateVaultIndexLocked()
			result.treeChanged = true
			result.kanbanChanged = true
		} else {
			for _, change := range changes {
				rel, err := filepath.Rel(a.vaultPath, change.Path)
				if err != nil || rel == "." || strings.HasPrefix(rel, "..") {
					a.invalidateVaultIndexLocked()
					result.treeChanged = true
					result.kanbanChanged = true
					break
				}
				cleanRel, err := vaultRelativePath(rel)
				if err != nil {
					continue
				}
				if a.consumeInternalVaultWriteLocked(cleanRel) {
					continue
				}

				if !strings.EqualFold(filepath.Ext(cleanRel), ".md") {
					if change.Op&fsnotify.Write != 0 {
						if info, statErr := root.Lstat(cleanRel); statErr == nil {
							a.updateFileTreeCacheFileLocked(cleanRel, info)
						}
					}
					if change.Op&(fsnotify.Create|fsnotify.Remove|fsnotify.Rename) != 0 {
						result.treeChanged = true
					}
					continue
				}
				if change.Op&(fsnotify.Remove|fsnotify.Rename) != 0 {
					a.removeVaultIndexPathLocked(cleanRel)
					result.treeChanged = true
					result.kanbanChanged = true
					continue
				}
				if change.Op&(fsnotify.Create|fsnotify.Write) == 0 {
					continue
				}
				info, err := root.Stat(cleanRel)
				if err != nil || info.IsDir() {
					a.removeVaultIndexPathLocked(cleanRel)
					result.treeChanged = true
					result.kanbanChanged = true
					continue
				}
				content, err := root.ReadFile(cleanRel)
				if err != nil {
					log.Printf("[watcher] read changed note %q: %v", cleanRel, err)
					a.invalidateVaultIndexLocked()
					result.treeChanged = true
					result.kanbanChanged = true
					continue
				}
				a.updateVaultIndexFileLocked(cleanRel, info, string(content))
				result.kanbanChanged = true
				if change.Op&fsnotify.Create != 0 {
					result.treeChanged = true
				}
			}
			root.Close()
		}
	}
	if result.treeChanged {
		a.invalidateFileTreeCacheLocked()
	}
	a.vaultMu.Unlock()
	return result
}

func (a *App) emitRuntimeEvent(name string) {
	a.emitRuntimeEventData(name)
}

func (a *App) emitRuntimeEventData(name string, data ...any) {
	if a.ctx == nil || name == "" {
		return
	}
	runtime.EventsEmit(a.ctx, name, data...)
}
