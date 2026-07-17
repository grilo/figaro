package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"figaro/internal/links"
)

// LinkStyleResult reports the preference and every open buffer the frontend
// must reload after a successful vault rewrite.
type LinkStyleResult struct {
	Success      bool     `json:"success"`
	Style        string   `json:"style,omitempty"`
	Rewritten    int      `json:"rewritten,omitempty"`
	UpdatedLinks []string `json:"updated_links,omitempty"`
	Error        string   `json:"error,omitempty"`
}

// LinkStyleLoad returns the saved note-link syntax, defaulting safely for
// vaults created before the setting existed.
func (a *App) LinkStyleLoad() (map[string]string, error) {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()
	settings, err := a.readSettingsFile()
	if err != nil {
		return map[string]string{"style": string(links.MarkdownLinkStyle)}, nil
	}
	style, valid := links.ParseLinkStyle(fmt.Sprint(settings["link_style"]))
	if !valid {
		style = links.MarkdownLinkStyle
	}
	return map[string]string{"style": string(style)}, nil
}

// ChangeLinkStyle saves a syntax preference and optionally rewrites every
// resolvable vault-note link. Rewrites are computed before any file changes;
// failed writes or a failed settings save restore every already-written note.
func (a *App) ChangeLinkStyle(value string, rewrite bool) (*LinkStyleResult, error) {
	style, valid := links.ParseLinkStyle(value)
	if !valid {
		return &LinkStyleResult{Success: false, Error: "link style must be markdown or wikilink"}, nil
	}

	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	root, err := a.openVaultRoot()
	if err != nil {
		return &LinkStyleResult{Success: false, Error: err.Error()}, nil
	}
	defer root.Close()

	var rewrites []vaultLinkRewrite
	rewrittenLinks := 0
	if rewrite {
		rewrites, rewrittenLinks, err = collectVaultLinkStyleRewrites(root, style)
		if err != nil {
			return &LinkStyleResult{Success: false, Error: err.Error()}, nil
		}
	}

	applied, err := applyVaultLinkRewrites(root, rewrites)
	if err != nil {
		restoreErr := restoreVaultLinkRewrites(root, applied)
		if restoreErr != nil {
			err = fmt.Errorf("%v; rollback also failed: %v", err, restoreErr)
		}
		return &LinkStyleResult{Success: false, Error: err.Error()}, nil
	}

	settings, err := a.readSettingsFile()
	if err == nil {
		settings["link_style"] = string(style)
		err = a.writeSettingsFile(settings)
	}
	if err != nil {
		restoreErr := restoreVaultLinkRewrites(root, applied)
		if restoreErr != nil {
			err = fmt.Errorf("save link preference: %v; rollback also failed: %v", err, restoreErr)
		}
		return &LinkStyleResult{Success: false, Error: err.Error()}, nil
	}

	a.resetFileVersionsLocked()
	updated := make([]string, 0, len(rewrites))
	for _, item := range rewrites {
		updated = append(updated, filepath.ToSlash(item.path))
	}
	return &LinkStyleResult{
		Success:      true,
		Style:        string(style),
		Rewritten:    rewrittenLinks,
		UpdatedLinks: updated,
	}, nil
}

type vaultMarkdownDocument struct {
	path    string
	content []byte
	mode    os.FileMode
}

func collectVaultLinkStyleRewrites(root *os.Root, style links.LinkStyle) ([]vaultLinkRewrite, int, error) {
	var documents []vaultMarkdownDocument
	notes := make(map[string]bool)
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
		path := links.NormalizeVaultPath(rel)
		notes[path] = true
		documents = append(documents, vaultMarkdownDocument{path: path, content: data, mode: info.Mode().Perm()})
		return nil
	})
	if err != nil {
		return nil, 0, err
	}

	exists := func(path string) bool { return notes[links.NormalizeVaultPath(path)] }
	var rewrites []vaultLinkRewrite
	converted := 0
	for _, document := range documents {
		updated, count := links.ConvertVaultLinks(string(document.content), document.path, style, exists)
		if updated == string(document.content) {
			continue
		}
		converted += count
		rewrites = append(rewrites, vaultLinkRewrite{
			path:     filepath.FromSlash(document.path),
			original: document.content,
			updated:  []byte(updated),
			mode:     document.mode,
		})
	}
	return rewrites, converted, nil
}
