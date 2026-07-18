package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"math"
	"net/http"
	"os"
	"os/exec"
	"os/user"
	pathpkg "path"
	"path/filepath"
	"reflect"
	"regexp"
	goruntime "runtime"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"figaro/internal/links"
	"figaro/internal/pdfexport"

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
	internalVaultWrites map[string]time.Time
	vaultWatcher        *vaultWatcher
	watcherStopping     bool
	history             *HistoryService
	windowStatePath     string
	windowState         windowState
	machineSettingsPath string
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

const legacyFigaroDarkThemeID = "figaro-dark"

// canonicalThemeID keeps the original default theme ID stable while allowing
// Figaro Dark to replace the former Default Dark without breaking saved
// settings created during the brief standalone Figaro Dark release.
func canonicalThemeID(themeID string) string {
	normalized := strings.TrimSpace(strings.ToLower(themeID))
	if normalized == legacyFigaroDarkThemeID {
		return "default"
	}
	return normalized
}

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
	a.startConfiguredAutoCommit()

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

func (a *App) startConfiguredAutoCommit() {
	if a.history != nil {
		a.history.StartAutoCommit(a.AutoCommitLoad())
	}
}

// domReady is called from OnDomReady; defined in main.go.
// shutdown is called from OnShutdown.
func (a *App) shutdown(ctx context.Context) {
	a.stopVaultWatcher()
	if a.history != nil {
		a.history.StartAutoCommit(0)
	}
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

// ============================================================================
// Path Safety
// ============================================================================

func (a *App) safePath(rel string) (string, error) {
	cleanRel, err := vaultRelativePath(rel)
	if err != nil {
		return "", err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return "", err
	}
	defer root.Close()
	if err := validateRootPath(root, cleanRel); err != nil {
		return "", fmt.Errorf("path escapes vault: %w", err)
	}
	return a.vaultAbsolutePath(cleanRel), nil
}

func (a *App) currentFileVersionLocked(path string, info os.FileInfo) float64 {
	actual := float64(info.ModTime().UnixNano()) / 1e9
	if known, ok := a.fileVersions[path]; ok && known > actual {
		return known
	}
	return actual
}

func (a *App) recordFileVersionLocked(path string, info os.FileInfo) float64 {
	version := float64(info.ModTime().UnixNano()) / 1e9
	if known, ok := a.fileVersions[path]; ok && version <= known {
		version = math.Nextafter(known, math.Inf(1))
	}
	a.fileVersions[path] = version
	return version
}

func (a *App) resetFileVersionsLocked() {
	a.fileVersions = make(map[string]float64)
}

// ============================================================================
// 1. File Tree
// ============================================================================

// FileTreeItem represents an item in the vault file tree.
type FileTreeItem struct {
	Name     string          `json:"name"`
	Path     string          `json:"path"`
	Type     string          `json:"type"` // "file" or "directory"
	Mtime    float64         `json:"mtime,omitempty"`
	Children []*FileTreeItem `json:"children,omitempty"`
}

// GetFileTree returns the complete vault file tree.
func (a *App) GetFileTree() ([]*FileTreeItem, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()

	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	return a.buildTree(root.FS(), ".")
}

func (a *App) buildTree(vaultFS fs.FS, dir string) ([]*FileTreeItem, error) {
	entries, err := fs.ReadDir(vaultFS, dir)
	if err != nil {
		return nil, err
	}

	items := make([]*FileTreeItem, 0, len(entries))
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		// Type may be unknown on some filesystems, so inspect the entry before
		// deciding whether it is a directory. Info reports the link itself (not
		// its target), which lets the tree consistently omit symlinks.
		info, err := e.Info()
		if err != nil {
			return nil, err
		}
		if info.Mode()&fs.ModeSymlink != 0 {
			continue
		}
		rel := name
		if dir != "." {
			rel = pathpkg.Join(dir, name)
		}
		if info.IsDir() {
			children, err := a.buildTree(vaultFS, rel)
			if err != nil {
				return nil, err
			}
			items = append(items, &FileTreeItem{
				Name:     name,
				Path:     rel,
				Type:     "directory",
				Children: children,
			})
		} else {
			mtime := float64(0)
			mtime = float64(info.ModTime().UnixNano()) / 1e9
			items = append(items, &FileTreeItem{
				Name:  name,
				Path:  rel,
				Type:  "file",
				Mtime: mtime,
			})
		}
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Type != items[j].Type {
			return items[i].Type == "directory"
		}
		return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name)
	})

	return items, nil
}

// ============================================================================
// 2. File Operations
// ============================================================================

// ReadFileResult is the return value of ReadFile.
type ReadFileResult struct {
	Content string  `json:"content"`
	Mtime   float64 `json:"mtime"`
	Path    string  `json:"path"`
	Binary  bool    `json:"binary,omitempty"`
}

// ReadFile reads a file from the vault.
func (a *App) ReadFile(relPath string) (*ReadFileResult, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()

	cleanRel, err := vaultRelativePath(relPath)
	if err != nil {
		log.Printf("[ReadFile] invalid path %q: %v", relPath, err)
		return nil, err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()

	info, err := root.Stat(cleanRel)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("[ReadFile] file not found: %q", relPath)
			return nil, nil // file not found — not an error, caller handles
		}
		return nil, err
	}
	if info.IsDir() {
		return nil, fmt.Errorf("cannot read directory: %s", relPath)
	}
	data, err := root.ReadFile(cleanRel)
	if err != nil {
		return nil, err
	}
	abs := a.vaultAbsolutePath(cleanRel)
	if isBinaryFileContent(data) {
		return &ReadFileResult{
			Content: "",
			Mtime:   float64(info.ModTime().UnixNano()) / 1e9,
			Path:    relPath,
			Binary:  true,
		}, nil
	}
	return &ReadFileResult{
		Content: string(data),
		Mtime:   a.currentFileVersionLocked(abs, info),
		Path:    relPath,
	}, nil
}

// isBinaryFileContent intentionally classifies by bytes rather than filename.
// CodeMirror can edit a large and evolving set of source file extensions, and
// valid UTF-8 is a safer contract than keeping a duplicate frontend allowlist
// in Go. NUL bytes and invalid UTF-8 are reliable indicators that a vault file
// should not be opened in a text editor.
func isBinaryFileContent(data []byte) bool {
	return bytes.IndexByte(data, 0) >= 0 || !utf8.Valid(data)
}

// SaveFileResult is the return value of SaveFile.
type SaveFileResult struct {
	Success        bool              `json:"success"`
	Error          string            `json:"error,omitempty"`
	Mtime          float64           `json:"mtime,omitempty"`
	Path           string            `json:"path,omitempty"`
	OldPath        string            `json:"old_path,omitempty"`
	UpdatedLinks   []string          `json:"updated_links,omitempty"`
	MergeAvailable bool              `json:"merge_available,omitempty"`
	MovedPaths     map[string]string `json:"moved_paths,omitempty"`
}

const maxClipboardImageBytes = 25 << 20

var clipboardImageExtensions = map[string]string{
	"image/png":    ".png",
	"image/jpeg":   ".jpg",
	"image/gif":    ".gif",
	"image/webp":   ".webp",
	"image/bmp":    ".bmp",
	"image/x-icon": ".ico",
}

var clipboardImageExtensionOrder = []string{".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico"}

// ClipboardImageResult describes an image saved beside an active Markdown
// note and the portable, note-relative Markdown that should be inserted.
type ClipboardImageResult struct {
	Success  bool   `json:"success"`
	Error    string `json:"error,omitempty"`
	Path     string `json:"path,omitempty"`
	Markdown string `json:"markdown,omitempty"`
}

// SaveFile writes content to a file, with optional conflict detection via expected_mtime.
func (a *App) SaveFile(relPath string, content string, expectedMtime float64) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	cleanRel, err := vaultRelativePath(relPath)
	if err != nil {
		return nil, err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	abs := a.vaultAbsolutePath(cleanRel)

	if expectedMtime != 0 {
		info, statErr := root.Stat(cleanRel)
		if statErr != nil {
			return &SaveFileResult{Success: false, Error: "File modified externally"}, nil
		}
		actualMtime := a.currentFileVersionLocked(abs, info)
		if actualMtime != expectedMtime {
			return &SaveFileResult{
				Success: false,
				Error:   "File modified externally",
				Mtime:   actualMtime,
			}, nil
		}
	}

	if err := writeRootFileAtomic(root, cleanRel, []byte(content), 0644); err != nil {
		return nil, err
	}

	info, err := root.Stat(cleanRel)
	if err != nil {
		return nil, fmt.Errorf("inspect saved file: %w", err)
	}
	mtime := a.recordFileVersionLocked(abs, info)

	a.updateVaultIndexFileLocked(cleanRel, info, content)
	a.markInternalVaultWriteLocked(cleanRel)

	return &SaveFileResult{
		Success: true,
		Mtime:   mtime,
		Path:    relPath,
	}, nil
}

// CommitCurrentFile commits the given file to git history (used by auto-commit scheduler).
func (a *App) CommitCurrentFile(relPath string) error {
	cleanRel, err := vaultRelativePath(relPath)
	if err != nil {
		return err
	}
	if cleanRel == "." {
		return fmt.Errorf("a file path is required")
	}
	if a.history != nil {
		return a.history.CommitFile(cleanRel)
	}
	return nil
}

// FileHasUncommittedChanges scopes Git status to one vault file so the status
// bar never conflates the active note with unrelated worktree changes.
func (a *App) FileHasUncommittedChanges(relPath string) (bool, error) {
	cleanRel, err := vaultRelativePath(relPath)
	if err != nil {
		return false, err
	}
	if cleanRel == "." {
		return false, fmt.Errorf("a file path is required")
	}
	if a.history == nil {
		return false, nil
	}
	return a.history.HasUncommittedChanges(cleanRel)
}

// CommitAllFiles commits all modified tracked files (used by auto-commit scheduler).
func (a *App) CommitAllFiles() error {
	if a.history != nil {
		return a.history.CommitAllModified()
	}
	return nil
}

// CreateFile creates a new markdown file.
func (a *App) CreateFile(relPath string, content string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	cleanRel, err := vaultRelativePath(relPath)
	if err != nil {
		return nil, err
	}
	if cleanRel == "." {
		return &SaveFileResult{Success: false, Error: "Cannot create vault root"}, nil
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if _, err := root.Stat(cleanRel); err == nil {
		return &SaveFileResult{Success: false, Error: "File already exists"}, nil
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	if err := createRootFile(root, cleanRel, []byte(content), 0644); err != nil {
		if os.IsExist(err) {
			return &SaveFileResult{Success: false, Error: "File already exists"}, nil
		}
		return nil, err
	}
	info, err := root.Stat(cleanRel)
	if err != nil {
		return nil, fmt.Errorf("inspect created file: %w", err)
	}
	mtime := a.recordFileVersionLocked(a.vaultAbsolutePath(cleanRel), info)
	a.updateVaultIndexFileLocked(cleanRel, info, content)
	return &SaveFileResult{Success: true, Mtime: mtime, Path: relPath}, nil
}

// CreateInboxNote creates a collision-safe timestamped Markdown note in the
// vault's real Inbox directory. Keeping Inbox as an ordinary folder means the
// note participates in Git history, file-tree styling, links, and external
// editing exactly like every other vault file.
func (a *App) CreateInboxNote() (*SaveFileResult, error) {
	return a.createInboxNoteAt(time.Now())
}

func (a *App) createInboxNoteAt(createdAt time.Time) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if err := root.MkdirAll("Inbox", 0755); err != nil {
		return nil, fmt.Errorf("create Inbox: %w", err)
	}

	base := createdAt.Local().Format("2006-01-02-150405")
	for suffix := 1; suffix <= 10_000; suffix++ {
		filename := base + ".md"
		if suffix > 1 {
			filename = fmt.Sprintf("%s-%d.md", base, suffix)
		}
		relPath := filepath.ToSlash(filepath.Join("Inbox", filename))
		if err := createRootFile(root, relPath, nil, 0644); err != nil {
			if os.IsExist(err) {
				continue
			}
			return nil, fmt.Errorf("create Inbox note: %w", err)
		}
		info, err := root.Stat(relPath)
		if err != nil {
			return nil, fmt.Errorf("inspect Inbox note: %w", err)
		}
		mtime := a.recordFileVersionLocked(a.vaultAbsolutePath(relPath), info)
		a.updateVaultIndexFileLocked(relPath, info, "")
		return &SaveFileResult{Success: true, Mtime: mtime, Path: relPath}, nil
	}
	return &SaveFileResult{Success: false, Error: "Could not find an available Inbox note name"}, nil
}

// SaveClipboardImage decodes an image pasted into a Markdown editor and
// creates image1, image2, and so on beside that note without overwriting an
// existing image. The detected byte format, rather than the browser-provided
// MIME label, determines the file extension.
func (a *App) SaveClipboardImage(noteRelPath string, declaredMIME string, encodedData string) (*ClipboardImageResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	noteClean, err := vaultRelativePath(noteRelPath)
	if err != nil {
		return nil, err
	}
	if noteClean == "." {
		return &ClipboardImageResult{Success: false, Error: "An active Markdown file is required"}, nil
	}
	declaredMIME = strings.ToLower(strings.TrimSpace(strings.SplitN(declaredMIME, ";", 2)[0]))
	if declaredMIME != "" && !strings.HasPrefix(declaredMIME, "image/") {
		return &ClipboardImageResult{Success: false, Error: "Clipboard content is not an image"}, nil
	}
	if encodedData == "" {
		return &ClipboardImageResult{Success: false, Error: "Clipboard image is empty"}, nil
	}
	if len(encodedData) > base64.StdEncoding.EncodedLen(maxClipboardImageBytes+1) {
		return &ClipboardImageResult{Success: false, Error: "Clipboard image is larger than 25 MB"}, nil
	}
	imageData, err := base64.StdEncoding.DecodeString(encodedData)
	if err != nil {
		return &ClipboardImageResult{Success: false, Error: "Clipboard image data is invalid"}, nil
	}
	if len(imageData) == 0 {
		return &ClipboardImageResult{Success: false, Error: "Clipboard image is empty"}, nil
	}
	if len(imageData) > maxClipboardImageBytes {
		return &ClipboardImageResult{Success: false, Error: "Clipboard image is larger than 25 MB"}, nil
	}

	detectedMIME := strings.SplitN(http.DetectContentType(imageData), ";", 2)[0]
	extension, supported := clipboardImageExtensions[detectedMIME]
	if !supported {
		return &ClipboardImageResult{Success: false, Error: "Clipboard image format is not supported"}, nil
	}

	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	directory := filepath.Dir(noteClean)
	directoryInfo, err := root.Stat(directory)
	if os.IsNotExist(err) {
		return &ClipboardImageResult{Success: false, Error: "The note directory no longer exists"}, nil
	}
	if err != nil {
		return nil, err
	}
	if !directoryInfo.IsDir() {
		return &ClipboardImageResult{Success: false, Error: "The note directory is not a folder"}, nil
	}

	for index := 1; index < 10000; index++ {
		available, err := clipboardImageIndexAvailable(root, directory, index)
		if err != nil {
			return nil, err
		}
		if !available {
			continue
		}
		filename := fmt.Sprintf("image%d%s", index, extension)
		imagePath := filename
		if directory != "." {
			imagePath = filepath.Join(directory, filename)
		}
		if err := createRootFile(root, imagePath, imageData, 0644); os.IsExist(err) {
			continue
		} else if err != nil {
			return nil, err
		}
		info, err := root.Stat(imagePath)
		if err != nil {
			return nil, fmt.Errorf("inspect pasted image: %w", err)
		}
		a.recordFileVersionLocked(a.vaultAbsolutePath(imagePath), info)
		return &ClipboardImageResult{
			Success:  true,
			Path:     filepath.ToSlash(imagePath),
			Markdown: fmt.Sprintf("![Image%d](%s)", index, filename),
		}, nil
	}
	return &ClipboardImageResult{Success: false, Error: "Could not find an available image filename"}, nil
}

func clipboardImageIndexAvailable(root *os.Root, directory string, index int) (bool, error) {
	for _, extension := range clipboardImageExtensionOrder {
		filename := fmt.Sprintf("image%d%s", index, extension)
		candidate := filename
		if directory != "." {
			candidate = filepath.Join(directory, filename)
		}
		if _, err := root.Lstat(candidate); os.IsNotExist(err) {
			continue
		} else if err != nil {
			return false, err
		}
		return false, nil
	}
	return true, nil
}

// CreateDirectory creates a new folder in the vault.
func (a *App) CreateDirectory(relPath string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	cleanRel, err := vaultRelativePath(relPath)
	if err != nil {
		return nil, err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if err := root.MkdirAll(cleanRel, 0755); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	return &SaveFileResult{Success: true, Path: relPath}, nil
}

// DeletePath deletes a file or directory (recursive).
func (a *App) DeletePath(relPath string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	cleanRel, err := vaultRelativePath(relPath)
	if err != nil {
		return nil, err
	}
	if cleanRel == "." {
		return &SaveFileResult{Success: false, Error: "Cannot delete vault root"}, nil
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if _, err := root.Stat(cleanRel); os.IsNotExist(err) {
		return &SaveFileResult{Success: false, Error: "Path not found"}, nil
	} else if err != nil {
		return nil, err
	}
	if err := root.RemoveAll(cleanRel); err != nil {
		return nil, err
	}
	if err := a.removeFileTreeStylePathsLocked(cleanRel); err != nil {
		log.Printf("[file-tree] Could not remove styles for deleted path %q: %v", filepath.ToSlash(cleanRel), err)
	}
	a.resetFileVersionsLocked()
	a.syncKanbanColumnsLocked()
	return &SaveFileResult{Success: true}, nil
}

// RenamePath renames/moves a file or folder.
func (a *App) RenamePath(oldRel string, newRel string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()
	return a.renamePathLocked(oldRel, newRel)
}

func (a *App) renamePathLocked(oldRel string, newRel string) (*SaveFileResult, error) {
	oldClean, err := vaultRelativePath(oldRel)
	if err != nil {
		return nil, err
	}
	newClean, err := vaultRelativePath(newRel)
	if err != nil {
		return nil, err
	}
	if oldClean == "." || newClean == "." {
		return &SaveFileResult{Success: false, Error: "Cannot rename vault root"}, nil
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if _, err := root.Stat(oldClean); os.IsNotExist(err) {
		return &SaveFileResult{Success: false, Error: "Source not found"}, nil
	} else if err != nil {
		return nil, err
	}
	if _, err := root.Stat(newClean); err == nil {
		return &SaveFileResult{Success: false, Error: "Destination exists"}, nil
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	if err := root.MkdirAll(filepath.Dir(newClean), 0755); err != nil {
		return nil, err
	}
	linkRewrites, err := collectVaultLinkRewrites(root, oldClean, newClean)
	if err != nil {
		return nil, fmt.Errorf("collect links for move: %w", err)
	}
	if err := root.Rename(oldClean, newClean); err != nil {
		return nil, err
	}
	if applied, err := applyVaultLinkRewrites(root, linkRewrites); err != nil {
		restoreErr := restoreVaultLinkRewrites(root, applied)
		renameErr := root.Rename(newClean, oldClean)
		a.resetFileVersionsLocked()
		if restoreErr != nil || renameErr != nil {
			return nil, fmt.Errorf("%w (rollback links: %v; rollback move: %v)", err, restoreErr, renameErr)
		}
		return nil, err
	}
	a.resetFileVersionsLocked()
	a.syncKanbanColumnsLocked()
	if err := a.rewriteFileTreeStylePathsLocked(oldClean, newClean, false); err != nil {
		log.Printf("[file-tree] Could not move styles from %q to %q: %v", filepath.ToSlash(oldClean), filepath.ToSlash(newClean), err)
	}
	updatedLinks := make([]string, 0, len(linkRewrites))
	for _, rewrite := range linkRewrites {
		updatedLinks = append(updatedLinks, filepath.ToSlash(rewrite.path))
	}
	return &SaveFileResult{Success: true, OldPath: oldRel, Path: newRel, UpdatedLinks: updatedLinks}, nil
}

// MovePath moves a file or directory into a target directory.
func (a *App) MovePath(sourceRel string, targetDirRel string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	sourceClean, err := vaultRelativePath(sourceRel)
	if err != nil {
		return nil, err
	}
	targetClean, err := vaultRelativePath(targetDirRel)
	if err != nil {
		return nil, err
	}
	if sourceClean == "." {
		return &SaveFileResult{Success: false, Error: "Cannot move vault root"}, nil
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	sourceInfo, err := root.Stat(sourceClean)
	if os.IsNotExist(err) {
		return &SaveFileResult{Success: false, Error: "Source not found"}, nil
	}
	if err != nil {
		return nil, err
	}
	if sourceInfo.IsDir() && (targetClean == sourceClean || strings.HasPrefix(targetClean, sourceClean+string(filepath.Separator))) {
		return &SaveFileResult{Success: false, Error: "Cannot move a directory into itself"}, nil
	}
	if err := root.MkdirAll(targetClean, 0755); err != nil {
		return nil, err
	}

	base := filepath.Base(sourceClean)
	newRel := targetClean
	if newRel == "." {
		newRel = base
	} else {
		newRel = filepath.Join(newRel, base)
	}
	if destinationInfo, destinationErr := root.Lstat(newRel); destinationErr == nil {
		if sourceInfo.IsDir() && destinationInfo.IsDir() {
			return &SaveFileResult{
				Success:        false,
				Error:          "Destination directory already exists",
				OldPath:        filepath.ToSlash(sourceClean),
				Path:           filepath.ToSlash(newRel),
				MergeAvailable: true,
			}, nil
		}
	} else if !os.IsNotExist(destinationErr) {
		return nil, destinationErr
	}
	return a.renamePathLocked(sourceClean, newRel)
}

type directoryMergeRename struct {
	oldPath string
	newPath string
}

// MergeDirectory moves one vault directory into an existing same-named
// destination directory. Existing subdirectories are merged recursively and
// colliding files receive " (copy)", " (copy 2)", and so on. The frontend
// calls this only after the user confirms the merge offered by MovePath.
func (a *App) MergeDirectory(sourceRel string, targetDirRel string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	sourceClean, err := vaultRelativePath(sourceRel)
	if err != nil {
		return nil, err
	}
	targetClean, err := vaultRelativePath(targetDirRel)
	if err != nil {
		return nil, err
	}
	if sourceClean == "." {
		return &SaveFileResult{Success: false, Error: "Cannot merge vault root"}, nil
	}
	if targetClean == sourceClean || strings.HasPrefix(targetClean, sourceClean+string(filepath.Separator)) {
		return &SaveFileResult{Success: false, Error: "Cannot move a directory into itself"}, nil
	}

	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	sourceInfo, err := root.Lstat(sourceClean)
	if os.IsNotExist(err) {
		return &SaveFileResult{Success: false, Error: "Source not found"}, nil
	}
	if err != nil {
		return nil, err
	}
	destination := filepath.Join(targetClean, filepath.Base(sourceClean))
	if targetClean == "." {
		destination = filepath.Base(sourceClean)
	}
	destinationInfo, err := root.Lstat(destination)
	if os.IsNotExist(err) {
		return &SaveFileResult{Success: false, Error: "Destination directory no longer exists"}, nil
	}
	if err != nil {
		return nil, err
	}
	if !sourceInfo.IsDir() || !destinationInfo.IsDir() {
		return &SaveFileResult{Success: false, Error: "Both merge paths must be directories"}, nil
	}

	renames := make([]directoryMergeRename, 0)
	movedPaths := make(map[string]string)
	updatedLinkSet := make(map[string]struct{})
	if err := a.prepareDirectoryMergeCollisionsLocked(root, sourceClean, destination, &renames, movedPaths, updatedLinkSet); err != nil {
		rollbackErr := a.rollbackDirectoryMergeRenamesLocked(renames)
		return &SaveFileResult{Success: false, Error: errors.Join(err, rollbackErr).Error()}, nil
	}

	linkRewrites, err := collectVaultLinkRewrites(root, sourceClean, destination)
	if err != nil {
		rollbackErr := a.rollbackDirectoryMergeRenamesLocked(renames)
		return &SaveFileResult{Success: false, Error: errors.Join(fmt.Errorf("collect links for merge: %w", err), rollbackErr).Error()}, nil
	}
	createdPaths := make([]string, 0)
	if err := copyPreparedDirectoryMerge(root, sourceClean, destination, &createdPaths); err != nil {
		cleanupErr := removeMergedPaths(root, createdPaths)
		rollbackErr := a.rollbackDirectoryMergeRenamesLocked(renames)
		return &SaveFileResult{Success: false, Error: errors.Join(fmt.Errorf("copy merged directory: %w", err), cleanupErr, rollbackErr).Error()}, nil
	}
	applied, err := applyVaultLinkRewrites(root, linkRewrites)
	if err != nil {
		restoreErr := restoreVaultLinkRewrites(root, applied)
		cleanupErr := removeMergedPaths(root, createdPaths)
		rollbackErr := a.rollbackDirectoryMergeRenamesLocked(renames)
		return &SaveFileResult{Success: false, Error: errors.Join(err, restoreErr, cleanupErr, rollbackErr).Error()}, nil
	}
	if err := root.RemoveAll(sourceClean); err != nil {
		return &SaveFileResult{Success: false, Error: fmt.Sprintf("Merged contents were copied, but the source folder could not be removed: %v", err)}, nil
	}

	finalUpdatedLinkSet := make(map[string]struct{}, len(updatedLinkSet)+len(linkRewrites))
	for path := range updatedLinkSet {
		cleanPath := filepath.Clean(filepath.FromSlash(path))
		if vaultPathIsSameOrDescendant(sourceClean, cleanPath) {
			relative, relativeErr := filepath.Rel(sourceClean, cleanPath)
			if relativeErr == nil {
				cleanPath = destination
				if relative != "." {
					cleanPath = filepath.Join(destination, relative)
				}
			}
		}
		finalUpdatedLinkSet[filepath.ToSlash(cleanPath)] = struct{}{}
	}
	for _, rewrite := range linkRewrites {
		finalUpdatedLinkSet[filepath.ToSlash(rewrite.path)] = struct{}{}
	}
	updatedLinks := make([]string, 0, len(finalUpdatedLinkSet))
	for path := range finalUpdatedLinkSet {
		updatedLinks = append(updatedLinks, path)
	}
	sort.Strings(updatedLinks)
	a.resetFileVersionsLocked()
	a.syncKanbanColumnsLocked()
	if err := a.mergeFileTreeStylePathsLocked(sourceClean, destination); err != nil {
		log.Printf("[file-tree] Could not preserve styles after directory merge: %v", err)
	}
	return &SaveFileResult{
		Success:      true,
		OldPath:      filepath.ToSlash(sourceClean),
		Path:         filepath.ToSlash(destination),
		MovedPaths:   movedPaths,
		UpdatedLinks: updatedLinks,
	}, nil
}

func (a *App) prepareDirectoryMergeCollisionsLocked(
	root *os.Root,
	sourceDir string,
	destinationDir string,
	renames *[]directoryMergeRename,
	movedPaths map[string]string,
	updatedLinks map[string]struct{},
) error {
	directory, err := root.Open(sourceDir)
	if err != nil {
		return err
	}
	entries, readErr := directory.ReadDir(-1)
	closeErr := directory.Close()
	if readErr != nil || closeErr != nil {
		return errors.Join(readErr, closeErr)
	}
	for _, entry := range entries {
		sourcePath := filepath.Join(sourceDir, entry.Name())
		destinationPath := filepath.Join(destinationDir, entry.Name())
		sourceInfo, err := root.Lstat(sourcePath)
		if err != nil {
			return err
		}
		destinationInfo, destinationErr := root.Lstat(destinationPath)
		if os.IsNotExist(destinationErr) {
			continue
		}
		if destinationErr != nil {
			return destinationErr
		}
		if sourceInfo.IsDir() && destinationInfo.IsDir() {
			if err := a.prepareDirectoryMergeCollisionsLocked(root, sourcePath, destinationPath, renames, movedPaths, updatedLinks); err != nil {
				return err
			}
			continue
		}

		renamedSource, err := nextParenthesizedMergePath(root, sourcePath, destinationDir, sourceInfo.IsDir())
		if err != nil {
			return err
		}
		result, err := a.renamePathLocked(sourcePath, renamedSource)
		if err != nil {
			return err
		}
		if !result.Success {
			return errors.New(result.Error)
		}
		*renames = append(*renames, directoryMergeRename{oldPath: sourcePath, newPath: renamedSource})
		finalPath := filepath.Join(destinationDir, filepath.Base(renamedSource))
		movedPaths[filepath.ToSlash(sourcePath)] = filepath.ToSlash(finalPath)
		for _, path := range result.UpdatedLinks {
			updatedLinks[path] = struct{}{}
		}
	}
	return nil
}

func (a *App) rollbackDirectoryMergeRenamesLocked(renames []directoryMergeRename) error {
	var rollbackErrors []error
	for index := len(renames) - 1; index >= 0; index-- {
		rename := renames[index]
		result, err := a.renamePathLocked(rename.newPath, rename.oldPath)
		if err != nil {
			rollbackErrors = append(rollbackErrors, err)
		} else if !result.Success {
			rollbackErrors = append(rollbackErrors, errors.New(result.Error))
		}
	}
	return errors.Join(rollbackErrors...)
}

func nextParenthesizedMergePath(root *os.Root, sourcePath string, destinationDir string, isDirectory bool) (string, error) {
	name := filepath.Base(sourcePath)
	sourceDir := filepath.Dir(sourcePath)
	for index := 1; index < 10000; index++ {
		candidateName := parenthesizedCopyCollisionName(name, isDirectory, index)
		sourceCandidate := filepath.Join(sourceDir, candidateName)
		destinationCandidate := filepath.Join(destinationDir, candidateName)
		sourceAvailable, err := rootPathAvailable(root, sourceCandidate)
		if err != nil {
			return "", err
		}
		destinationAvailable, err := rootPathAvailable(root, destinationCandidate)
		if err != nil {
			return "", err
		}
		if sourceAvailable && destinationAvailable {
			return sourceCandidate, nil
		}
	}
	return "", fmt.Errorf("could not find an available merge name for %q", name)
}

func rootPathAvailable(root *os.Root, path string) (bool, error) {
	if _, err := root.Lstat(path); os.IsNotExist(err) {
		return true, nil
	} else if err != nil {
		return false, err
	}
	return false, nil
}

func parenthesizedCopyCollisionName(name string, isDirectory bool, index int) string {
	suffix := " (copy)"
	if index > 1 {
		suffix = fmt.Sprintf(" (copy %d)", index)
	}
	if isDirectory {
		return name + suffix
	}
	extension := filepath.Ext(name)
	if strings.HasSuffix(strings.ToLower(name), ".drawio.svg") {
		extension = name[len(name)-len(".drawio.svg"):]
	}
	if extension == "" || extension == name {
		return name + suffix
	}
	return strings.TrimSuffix(name, extension) + suffix + extension
}

func copyPreparedDirectoryMerge(root *os.Root, sourceDir string, destinationDir string, createdPaths *[]string) error {
	directory, err := root.Open(sourceDir)
	if err != nil {
		return err
	}
	entries, readErr := directory.ReadDir(-1)
	closeErr := directory.Close()
	if readErr != nil || closeErr != nil {
		return errors.Join(readErr, closeErr)
	}
	for _, entry := range entries {
		sourcePath := filepath.Join(sourceDir, entry.Name())
		destinationPath := filepath.Join(destinationDir, entry.Name())
		sourceInfo, err := root.Lstat(sourcePath)
		if err != nil {
			return err
		}
		destinationInfo, destinationErr := root.Lstat(destinationPath)
		if destinationErr == nil && sourceInfo.IsDir() && destinationInfo.IsDir() {
			if err := copyPreparedDirectoryMerge(root, sourcePath, destinationPath, createdPaths); err != nil {
				return err
			}
			continue
		}
		if destinationErr == nil {
			return fmt.Errorf("merge collision was not resolved for %q", filepath.ToSlash(sourcePath))
		}
		if !os.IsNotExist(destinationErr) {
			return destinationErr
		}
		created, err := copyVaultTree(root, sourcePath, destinationPath)
		if created {
			*createdPaths = append(*createdPaths, destinationPath)
		}
		if err != nil {
			return err
		}
	}
	return nil
}

func removeMergedPaths(root *os.Root, paths []string) error {
	var cleanupErrors []error
	for index := len(paths) - 1; index >= 0; index-- {
		if err := root.RemoveAll(paths[index]); err != nil && !os.IsNotExist(err) {
			cleanupErrors = append(cleanupErrors, err)
		}
	}
	return errors.Join(cleanupErrors...)
}

const recursiveCopyError = "A folder cannot be copied into itself or one of its descendants because that would cause a recursive copy. Select its parent folder to create a sibling copy instead."

// CopyPath copies one vault file or directory into an existing vault
// directory. Existing entries are never replaced: a collision receives a
// descriptive copy suffix (for example, "Notes copy" or "note copy 2.md").
func (a *App) CopyPath(sourceRel string, targetDirRel string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	sourceClean, err := vaultRelativePath(sourceRel)
	if err != nil {
		return nil, err
	}
	targetClean, err := vaultRelativePath(targetDirRel)
	if err != nil {
		return nil, err
	}
	if sourceClean == "." {
		return &SaveFileResult{Success: false, Error: "Cannot copy vault root"}, nil
	}

	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()

	sourceInfo, err := root.Lstat(sourceClean)
	if os.IsNotExist(err) {
		return &SaveFileResult{Success: false, Error: "Source not found"}, nil
	}
	if err != nil {
		return nil, err
	}
	if sourceInfo.Mode()&fs.ModeSymlink != 0 {
		return &SaveFileResult{Success: false, Error: "Cannot copy symbolic links"}, nil
	}
	if !sourceInfo.IsDir() && !sourceInfo.Mode().IsRegular() {
		return &SaveFileResult{Success: false, Error: "Cannot copy special files"}, nil
	}

	targetInfo, err := root.Lstat(targetClean)
	if os.IsNotExist(err) {
		return &SaveFileResult{Success: false, Error: "Paste destination no longer exists"}, nil
	}
	if err != nil {
		return nil, err
	}
	if targetInfo.Mode()&fs.ModeSymlink != 0 || !targetInfo.IsDir() {
		return &SaveFileResult{Success: false, Error: "Paste destination is not a folder"}, nil
	}
	if sourceInfo.IsDir() && vaultPathIsSameOrDescendant(sourceClean, targetClean) {
		return &SaveFileResult{Success: false, Error: recursiveCopyError}, nil
	}

	destination, err := nextCopyDestination(root, sourceClean, targetClean, sourceInfo.IsDir())
	if err != nil {
		return nil, err
	}
	createdDestination, copyErr := copyVaultTree(root, sourceClean, destination)
	if copyErr != nil {
		if createdDestination {
			if cleanupErr := root.RemoveAll(destination); cleanupErr != nil {
				log.Printf("[file-copy] Could not remove incomplete copy %q: %v", destination, cleanupErr)
			}
		}
		return &SaveFileResult{Success: false, Error: fmt.Sprintf("Could not copy %q: %v", filepath.Base(sourceClean), copyErr)}, nil
	}
	updatedLinks, rewriteErr := rewriteCopiedMarkdownLinks(root, sourceClean, destination)
	if rewriteErr != nil {
		if cleanupErr := root.RemoveAll(destination); cleanupErr != nil {
			log.Printf("[file-copy] Could not remove copy after link rewrite failure %q: %v", destination, cleanupErr)
		}
		return &SaveFileResult{Success: false, Error: fmt.Sprintf("Could not preserve links in copied item %q: %v", filepath.Base(sourceClean), rewriteErr)}, nil
	}

	a.syncKanbanColumnsLocked()
	if err := a.rewriteFileTreeStylePathsLocked(sourceClean, destination, true); err != nil {
		log.Printf("[file-tree] Could not copy styles from %q to %q: %v", filepath.ToSlash(sourceClean), filepath.ToSlash(destination), err)
	}
	return &SaveFileResult{Success: true, Path: filepath.ToSlash(destination), UpdatedLinks: updatedLinks}, nil
}

func vaultPathIsSameOrDescendant(parent, candidate string) bool {
	parent = filepath.Clean(parent)
	candidate = filepath.Clean(candidate)
	if goruntime.GOOS == "windows" {
		parent = strings.ToLower(parent)
		candidate = strings.ToLower(candidate)
	}
	return candidate == parent || strings.HasPrefix(candidate, parent+string(filepath.Separator))
}

func nextCopyDestination(root *os.Root, source, targetDirectory string, isDirectory bool) (string, error) {
	name := filepath.Base(source)
	for index := 0; index < 10000; index++ {
		candidateName := name
		if index > 0 {
			candidateName = copyCollisionName(name, isDirectory, index)
		}
		candidate := candidateName
		if targetDirectory != "." {
			candidate = filepath.Join(targetDirectory, candidateName)
		}
		if _, err := root.Lstat(candidate); os.IsNotExist(err) {
			return candidate, nil
		} else if err != nil {
			return "", err
		}
	}
	return "", fmt.Errorf("could not find an available copy name for %q", name)
}

func copyCollisionName(name string, isDirectory bool, index int) string {
	suffix := " copy"
	if index > 1 {
		suffix += fmt.Sprintf(" %d", index)
	}
	if isDirectory {
		return name + suffix
	}
	extension := filepath.Ext(name)
	// Keep editable Draw.io copies recognisable as .drawio.svg diagrams.
	if strings.HasSuffix(strings.ToLower(name), ".drawio.svg") {
		extension = name[len(name)-len(".drawio.svg"):]
	}
	if extension == "" || extension == name {
		return name + suffix
	}
	stem := strings.TrimSuffix(name, extension)
	return stem + suffix + extension
}

func copyVaultTree(root *os.Root, source, destination string) (bool, error) {
	info, err := root.Lstat(source)
	if err != nil {
		return false, err
	}
	if info.Mode()&fs.ModeSymlink != 0 {
		return false, fmt.Errorf("source contains symbolic link %q", filepath.Base(source))
	}
	if info.IsDir() {
		input, err := root.Open(source)
		if err != nil {
			return false, err
		}
		defer input.Close()
		openedInfo, err := input.Stat()
		if err != nil || !openedInfo.IsDir() || !os.SameFile(info, openedInfo) {
			return false, fmt.Errorf("source folder changed while it was being copied")
		}
		if err := root.Mkdir(destination, info.Mode().Perm()|0700); err != nil {
			return false, err
		}
		entries, err := input.ReadDir(-1)
		if err != nil {
			return true, err
		}
		for _, entry := range entries {
			if _, err := copyVaultTree(root, filepath.Join(source, entry.Name()), filepath.Join(destination, entry.Name())); err != nil {
				return true, err
			}
		}
		return true, nil
	}
	if !info.Mode().IsRegular() {
		return false, fmt.Errorf("source contains special file %q", filepath.Base(source))
	}

	input, err := root.Open(source)
	if err != nil {
		return false, err
	}
	defer input.Close()
	openedInfo, err := input.Stat()
	if err != nil || !openedInfo.Mode().IsRegular() || !os.SameFile(info, openedInfo) {
		return false, fmt.Errorf("source file changed while it was being copied")
	}
	output, err := root.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, info.Mode().Perm())
	if err != nil {
		return false, err
	}
	removeIncomplete := true
	defer func() {
		_ = output.Close()
		if removeIncomplete {
			_ = root.Remove(destination)
		}
	}()
	if _, err := io.Copy(output, input); err != nil {
		return true, err
	}
	if err := output.Sync(); err != nil {
		return true, err
	}
	if err := output.Close(); err != nil {
		return true, err
	}
	removeIncomplete = false
	return true, nil
}

// CopyExternalResult reports the vault-relative top-level paths imported from
// a native file manager drop. Sources are never removed.
type CopyExternalResult struct {
	Success            bool     `json:"success"`
	Paths              []string `json:"paths,omitempty"`
	Conflicts          []string `json:"conflicts,omitempty"`
	DirectoryConflicts []string `json:"directory_conflicts,omitempty"`
	Error              string   `json:"error,omitempty"`
}

type externalCopyPlan struct {
	source      string
	destination string
	replace     bool
}

type externalCopyBackup struct {
	destination string
	backup      string
}

// CopyExternalPaths copies files or folders supplied by Wails' native file
// drop channel into an existing vault directory. It preflights the complete
// batch and only replaces existing entries after the frontend has received
// their paths and obtained explicit user confirmation.
func (a *App) CopyExternalPaths(sourcePaths []string, targetDirRel string, replaceExisting bool) (*CopyExternalResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	if len(sourcePaths) == 0 {
		return &CopyExternalResult{Success: false, Error: "No files or folders were dropped"}, nil
	}
	targetClean, err := vaultRelativePath(targetDirRel)
	if err != nil {
		return &CopyExternalResult{Success: false, Error: err.Error()}, nil
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	targetInfo, err := root.Stat(targetClean)
	if os.IsNotExist(err) {
		return &CopyExternalResult{Success: false, Error: "Drop destination no longer exists"}, nil
	}
	if err != nil {
		return nil, err
	}
	if !targetInfo.IsDir() {
		return &CopyExternalResult{Success: false, Error: "Drop destination is not a folder"}, nil
	}

	targetAbsolute, err := filepath.EvalSymlinks(a.vaultAbsolutePath(targetClean))
	if err != nil {
		return nil, fmt.Errorf("resolve drop destination: %w", err)
	}
	plans := make([]externalCopyPlan, 0, len(sourcePaths))
	conflicts := make([]string, 0)
	directoryConflicts := make([]string, 0)
	seenDestinations := make(map[string]struct{}, len(sourcePaths))
	for _, suppliedPath := range sourcePaths {
		source := filepath.Clean(strings.TrimSpace(suppliedPath))
		if source == "." || !filepath.IsAbs(source) {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Dropped path must be absolute: %q", suppliedPath)}, nil
		}
		info, err := os.Lstat(source)
		if err != nil {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot inspect %q: %v", filepath.Base(source), err)}, nil
		}
		if info.Mode()&fs.ModeSymlink != 0 {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot import symbolic link %q", filepath.Base(source))}, nil
		}
		if !info.IsDir() && !info.Mode().IsRegular() {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot import special file %q", filepath.Base(source))}, nil
		}
		if err := validateExternalCopyTree(source); err != nil {
			return &CopyExternalResult{Success: false, Error: err.Error()}, nil
		}

		destination := filepath.Join(targetClean, filepath.Base(source))
		if targetClean == "." {
			destination = filepath.Base(source)
		}
		key := filepath.Clean(destination)
		if goruntime.GOOS == "windows" {
			key = strings.ToLower(key)
		}
		if _, duplicate := seenDestinations[key]; duplicate {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("More than one dropped item is named %q", filepath.Base(source))}, nil
		}
		seenDestinations[key] = struct{}{}
		destinationInfo, destinationErr := root.Stat(destination)
		replace := false
		if destinationErr == nil {
			if os.SameFile(info, destinationInfo) {
				return &CopyExternalResult{Success: false, Error: fmt.Sprintf("%q is already at the destination", filepath.Base(source))}, nil
			}
			replace = true
			conflicts = append(conflicts, filepath.ToSlash(destination))
			if info.IsDir() && destinationInfo.IsDir() {
				directoryConflicts = append(directoryConflicts, filepath.ToSlash(destination))
			}
		} else if !os.IsNotExist(destinationErr) {
			return nil, destinationErr
		}

		resolvedSource, err := filepath.EvalSymlinks(source)
		if err != nil {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot resolve %q: %v", filepath.Base(source), err)}, nil
		}
		if info.IsDir() && pathIsWithin(resolvedSource, filepath.Join(targetAbsolute, filepath.Base(source))) {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot copy folder %q into itself", filepath.Base(source))}, nil
		}
		plans = append(plans, externalCopyPlan{source: source, destination: destination, replace: replace})
	}
	if len(conflicts) > 0 && !replaceExisting {
		return &CopyExternalResult{
			Success:            false,
			Conflicts:          conflicts,
			DirectoryConflicts: directoryConflicts,
			Error:              "One or more items already exist in the destination",
		}, nil
	}

	backupRoot := ""
	backups := make([]externalCopyBackup, 0, len(conflicts))
	if len(conflicts) > 0 {
		backupRoot, err = createExternalCopyBackupRoot(root)
		if err != nil {
			return nil, fmt.Errorf("prepare replacement backup: %w", err)
		}
		for index, plan := range plans {
			if !plan.replace {
				continue
			}
			backup := filepath.Join(backupRoot, fmt.Sprintf("%d", index))
			if err := root.Rename(plan.destination, backup); err != nil {
				restoreErr := restoreExternalCopyBackups(root, backups)
				if restoreErr == nil {
					_ = root.RemoveAll(backupRoot)
				}
				return &CopyExternalResult{Success: false, Error: errors.Join(
					fmt.Errorf("could not prepare replacement for %q: %w", filepath.Base(plan.destination), err),
					restoreErr,
				).Error()}, nil
			}
			backups = append(backups, externalCopyBackup{destination: plan.destination, backup: backup})
		}
	}

	copied := make([]string, 0, len(plans))
	for _, plan := range plans {
		log.Printf("[file-drop] Copying %q into vault path %q", plan.source, filepath.ToSlash(plan.destination))
		createdDestination, err := copyExternalTree(root, plan.source, plan.destination)
		if err != nil {
			if createdDestination {
				copied = append(copied, plan.destination)
			}
			for index := len(copied) - 1; index >= 0; index-- {
				if cleanupErr := root.RemoveAll(copied[index]); cleanupErr != nil {
					log.Printf("[file-drop] Could not roll back incomplete import %q: %v", copied[index], cleanupErr)
				}
			}
			restoreErr := restoreExternalCopyBackups(root, backups)
			if backupRoot != "" && restoreErr == nil {
				_ = root.RemoveAll(backupRoot)
			}
			return &CopyExternalResult{Success: false, Error: errors.Join(
				fmt.Errorf("could not copy %q: %w", filepath.Base(plan.source), err),
				restoreErr,
			).Error()}, nil
		}
		copied = append(copied, plan.destination)
	}
	if backupRoot != "" {
		if err := root.RemoveAll(backupRoot); err != nil {
			log.Printf("[file-drop] Could not remove completed replacement backup %q: %v", backupRoot, err)
		}
	}
	a.syncKanbanColumnsLocked()
	paths := make([]string, len(copied))
	for index, path := range copied {
		paths[index] = filepath.ToSlash(path)
	}
	return &CopyExternalResult{Success: true, Paths: paths}, nil
}

// MergeExternalPaths imports native files and directories without replacing
// anything already in the vault. Existing same-named directories merge
// recursively; every other collision receives a parenthesized copy suffix.
func (a *App) MergeExternalPaths(sourcePaths []string, targetDirRel string) (*CopyExternalResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	if len(sourcePaths) == 0 {
		return &CopyExternalResult{Success: false, Error: "No files or folders were dropped"}, nil
	}
	targetClean, err := vaultRelativePath(targetDirRel)
	if err != nil {
		return &CopyExternalResult{Success: false, Error: err.Error()}, nil
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	targetInfo, err := root.Lstat(targetClean)
	if err != nil {
		return &CopyExternalResult{Success: false, Error: "Drop destination no longer exists"}, nil
	}
	if !targetInfo.IsDir() {
		return &CopyExternalResult{Success: false, Error: "Drop destination is not a folder"}, nil
	}
	targetAbsolute, err := filepath.EvalSymlinks(a.vaultAbsolutePath(targetClean))
	if err != nil {
		return nil, fmt.Errorf("resolve drop destination: %w", err)
	}

	seenNames := make(map[string]struct{}, len(sourcePaths))
	sources := make([]string, 0, len(sourcePaths))
	for _, suppliedPath := range sourcePaths {
		source := filepath.Clean(strings.TrimSpace(suppliedPath))
		if source == "." || !filepath.IsAbs(source) {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Dropped path must be absolute: %q", suppliedPath)}, nil
		}
		info, err := os.Lstat(source)
		if err != nil {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot inspect %q: %v", filepath.Base(source), err)}, nil
		}
		if info.Mode()&fs.ModeSymlink != 0 || (!info.IsDir() && !info.Mode().IsRegular()) {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot import unsupported path %q", filepath.Base(source))}, nil
		}
		if err := validateExternalCopyTree(source); err != nil {
			return &CopyExternalResult{Success: false, Error: err.Error()}, nil
		}
		nameKey := filepath.Base(source)
		if goruntime.GOOS == "windows" {
			nameKey = strings.ToLower(nameKey)
		}
		if _, duplicate := seenNames[nameKey]; duplicate {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("More than one dropped item is named %q", filepath.Base(source))}, nil
		}
		seenNames[nameKey] = struct{}{}
		resolvedSource, err := filepath.EvalSymlinks(source)
		if err != nil {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot resolve %q: %v", filepath.Base(source), err)}, nil
		}
		if info.IsDir() && pathIsWithin(resolvedSource, filepath.Join(targetAbsolute, filepath.Base(source))) {
			return &CopyExternalResult{Success: false, Error: fmt.Sprintf("Cannot copy folder %q into itself", filepath.Base(source))}, nil
		}
		sources = append(sources, source)
	}

	createdPaths := make([]string, 0)
	paths := make([]string, 0, len(sources))
	for _, source := range sources {
		destination := filepath.Join(targetClean, filepath.Base(source))
		if targetClean == "." {
			destination = filepath.Base(source)
		}
		actualDestination, err := copyExternalTreeMerged(root, source, destination, &createdPaths)
		if err != nil {
			cleanupErr := removeMergedPaths(root, createdPaths)
			return &CopyExternalResult{Success: false, Error: errors.Join(fmt.Errorf("could not merge %q: %w", filepath.Base(source), err), cleanupErr).Error()}, nil
		}
		paths = append(paths, filepath.ToSlash(actualDestination))
	}
	a.syncKanbanColumnsLocked()
	return &CopyExternalResult{Success: true, Paths: paths}, nil
}

func copyExternalTreeMerged(root *os.Root, source string, destination string, createdPaths *[]string) (string, error) {
	sourceInfo, err := os.Lstat(source)
	if err != nil {
		return "", err
	}
	destinationInfo, destinationErr := root.Lstat(destination)
	if destinationErr == nil && sourceInfo.IsDir() && destinationInfo.IsDir() {
		entries, err := os.ReadDir(source)
		if err != nil {
			return "", err
		}
		for _, entry := range entries {
			if _, err := copyExternalTreeMerged(root, filepath.Join(source, entry.Name()), filepath.Join(destination, entry.Name()), createdPaths); err != nil {
				return "", err
			}
		}
		return destination, nil
	}
	actualDestination := destination
	if destinationErr == nil {
		actualDestination, err = nextParenthesizedExternalDestination(root, destination, sourceInfo.IsDir())
		if err != nil {
			return "", err
		}
	} else if !os.IsNotExist(destinationErr) {
		return "", destinationErr
	}
	created, err := copyExternalTree(root, source, actualDestination)
	if created {
		*createdPaths = append(*createdPaths, actualDestination)
	}
	return actualDestination, err
}

func nextParenthesizedExternalDestination(root *os.Root, destination string, isDirectory bool) (string, error) {
	directory := filepath.Dir(destination)
	name := filepath.Base(destination)
	for index := 1; index < 10000; index++ {
		candidate := filepath.Join(directory, parenthesizedCopyCollisionName(name, isDirectory, index))
		available, err := rootPathAvailable(root, candidate)
		if err != nil {
			return "", err
		}
		if available {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("could not find an available merge name for %q", name)
}

func createExternalCopyBackupRoot(root *os.Root) (string, error) {
	if err := root.MkdirAll(".config", 0700); err != nil {
		return "", err
	}
	for attempt := 0; attempt < 16; attempt++ {
		rel := filepath.Join(".config", fmt.Sprintf(".file-drop-backup-%d-%d", time.Now().UnixNano(), attempt))
		if err := root.Mkdir(rel, 0700); os.IsExist(err) {
			continue
		} else if err != nil {
			return "", err
		}
		return rel, nil
	}
	return "", errors.New("could not create a unique file-drop backup directory")
}

func restoreExternalCopyBackups(root *os.Root, backups []externalCopyBackup) error {
	var restoreErrors []error
	for index := len(backups) - 1; index >= 0; index-- {
		backup := backups[index]
		if err := root.Rename(backup.backup, backup.destination); err != nil {
			log.Printf("[file-drop] Could not restore replaced vault path %q from %q: %v", backup.destination, backup.backup, err)
			restoreErrors = append(restoreErrors, fmt.Errorf("could not restore original %q: %w", filepath.Base(backup.destination), err))
		}
	}
	return errors.Join(restoreErrors...)
}

func validateExternalCopyTree(source string) error {
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return fmt.Errorf("Cannot read %q: %w", filepath.Base(path), walkErr)
		}
		if entry.Type()&fs.ModeSymlink != 0 {
			return fmt.Errorf("Cannot import symbolic link %q", filepath.Base(path))
		}
		info, err := entry.Info()
		if err != nil {
			return fmt.Errorf("Cannot inspect %q: %w", filepath.Base(path), err)
		}
		if !info.IsDir() && !info.Mode().IsRegular() {
			return fmt.Errorf("Cannot import special file %q", filepath.Base(path))
		}
		return nil
	})
}

func copyExternalTree(root *os.Root, source, destination string) (bool, error) {
	info, err := os.Lstat(source)
	if err != nil {
		return false, err
	}
	if info.Mode()&fs.ModeSymlink != 0 {
		return false, fmt.Errorf("source changed into a symbolic link")
	}
	if info.IsDir() {
		// Ensure the importing user can populate a read-only source directory.
		// Files keep their source mode; vault folders retain at least owner access.
		if err := root.Mkdir(destination, info.Mode().Perm()|0700); err != nil {
			return false, err
		}
		entries, err := os.ReadDir(source)
		if err != nil {
			return true, err
		}
		for _, entry := range entries {
			if _, err := copyExternalTree(root, filepath.Join(source, entry.Name()), filepath.Join(destination, entry.Name())); err != nil {
				return true, err
			}
		}
		return true, nil
	}
	if !info.Mode().IsRegular() {
		return false, fmt.Errorf("source is not a regular file")
	}
	input, err := os.Open(source) // #nosec G304 -- source is an absolute path explicitly supplied by the native desktop file-drop API.
	if err != nil {
		return false, err
	}
	defer input.Close()
	output, err := root.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, info.Mode().Perm())
	if err != nil {
		return false, err
	}
	removeIncomplete := true
	defer func() {
		_ = output.Close()
		if removeIncomplete {
			_ = root.Remove(destination)
		}
	}()
	if _, err := io.Copy(output, input); err != nil {
		return true, err
	}
	if err := output.Sync(); err != nil {
		return true, err
	}
	if err := output.Close(); err != nil {
		return true, err
	}
	removeIncomplete = false
	return true, nil
}

func pathIsWithin(parent, child string) bool {
	relative, err := filepath.Rel(parent, child)
	if err != nil {
		return false
	}
	return relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)))
}

// ============================================================================
// 3. Search
// ============================================================================

// SearchMatch holds a single line match.
type SearchMatch struct {
	Line int    `json:"line"`
	Text string `json:"text"`
}

// SearchResult holds per-file search results.
type SearchResult struct {
	Path       string        `json:"path"`
	Name       string        `json:"name"`
	Matches    []SearchMatch `json:"matches"`
	MatchCount int           `json:"match_count"`
	Mtime      float64       `json:"mtime"`
}

// searchPreview returns the first matching line and the exact match count.
// The search dropdown only displays these two facts, so retaining every
// matching line would needlessly allocate and serialize large result payloads
// for broad searches.
func searchPreview(content, query string, caseSensitive bool) ([]SearchMatch, int) {
	var first SearchMatch
	matchCount := 0
	for lineNumber, lineStart := 1, 0; ; lineNumber++ {
		lineEnd := strings.IndexByte(content[lineStart:], '\n')
		line := content[lineStart:]
		if lineEnd >= 0 {
			line = content[lineStart : lineStart+lineEnd]
		}
		check := line
		if !caseSensitive {
			check = strings.ToLower(line)
		}
		if strings.Contains(check, query) {
			matchCount++
			if matchCount == 1 {
				first = SearchMatch{Line: lineNumber, Text: strings.TrimSpace(line)}
			}
		}
		if lineEnd < 0 {
			break
		}
		lineStart += lineEnd + 1
	}
	if matchCount == 0 {
		return nil, 0
	}
	return []SearchMatch{first}, matchCount
}

// SearchFiles searches all .md files in the vault for a query string.
func (a *App) SearchFiles(query string, caseSensitive bool) ([]SearchResult, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, err
	}

	searchQuery := query
	candidates := map[string]struct{}(nil)
	if !caseSensitive {
		searchQuery = strings.ToLower(query)
		candidates = index.searchCandidates(searchQuery)
	}

	var results []SearchResult
	for _, path := range index.paths {
		if candidates != nil {
			if _, found := candidates[path]; !found {
				continue
			}
		}
		file := index.files[path]
		content := file.content
		if !caseSensitive {
			content = file.searchLower
		}
		if !strings.Contains(content, searchQuery) {
			continue
		}

		matches, matchCount := searchPreview(file.content, searchQuery, caseSensitive)
		if matchCount > 0 {
			results = append(results, SearchResult{
				Path:       file.path,
				Name:       file.name,
				Matches:    matches,
				MatchCount: matchCount,
				Mtime:      file.mtime,
			})
		}
	}
	sort.Slice(results, func(i, j int) bool {
		return results[i].Mtime > results[j].Mtime
	})
	return results, nil
}

// BacklinkResult holds one backlink match.
type BacklinkResult struct {
	Path    string  `json:"path"`
	Name    string  `json:"name"`
	LineNum int     `json:"line_num"`
	Snippet string  `json:"snippet"`
	Mtime   float64 `json:"mtime"`
}

// SearchBacklinks finds all notes that link to the given target note.
func (a *App) SearchBacklinks(targetPath string) ([]BacklinkResult, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, err
	}

	targetName := strings.TrimSuffix(filepath.Base(targetPath), ".md")
	targetRel := strings.ReplaceAll(targetPath, "\\", "/")

	// Wails serializes a nil Go slice as null. Backlinks are a collection, so
	// preserve the API contract and return [] when no notes link to the target.
	results := make([]BacklinkResult, 0)
	bySource := make(map[string]BacklinkResult)
	for _, target := range []string{targetRel, targetName + ".md"} {
		for _, backlink := range index.backlinksByTarget[strings.ToLower(target)] {
			previous, found := bySource[backlink.Path]
			if !found || backlink.LineNum < previous.LineNum {
				bySource[backlink.Path] = backlink
			}
		}
	}
	for _, backlink := range bySource {
		results = append(results, backlink)
	}
	sort.Slice(results, func(i, j int) bool {
		return results[i].Mtime > results[j].Mtime
	})
	return results, nil
}

// ============================================================================
// 4. Hashtag / Kanban
// ============================================================================

func (a *App) extractHashtags(content string) []string {
	return findHashtags(content)
}

// syncKanbanColumns rescans all vault files for hashtags and updates the column list.
func (a *App) syncKanbanColumns() {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	a.syncKanbanColumnsLocked()
}

// syncKanbanColumnsLocked requires vaultMu to be held (for reading or
// writing), so a scan observes a coherent vault snapshot.
func (a *App) syncKanbanColumnsLocked() {
	// Broad filesystem changes (rename/copy/merge and external tools) may
	// affect an unknown set of notes. Discard the old snapshot once, then build
	// a coherent replacement. Ordinary saves use updateVaultIndexFileLocked
	// instead and never enter this path.
	a.invalidateVaultIndexLocked()
	if _, err := a.ensureVaultIndexLocked(); err != nil {
		log.Printf("[vault-index] Could not index vault: %v", err)
	}
}

// GetKanbanColumns returns current columns and colors.
func (a *App) GetKanbanColumns() (map[string]interface{}, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	columns := append([]string(nil), a.kanbanColumns...)
	colors := make(map[string]string, len(a.kanbanColors))
	for name, color := range a.kanbanColors {
		colors[name] = color
	}
	return map[string]interface{}{
		"columns": columns,
		"colors":  colors,
	}, nil
}

// KanbanCard represents a task on the board.
type KanbanCard struct {
	File     string `json:"file"`
	FileName string `json:"file_name"`
	Line     int    `json:"line"`
	Text     string `json:"text"`
	Tag      string `json:"tag"`
}

// GetKanbanBoard returns all tasks grouped by column.
func (a *App) GetKanbanBoard() (map[string][]KanbanCard, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, err
	}

	a.mu.RLock()
	columns := make([]string, len(a.kanbanColumns))
	copy(columns, a.kanbanColumns)
	a.mu.RUnlock()

	columnSet := make(map[string]bool)
	for _, c := range columns {
		columnSet[c] = true
	}

	board := make(map[string][]KanbanCard)
	for tag, cards := range index.cardsByTag {
		if columnSet[tag] {
			board[tag] = append([]KanbanCard(nil), cards...)
		}
	}
	return board, nil
}

const maxHomeTaskCount = 6

// GetHomeTasks returns the first unfinished Kanban cards needed by Home
// without serializing the complete board. Cards retain the normal board order:
// custom columns first, then todo and wip, with done always omitted.
func (a *App) GetHomeTasks(limit int) ([]KanbanCard, error) {
	if limit <= 0 {
		return []KanbanCard{}, nil
	}
	if limit > maxHomeTaskCount {
		limit = maxHomeTaskCount
	}

	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, err
	}

	a.mu.RLock()
	columns := append([]string(nil), a.kanbanColumns...)
	a.mu.RUnlock()

	tasks := make([]KanbanCard, 0, limit)
	for _, column := range columns {
		if strings.EqualFold(column, "done") {
			continue
		}
		for _, card := range index.cardsByTag[column] {
			tasks = append(tasks, card)
			if len(tasks) == limit {
				return tasks, nil
			}
		}
	}
	return tasks, nil
}

// SetColumnColor sets a color for a kanban column.
func (a *App) SetColumnColor(name string, color string) (map[string]interface{}, error) {
	name = strings.TrimSpace(strings.ToLower(name))
	a.mu.Lock()
	defer a.mu.Unlock()

	found := false
	for _, c := range a.kanbanColumns {
		if c == name {
			found = true
			break
		}
	}
	if !found {
		return map[string]interface{}{"success": false, "error": "Column not found"}, nil
	}
	if color == "" {
		delete(a.kanbanColors, name)
	} else {
		a.kanbanColors[name] = color
	}
	a.saveColors()
	columns := append([]string(nil), a.kanbanColumns...)
	colors := make(map[string]string, len(a.kanbanColors))
	for column, savedColor := range a.kanbanColors {
		colors[column] = savedColor
	}
	return map[string]interface{}{
		"success": true,
		"colors":  colors,
		"columns": columns,
	}, nil
}

// RenameKanbanColumn renames a column and updates all file occurrences.
func (a *App) RenameKanbanColumn(oldName string, newName string) (map[string]interface{}, error) {
	oldName = strings.TrimSpace(strings.ToLower(oldName))
	newName = strings.TrimSpace(strings.ToLower(newName))

	if !regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_-]*$`).MatchString(newName) {
		return map[string]interface{}{"success": false, "error": "Invalid column name"}, nil
	}

	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	a.mu.Lock()
	oldIdx := -1
	for i, c := range a.kanbanColumns {
		if c == oldName {
			oldIdx = i
			break
		}
	}
	if oldIdx < 0 {
		a.mu.Unlock()
		return map[string]interface{}{"success": false, "error": "Column not found"}, nil
	}
	for _, sc := range SystemColumns {
		if oldName == sc {
			a.mu.Unlock()
			return map[string]interface{}{"success": false, "error": "Cannot rename system column"}, nil
		}
	}
	for _, c := range a.kanbanColumns {
		if c == newName {
			a.mu.Unlock()
			return map[string]interface{}{"success": false, "error": "Column already exists"}, nil
		}
	}
	a.kanbanColumns[oldIdx] = newName
	if col, ok := a.kanbanColors[oldName]; ok {
		a.kanbanColors[newName] = col
		delete(a.kanbanColors, oldName)
		a.saveColors()
	}
	a.mu.Unlock()

	if err := a.renameHashtagInVault(oldName, newName); err != nil {
		return nil, fmt.Errorf("rename hashtag in vault: %w", err)
	}
	a.syncKanbanColumnsLocked()

	a.mu.RLock()
	defer a.mu.RUnlock()
	columns := append([]string(nil), a.kanbanColumns...)
	colors := make(map[string]string, len(a.kanbanColors))
	for column, color := range a.kanbanColors {
		colors[column] = color
	}
	return map[string]interface{}{
		"success": true,
		"columns": columns,
		"colors":  colors,
	}, nil
}

// DeleteKanbanColumn removes a column and strips its tag from all files.
func (a *App) DeleteKanbanColumn(name string) (map[string]interface{}, error) {
	name = strings.TrimSpace(strings.ToLower(name))
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	a.mu.Lock()
	for _, sc := range SystemColumns {
		if name == sc {
			a.mu.Unlock()
			return map[string]interface{}{"success": false, "error": "Cannot delete system column"}, nil
		}
	}
	found := false
	for i, c := range a.kanbanColumns {
		if c == name {
			a.kanbanColumns = append(a.kanbanColumns[:i], a.kanbanColumns[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		a.mu.Unlock()
		return map[string]interface{}{"success": false, "error": "Column not found"}, nil
	}
	delete(a.kanbanColors, name)
	a.saveColors()
	a.mu.Unlock()

	if err := a.removeHashtagFromVault(name); err != nil {
		return nil, fmt.Errorf("remove hashtag from vault: %w", err)
	}
	a.syncKanbanColumnsLocked()

	a.mu.RLock()
	defer a.mu.RUnlock()
	columns := append([]string(nil), a.kanbanColumns...)
	colors := make(map[string]string, len(a.kanbanColors))
	for column, color := range a.kanbanColors {
		colors[column] = color
	}
	return map[string]interface{}{
		"success": true,
		"columns": columns,
		"colors":  colors,
	}, nil
}

// UpdateTaskTag changes a tag on a specific line in a file (card drag).
func (a *App) UpdateTaskTag(filePath string, lineNum int, oldTag string, newTag string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	cleanRel, err := vaultRelativePath(filePath)
	if err != nil {
		return nil, err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	data, err := root.ReadFile(cleanRel)
	if err != nil {
		return nil, err
	}
	lines := strings.Split(string(data), "\n")
	if lineNum < 1 || lineNum > len(lines) {
		return &SaveFileResult{Success: false, Error: "Line out of range"}, nil
	}
	line := lines[lineNum-1]
	newLine := replaceHashtag(line, oldTag, newTag)
	if newLine == line {
		return &SaveFileResult{Success: false, Error: "Tag not found on line"}, nil
	}
	lines[lineNum-1] = newLine
	updatedContent := strings.Join(lines, "\n")
	if err := writeRootFileAtomic(root, cleanRel, []byte(updatedContent), 0644); err != nil {
		return nil, err
	}
	info, err := root.Stat(cleanRel)
	if err != nil {
		return nil, fmt.Errorf("inspect updated task: %w", err)
	}
	mtime := a.recordFileVersionLocked(a.vaultAbsolutePath(cleanRel), info)
	a.updateVaultIndexFileLocked(cleanRel, info, updatedContent)
	a.markInternalVaultWriteLocked(cleanRel)
	return &SaveFileResult{Success: true, Mtime: mtime, Path: filePath}, nil
}

// RemoveTagFromTask strips a tag from a specific line.
func (a *App) RemoveTagFromTask(filePath string, lineNum int, tag string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	cleanRel, err := vaultRelativePath(filePath)
	if err != nil {
		return nil, err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	data, err := root.ReadFile(cleanRel)
	if err != nil {
		return nil, err
	}
	lines := strings.Split(string(data), "\n")
	if lineNum < 1 || lineNum > len(lines) {
		return &SaveFileResult{Success: false, Error: "Line out of range"}, nil
	}
	line := lines[lineNum-1]
	newLine := removeHashtag(line, tag)
	if newLine == line {
		return &SaveFileResult{Success: false, Error: "Tag not found on line"}, nil
	}
	lines[lineNum-1] = newLine
	updatedContent := strings.Join(lines, "\n")
	if err := writeRootFileAtomic(root, cleanRel, []byte(updatedContent), 0644); err != nil {
		return nil, err
	}
	info, err := root.Stat(cleanRel)
	if err != nil {
		return nil, fmt.Errorf("inspect updated task: %w", err)
	}
	mtime := a.recordFileVersionLocked(a.vaultAbsolutePath(cleanRel), info)
	a.updateVaultIndexFileLocked(cleanRel, info, updatedContent)
	a.markInternalVaultWriteLocked(cleanRel)
	return &SaveFileResult{Success: true, Mtime: mtime, Path: filePath}, nil
}

func (a *App) renameHashtagInVault(oldTag, newTag string) error {
	return a.walkVaultMarkdown(func(root *os.Root, rel string, _ fs.FileInfo, data []byte) error {
		content := string(data)
		newContent := replaceHashtag(content, oldTag, newTag)
		if newContent != content {
			if err := writeRootFileAtomic(root, filepath.FromSlash(rel), []byte(newContent), 0644); err != nil {
				return err
			}
			info, err := root.Stat(filepath.FromSlash(rel))
			if err != nil {
				return err
			}
			a.recordFileVersionLocked(a.vaultAbsolutePath(filepath.FromSlash(rel)), info)
		}
		return nil
	})
}

func (a *App) removeHashtagFromVault(tag string) error {
	return a.walkVaultMarkdown(func(root *os.Root, rel string, _ fs.FileInfo, data []byte) error {
		content := string(data)
		newContent := removeHashtag(content, tag)
		if newContent != content {
			if err := writeRootFileAtomic(root, filepath.FromSlash(rel), []byte(newContent), 0644); err != nil {
				return err
			}
			info, err := root.Stat(filepath.FromSlash(rel))
			if err != nil {
				return err
			}
			a.recordFileVersionLocked(a.vaultAbsolutePath(filepath.FromSlash(rel)), info)
		}
		return nil
	})
}

// ============================================================================
// 5. Calendar / Daily Notes
// ============================================================================

// LinkedNote holds info about a note linked to a date.
type LinkedNote struct {
	Path    string  `json:"path"`
	Name    string  `json:"name"`
	LineNum int     `json:"line_num"`
	Snippet string  `json:"snippet"`
	Mtime   float64 `json:"mtime"`
}

// GetLinkedNotesForDate returns notes that link to a date-specific daily note.
func (a *App) GetLinkedNotesForDate(dateStr string) ([]LinkedNote, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()

	index, err := a.calendarIndexLocked()
	if err != nil {
		return nil, err
	}
	results := append([]LinkedNote(nil), index.linkedNotes[dateStr]...)
	return results, nil
}

// CalendarMonthData returns calendar information for a month.
type CalendarMonthData struct {
	Year          int     `json:"year"`
	Month         int     `json:"month"`
	DaysWithNotes []int   `json:"days_with_notes"`
	DaysWithLinks []int   `json:"days_with_links"`
	Calendar      [][]int `json:"calendar"`
}

// GetCalendarMonthData returns which days have notes/links in a given month.
func (a *App) GetCalendarMonthData(year int, month int) (*CalendarMonthData, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()

	index, err := a.calendarIndexLocked()
	if err != nil {
		return nil, err
	}

	// Build calendar grid
	firstDay := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	startDow := int(firstDay.Weekday()) // Sunday=0
	daysInMonth := time.Date(year, time.Month(month)+1, 0, 0, 0, 0, 0, time.UTC).Day()

	cal := make([][]int, 0)
	week := make([]int, 7)
	for i := range week {
		week[i] = 0
	}
	day := 1
	for dow := 0; dow < startDow; dow++ {
		week[dow] = 0
	}
	for dow := startDow; day <= daysInMonth; dow++ {
		week[dow] = day
		day++
		if dow == 6 || day > daysInMonth {
			cal = append(cal, append([]int{}, week...))
			for i := range week {
				week[i] = 0
			}
			dow = -1
		}
	}

	return &CalendarMonthData{
		Year:          year,
		Month:         month,
		DaysWithNotes: calendarMonthDays(index.dailyDaysByMonth, year, month),
		DaysWithLinks: calendarMonthDays(index.linkedDaysByMonth, year, month),
		Calendar:      cal,
	}, nil
}

// GetTodayLink returns today's date string.
func (a *App) GetTodayLink() string {
	return time.Now().Format("2006-01-02")
}

func normalizeOSUsername(username string) string {
	username = strings.TrimSpace(username)
	if separator := strings.LastIndexAny(username, "\\/"); separator >= 0 {
		username = username[separator+1:]
	}
	return strings.TrimSpace(username)
}

// GetOSUsername returns the current operating-system account name for use as
// a local document metadata default. It intentionally does not persist it.
func (a *App) GetOSUsername() string {
	if current, err := user.Current(); err == nil {
		if username := normalizeOSUsername(current.Username); username != "" {
			return username
		}
	}
	for _, envName := range []string{"USERNAME", "USER"} {
		if username := normalizeOSUsername(os.Getenv(envName)); username != "" {
			return username
		}
	}
	return ""
}

// GetTomorrowLink returns tomorrow's date string.
func (a *App) GetTomorrowLink() string {
	return time.Now().AddDate(0, 0, 1).Format("2006-01-02")
}

// GetYesterdayLink returns yesterday's date string.
func (a *App) GetYesterdayLink() string {
	return time.Now().AddDate(0, 0, -1).Format("2006-01-02")
}

// ============================================================================
// 6. Session Persistence
// ============================================================================

// SaveSession saves session state to vault/.config/session.json.
func (a *App) SaveSession(data map[string]interface{}) (*SaveFileResult, error) {
	a.sessionMu.Lock()
	defer a.sessionMu.Unlock()

	if err := a.writeSessionData(data); err != nil {
		return nil, err
	}
	return &SaveFileResult{Success: true}, nil
}

func (a *App) writeSessionData(data map[string]interface{}) error {
	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	return a.writeVaultFileAtomic(".config/session.json", jsonData, 0600)
}

// LoadSession loads session state from vault/.config/session.json. It repairs
// malformed or stale records as it reads them so an old tab cannot leave the
// client trying to restore a file that no longer exists.
func (a *App) LoadSession() (map[string]interface{}, error) {
	a.sessionMu.Lock()
	defer a.sessionMu.Unlock()

	data, err := a.readVaultFile(".config/session.json")
	if os.IsNotExist(err) {
		defaults := map[string]interface{}{}
		if err := a.writeSessionData(defaults); err != nil {
			return nil, err
		}
		return defaults, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read session: %w", err)
	}
	var result map[string]interface{}
	if len(bytes.TrimSpace(data)) == 0 || json.Unmarshal(data, &result) != nil || result == nil {
		defaults := map[string]interface{}{}
		if err := a.writeSessionData(defaults); err != nil {
			return nil, err
		}
		return defaults, nil
	}

	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	normalized := normalizeSessionData(root, result)
	if !reflect.DeepEqual(result, normalized) {
		if err := a.writeSessionData(normalized); err != nil {
			return nil, err
		}
	}
	return normalized, nil
}

func sessionString(value interface{}) string {
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

func sessionFilePath(root *os.Root, value interface{}) (string, bool) {
	clean, err := vaultRelativePath(sessionString(value))
	if err != nil || clean == "." {
		return "", false
	}
	info, err := root.Stat(clean)
	if err != nil || info.IsDir() {
		return "", false
	}
	return filepath.ToSlash(clean), true
}

func sessionDirectoryPath(root *os.Root, value interface{}) (string, bool) {
	clean, err := vaultRelativePath(sessionString(value))
	if err != nil || clean == "." {
		return "", false
	}
	info, err := root.Stat(clean)
	if err != nil || !info.IsDir() {
		return "", false
	}
	return filepath.ToSlash(clean), true
}

// sessionTreePath accepts either a file or a directory because tree focus is
// independent from the active editor file. It still validates the path against
// the vault before persisting it across launches.
func sessionTreePath(root *os.Root, value interface{}) (string, bool) {
	clean, err := vaultRelativePath(sessionString(value))
	if err != nil || clean == "." {
		return "", false
	}
	if _, err := root.Stat(clean); err != nil {
		return "", false
	}
	return filepath.ToSlash(clean), true
}

func normalizeSessionData(root *os.Root, source map[string]interface{}) map[string]interface{} {
	normalized := make(map[string]interface{})
	validTabIDs := make(map[string]bool)
	fileTabIDs := make(map[string]bool)
	tabs := make([]interface{}, 0)

	if candidates, ok := source["openTabs"].([]interface{}); ok {
		for _, candidate := range candidates {
			tab, ok := candidate.(map[string]interface{})
			if !ok {
				continue
			}
			typeName := sessionString(tab["type"])
			var cleaned map[string]interface{}
			var tabID string
			switch typeName {
			case "calendar":
				date := sessionString(tab["dateStr"])
				if date == "" {
					continue
				}
				tabID = sessionString(tab["id"])
				if tabID == "" {
					tabID = "calendar-" + date
				}
				title := sessionString(tab["title"])
				if title == "" {
					title = "Calendar: " + date
				}
				cleaned = map[string]interface{}{"id": tabID, "type": "calendar", "title": title, "dateStr": date}
			case "file", "drawio":
				path, valid := sessionFilePath(root, tab["path"])
				if !valid {
					continue
				}
				tabID = sessionString(tab["id"])
				if tabID == "" {
					tabID = path
				}
				title := sessionString(tab["title"])
				if title == "" {
					title = filepath.Base(path)
				}
				cleaned = map[string]interface{}{"id": tabID, "type": typeName, "title": title, "path": path}
			default:
				continue
			}
			if validTabIDs[tabID] {
				continue
			}
			validTabIDs[tabID] = true
			if typeName == "file" {
				fileTabIDs[tabID] = true
			}
			tabs = append(tabs, cleaned)
		}
	}
	if len(tabs) > 0 {
		normalized["openTabs"] = tabs
	}

	if activeTabID := sessionString(source["activeTabId"]); validTabIDs[activeTabID] {
		normalized["activeTabId"] = activeTabID
	}
	if selectedPath, valid := sessionFilePath(root, source["selectedFilePath"]); valid {
		normalized["selectedFilePath"] = selectedPath
	}
	if selectedTreePath, valid := sessionTreePath(root, source["selectedTreePath"]); valid {
		normalized["selectedTreePath"] = selectedTreePath
	}

	if candidates, ok := source["expandedDirs"].([]interface{}); ok {
		directories := make([]interface{}, 0, len(candidates))
		seen := make(map[string]bool)
		for _, candidate := range candidates {
			if path, valid := sessionDirectoryPath(root, candidate); valid && !seen[path] {
				seen[path] = true
				directories = append(directories, path)
			}
		}
		if len(directories) > 0 {
			normalized["expandedDirs"] = directories
		}
	}

	if candidates, ok := source["pinnedTabs"].([]interface{}); ok {
		pinned := make([]interface{}, 0, len(candidates))
		seen := make(map[string]bool)
		for _, candidate := range candidates {
			id := sessionString(candidate)
			if id != "" && validTabIDs[id] && !seen[id] {
				seen[id] = true
				pinned = append(pinned, id)
			}
		}
		if len(pinned) > 0 {
			normalized["pinnedTabs"] = pinned
		}
	}

	if cursors, ok := source["cursorStates"].(map[string]interface{}); ok {
		cleaned := make(map[string]interface{})
		for id, cursor := range cursors {
			if fileTabIDs[id] {
				cleaned[id] = cursor
			}
		}
		if len(cleaned) > 0 {
			normalized["cursorStates"] = cleaned
		}
	}

	if theme := sessionString(source["theme"]); theme != "" {
		normalized["theme"] = theme
	}
	return normalized
}

// ============================================================================
// 7. Merge Notes
// ============================================================================

// MergeNotesResult is the return value of MergeNotes.
type MergeNotesResult struct {
	Success bool     `json:"success"`
	Error   string   `json:"error,omitempty"`
	Master  string   `json:"master,omitempty"`
	Deleted []string `json:"deleted,omitempty"`
}

// MergeNotes merges source notes into the master (first in list).
func (a *App) MergeNotes(paths []string) (*MergeNotesResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	if len(paths) < 2 {
		return &MergeNotesResult{Success: false, Error: "Need at least 2 notes to merge"}, nil
	}

	masterRel, err := vaultRelativePath(paths[0])
	if err != nil {
		return nil, err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()

	masterData, err := root.ReadFile(masterRel)
	if err != nil {
		return nil, err
	}

	parts := []string{string(masterData)}
	var deleted []string

	for _, p := range paths[1:] {
		srcRel, err := vaultRelativePath(p)
		if err != nil {
			return nil, err
		}
		srcData, err := root.ReadFile(srcRel)
		if err != nil {
			return nil, err
		}
		trimmed := strings.TrimSpace(string(srcData))
		if trimmed != "" {
			// Avoid adding --- separator if master is also empty
			if len(parts) == 1 && strings.TrimSpace(parts[0]) == "" {
				parts[0] = trimmed
			} else {
				parts = append(parts, "\n\n---\n\n"+trimmed)
			}
		}
		deleted = append(deleted, filepath.ToSlash(srcRel))
	}

	merged := strings.Join(parts, "")
	if err := writeRootFileAtomic(root, masterRel, []byte(merged), 0644); err != nil {
		return nil, err
	}

	for _, p := range paths[1:] {
		srcRel, safeErr := vaultRelativePath(p)
		if safeErr != nil {
			return nil, safeErr
		}
		if err := root.Remove(srcRel); err != nil && !os.IsNotExist(err) {
			return nil, err
		}
	}

	a.resetFileVersionsLocked()
	a.syncKanbanColumnsLocked()
	return &MergeNotesResult{
		Success: true,
		Master:  paths[0],
		Deleted: deleted,
	}, nil
}

// ============================================================================
// 8. Reveal in Explorer
// ============================================================================

// RevealInExplorer opens the system file manager at the given path.
func (a *App) RevealInExplorer(relPath string) (*SaveFileResult, error) {
	target := a.vaultPath
	if relPath != "" {
		cleanRel, err := vaultRelativePath(relPath)
		if err != nil {
			return nil, err
		}
		root, err := a.openVaultRoot()
		if err != nil {
			return nil, err
		}
		info, statErr := root.Stat(cleanRel)
		closeErr := root.Close()
		if closeErr != nil {
			return nil, fmt.Errorf("close vault root: %w", closeErr)
		}
		if statErr == nil {
			target = a.vaultAbsolutePath(cleanRel)
			if !info.IsDir() {
				target = filepath.Dir(target)
			}
		} else if !os.IsNotExist(statErr) {
			return nil, statErr
		}
	}

	command, err := fileManagerCommand(target)
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	if err := startFileManager(command); err != nil {
		return &SaveFileResult{Success: false, Error: fmt.Sprintf("open file manager: %v", err)}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

var startFileManager = func(command *exec.Cmd) error {
	return command.Start()
}

func fileManagerCommand(target string) (*exec.Cmd, error) {
	switch goruntime.GOOS {
	case "linux":
		return exec.Command("xdg-open", target), nil // #nosec G204 -- fixed program and root-validated local target; no shell is used.
	case "darwin":
		return exec.Command("open", target), nil // #nosec G204 -- fixed program and root-validated local target; no shell is used.
	case "windows":
		return exec.Command("explorer.exe", target), nil // #nosec G204 -- fixed program and root-validated local target; no shell is used.
	default:
		return nil, fmt.Errorf("revealing files is not supported on %s", goruntime.GOOS)
	}
}

// ============================================================================
// 9. Theme Management
// ============================================================================

// ThemeInfo holds a theme's id and display name.
type ThemeInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// embeddedThemeAssetPath builds a logical embed.FS path. These paths are
// always slash-separated, including when the application itself runs on
// Windows, so filepath.Join must not be used here.
func embeddedThemeAssetPath(name string) string {
	return pathpkg.Join("frontend", "themes", name)
}

// GetThemes returns the list of available themes from themes/manifest.json.
func (a *App) GetThemes() (map[string]interface{}, error) {
	path := embeddedThemeAssetPath("manifest.json")
	data, err := assets.ReadFile(path)
	if err != nil {
		data, err = readProjectAsset(path) // fallback for dev mode
		if err != nil {
			return map[string]interface{}{
				"themes": []ThemeInfo{{ID: "default", Name: "Figaro Dark"}},
			}, nil
		}
	}
	var themes []ThemeInfo
	if err := json.Unmarshal(data, &themes); err != nil {
		return map[string]interface{}{
			"themes": []ThemeInfo{{ID: "default", Name: "Figaro Dark"}},
		}, nil
	}
	return map[string]interface{}{"themes": themes}, nil
}

// GetThemeCSS returns the raw CSS for a theme.
func (a *App) GetThemeCSS(themeID string) (map[string]string, error) {
	themeID = canonicalThemeID(themeID)
	if !themeIDRe.MatchString(themeID) {
		return nil, fmt.Errorf("invalid theme id")
	}
	path := embeddedThemeAssetPath(themeID + ".css")
	data, err := assets.ReadFile(path)
	if err != nil {
		data, err = readProjectAsset(path) // fallback for dev mode
		if err != nil {
			return map[string]string{"css": ""}, nil
		}
	}
	return map[string]string{"css": string(data)}, nil
}

var legacyWorkspaceSettingKeys = []string{
	"openTabs",
	"activeTabId",
	"selectedFilePath",
	"selectedTreePath",
	"expandedDirs",
	"pinnedTabs",
	"cursorStates",
}

func defaultSettings() map[string]interface{} {
	return map[string]interface{}{
		"theme":               "default",
		"font":                "inter",
		"code_font":           "theme-mono",
		"link_style":          string(links.MarkdownLinkStyle),
		"vim":                 false,
		"line_numbers":        false,
		"auto_save_seconds":   300,
		"auto_commit_seconds": 3600,
	}
}

func nonNegativeWholeSetting(value interface{}) (int, bool) {
	switch number := value.(type) {
	case int:
		return number, number >= 0
	case float64:
		if number < 0 || math.Trunc(number) != number || number > float64(math.MaxInt) {
			return 0, false
		}
		return int(number), true
	default:
		return 0, false
	}
}

func autoCommitSetting(value interface{}) (int, bool) {
	if number, valid := nonNegativeWholeSetting(value); valid {
		return number, true
	}
	switch number := value.(type) {
	case int:
		return number, number == -1
	case float64:
		return int(number), number == -1
	default:
		return 0, false
	}
}

// ensureSettingsDefaults makes the settings file a real, recoverable config
// record. Older versions could leave workspace-tab data in this file, while a
// missing, empty, or malformed file only happened to work through scattered
// frontend fallbacks.
func (a *App) ensureSettingsDefaults() {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	changed := false
	if err != nil || settings == nil {
		if err != nil {
			log.Printf("[settings] Resetting invalid settings file: %v", err)
		}
		settings = make(map[string]interface{})
		changed = true
	}
	// Convert the old minute-based autosave preference before filling the
	// modern seconds key. This preserves a user's prior setting while leaving
	// the resulting settings file with one canonical representation.
	if _, hasSeconds := settings["auto_save_seconds"]; !hasSeconds {
		if minutes, valid := nonNegativeWholeSetting(settings["auto_save_minutes"]); valid {
			settings["auto_save_seconds"] = minutes * 60
			changed = true
		}
	}

	for key, fallback := range defaultSettings() {
		switch fallbackValue := fallback.(type) {
		case string:
			rawValue, ok := settings[key].(string)
			value := strings.TrimSpace(rawValue)
			if key == "theme" {
				value = canonicalThemeID(value)
			} else if key == "link_style" {
				if style, valid := links.ParseLinkStyle(value); valid {
					value = string(style)
				} else {
					value = ""
				}
			}
			if !ok || value == "" {
				settings[key] = fallbackValue
				changed = true
			} else if value != rawValue {
				settings[key] = value
				changed = true
			}
		case bool:
			if _, ok := settings[key].(bool); !ok {
				settings[key] = fallbackValue
				changed = true
			}
		case int:
			_, valid := nonNegativeWholeSetting(settings[key])
			if key == "auto_commit_seconds" {
				_, valid = autoCommitSetting(settings[key])
			}
			if !valid {
				settings[key] = fallbackValue
				changed = true
			}
		}
	}
	if _, exists := settings["auto_save_minutes"]; exists {
		delete(settings, "auto_save_minutes")
		changed = true
	}

	for _, key := range legacyWorkspaceSettingKeys {
		if _, exists := settings[key]; exists {
			delete(settings, key)
			changed = true
		}
	}
	if !changed {
		return
	}
	if err := a.writeSettingsFile(settings); err != nil {
		log.Printf("[settings] Could not write normalized settings: %v", err)
	}
}

// PDFBrowserSettingResult describes the optional browser executable selected
// for PDF export. Cancelled is distinct from an invalid executable so the
// settings UI can leave an existing preference untouched.
type PDFBrowserSettingResult struct {
	Success   bool   `json:"success"`
	Cancelled bool   `json:"cancelled,omitempty"`
	Path      string `json:"path,omitempty"`
	Engine    string `json:"engine,omitempty"`
	Error     string `json:"error,omitempty"`
}

// PDFBrowserLoad returns the explicitly configured PDF browser, if any.
// Automatic discovery remains active when Path is empty.
func (a *App) PDFBrowserLoad() (*PDFBrowserSettingResult, error) {
	path, err := a.loadPDFBrowserPath()
	if err != nil {
		return &PDFBrowserSettingResult{Success: false, Error: err.Error()}, nil
	}
	return &PDFBrowserSettingResult{Success: true, Path: path}, nil
}

// PDFBrowserChoose opens the native file chooser, verifies the selected
// executable can run Chromium headless mode, and only then persists it.
func (a *App) PDFBrowserChoose() (*PDFBrowserSettingResult, error) {
	ctx := a.ctx
	if ctx == nil {
		return &PDFBrowserSettingResult{Success: false, Error: "application window is not ready"}, nil
	}
	options := runtime.OpenDialogOptions{Title: "Choose Chrome, Chromium, Edge, or Brave"}
	if goruntime.GOOS == "windows" {
		options.Filters = []runtime.FileFilter{{DisplayName: "Browser executables (*.exe)", Pattern: "*.exe"}}
	}
	selected, err := runtime.OpenFileDialog(ctx, options)
	if err != nil {
		return &PDFBrowserSettingResult{Success: false, Error: fmt.Sprintf("open browser chooser: %v", err)}, nil
	}
	if strings.TrimSpace(selected) == "" {
		return &PDFBrowserSettingResult{Success: false, Cancelled: true}, nil
	}

	browser, err := pdfexport.BrowserForExecutable(ctx, selected)
	if err != nil {
		return &PDFBrowserSettingResult{Success: false, Path: selected, Error: err.Error()}, nil
	}
	if err := pdfexport.ValidateChromiumHeadless(ctx, browser); err != nil {
		log.Printf("[pdf-browser] User-selected executable %q failed real headless startup validation: %v", browser.Executable, err)
		return &PDFBrowserSettingResult{
			Success: false,
			Path:    selected,
			Error:   fmt.Sprintf("selected browser could not start its PDF engine: %v", err),
		}, nil
	}
	if err := a.storePDFBrowserPath(browser.Executable); err != nil {
		return &PDFBrowserSettingResult{Success: false, Path: selected, Error: err.Error()}, nil
	}
	return &PDFBrowserSettingResult{
		Success: true,
		Path:    browser.Executable,
		Engine:  string(browser.Engine),
	}, nil
}

// PDFBrowserClear removes the override and restores automatic discovery.
func (a *App) PDFBrowserClear() (*PDFBrowserSettingResult, error) {
	if err := a.storePDFBrowserPath(""); err != nil {
		return &PDFBrowserSettingResult{Success: false, Error: err.Error()}, nil
	}
	return &PDFBrowserSettingResult{Success: true}, nil
}

// ThemeLoad loads the saved theme from vault/.config/settings.json.
func (a *App) ThemeLoad() (map[string]string, error) {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return map[string]string{"theme": "default"}, nil
	}
	theme, _ := settings["theme"].(string)
	theme = canonicalThemeID(theme)
	if theme == "" {
		theme = "default"
	}
	font, _ := settings["font"].(string)
	if font == "" {
		font = "inter"
	}
	codeFont, _ := settings["code_font"].(string)
	if codeFont == "" {
		codeFont = "theme-mono"
	}
	return map[string]string{"theme": theme, "font": font, "codeFont": codeFont}, nil
}

// ThemeSave saves the selected theme to settings.
func (a *App) ThemeSave(themeID string) (*SaveFileResult, error) {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	settings["theme"] = canonicalThemeID(themeID)
	if err := a.writeSettingsFile(settings); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

// FontSave saves the editor font preference to settings.
func (a *App) FontSave(fontID string) (*SaveFileResult, error) {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	settings["font"] = fontID
	if err := a.writeSettingsFile(settings); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

// CodeFontSave saves the separate monospaced font preference used only for
// syntax-highlighted code files. Markdown prose and Markdown code blocks keep
// their existing typography choices.
func (a *App) CodeFontSave(fontID string) (*SaveFileResult, error) {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	settings["code_font"] = fontID
	if err := a.writeSettingsFile(settings); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

// VimLoad loads the vim mode preference.
func (a *App) VimLoad() (map[string]bool, error) {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return map[string]bool{"enabled": false}, nil
	}
	enabled, _ := settings["vim"].(bool)
	return map[string]bool{"enabled": enabled}, nil
}

// VimSave saves the vim mode preference.
func (a *App) VimSave(enabled bool) (*SaveFileResult, error) {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	settings["vim"] = enabled
	if err := a.writeSettingsFile(settings); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

// LineNumbersLoad loads the persisted editor gutter preference.
func (a *App) LineNumbersLoad() (map[string]bool, error) {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return map[string]bool{"enabled": false}, nil
	}
	enabled, ok := settings["line_numbers"].(bool)
	if !ok {
		enabled = false
	}
	return map[string]bool{"enabled": enabled}, nil
}

// LineNumbersSave saves the editor gutter preference.
func (a *App) LineNumbersSave(enabled bool) (*SaveFileResult, error) {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	settings["line_numbers"] = enabled
	if err := a.writeSettingsFile(settings); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

// ============================================================================
// 10. Interactive PDF export helpers
// ============================================================================

func (a *App) resolvePrintStylesheet(sourceDir string, stylesheetRef string) (string, error) {
	ref := strings.TrimSpace(strings.ReplaceAll(stylesheetRef, "\\", "/"))
	if ref == "" {
		return "", fmt.Errorf("print stylesheet is empty")
	}
	lowerRef := strings.ToLower(ref)
	if strings.HasPrefix(ref, "/") || strings.HasPrefix(ref, "//") ||
		strings.Contains(lowerRef, "://") || strings.HasPrefix(lowerRef, "file:") ||
		(len(ref) > 1 && ref[1] == ':') {
		return "", fmt.Errorf("print stylesheet must be a vault-local relative CSS path")
	}
	if !strings.EqualFold(filepath.Ext(ref), ".css") {
		return "", fmt.Errorf("print stylesheet must reference a .css file")
	}

	return vaultRelativePath(filepath.ToSlash(filepath.Join(sourceDir, filepath.FromSlash(ref))))
}

func readPrintCSS(root *os.Root, rel string, label string, required bool) (string, error) {
	cssData, err := root.ReadFile(rel)
	if err != nil {
		if !required && os.IsNotExist(err) {
			return "", nil
		}
		if os.IsNotExist(err) {
			return "", fmt.Errorf("%s was not found", label)
		}
		return "", fmt.Errorf("read %s: %v", label, err)
	}
	if isBinaryFileContent(cssData) {
		return "", fmt.Errorf("%s must be a UTF-8 CSS file", label)
	}
	return string(cssData), nil
}

// ============================================================================
// 11. Window Management (native, hardware-accelerated via Wails runtime)
// ============================================================================

// WindowMinimize minimizes the application window.
func (a *App) WindowMinimize() {
	if a.ctx != nil {
		a.captureWindowState(a.ctx)
		safeRuntimeCall(func() { runtime.WindowMinimise(a.ctx) })
	}
}

// WindowMaximize toggles between maximized and normal window size.
func (a *App) WindowMaximize() {
	if a.ctx != nil {
		// Preserve the current normal dimensions before entering maximized
		// state. A resize observation records the resulting state afterwards.
		a.captureWindowState(a.ctx)
		safeRuntimeCall(func() { runtime.WindowToggleMaximise(a.ctx) })
	}
}

// WindowClose closes the application window.
func (a *App) WindowClose() {
	if a.ctx != nil {
		// Capture while GTK still owns a realised window. OnShutdown runs after
		// native teardown has begun on Linux, where querying state would emit
		// gtk_widget_get_window / gdk_window_get_state critical assertions.
		a.captureWindowState(a.ctx)
		safeRuntimeCall(func() { runtime.Quit(a.ctx) })
	}
}

// WindowSetPosition moves the window to (x, y). Used by the drag handler.
func (a *App) WindowSetPosition(x int, y int) {
	if a.ctx != nil {
		safeRuntimeCall(func() { runtime.WindowSetPosition(a.ctx, x, y) })
	}
}

// WindowGetPosition returns the current window position as {x, y}.
// Used by the drag handler to track the window during moves.
func (a *App) WindowGetPosition() map[string]int {
	if a.ctx == nil {
		return map[string]int{"x": 0, "y": 0}
	}
	var x, y int
	safeRuntimeCall(func() {
		x, y = runtime.WindowGetPosition(a.ctx)
	})
	return map[string]int{"x": x, "y": y}
}

// WindowGetSize returns the current window size as {w, h}.
func (a *App) WindowGetSize() map[string]int {
	if a.ctx == nil {
		return map[string]int{"w": 800, "h": 600}
	}
	var w, h int
	safeRuntimeCall(func() {
		w, h = runtime.WindowGetSize(a.ctx)
	})
	return map[string]int{"w": w, "h": h}
}

// WindowSetSize sets the window dimensions.
func (a *App) WindowSetSize(w int, h int) {
	if a.ctx != nil {
		safeRuntimeCall(func() { runtime.WindowSetSize(a.ctx, w, h) })
	}
}

// WindowStartResize performs a window resize operation using Wails v2 runtime.
// direction is one of: "N", "S", "E", "W", "NE", "NW", "SE", "SW".
// The frontend perimeter mouse listeners pass these directional tokens.
// On Linux/GTK frameless windows, the native window manager handles edge
// resize automatically; this method provides a programmatic alternative.
// For zero-latency native resize, use CSS cursor hints at window edges
// combined with the GTK frameless window's built-in edge behavior.
func (a *App) WindowStartResize(direction string) {
	if a.ctx == nil {
		return
	}
	safeRuntimeCall(func() {
		x, y := runtime.WindowGetPosition(a.ctx)
		w, h := runtime.WindowGetSize(a.ctx)
		delta := 20 // pixels per step
		switch strings.ToUpper(direction) {
		case "N":
			runtime.WindowSetPosition(a.ctx, x, y-delta)
			runtime.WindowSetSize(a.ctx, w, h+delta)
		case "S":
			runtime.WindowSetSize(a.ctx, w, h+delta)
		case "E":
			runtime.WindowSetSize(a.ctx, w+delta, h)
		case "W":
			runtime.WindowSetPosition(a.ctx, x-delta, y)
			runtime.WindowSetSize(a.ctx, w+delta, h)
		case "NE":
			runtime.WindowSetPosition(a.ctx, x, y-delta)
			runtime.WindowSetSize(a.ctx, w+delta, h+delta)
		case "NW":
			runtime.WindowSetPosition(a.ctx, x-delta, y-delta)
			runtime.WindowSetSize(a.ctx, w+delta, h+delta)
		case "SE":
			runtime.WindowSetSize(a.ctx, w+delta, h+delta)
		case "SW":
			runtime.WindowSetPosition(a.ctx, x-delta, y)
			runtime.WindowSetSize(a.ctx, w+delta, h+delta)
		}
	})
}

// safeRuntimeCall wraps a call to the Wails runtime to prevent panics
// when a non-Wails context (e.g., context.Background()) is passed during testing.
func safeRuntimeCall(fn func()) {
	defer func() {
		if r := recover(); r != nil {
			// Runtime panics with non-Wails contexts are expected in tests; suppress.
		}
	}()
	fn()
}

// ============================================================================
// 12. Kanban Colors Persistence
// ============================================================================

func (a *App) loadColors() {
	data, err := a.readVaultFile(".config/kanban-colors.json")
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("[kanban] load colors: %v", err)
		}
		return
	}
	if err := json.Unmarshal(data, &a.kanbanColors); err != nil {
		log.Printf("[kanban] parse colors: %v", err)
		return
	}
	// Prune colors for columns that no longer exist
	for k := range a.kanbanColors {
		found := false
		for _, c := range a.kanbanColumns {
			if c == k {
				found = true
				break
			}
		}
		if !found {
			delete(a.kanbanColors, k)
		}
	}
}

func (a *App) saveColors() {
	// Prune dead colors
	for k := range a.kanbanColors {
		found := false
		for _, c := range a.kanbanColumns {
			if c == k {
				found = true
				break
			}
		}
		if !found {
			delete(a.kanbanColors, k)
		}
	}
	data, err := json.MarshalIndent(a.kanbanColors, "", "  ")
	if err != nil {
		log.Printf("[kanban] serialize colors: %v", err)
		return
	}
	if err := a.writeVaultFileAtomic(".config/kanban-colors.json", data, 0600); err != nil {
		log.Printf("[kanban] save colors: %v", err)
	}
}

// AutoSaveLoad returns the auto-save interval in seconds (0 = disabled).
func (a *App) AutoSaveLoad() int {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("[settings] load auto-save interval: %v", err)
		}
		return 300
	}
	if v, ok := settings["auto_save_seconds"]; ok {
		switch n := v.(type) {
		case float64:
			return int(n)
		case int:
			return n
		}
	}
	// Also check old key name for backward compat
	if v, ok := settings["auto_save_minutes"]; ok {
		switch n := v.(type) {
		case float64:
			return int(n) * 60
		case int:
			return n * 60
		}
	}
	return 300 // default: 5 minutes
}

// AutoSaveSave persists the auto-save interval in seconds.
func (a *App) AutoSaveSave(seconds int) error {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return err
	}
	settings["auto_save_seconds"] = seconds
	return a.writeSettingsFile(settings)
}

// AutoCommitLoad returns the auto-commit interval in seconds. Zero disables
// commits, while -1 selects committing each file after a successful save.
func (a *App) AutoCommitLoad() int {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("[settings] load auto-commit interval: %v", err)
		}
		return 3600
	}
	if v, ok := settings["auto_commit_seconds"]; ok {
		switch n := v.(type) {
		case float64:
			return int(n)
		case int:
			return n
		}
	}
	return 3600 // default: 1 hour
}

// AutoCommitSave persists the auto-commit interval in seconds.
func (a *App) AutoCommitSave(seconds int) error {
	if seconds < -1 {
		return fmt.Errorf("invalid auto-commit mode")
	}
	a.settingsMu.Lock()

	settings, err := a.readSettingsFile()
	if err != nil {
		a.settingsMu.Unlock()
		return err
	}
	settings["auto_commit_seconds"] = seconds
	err = a.writeSettingsFile(settings)
	a.settingsMu.Unlock()
	if err != nil {
		return err
	}
	if a.history != nil {
		a.history.StartAutoCommit(seconds)
	}
	return nil
}

// ============================================================================
// History Methods (Wails Bindings)
// ============================================================================

// GetFileHistory returns the git commit history for a file.
func (a *App) GetFileHistory(relPath string) ([]HistoryEntry, error) {
	if a.history == nil {
		return nil, fmt.Errorf("history not available")
	}
	return a.history.GetFileHistory(relPath)
}

// GetFileVersion returns the content of a file at a specific commit.
func (a *App) GetFileVersion(relPath string, hash string) (string, error) {
	if a.history == nil {
		return "", fmt.Errorf("history not available")
	}
	return a.history.GetFileVersion(relPath, hash)
}

// GetCommitCount returns the number of commits for a file.
func (a *App) GetCommitCount(relPath string) (int, error) {
	if a.history == nil {
		return 0, fmt.Errorf("history not available")
	}
	return a.history.CommitCount(relPath)
}
