package main

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
		})
		return nil
	})
	if err != nil {
		return nil, err
	}
	return rewrites, nil
}

func applyVaultLinkRewrites(root *os.Root, rewrites []vaultLinkRewrite) ([]vaultLinkRewrite, error) {
	applied := make([]vaultLinkRewrite, 0, len(rewrites))
	for _, rewrite := range rewrites {
		if err := writeRootFileAtomic(root, rewrite.path, rewrite.updated, 0644); err != nil {
			return applied, fmt.Errorf("rewrite links in %q: %w", filepath.ToSlash(rewrite.path), err)
		}
		applied = append(applied, rewrite)
	}
	return applied, nil
}

func restoreVaultLinkRewrites(root *os.Root, rewrites []vaultLinkRewrite) error {
	for index := len(rewrites) - 1; index >= 0; index-- {
		rewrite := rewrites[index]
		if err := writeRootFileAtomic(root, rewrite.path, rewrite.original, 0644); err != nil {
			return fmt.Errorf("restore links in %q: %w", filepath.ToSlash(rewrite.path), err)
		}
	}
	return nil
}
