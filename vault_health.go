package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// VaultHealthIssue identifies one read-only finding from a vault health scan.
// Path always refers to a vault-relative source or affected entry, making a
// result safe to open directly from the frontend.
type VaultHealthIssue struct {
	Path    string   `json:"path"`
	LineNum int      `json:"line_num,omitempty"`
	Detail  string   `json:"detail"`
	Target  string   `json:"target,omitempty"`
	Paths   []string `json:"paths,omitempty"`
}

// VaultHealthReport groups non-destructive vault maintenance findings. Slices
// are intentionally initialized so Wails always serializes them as arrays.
type VaultHealthReport struct {
	BrokenLinks        []VaultHealthIssue `json:"broken_links"`
	OrphanAttachments  []VaultHealthIssue `json:"orphan_attachments"`
	DuplicateNames     []VaultHealthIssue `json:"duplicate_names"`
	InvalidFrontmatter []VaultHealthIssue `json:"invalid_frontmatter"`
}

var (
	vaultHealthMarkdownLinkRE = regexp.MustCompile(`!?\[[^\]\r\n]*\]\(([^)\r\n]+)\)`)
	attachmentExtensions      = map[string]struct{}{
		".png": {}, ".jpg": {}, ".jpeg": {}, ".gif": {}, ".webp": {}, ".avif": {}, ".svg": {},
		".mp3": {}, ".wav": {}, ".m4a": {}, ".ogg": {}, ".mp4": {}, ".mov": {}, ".webm": {}, ".pdf": {},
	}
)

// GetVaultHealth inspects the current vault without modifying it. It relies on
// the same root-scoped file access as regular vault operations and excludes
// hidden directories and symlinks, so a scan cannot escape the selected vault.
func (a *App) GetVaultHealth() (*VaultHealthReport, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()

	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, err
	}
	report := &VaultHealthReport{
		BrokenLinks:        make([]VaultHealthIssue, 0),
		OrphanAttachments:  make([]VaultHealthIssue, 0),
		DuplicateNames:     make([]VaultHealthIssue, 0),
		InvalidFrontmatter: make([]VaultHealthIssue, 0),
	}

	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()

	files, err := visibleVaultFiles(root)
	if err != nil {
		return nil, err
	}

	referencedAttachments := make(map[string]struct{})
	for _, path := range index.paths {
		file := index.files[path]
		broken, referenced := inspectVaultLinks(file.path, file.content, files, index.files)
		report.BrokenLinks = append(report.BrokenLinks, broken...)
		for target := range referenced {
			referencedAttachments[target] = struct{}{}
		}
		if issue, invalid := invalidFrontmatterIssue(file.path, file.content); invalid {
			report.InvalidFrontmatter = append(report.InvalidFrontmatter, issue)
		}
	}

	byName := make(map[string][]string)
	for path := range files {
		base := filepath.Base(path)
		byName[strings.ToLower(base)] = append(byName[strings.ToLower(base)], path)
		if _, attachment := attachmentExtensions[strings.ToLower(filepath.Ext(base))]; attachment {
			if _, referenced := referencedAttachments[path]; !referenced {
				report.OrphanAttachments = append(report.OrphanAttachments, VaultHealthIssue{
					Path:   path,
					Detail: "No Markdown note references this attachment.",
				})
			}
		}
	}
	for name, paths := range byName {
		if len(paths) < 2 {
			continue
		}
		sort.Strings(paths)
		report.DuplicateNames = append(report.DuplicateNames, VaultHealthIssue{
			Path:   paths[0],
			Detail: fmt.Sprintf("%d entries share the filename %q.", len(paths), filepath.Base(name)),
			Paths:  append([]string(nil), paths...),
		})
	}

	sortVaultHealthReport(report)
	return report, nil
}

func visibleVaultFiles(root *os.Root) (map[string]struct{}, error) {
	files := make(map[string]struct{})
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
		if info.Mode().IsRegular() {
			files[filepath.ToSlash(rel)] = struct{}{}
		}
		return nil
	})
	return files, err
}

func inspectVaultLinks(sourcePath, content string, files map[string]struct{}, markdownFiles map[string]vaultIndexedFile) ([]VaultHealthIssue, map[string]struct{}) {
	issues := make([]VaultHealthIssue, 0)
	referencedAttachments := make(map[string]struct{})
	inFence := false
	for lineNumber, lineStart := 1, 0; ; lineNumber++ {
		lineEnd := strings.IndexByte(content[lineStart:], '\n')
		line := content[lineStart:]
		if lineEnd >= 0 {
			line = content[lineStart : lineStart+lineEnd]
		}
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~") {
			inFence = !inFence
		} else if !inFence {
			issues, referencedAttachments = inspectVaultLinkLine(sourcePath, line, lineNumber, issues, referencedAttachments, files, markdownFiles)
		}
		if lineEnd < 0 {
			break
		}
		lineStart += lineEnd + 1
	}
	return issues, referencedAttachments
}

func inspectVaultLinkLine(sourcePath, line string, lineNumber int, issues []VaultHealthIssue, referenced map[string]struct{}, files map[string]struct{}, markdownFiles map[string]vaultIndexedFile) ([]VaultHealthIssue, map[string]struct{}) {
	checkTarget := func(raw, display string, wikilink bool) {
		target := vaultLinkTarget(sourcePath, raw, wikilink)
		if target == "" {
			return
		}
		if _, markdown := markdownFiles[target]; markdown {
			return
		}
		if _, exists := files[target]; exists {
			if _, attachment := attachmentExtensions[strings.ToLower(filepath.Ext(target))]; attachment {
				referenced[target] = struct{}{}
			}
			return
		}
		issues = append(issues, VaultHealthIssue{
			Path:    sourcePath,
			LineNum: lineNumber,
			Detail:  "Links to a vault entry that does not exist.",
			Target:  display,
		})
	}
	for _, match := range vaultHealthMarkdownLinkRE.FindAllStringSubmatch(line, -1) {
		if len(match) == 2 {
			raw := markdownLinkDestination(match[1])
			checkTarget(raw, raw, false)
		}
	}
	for _, match := range wikiRelationshipLinkRE.FindAllStringSubmatch(line, -1) {
		if len(match) != 2 {
			continue
		}
		raw, _, _ := strings.Cut(match[1], "|")
		checkTarget(raw, strings.TrimSpace(raw), true)
	}
	return issues, referenced
}

func markdownLinkDestination(raw string) string {
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "<") {
		if end := strings.IndexByte(raw, '>'); end >= 0 {
			return strings.TrimSpace(raw[1:end])
		}
	}
	if fields := strings.Fields(raw); len(fields) > 0 {
		return fields[0]
	}
	return ""
}

func invalidFrontmatterIssue(path, content string) (VaultHealthIssue, bool) {
	lines := strings.Split(content, "\n")
	if len(lines) == 0 || strings.TrimPrefix(lines[0], "\ufeff") != "---" {
		return VaultHealthIssue{}, false
	}
	for lineNumber := 1; lineNumber < len(lines); lineNumber++ {
		marker := strings.TrimSpace(lines[lineNumber])
		if marker == "---" || marker == "..." {
			return VaultHealthIssue{}, false
		}
	}
	return VaultHealthIssue{
		Path:    path,
		LineNum: 1,
		Detail:  "Frontmatter opens with --- but has no closing --- or ... delimiter.",
	}, true
}

func sortVaultHealthReport(report *VaultHealthReport) {
	sortIssues := func(issues []VaultHealthIssue) {
		sort.Slice(issues, func(i, j int) bool {
			if issues[i].Path != issues[j].Path {
				return issues[i].Path < issues[j].Path
			}
			return issues[i].LineNum < issues[j].LineNum
		})
	}
	sortIssues(report.BrokenLinks)
	sortIssues(report.OrphanAttachments)
	sortIssues(report.DuplicateNames)
	sortIssues(report.InvalidFrontmatter)
}
