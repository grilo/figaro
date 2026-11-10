package desktop

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"figaro/internal/links"
	"figaro/internal/vault"
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

// collectVaultLinkRewrites is the complete scan used when the index cannot be
// trusted. It admits notes by the index's own rules: a note recorded as a file
// issue (too large, unreadable, binary or not UTF-8) holds no links Figaro can
// rewrite, so it is passed over instead of being read whole or failing the
// move for every other note.
func collectVaultLinkRewrites(root *os.Root, oldRel string, newRel string) ([]vaultLinkRewrite, error) {
	oldRel = links.NormalizeVaultPath(oldRel)
	newRel = links.NormalizeVaultPath(newRel)
	var rewrites []vaultLinkRewrite

	err := vault.WalkMarkdownMetadata(root, func(root *os.Root, rel string, info fs.FileInfo) error {
		if vaultFileMetadataIssue(rel, info) != nil {
			return nil
		}
		data, err := root.ReadFile(filepath.FromSlash(rel))
		if err != nil || vaultFileContentIssue(rel, data) != nil {
			return nil
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
	issueFor vaultFileIssueLookup,
	oldRel string,
	newRel string,
) ([]vaultLinkRewrite, bool, error) {
	valid, err := vaultIndexMatchesMarkdownFiles(root, index, issueFor)
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

// vaultFileIssueLookup returns the recorded file issue for a slash-separated
// vault path, or nil.
type vaultFileIssueLookup func(path string) *VaultFileIssue

// fileIssueExplainsUnindexedNote reports whether a Markdown file that is
// missing from the index is one Figaro keeps out of it on purpose. Oversized,
// binary, non-UTF-8 and unreadable notes are recorded as file issues instead of
// being indexed, so their absence is not evidence of a stale index. An issue
// whose recorded size no longer fits the file describes an older version of
// it; that note may be indexable now, and only a rebuild can tell.
func fileIssueExplainsUnindexedNote(issue *VaultFileIssue, info fs.FileInfo) bool {
	if issue == nil || info == nil {
		return false
	}
	switch issue.Code {
	case fileIssueTooLarge:
		return info.Size() > maxEditableFileBytes
	case fileIssueBinary, fileIssueUnsupportedEncoding:
		return issue.Size == info.Size()
	case fileIssueUnreadable:
		return true
	default:
		return false
	}
}

func vaultIndexMatchesMarkdownFiles(root *os.Root, index *vaultIndex, issueFor vaultFileIssueLookup) (bool, error) {
	return vaultIndexMatchesMarkdownFilesExcluding(root, index, "", issueFor)
}

// vaultIndexMatchesMarkdownFilesExcluding validates the retained index after
// a known copy has reached disk. The newly created destination is ignored so
// every pre-existing Markdown file is still checked at its final metadata;
// an external change which raced or preceded the copy therefore selects the
// safe full-rebuild path. Notes with a recorded file issue are expected to be
// absent from the index and do not count against it.
func vaultIndexMatchesMarkdownFilesExcluding(root *os.Root, index *vaultIndex, excludedRel string, issueFor vaultFileIssueLookup) (bool, error) {
	if index == nil {
		return false, nil
	}
	excludedRel = links.NormalizeVaultPath(excludedRel)
	excluding := excludedRel != "" && excludedRel != "."
	expected := len(index.files)
	if excluding {
		for indexedPath := range index.files {
			if pathAtOrBelow(indexedPath, excludedRel) {
				expected--
			}
		}
	}
	matched := 0
	matches := true
	err := vault.WalkMarkdownMetadata(root, func(_ *os.Root, rel string, info fs.FileInfo) error {
		if excluding && pathAtOrBelow(rel, excludedRel) {
			return nil
		}
		file, found := index.files[rel]
		if !found {
			if issueFor != nil && fileIssueExplainsUnindexedNote(issueFor(rel), info) {
				return nil
			}
			matches = false
			return fs.SkipAll
		}
		if !file.matchesMetadata(info) {
			matches = false
			return fs.SkipAll
		}
		matched++
		return nil
	})
	if err != nil {
		return false, err
	}
	return matches && matched == expected, nil
}

// acknowledgeVaultLinkRewritesLocked marks link rewrites Figaro has just
// written, and whose effect the index already reflects (or will, through the
// rebuild the caller has arranged), so their watcher events are not indexed a
// second time. The caller must hold vaultMu for writing.
func (a *App) acknowledgeVaultLinkRewritesLocked(applied []vaultLinkRewrite) {
	for _, rewrite := range applied {
		a.markInternalVaultWriteLocked(filepath.Clean(rewrite.path))
	}
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
