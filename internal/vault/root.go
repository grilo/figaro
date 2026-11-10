// Package vault provides root-scoped filesystem primitives for Txin's local
// vault. Every operation is relative to an os.Root so a symlink race cannot
// escape the selected vault directory.
package vault

import (
	"crypto/rand"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// RelativePath normalizes a frontend-supplied path without permitting an
// absolute path or traversal above the vault root.
func RelativePath(rel string) (string, error) {
	return relativePathFor(runtime.GOOS, rel)
}

// relativePathFor is RelativePath with the operating system passed in, so the
// drive-letter rule of each platform can be tested on any of them.
func relativePathFor(goos string, rel string) (string, error) {
	rel = strings.ReplaceAll(rel, "\\", "/")
	rel = strings.TrimLeft(rel, "/")
	if strings.ContainsRune(rel, '\x00') {
		return "", fmt.Errorf("invalid path contains NUL")
	}
	if hasDrivePrefix(goos, rel) {
		return "", fmt.Errorf("Windows absolute paths not allowed: %s", rel)
	}

	clean := filepath.Clean(filepath.FromSlash(rel))
	if clean == "." {
		return ".", nil
	}
	if clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) || filepath.IsAbs(clean) {
		return "", fmt.Errorf("path escapes vault: %s", rel)
	}
	return clean, nil
}

// hasDrivePrefix reports whether a slash-separated path starts like a Windows
// drive. On Windows any second-character colon selects a drive or an alternate
// data stream, so all of them are refused. Elsewhere a colon is an ordinary
// filename character ("1:1 Alice.md", "a: note.md"); only an unmistakable drive
// form, an ASCII letter and a colon alone or followed by a separator, is
// refused there.
func hasDrivePrefix(goos string, rel string) bool {
	if len(rel) < 2 || rel[1] != ':' {
		return false
	}
	if goos == "windows" {
		return true
	}
	letter := rel[0] | 0x20
	return letter >= 'a' && letter <= 'z' && (len(rel) == 2 || rel[2] == '/')
}

// ValidatePath forces Root to resolve existing path components. A missing
// final component is valid for create operations.
func ValidatePath(root *os.Root, rel string) error {
	_, err := root.Stat(rel)
	if err == nil || os.IsNotExist(err) {
		return nil
	}
	return err
}

// WriteFileAtomic writes a root-relative file through a random temporary file
// and then renames it into place. A file that already exists keeps exactly its
// permission bits; a new file gets mode as filtered by the process umask.
func WriteFileAtomic(root *os.Root, rel string, data []byte, mode os.FileMode) error {
	dir := filepath.Dir(rel)
	if dir != "." {
		if err := root.MkdirAll(dir, 0755); err != nil {
			return err
		}
	}
	replacesExisting := false
	if info, err := root.Stat(rel); err == nil {
		mode = info.Mode().Perm()
		replacesExisting = true
	} else if !os.IsNotExist(err) {
		return err
	}

	base := filepath.Base(rel)
	for attempt := 0; attempt < 16; attempt++ {
		var token [12]byte
		if _, err := rand.Read(token[:]); err != nil {
			return fmt.Errorf("generate temporary file name: %w", err)
		}
		tempRel := filepath.Join(dir, "."+base+".tmp-"+fmt.Sprintf("%x", token))
		file, err := root.OpenFile(tempRel, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode.Perm())
		if os.IsExist(err) {
			continue
		}
		if err != nil {
			return err
		}
		if replacesExisting {
			restorePermissions(file, mode.Perm())
		}

		if _, err := file.Write(data); err != nil {
			return closeAndRemove(root, file, tempRel, "write temporary file", err)
		}
		if err := file.Sync(); err != nil {
			return closeAndRemove(root, file, tempRel, "sync temporary file", err)
		}
		if err := file.Close(); err != nil {
			return removeAfterFailure(root, tempRel, "close temporary file", err)
		}
		if err := root.Rename(tempRel, rel); err != nil {
			return removeAfterFailure(root, tempRel, "rename temporary file", err)
		}
		return nil
	}
	return fmt.Errorf("create temporary file for %s: too many collisions", rel)
}

// restorePermissions gives the temporary replacement the permission bits of
// the file it replaces. Creating it applied the process umask, which would
// otherwise turn a group-writable 0664 note into 0644 on every save. Filesystems
// with synthetic permissions (FAT, some network mounts) refuse the change; the
// save then proceeds with the bits the filesystem chose, as it always did.
func restorePermissions(file *os.File, mode os.FileMode) {
	if info, err := file.Stat(); err == nil && info.Mode().Perm() == mode {
		return
	}
	_ = file.Chmod(mode)
}

// CreateFile creates a root-relative file without replacing an existing file.
func CreateFile(root *os.Root, rel string, data []byte, mode os.FileMode) error {
	dir := filepath.Dir(rel)
	if dir != "." {
		if err := root.MkdirAll(dir, 0755); err != nil {
			return err
		}
	}

	file, err := root.OpenFile(rel, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode.Perm())
	if err != nil {
		return err
	}
	if _, err := file.Write(data); err != nil {
		return closeAndRemove(root, file, rel, "write new file", err)
	}
	if err := file.Sync(); err != nil {
		return closeAndRemove(root, file, rel, "sync new file", err)
	}
	if err := file.Close(); err != nil {
		return removeAfterFailure(root, rel, "close new file", err)
	}
	return nil
}

func closeAndRemove(root *os.Root, file *os.File, rel string, operation string, cause error) error {
	issues := []error{fmt.Errorf("%s: %w", operation, cause)}
	if err := file.Close(); err != nil {
		issues = append(issues, fmt.Errorf("close file: %w", err))
	}
	if err := removeRootFile(root, rel); err != nil {
		issues = append(issues, fmt.Errorf("remove incomplete file: %w", err))
	}
	return errors.Join(issues...)
}

func removeAfterFailure(root *os.Root, rel string, operation string, cause error) error {
	issues := []error{fmt.Errorf("%s: %w", operation, cause)}
	if err := removeRootFile(root, rel); err != nil {
		issues = append(issues, fmt.Errorf("remove incomplete file: %w", err))
	}
	return errors.Join(issues...)
}

func removeRootFile(root *os.Root, rel string) error {
	if err := root.Remove(rel); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// MarkdownVisitor receives regular Markdown files only. The relative path is
// slash-separated so it is stable across platforms.
type MarkdownVisitor func(root *os.Root, rel string, info fs.FileInfo, data []byte) error

// MarkdownProgress reports how many Markdown files have been visited out of
// the total discovered beneath the vault root. The first report is always
// (0, total), including for an empty vault.
type MarkdownProgress func(visited int, total int)

// MarkdownMetadataVisitor receives one ordinary Markdown file before its
// contents are read. Callers can reject oversized files without allocating
// them, then perform a root-scoped read only when their admission policy
// allows it.
type MarkdownMetadataVisitor func(root *os.Root, rel string, info fs.FileInfo) error

type markdownFile struct {
	rel  string
	info fs.FileInfo
}

// WalkMarkdown walks ordinary Markdown files below an already-open vault root.
// It omits dot-directories and symlinks; Root protects all opens from races.
func WalkMarkdown(root *os.Root, visitor MarkdownVisitor) error {
	return walkMarkdownFiles(root, func(file markdownFile) error {
		data, err := root.ReadFile(file.rel)
		if err != nil {
			return fmt.Errorf("read vault path %q: %w", file.rel, err)
		}
		return visitor(root, filepath.ToSlash(file.rel), file.info, data)
	})
}

// WalkMarkdownWithProgress discovers the complete Markdown workload before
// reading files, then reports determinate progress after each successful
// visit. The two-phase walk is reserved for user-visible cold vault loading;
// ordinary one-off vault operations can retain WalkMarkdown's single pass.
func WalkMarkdownWithProgress(root *os.Root, visitor MarkdownVisitor, progress MarkdownProgress) error {
	files := make([]markdownFile, 0)
	if err := walkMarkdownFiles(root, func(file markdownFile) error {
		files = append(files, file)
		return nil
	}); err != nil {
		return err
	}

	if progress != nil {
		progress(0, len(files))
	}
	for index, file := range files {
		data, err := root.ReadFile(file.rel)
		if err != nil {
			return fmt.Errorf("read vault path %q: %w", file.rel, err)
		}
		if err := visitor(root, filepath.ToSlash(file.rel), file.info, data); err != nil {
			return err
		}
		if progress != nil {
			progress(index+1, len(files))
		}
	}
	return nil
}

// WalkMarkdownMetadataWithProgress discovers the complete Markdown workload,
// then leaves content reads to the visitor. It preserves the same determinate
// progress contract as WalkMarkdownWithProgress.
func WalkMarkdownMetadataWithProgress(root *os.Root, visitor MarkdownMetadataVisitor, progress MarkdownProgress) error {
	files := make([]markdownFile, 0)
	if err := walkMarkdownFiles(root, func(file markdownFile) error {
		files = append(files, file)
		return nil
	}); err != nil {
		return err
	}

	if progress != nil {
		progress(0, len(files))
	}
	for index, file := range files {
		if err := visitor(root, filepath.ToSlash(file.rel), file.info); err != nil {
			return err
		}
		if progress != nil {
			progress(index+1, len(files))
		}
	}
	return nil
}

// WalkMarkdownMetadata visits every ordinary Markdown file once, in path
// order, without reading it and without a progress pre-pass. A visitor that
// returns fs.SkipAll ends the walk early without an error.
func WalkMarkdownMetadata(root *os.Root, visitor MarkdownMetadataVisitor) error {
	return walkMarkdownFiles(root, func(file markdownFile) error {
		return visitor(root, filepath.ToSlash(file.rel), file.info)
	})
}

// IsSkippableWalkError reports whether a failure met on one entry below the
// vault root should leave that entry out instead of failing the whole walk: a
// folder the user may not read (ext4's lost+found, a chmod 000 directory) or an
// entry that vanished between being listed and being inspected. A failure on
// the vault root itself is never skippable; callers check that themselves.
func IsSkippableWalkError(err error) bool {
	return errors.Is(err, fs.ErrPermission) || errors.Is(err, fs.ErrNotExist)
}

// HasMarkdown reports whether the vault holds at least one ordinary Markdown
// file, by the same rules as WalkMarkdown. It stops at the first one found,
// and looks at the top level first so that the usual vault, with a note beside
// its folders, is settled by one listing instead of a descent into them.
func HasMarkdown(root *os.Root) (bool, error) {
	entries, err := fs.ReadDir(root.FS(), ".")
	if err != nil {
		return false, fmt.Errorf("walk vault path %q: %w", ".", err)
	}
	for _, entry := range entries {
		if entry.Type().IsRegular() && isMarkdownName(entry.Name()) {
			return true, nil
		}
	}
	found := false
	err = walkMarkdownFiles(root, func(markdownFile) error {
		found = true
		return fs.SkipAll
	})
	return found, err
}

func isMarkdownName(name string) bool {
	return strings.HasSuffix(strings.ToLower(name), ".md")
}

func walkMarkdownFiles(root *os.Root, visitor func(markdownFile) error) error {
	return fs.WalkDir(root.FS(), ".", func(rel string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			if rel != "." && IsSkippableWalkError(walkErr) {
				return nil
			}
			return fmt.Errorf("walk vault path %q: %w", rel, walkErr)
		}
		if rel == "." {
			return nil
		}
		if entry.Type()&fs.ModeSymlink != 0 {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			if IsSkippableWalkError(err) {
				return nil
			}
			return fmt.Errorf("inspect vault path %q: %w", rel, err)
		}
		if info.Mode()&fs.ModeSymlink != 0 {
			return nil
		}
		if info.IsDir() {
			if strings.HasPrefix(entry.Name(), ".") {
				return fs.SkipDir
			}
			return nil
		}
		if !isMarkdownName(entry.Name()) {
			return nil
		}
		return visitor(markdownFile{rel: rel, info: info})
	})
}
