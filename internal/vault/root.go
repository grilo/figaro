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
	"strings"
)

// RelativePath normalizes a frontend-supplied path without permitting an
// absolute path or traversal above the vault root.
func RelativePath(rel string) (string, error) {
	rel = strings.ReplaceAll(rel, "\\", "/")
	rel = strings.TrimLeft(rel, "/")
	if strings.ContainsRune(rel, '\x00') {
		return "", fmt.Errorf("invalid path contains NUL")
	}
	if len(rel) > 1 && rel[1] == ':' {
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
// and then renames it into place. Existing permissions are retained.
func WriteFileAtomic(root *os.Root, rel string, data []byte, mode os.FileMode) error {
	dir := filepath.Dir(rel)
	if dir != "." {
		if err := root.MkdirAll(dir, 0755); err != nil {
			return err
		}
	}
	if info, err := root.Stat(rel); err == nil {
		mode = info.Mode().Perm()
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

// WalkMarkdown walks ordinary Markdown files below an already-open vault root.
// It omits dot-directories and symlinks; Root protects all opens from races.
func WalkMarkdown(root *os.Root, visitor MarkdownVisitor) error {
	return fs.WalkDir(root.FS(), ".", func(rel string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
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
		if !strings.HasSuffix(strings.ToLower(entry.Name()), ".md") {
			return nil
		}

		data, err := root.ReadFile(rel)
		if err != nil {
			return fmt.Errorf("read vault path %q: %w", rel, err)
		}
		return visitor(root, filepath.ToSlash(rel), info, data)
	})
}
