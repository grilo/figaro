package desktop

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// DroppedMarkdownFiles sorts Markdown files dropped outside the file tree.
// Notes already inside the vault open by their vault-relative path; files
// elsewhere become process-local external documents that save back to their
// original location, exactly like files the operating system opened.
type DroppedMarkdownFiles struct {
	VaultPaths []string              `json:"vaultPaths"`
	External   []*ExternalLaunchFile `json:"external"`
	Skipped    []string              `json:"skipped"`
}

func isDroppedMarkdownName(name string) bool {
	extension := strings.ToLower(filepath.Ext(name))
	return extension == ".md" || extension == ".markdown"
}

// OpenDroppedMarkdownFiles accepts only absolute paths to regular Markdown
// files. Symbolic links and anything else are reported as skipped rather than
// opened. A drop reaches Wails through the same message channel page scripts
// use, so these rules, not the drop itself, bound what the editor may write.
func (a *App) OpenDroppedMarkdownFiles(paths []string) (*DroppedMarkdownFiles, error) {
	result := &DroppedMarkdownFiles{VaultPaths: []string{}, External: []*ExternalLaunchFile{}, Skipped: []string{}}
	vaultRoot, err := filepath.EvalSymlinks(a.vaultPath)
	if err != nil {
		return nil, err
	}
	external := make([]string, 0, len(paths))
	seenVault := make(map[string]struct{}, len(paths))
	for _, supplied := range paths {
		clean := filepath.Clean(strings.TrimSpace(supplied))
		if clean == "." || !filepath.IsAbs(clean) || !isDroppedMarkdownName(clean) {
			result.Skipped = append(result.Skipped, supplied)
			continue
		}
		info, err := os.Lstat(clean)
		if err != nil || info.Mode()&fs.ModeSymlink != 0 || !info.Mode().IsRegular() {
			result.Skipped = append(result.Skipped, supplied)
			continue
		}
		resolved, err := filepath.EvalSymlinks(clean)
		if err != nil {
			result.Skipped = append(result.Skipped, supplied)
			continue
		}
		if pathIsWithin(vaultRoot, resolved) {
			relative, err := filepath.Rel(vaultRoot, resolved)
			if err != nil {
				result.Skipped = append(result.Skipped, supplied)
				continue
			}
			relative = filepath.ToSlash(relative)
			if _, duplicate := seenVault[relative]; !duplicate {
				seenVault[relative] = struct{}{}
				result.VaultPaths = append(result.VaultPaths, relative)
			}
			continue
		}
		external = append(external, clean)
	}
	fresh := make([]string, 0, len(external))
	for _, path := range external {
		id, known := a.externalFiles.idForPath(path)
		if !known {
			fresh = append(fresh, path)
			continue
		}
		info, err := os.Stat(path)
		if err != nil {
			result.Skipped = append(result.Skipped, path)
			continue
		}
		result.External = append(result.External, &ExternalLaunchFile{
			ID: id, Name: filepath.Base(path), Path: path, Mtime: externalFileMtime(info),
		})
	}
	result.External = append(result.External, a.registerLaunchExternalFiles(fresh)...)
	return result, nil
}
