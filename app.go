package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"math"
	"os"
	"os/exec"
	"os/user"
	pathpkg "path"
	"path/filepath"
	"regexp"
	goruntime "runtime"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

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
	fileVersions        map[string]float64
	kanbanColumns       []string
	kanbanColors        map[string]string
	history             *HistoryService
}

// SystemColumns are the three built-in kanban columns always present.
var SystemColumns = []string{"todo", "wip", "done"}

// hashtagRe matches #tagname (bare, without boundary checks).
// Use findHashtags() / replaceHashtag() / removeHashtag() for full boundary validation.
var hashtagRe = regexp.MustCompile(`#([a-zA-Z][a-zA-Z0-9_-]*)\b`)

// isHexColor checks if a tag looks like a hex color (#RGB or #RRGGBB).
var hexColorRe = regexp.MustCompile(`^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$`)

var themeIDRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)

// isHashtagBoundaryOK checks that the character before a match at position `pos`
// is not a word character and not another '#'.
func isHashtagBoundaryOK(s string, matchStart int) bool {
	if matchStart == 0 {
		return true
	}
	prev := s[matchStart-1]
	if prev == '#' {
		return false
	}
	if (prev >= 'a' && prev <= 'z') || (prev >= 'A' && prev <= 'Z') || (prev >= '0' && prev <= '9') || prev == '_' {
		return false
	}
	return true
}

// findHashtags extracts valid hashtags from content, respecting word boundaries.
func findHashtags(content string) []string {
	seen := make(map[string]bool)
	var tags []string
	for _, idx := range hashtagRe.FindAllStringSubmatchIndex(content, -1) {
		if len(idx) >= 4 && isHashtagBoundaryOK(content, idx[0]) {
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
		if isHashtagBoundaryOK(content, idx[0]) {
			result.WriteString(content[last:idx[0]])
			result.WriteString("#" + newTag)
			last = idx[1]
		}
	}
	result.WriteString(content[last:])
	return result.String()
}

// removeHashtag removes all occurrences of #tag with optional trailing whitespace.
func removeHashtag(content, tag string) string {
	pat := regexp.MustCompile(`#` + regexp.QuoteMeta(tag) + `\b\s*`)
	var result strings.Builder
	last := 0
	for _, idx := range pat.FindAllStringSubmatchIndex(content, -1) {
		if isHashtagBoundaryOK(content, idx[0]) {
			result.WriteString(content[last:idx[0]])
			last = idx[1]
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
		vaultPath:     absPath,
		fileVersions:  make(map[string]float64),
		kanbanColors:  make(map[string]string),
		kanbanColumns: append([]string{}, SystemColumns...),
	}
	a.loadColors()
	a.syncKanbanColumns()

	// Initialize git history service
	hs, err := NewHistoryService(absPath)
	if err != nil {
		log.Println("[history] Failed to init:", err)
	} else {
		hs.SetVaultReadLocker(&a.vaultMu)
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
*Vibecoded with Reasonix.*
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

	// Desktop integration uses Linux's XDG/GNOME conventions. Other Wails
	// platforms provide their own app registration model.
	if goruntime.GOOS == "linux" {
		go a.ensureDesktopIntegration()
	}
	a.ensureWelcomeNote()
}

// domReady is called from OnDomReady; defined in main.go.
// shutdown is called from OnShutdown.
func (a *App) shutdown(ctx context.Context) {
	if a.history != nil {
		a.history.StartAutoCommit(0)
	}
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
	Success      bool     `json:"success"`
	Error        string   `json:"error,omitempty"`
	Mtime        float64  `json:"mtime,omitempty"`
	Path         string   `json:"path,omitempty"`
	OldPath      string   `json:"old_path,omitempty"`
	UpdatedLinks []string `json:"updated_links,omitempty"`
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

	a.syncKanbanColumnsLocked()

	return &SaveFileResult{
		Success: true,
		Mtime:   mtime,
		Path:    relPath,
	}, nil
}

// CommitCurrentFile commits the given file to git history (used by auto-commit scheduler).
func (a *App) CommitCurrentFile(relPath string) error {
	if a.history != nil {
		return a.history.CommitFile(relPath)
	}
	return nil
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
	a.syncKanbanColumnsLocked()
	return &SaveFileResult{Success: true, Mtime: mtime, Path: relPath}, nil
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
	return a.renamePathLocked(sourceClean, newRel)
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
	Path    string        `json:"path"`
	Name    string        `json:"name"`
	Matches []SearchMatch `json:"matches"`
	Mtime   float64       `json:"mtime"`
}

// SearchFiles searches all .md files in the vault for a query string.
func (a *App) SearchFiles(query string, caseSensitive bool) ([]SearchResult, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()

	var results []SearchResult
	if err := a.walkVaultMarkdown(func(_ *os.Root, rel string, info fs.FileInfo, data []byte) error {
		content := string(data)
		searchQuery := query
		if !caseSensitive {
			searchQuery = strings.ToLower(query)
			content = strings.ToLower(content)
		}
		if !strings.Contains(content, searchQuery) {
			return nil
		}

		// Re-read original content for case-sensitive line matching
		lines := strings.Split(string(data), "\n")
		var matches []SearchMatch
		for i, line := range lines {
			check := line
			if !caseSensitive {
				check = strings.ToLower(line)
			}
			if strings.Contains(check, searchQuery) {
				matches = append(matches, SearchMatch{Line: i + 1, Text: strings.TrimSpace(line)})
			}
		}
		if len(matches) > 0 {
			results = append(results, SearchResult{
				Path:    rel,
				Name:    info.Name(),
				Matches: matches,
				Mtime:   float64(info.ModTime().UnixNano()) / 1e9,
			})
		}
		return nil
	}); err != nil {
		return nil, err
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

	targetName := strings.TrimSuffix(filepath.Base(targetPath), ".md")
	targetRel := strings.ReplaceAll(targetPath, "\\", "/")
	// Build pattern: [targetName](targetRel) or [targetName](targetName.md)
	// Case-insensitive matching.
	pattern := regexp.MustCompile(
		`(?i)\[` + regexp.QuoteMeta(targetName) + `\]\((` + regexp.QuoteMeta(targetRel) + `|` + regexp.QuoteMeta(targetName) + `\.md)\)`,
	)

	var results []BacklinkResult
	if err := a.walkVaultMarkdown(func(_ *os.Root, rel string, info fs.FileInfo, data []byte) error {
		lines := strings.Split(string(data), "\n")
		for i, line := range lines {
			if pattern.MatchString(line) {
				results = append(results, BacklinkResult{
					Path:    rel,
					Name:    info.Name(),
					LineNum: i + 1,
					Snippet: strings.TrimSpace(line),
					Mtime:   float64(info.ModTime().UnixNano()) / 1e9,
				})
				break // One match per file
			}
		}
		return nil
	}); err != nil {
		return nil, err
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
	a.mu.Lock()
	defer a.mu.Unlock()

	tags := make(map[string]bool)
	for _, sc := range SystemColumns {
		tags[sc] = true
	}

	if err := a.walkVaultMarkdown(func(_ *os.Root, _ string, _ fs.FileInfo, data []byte) error {
		for _, t := range a.extractHashtags(string(data)) {
			tags[t] = true
		}
		return nil
	}); err != nil {
		log.Printf("[kanban] Could not scan vault: %v", err)
	}

	var custom []string
	for t := range tags {
		isSystem := false
		for _, sc := range SystemColumns {
			if t == sc {
				isSystem = true
				break
			}
		}
		if !isSystem {
			custom = append(custom, t)
		}

	}
	sort.Strings(custom)
	a.kanbanColumns = append(custom, SystemColumns...)
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

	a.mu.RLock()
	columns := make([]string, len(a.kanbanColumns))
	copy(columns, a.kanbanColumns)
	a.mu.RUnlock()

	columnSet := make(map[string]bool)
	for _, c := range columns {
		columnSet[c] = true
	}

	board := make(map[string][]KanbanCard)
	if err := a.walkVaultMarkdown(func(_ *os.Root, rel string, info fs.FileInfo, data []byte) error {
		lines := strings.Split(string(data), "\n")
		for lineNum, line := range lines {
			for _, idx := range hashtagRe.FindAllStringSubmatchIndex(line, -1) {
				if len(idx) >= 4 && isHashtagBoundaryOK(line, idx[0]) {
					tag := strings.ToLower(line[idx[2]:idx[3]])
					if columnSet[tag] {
						// Clean display text
						display := strings.TrimSpace(line)
						display = regexp.MustCompile(`^[-*+]\s*\[[ x]\]\s*`).ReplaceAllString(display, "")
						display = removeHashtag(display, tag)
						board[tag] = append(board[tag], KanbanCard{
							File:     rel,
							FileName: info.Name(),
							Line:     lineNum + 1,
							Text:     display,
							Tag:      tag,
						})
					}
				}
			}
		}
		return nil
	}); err != nil {
		return nil, err
	}
	return board, nil
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
	if err := writeRootFileAtomic(root, cleanRel, []byte(strings.Join(lines, "\n")), 0644); err != nil {
		return nil, err
	}
	info, err := root.Stat(cleanRel)
	if err != nil {
		return nil, fmt.Errorf("inspect updated task: %w", err)
	}
	mtime := a.recordFileVersionLocked(a.vaultAbsolutePath(cleanRel), info)
	a.syncKanbanColumnsLocked()
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
	if err := writeRootFileAtomic(root, cleanRel, []byte(strings.Join(lines, "\n")), 0644); err != nil {
		return nil, err
	}
	info, err := root.Stat(cleanRel)
	if err != nil {
		return nil, fmt.Errorf("inspect updated task: %w", err)
	}
	mtime := a.recordFileVersionLocked(a.vaultAbsolutePath(cleanRel), info)
	a.syncKanbanColumnsLocked()
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

	pattern := regexp.MustCompile(`\[.*?\]\(` + regexp.QuoteMeta(dateStr) + `\.md\)`)
	var results []LinkedNote
	if err := a.walkVaultMarkdown(func(_ *os.Root, rel string, info fs.FileInfo, data []byte) error {
		lines := strings.Split(string(data), "\n")
		for i, line := range lines {
			if pattern.MatchString(line) {
				results = append(results, LinkedNote{
					Path:    rel,
					Name:    info.Name(),
					LineNum: i + 1,
					Snippet: strings.TrimSpace(line),
					Mtime:   float64(info.ModTime().UnixNano()) / 1e9,
				})
				break
			}
		}
		return nil
	}); err != nil {
		return nil, err
	}
	sort.Slice(results, func(i, j int) bool {
		return results[i].Mtime > results[j].Mtime
	})
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

	daysWithNotes := make(map[int]bool)
	daysWithLinks := make(map[int]bool)

	if err := a.walkVaultMarkdown(func(_ *os.Root, _ string, info fs.FileInfo, data []byte) error {
		name := info.Name()
		// Check if it's a daily note YYYY-MM-DD.md
		if matched, _ := regexp.MatchString(`^\d{4}-\d{2}-\d{2}\.md$`, name); matched {
			dateStr := strings.TrimSuffix(name, ".md")
			t, err := time.Parse("2006-01-02", dateStr)
			if err == nil && t.Year() == year && int(t.Month()) == month {
				daysWithNotes[t.Day()] = true
			}
		}
		// Check for links to daily notes
		content := string(data)
		for day := 1; day <= 31; day++ {
			dateStr := fmt.Sprintf("%04d-%02d-%02d", year, month, day)
			escaped := regexp.QuoteMeta(dateStr)
			if matched, _ := regexp.MatchString(`\[.*?\]\(`+escaped+`\.md\)`, content); matched {
				daysWithLinks[day] = true
			} else if matched, _ := regexp.MatchString(`\[`+escaped+`\]\(\)`, content); matched {
				daysWithLinks[day] = true
			}
		}
		return nil
	}); err != nil {
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

	notesList := keysToList(daysWithNotes)
	linksList := keysToList(daysWithLinks)
	sort.Ints(notesList)
	sort.Ints(linksList)

	return &CalendarMonthData{
		Year:          year,
		Month:         month,
		DaysWithNotes: notesList,
		DaysWithLinks: linksList,
		Calendar:      cal,
	}, nil
}

func keysToList(m map[int]bool) []int {
	list := make([]int, 0, len(m))
	for k := range m {
		list = append(list, k)
	}
	return list
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

	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return nil, err
	}
	if err := a.writeVaultFileAtomic(".config/session.json", jsonData, 0600); err != nil {
		return nil, err
	}
	return &SaveFileResult{Success: true}, nil
}

// LoadSession loads session state from vault/.config/session.json.
func (a *App) LoadSession() (map[string]interface{}, error) {
	a.sessionMu.RLock()
	defer a.sessionMu.RUnlock()

	data, err := a.readVaultFile(".config/session.json")
	if os.IsNotExist(err) {
		return map[string]interface{}{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read session: %w", err)
	}
	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("parse session: %w", err)
	}
	return result, nil
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

// GetThemes returns the list of available themes from themes/manifest.json.
func (a *App) GetThemes() (map[string]interface{}, error) {
	path := filepath.Join("frontend", "themes", "manifest.json")
	data, err := assets.ReadFile(path)
	if err != nil {
		data, err = readProjectAsset(path) // fallback for dev mode
		if err != nil {
			return map[string]interface{}{
				"themes": []ThemeInfo{{ID: "default", Name: "Default Dark"}},
			}, nil
		}
	}
	var themes []ThemeInfo
	if err := json.Unmarshal(data, &themes); err != nil {
		return map[string]interface{}{
			"themes": []ThemeInfo{{ID: "default", Name: "Default Dark"}},
		}, nil
	}
	return map[string]interface{}{"themes": themes}, nil
}

// GetThemeCSS returns the raw CSS for a theme.
func (a *App) GetThemeCSS(themeID string) (map[string]string, error) {
	themeID = strings.TrimSpace(strings.ToLower(themeID))
	if !themeIDRe.MatchString(themeID) {
		return nil, fmt.Errorf("invalid theme id")
	}
	path := filepath.Join("frontend", "themes", themeID+".css")
	data, err := assets.ReadFile(path)
	if err != nil {
		data, err = readProjectAsset(path) // fallback for dev mode
		if err != nil {
			return map[string]string{"css": ""}, nil
		}
	}
	return map[string]string{"css": string(data)}, nil
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
	settings["theme"] = themeID
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
		safeRuntimeCall(func() { runtime.WindowMinimise(a.ctx) })
	}
}

// WindowMaximize toggles fullscreen.
func (a *App) WindowMaximize() {
	if a.ctx != nil {
		safeRuntimeCall(func() { runtime.WindowToggleMaximise(a.ctx) })
	}
}

// WindowClose closes the application window.
func (a *App) WindowClose() {
	if a.ctx != nil {
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

// AutoCommitLoad returns the auto-commit interval in seconds (0 = disabled).
func (a *App) AutoCommitLoad() int {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("[settings] load auto-commit interval: %v", err)
		}
		return 0
	}
	if v, ok := settings["auto_commit_seconds"]; ok {
		switch n := v.(type) {
		case float64:
			return int(n)
		case int:
			return n
		}
	}
	return 0 // default: disabled
}

// AutoCommitSave persists the auto-commit interval in seconds.
func (a *App) AutoCommitSave(seconds int) error {
	if seconds < 0 {
		return fmt.Errorf("auto-commit interval cannot be negative")
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
