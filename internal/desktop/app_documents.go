package desktop

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"figaro/internal/notes"
)

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

// ExternalLaunchFile describes one Markdown document passed to Figaro by the
// operating system at initial or forwarded launch. IDs are process-local
// capabilities, while Path is shown only so the editor can retain normal
// language detection and file labeling.
type ExternalLaunchFile struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Path  string  `json:"path"`
	Mtime float64 `json:"mtime"`
}

func externalFileMtime(info os.FileInfo) float64 {
	return float64(info.ModTime().UnixNano()) / 1e9
}

func readExternalMarkdownFile(path string) (*ReadFileResult, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("cannot read non-regular external file")
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return &ReadFileResult{
		Content: string(content),
		Mtime:   externalFileMtime(info),
		Path:    path,
		Binary:  isBinaryFileContent(content),
	}, nil
}

// GetLaunchExternalFiles returns every document registered by operating-system
// launches in this process without reading them. A document can disappear
// before the frontend is ready, in which case it is simply omitted and never
// becomes an editable tab.
func (a *App) GetLaunchExternalFiles() ([]*ExternalLaunchFile, error) {
	a.externalFilesMu.RLock()
	ids := append([]string(nil), a.launchExternalIDs...)
	paths := make(map[string]string, len(a.launchExternalFiles))
	for id, path := range a.launchExternalFiles {
		paths[id] = path
	}
	a.externalFilesMu.RUnlock()

	files := make([]*ExternalLaunchFile, 0, len(ids))
	for _, id := range ids {
		path := paths[id]
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		files = append(files, &ExternalLaunchFile{
			ID:    id,
			Name:  filepath.Base(path),
			Path:  path,
			Mtime: externalFileMtime(info),
		})
	}
	return files, nil
}

// ReadLaunchExternalFile reads only a Markdown file registered by an explicit
// operating-system launch. It deliberately does not share ReadFile's
// vault-relative API.
func (a *App) ReadLaunchExternalFile(id string) (*ReadFileResult, error) {
	path, err := a.launchExternalFilePath(id)
	if err != nil {
		return nil, err
	}
	return readExternalMarkdownFile(path)
}

func writeExternalFileAtomic(path string, content []byte, mode os.FileMode) (err error) {
	temporary, err := os.CreateTemp(filepath.Dir(path), ".figaro-save-*")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer func() {
		_ = temporary.Close()
		_ = os.Remove(temporaryPath)
	}()
	if err := temporary.Chmod(mode.Perm()); err != nil {
		return err
	}
	if _, err := temporary.Write(content); err != nil {
		return err
	}
	if err := temporary.Sync(); err != nil {
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return os.Rename(temporaryPath, path)
}

// SaveLaunchExternalFile writes back to the exact source document associated
// with its process-local launch ID. It keeps the normal optimistic mtime
// conflict contract but never updates the vault index or Git history.
func (a *App) SaveLaunchExternalFile(id string, content string, expectedMtime float64) (*SaveFileResult, error) {
	path, err := a.launchExternalFilePath(id)
	if err != nil {
		return nil, err
	}
	linkInfo, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if linkInfo.Mode()&os.ModeSymlink != 0 {
		return &SaveFileResult{Success: false, Error: "Cannot save a symbolic-link launch file"}, nil
	}
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return &SaveFileResult{Success: false, Error: "Cannot save a non-regular external file"}, nil
	}
	if info.Mode().Perm()&0222 == 0 {
		return &SaveFileResult{Success: false, Error: "External file is read-only"}, nil
	}
	if expectedMtime != 0 && externalFileMtime(info) != expectedMtime {
		return &SaveFileResult{Success: false, Error: "File modified externally"}, nil
	}
	if err := writeExternalFileAtomic(path, []byte(content), info.Mode()); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	updated, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	return &SaveFileResult{Success: true, Mtime: externalFileMtime(updated), Path: path}, nil
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
	DeletedID      string            `json:"deleted_id,omitempty"`
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

	service := notes.Service{Repository: &vaultNoteSaveRepository{
		app:      a,
		root:     root,
		cleanRel: cleanRel,
		abs:      abs,
	}}
	result, err := service.Save(notes.SaveRequest{
		Content:         content,
		ExpectedVersion: expectedMtime,
	})
	if err != nil {
		return nil, err
	}
	return &SaveFileResult{
		Success: result.Success,
		Error:   result.Error,
		Mtime:   result.Version,
		Path:    relPath,
	}, nil
}

// vaultNoteSaveRepository adapts the confined vault root and in-memory index
// to the note save use case. No conflict or force-save policy lives here.
type vaultNoteSaveRepository struct {
	app      *App
	root     *os.Root
	cleanRel string
	abs      string
}

func (r *vaultNoteSaveRepository) CurrentVersion() (float64, bool) {
	info, err := r.root.Stat(r.cleanRel)
	if err != nil {
		return 0, false
	}
	return r.app.currentFileVersionLocked(r.abs, info), true
}

func (r *vaultNoteSaveRepository) Write(content string) (float64, error) {
	if err := r.app.writeNoteWithTaskSchedules(r.root, r.cleanRel, content); err != nil {
		return 0, err
	}
	info, err := r.root.Stat(r.cleanRel)
	if err != nil {
		return 0, fmt.Errorf("inspect saved file: %w", err)
	}
	version := r.app.recordFileVersionLocked(r.abs, info)
	r.app.updateVaultIndexFileLocked(r.cleanRel, info, content)
	r.app.markInternalVaultWriteLocked(r.cleanRel)
	return version, nil
}

// CommitCurrentFile records exactly one vault file in local Git history.
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
		a.updateFileTreeCacheFileLocked(imagePath, info)
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
