package desktop

import (
	"context"
	"figaro/internal/startup"
	"figaro/internal/vault"
	"figaro/internal/writing"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	goruntime "runtime"
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"
)

// ============================================================================
// App — the bound backend struct whose exported methods become the JS API
// ============================================================================

// App is the primary backend struct bound to the Wails frontend.
// All exported receiver methods with signature (ctx context.Context, ...) (T, error)
// are automatically exposed as async JS functions on the Go binding object.
type App struct {
	startupTrace        *startup.Trace
	startupLogDir       string
	writingMu           sync.Mutex
	writingEngine       *writing.Engine
	writingOpening      *writingInitialization
	writingStopped      bool
	assets              AssetFS
	vaultPath           string
	devInspectorAddress string
	vaultMu             sync.RWMutex
	vaultPathMu         sync.RWMutex
	fileTreeBuildMu     sync.Mutex
	sessionMu           sync.RWMutex
	mu                  sync.RWMutex
	desktopRuntime      *runtimeBridge
	externalFiles       *externalFileRegistry
	settingsMu          sync.RWMutex
	writingStateMu      sync.RWMutex
	taskProjectionMu    sync.Mutex
	vaultHealthMu       sync.Mutex
	machineSettingsMu   sync.RWMutex
	windowStateMu       sync.Mutex
	calendarMu          sync.Mutex
	watcherMu           sync.Mutex
	vaultIndexBuildMu   sync.Mutex
	vaultStartupOnce    sync.Once
	fileIssuesMu        sync.RWMutex
	fileVersions        map[string]float64
	kanbanColumns       []string
	kanbanColors        map[string]string
	calendarIndex       *calendarDateIndex
	vaultIndex          *vaultIndex
	vaultIndexScan      *vaultIndexScan
	vaultStartupPending bool
	pendingFileSaves    map[string]*pendingFileSave
	fileSaveFollowupMu  sync.Mutex
	taskProjection      taskScheduleProjectionCache
	vaultHealthCache    vaultHealthCache
	fileTreeEntries     map[string]fileTreeCacheEntry
	fileTreeSnapshot    []*FileTreeItem
	fileIssues          map[string]VaultFileIssue
	internalVaultWrites map[string]internalVaultWriteAck
	vaultWatcher        *vaultWatcher
	watcherStopping     bool
	history             *HistoryService
	windowStatePath     string
	windowState         windowState
	machineSettingsPath string
	sessionStateRoot    string
	applicationVersion  string
	vaultLoad           *vaultLoadTracker
	windowRuntime       windowRuntime
	updates             updateCoordinator
}

// SystemColumns are the three built-in kanban columns always present.
var SystemColumns = []string{"todo", "wip", "done"}

const externalLaunchEventName = "launch:external-files"

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

// standaloneHashtagRanges returns the byte ranges of every standalone #tag in
// content, in order. The tag is matched without regard to ASCII letter case,
// as findHashtags reports it: "#TODO" is a card in the "todo" column and must
// be found by that name. Hashtag names are ASCII, so no other folding applies.
//
// This runs once per Kanban card, so it scans the text directly instead of
// compiling a pattern per call.
func standaloneHashtagRanges(content, tag string) [][2]int {
	// A tag ends at a word boundary and is followed by whitespace, which only
	// a name ending in a letter, digit or underscore can satisfy.
	if tag == "" || !isHashtagWordByte(tag[len(tag)-1]) {
		return nil
	}
	var ranges [][2]int
	for start := 0; start < len(content); {
		offset := strings.IndexByte(content[start:], '#')
		if offset < 0 {
			break
		}
		start += offset
		end := start + 1 + len(tag)
		if end > len(content) || !equalASCIIFold(content[start+1:end], tag) ||
			(end < len(content) && isHashtagWordByte(content[end])) {
			start++
			continue
		}
		if isHashtagBoundaryOK(content, start, end) {
			ranges = append(ranges, [2]int{start, end})
		}
		start = end
	}
	return ranges
}

func isHashtagWordByte(value byte) bool {
	return value == '_' || (value >= '0' && value <= '9') ||
		(value >= 'a' && value <= 'z') || (value >= 'A' && value <= 'Z')
}

func equalASCIIFold(left, right string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := 0; index < len(left); index++ {
		a, b := left[index], right[index]
		if a >= 'A' && a <= 'Z' {
			a += 'a' - 'A'
		}
		if b >= 'A' && b <= 'Z' {
			b += 'a' - 'A'
		}
		if a != b {
			return false
		}
	}
	return true
}

// replaceHashtag replaces every standalone #oldTag, in any letter case, with
// #newTag.
func replaceHashtag(content, oldTag, newTag string) string {
	ranges := standaloneHashtagRanges(content, oldTag)
	if len(ranges) == 0 {
		return content
	}
	var result strings.Builder
	last := 0
	for _, match := range ranges {
		result.WriteString(content[last:match[0]])
		result.WriteString("#" + newTag)
		last = match[1]
	}
	result.WriteString(content[last:])
	return result.String()
}

// removeHashtag removes every standalone #tag, in any letter case, together
// with the spaces and tabs that follow it on the same line. A line break is
// never consumed: the function also runs over whole notes, where swallowing it
// would join the tagged line with the one below.
func removeHashtag(content, tag string) string {
	ranges := standaloneHashtagRanges(content, tag)
	if len(ranges) == 0 {
		return content
	}
	var result strings.Builder
	last := 0
	for _, match := range ranges {
		result.WriteString(content[last:match[0]])
		last = match[1]
		for last < len(content) && (content[last] == ' ' || content[last] == '\t') {
			last++
		}
	}
	result.WriteString(content[last:])
	return result.String()
}

// NewApp constructs the in-memory facade only. It performs no filesystem or
// Git work, which keeps dependency assembly independently testable.
func NewApp(vaultPath string, bundledAssets ...AssetFS) *App {
	var assetBundle AssetFS
	if len(bundledAssets) > 0 {
		assetBundle = bundledAssets[0]
	}
	return &App{
		assets:              assetBundle,
		vaultPath:           vaultPath,
		fileVersions:        make(map[string]float64),
		kanbanColors:        make(map[string]string),
		kanbanColumns:       append([]string{}, SystemColumns...),
		externalFiles:       newExternalFileRegistry(),
		internalVaultWrites: make(map[string]internalVaultWriteAck),
		fileIssues:          make(map[string]VaultFileIssue),
		windowState:         defaultWindowState(),
		vaultLoad:           newVaultLoadTracker(),
		desktopRuntime:      newRuntimeBridge(nil),
		windowRuntime:       wailsWindowRuntime{},
	}
}

// OpenApp resolves and prepares the selected vault, then attaches adapters
// whose construction necessarily performs filesystem or Git I/O.
func OpenApp(vaultPath string, bundledAssets ...AssetFS) *App {
	return openApp(vaultPath, nil, bundledAssets...)
}

func openApp(vaultPath string, trace *startup.Trace, bundledAssets ...AssetFS) *App {
	finish := trace.Begin("vault-open")
	defer finish(nil)
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
	if resolved, resolveErr := filepath.EvalSymlinks(absPath); resolveErr == nil {
		absPath = resolved
	}

	a := NewApp(absPath, bundledAssets...)
	a.startupTrace = trace
	a.loadColors()

	// Initialize git history service
	finishHistory := trace.Begin("history-open")
	hs, err := NewHistoryService(absPath)
	finishHistory(err)
	if err != nil {
		log.Println("[history] Failed to init:", err)
		code := fileIssueHistoryUnavailable
		severity := "warning"
		title := "Local history is unavailable"
		guidance := "Keep editing normally. Repair or restore the .git folder before relying on version history, then check again."
		if isDiskFullFailure(err) {
			code = fileIssueDiskFull
			severity = "danger"
			title = "Disk full — local history is unavailable"
			guidance = "Free storage space before relying on version history, then check again. Notes can still be edited."
		}
		a.setVaultFileIssue(".git", &VaultFileIssue{
			Code:     code,
			Severity: severity,
			Title:    title,
			Detail:   fmt.Sprintf("Figaro could not open the vault's local Git history: %v. Notes can still be edited and saved.", err),
			Guidance: guidance,
		})
	} else {
		hs.SetVaultLocks(&a.vaultPathMu, &a.vaultMu)
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

### Mermaid diagrams

` + "`" + "`" + "`" + `mermaid
flowchart LR
    Capture[Capture an idea] --> Connect[Connect notes]
    Connect --> Discover[Discover insight]
` + "`" + "`" + "`" + `

### Tables

| Feature | Status | Shortcut |
|---------|--------|----------|
| File tree | ✅ | Ctrl+Shift+B |
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

1. **Capture a quick note** — Press Ctrl+N, or right-click the file tree to create a named note
2. **Link notes together** — Use [title](file.md) or [[wikilinks]]
3. **Organize with folders** — Create directories in the file tree
4. **Search everything** — Ctrl+Shift+F searches all notes
5. **Track changes** — Git history is automatic (click "0 changes" in the status bar)
6. **Export** — Right-click the editor → Preview PDF → Generate PDF

---

*Built with ❤️ using Go, Wails, and CodeMirror 6.*
`

// ensureWelcomeNote creates Welcome.md only in a vault that holds no Markdown
// note anywhere. A vault whose notes all live in folders already has content,
// so the search follows the index's rules (any letter case of ".md", no hidden
// folders, no symbolic links) and stops at the first note it finds.
func (a *App) ensureWelcomeNote() {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	root, err := a.openVaultRoot()
	if err != nil {
		log.Printf("[vault] Cannot open vault root: %v", err)
		return
	}
	defer root.Close()
	hasNotes, err := vault.HasMarkdown(root)
	if err != nil {
		log.Printf("[vault] Cannot read vault: %v", err)
		return
	}
	if hasNotes {
		return
	}
	if err := writeRootFileAtomic(root, "Welcome.md", []byte(welcomeContent), 0644); err != nil {
		log.Printf("[vault] Cannot create Welcome.md: %v", err)
	} else {
		log.Println("[vault] Created Welcome.md — empty vault, welcome to figaro!")
	}
}

// startup captures the Wails service context.
func (a *App) startup(ctx context.Context) {
	finish := a.startupTrace.Begin("native-startup")
	defer finish(nil)
	a.deferInitialVaultIndex()
	a.desktopRuntime.start(ctx)
	log.Println("[go] App.startup() — Wails context captured")
	finishSettings := a.startupTrace.Begin("settings")
	a.migrateLegacyPDFBrowserPreference()
	a.ensureSettingsDefaults()
	finishSettings(nil)

	// Desktop integration uses Linux's XDG/GNOME conventions. Other Wails
	// platforms provide their own app registration model.
	if goruntime.GOOS == "linux" {
		go a.ensureDesktopIntegration()
	}
	finishWelcome := a.startupTrace.Begin("welcome-note")
	a.ensureWelcomeNote()
	finishWelcome(nil)
	a.watcherMu.Lock()
	a.watcherStopping = false
	a.watcherMu.Unlock()
}

// StartVaultLoad begins the vault watcher and cold index only after the
// frontend has loaded and applied the persisted shell appearance. It is
// idempotent because the Wails bridge or a reconnecting frontend may retry.
func (a *App) StartVaultLoad() bool {
	started := false
	a.vaultStartupOnce.Do(func() {
		started = true
		go a.startVaultWatcher()
		a.startInitialVaultIndex(nil)
	})
	return started
}

// setLaunchExternalFiles retains the Markdown files supplied by the operating
// system at process launch. The frontend receives opaque IDs rather than
// arbitrary filesystem paths it could use to request unrelated files.
func (a *App) setLaunchExternalFiles(paths []string) {
	a.externalFiles.reset()
	a.registerLaunchExternalFiles(paths)
}

// registerLaunchExternalFiles extends the process-local capability set and
// returns only the descriptors created for this launch. Repeated paths within
// one operating-system request share one capability, while a later explicit
// launch remains a new request and can bring the existing window forward.
func (a *App) registerLaunchExternalFiles(paths []string) []*ExternalLaunchFile {
	candidates := make([]externalLaunchCandidate, 0, len(paths))
	knownPaths := make(map[string]struct{}, len(paths))
	for _, path := range paths {
		clean := filepath.Clean(path)
		if clean == "." || clean == "" {
			continue
		}
		key := clean
		if goruntime.GOOS == "windows" {
			key = strings.ToLower(key)
		}
		if _, exists := knownPaths[key]; exists {
			continue
		}
		info, err := os.Stat(clean)
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		knownPaths[key] = struct{}{}
		candidates = append(candidates, externalLaunchCandidate{path: clean, mtime: externalFileMtime(info)})
	}
	return a.externalFiles.register(candidates)
}

func (a *App) requestWindowFocus() {
	a.desktopRuntime.requestFocus()
}

// handleSecondInstanceLaunch receives a validated operating-system launch
// from Wails, extends the first process's capability set, and asks its frontend
// to reuse the normal external-file choice. The existing window is focused
// even when no valid Markdown argument was supplied.
func (a *App) handleSecondInstanceLaunch(args []string, workingDirectory string) {
	files := a.registerLaunchExternalFiles(markdownLaunchPathsFrom(args, workingDirectory))
	if len(files) > 0 {
		a.emitRuntimeEventData(externalLaunchEventName, files)
	}
	a.requestWindowFocus()
}

func (a *App) launchExternalFilePath(id string) (string, error) {
	path, ok := a.externalFiles.path(id)
	if !ok || path == "" {
		return "", fmt.Errorf("external launch file is not available")
	}
	return path, nil
}

// domReady runs on the window's runtime-ready event; defined in run.go.
// shutdown runs from the Wails service shutdown hook.
func (a *App) shutdown(ctx context.Context) {
	a.startupTrace.Mark("shutdown")
	a.writingMu.Lock()
	a.writingStopped = true
	engine := a.writingEngine
	a.writingEngine = nil
	a.writingMu.Unlock()
	if engine != nil {
		engine.Close()
	}
	a.vaultMu.Lock()
	if a.vaultIndexScan != nil {
		a.vaultIndexScan.cancel()
		a.vaultIndexScan = nil
	}
	a.vaultMu.Unlock()
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

type vaultFilesystemChangeResult struct {
	treeChanged   bool
	kanbanChanged bool
	// paths lists the external vault-relative changes in this batch. It is
	// nil when the scope is unknown, which consumers treat as "anything".
	paths []string
}

// maximumReportedVaultChanges bounds the event payload; a larger batch is
// reported as an unknown scope so consumers fall back to a full refresh.
const maximumReportedVaultChanges = 256

// handleVaultFilesystemChanges applies the debounced native event batch to
// the shared index and publishes only the UI work which is actually needed.
// A normal external save reads only the changed Markdown file; unscoped
// notifications remain a safe fallback that rebuilds once.
func (a *App) handleVaultFilesystemChanges(changes []vaultWatchChange) {
	result := a.applyVaultFilesystemChanges(changes)
	payload := map[string]any{
		"tree_changed":   result.treeChanged,
		"kanban_changed": result.kanbanChanged,
	}
	if result.paths != nil {
		payload["paths"] = result.paths
	}
	a.emitRuntimeEventData("vault:changed", payload)
}

// applyVaultFilesystemChanges updates the shared index and returns the
// affected frontend projections. Keeping the result separate from Wails event
// emission makes the internal-write fast path observable in tests.
func (a *App) applyVaultFilesystemChanges(changes []vaultWatchChange) vaultFilesystemChangeResult {
	result := vaultFilesystemChangeResult{
		treeChanged:   len(changes) == 0,
		kanbanChanged: len(changes) == 0,
	}
	scoped := len(changes) > 0 && len(changes) <= maximumReportedVaultChanges
	if scoped {
		result.paths = []string{}
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
			scoped = false
			a.invalidateVaultIndexLocked()
			result.treeChanged = true
			result.kanbanChanged = true
		} else {
			batch := newVaultWatchBatch()
			for _, change := range changes {
				rel, err := filepath.Rel(a.vaultPath, change.Path)
				if err != nil || rel == "." || strings.HasPrefix(rel, "..") {
					scoped = false
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
				if scoped {
					result.paths = append(result.paths, filepath.ToSlash(cleanRel))
				}
				if !a.applyVaultWatchChangeLocked(root, cleanRel, change.Op, &result, batch) {
					scoped = false
					break
				}
			}
			root.Close()
		}
	}
	if result.treeChanged {
		a.invalidateFileTreeCacheLocked()
	}
	a.vaultMu.Unlock()
	if !scoped {
		result.paths = nil
	}
	return result
}

func (a *App) emitRuntimeEvent(name string) {
	a.emitRuntimeEventData(name)
}

func (a *App) emitRuntimeEventData(name string, data ...any) {
	a.desktopRuntime.emit(name, data...)
}
