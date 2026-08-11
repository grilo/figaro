package desktop

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"figaro/internal/links"
)

// This Wails-facing layer applies the pure internal/links transformation to
// root-scoped vault files. It computes edits before the move and can restore
// them if a later write fails.
type vaultLinkRewrite struct {
	path     string
	original []byte
	updated  []byte
	mode     os.FileMode
}

func collectVaultLinkRewrites(root *os.Root, oldRel string, newRel string) ([]vaultLinkRewrite, error) {
	oldRel = links.NormalizeVaultPath(oldRel)
	newRel = links.NormalizeVaultPath(newRel)
	var rewrites []vaultLinkRewrite

	err := fs.WalkDir(root.FS(), ".", func(rel string, entry fs.DirEntry, walkErr error) error {
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
		sourceRel := links.NormalizeVaultPath(rel)
		futureSourceRel := links.MovedVaultPath(sourceRel, oldRel, newRel)
		updated := links.RewriteMarkdownLinksForMove(string(data), sourceRel, futureSourceRel, oldRel, newRel)
		if updated == string(data) {
			return nil
		}
		rewrites = append(rewrites, vaultLinkRewrite{
			path:     filepath.FromSlash(futureSourceRel),
			original: data,
			updated:  []byte(updated),
			mode:     info.Mode().Perm(),
		})
		return nil
	})
	if err != nil {
		return nil, err
	}
	return rewrites, nil
}

// collectVaultLinkRewritesIndexed avoids reopening every Markdown document
// when the shared index still describes the filesystem. A metadata-only walk
// validates that precondition first; any external change the watcher has not
// yet delivered falls back to the complete root-scoped scan above.
func collectVaultLinkRewritesIndexed(
	root *os.Root,
	index *vaultIndex,
	oldRel string,
	newRel string,
) ([]vaultLinkRewrite, bool, error) {
	valid, err := vaultIndexMatchesMarkdownFiles(root, index)
	if err != nil {
		return nil, false, err
	}
	if !valid {
		rewrites, err := collectVaultLinkRewrites(root, oldRel, newRel)
		return rewrites, false, err
	}

	oldRel = links.NormalizeVaultPath(oldRel)
	newRel = links.NormalizeVaultPath(newRel)
	candidates := vaultLinkRewriteCandidates(index, oldRel)
	rewrites := make([]vaultLinkRewrite, 0, len(candidates))
	for _, file := range candidates {
		futureSourceRel := links.MovedVaultPath(file.path, oldRel, newRel)
		updated := links.RewriteMarkdownLinksForMove(
			file.content,
			file.path,
			futureSourceRel,
			oldRel,
			newRel,
		)
		if updated == file.content {
			continue
		}
		rewrites = append(rewrites, vaultLinkRewrite{
			path:     filepath.FromSlash(futureSourceRel),
			original: []byte(file.content),
			updated:  []byte(updated),
			mode:     file.mode.Perm(),
		})
	}
	return rewrites, true, nil
}

// vaultLinkRewriteCandidates is the pure pruning rule for a move. Markdown
// inside the moved tree is considered when it has an internal destination,
// because explicit relative links may need to change with the source path.
// Other files are considered only when one of their destinations enters the
// moved tree.
func vaultLinkRewriteCandidates(index *vaultIndex, oldRel string) []vaultIndexedFile {
	if index == nil {
		return nil
	}
	oldRel = links.NormalizeVaultPath(oldRel)
	candidates := make([]vaultIndexedFile, 0)
	for _, path := range index.paths {
		file := index.files[path]
		candidate := pathAtOrBelow(file.path, oldRel) && len(file.linkTargets) > 0
		if !candidate {
			for _, target := range file.linkTargets {
				if pathAtOrBelow(target, oldRel) {
					candidate = true
					break
				}
			}
		}
		if candidate {
			candidates = append(candidates, file)
		}
	}
	return candidates
}

func pathAtOrBelow(path string, root string) bool {
	path = links.NormalizeVaultPath(path)
	root = links.NormalizeVaultPath(root)
	return path == root || strings.HasPrefix(path, root+"/")
}

func vaultIndexMatchesMarkdownFiles(root *os.Root, index *vaultIndex) (bool, error) {
	if index == nil {
		return false, nil
	}
	matched := 0
	matches := true
	err := fs.WalkDir(root.FS(), ".", func(rel string, entry fs.DirEntry, walkErr error) error {
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

		file, found := index.files[filepath.ToSlash(rel)]
		if !found || file.size != info.Size() ||
			file.modTimeNano != info.ModTime().UnixNano() || file.mode != info.Mode() {
			matches = false
			return fs.SkipAll
		}
		matched++
		return nil
	})
	if err != nil {
		return false, err
	}
	return matches && matched == len(index.files), nil
}

func applyVaultLinkRewrites(root *os.Root, rewrites []vaultLinkRewrite) ([]vaultLinkRewrite, error) {
	applied := make([]vaultLinkRewrite, 0, len(rewrites))
	for _, rewrite := range rewrites {
		mode := rewrite.mode
		if mode == 0 {
			mode = 0644
		}
		if err := writeRootFileAtomic(root, rewrite.path, rewrite.updated, mode); err != nil {
			return applied, fmt.Errorf("rewrite links in %q: %w", filepath.ToSlash(rewrite.path), err)
		}
		applied = append(applied, rewrite)
	}
	return applied, nil
}

func restoreVaultLinkRewrites(root *os.Root, rewrites []vaultLinkRewrite) error {
	for index := len(rewrites) - 1; index >= 0; index-- {
		rewrite := rewrites[index]
		mode := rewrite.mode
		if mode == 0 {
			mode = 0644
		}
		if err := writeRootFileAtomic(root, rewrite.path, rewrite.original, mode); err != nil {
			return fmt.Errorf("restore links in %q: %w", filepath.ToSlash(rewrite.path), err)
		}
	}
	return nil
}

// rewriteCopiedMarkdownLinks updates only Markdown files in a newly created
// copy. Incoming links elsewhere deliberately keep pointing at the original.
func rewriteCopiedMarkdownLinks(root *os.Root, sourceRoot string, copiedRoot string) ([]string, error) {
	sourceRoot = filepath.Clean(sourceRoot)
	copiedRoot = filepath.Clean(copiedRoot)
	var updatedPaths []string

	err := fs.WalkDir(root.FS(), filepath.ToSlash(copiedRoot), func(rel string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return fmt.Errorf("walk copied path %q: %w", rel, walkErr)
		}
		if entry.Type()&fs.ModeSymlink != 0 {
			return fmt.Errorf("copied path changed into a symbolic link: %q", rel)
		}
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".md") {
			return nil
		}

		copiedPath := filepath.FromSlash(rel)
		relative, err := filepath.Rel(copiedRoot, copiedPath)
		if err != nil {
			return fmt.Errorf("resolve copied path %q: %w", rel, err)
		}
		sourcePath := sourceRoot
		if relative != "." {
			sourcePath = filepath.Join(sourceRoot, relative)
		}
		data, err := root.ReadFile(copiedPath)
		if err != nil {
			return fmt.Errorf("read copied Markdown %q: %w", rel, err)
		}
		updated := links.RewriteMarkdownLinksForCopy(
			string(data),
			filepath.ToSlash(sourcePath),
			filepath.ToSlash(copiedPath),
			filepath.ToSlash(sourceRoot),
			filepath.ToSlash(copiedRoot),
		)
		if updated == string(data) {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return fmt.Errorf("inspect copied Markdown %q: %w", rel, err)
		}
		if err := writeRootFileAtomic(root, copiedPath, []byte(updated), info.Mode().Perm()); err != nil {
			return fmt.Errorf("rewrite links in copied Markdown %q: %w", rel, err)
		}
		updatedPaths = append(updatedPaths, filepath.ToSlash(copiedPath))
		return nil
	})
	if err != nil {
		return nil, err
	}
	return updatedPaths, nil
}
