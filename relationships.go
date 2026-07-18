package main

import (
	"fmt"
	"net/url"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"
)

// SearchUnlinkedMentions returns plain-text uses of a note's filename title
// that are not already linked to that note. It deliberately reads the shared
// vault index rather than reopening every Markdown file.
func (a *App) SearchUnlinkedMentions(targetPath string) ([]BacklinkResult, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()

	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, err
	}

	targetPath = filepath.ToSlash(filepath.Clean(strings.TrimSpace(targetPath)))
	target, found := index.files[targetPath]
	if !found {
		return []BacklinkResult{}, nil
	}
	title := strings.TrimSuffix(target.name, filepath.Ext(target.name))
	if len([]rune(strings.TrimSpace(title))) < 2 {
		return []BacklinkResult{}, nil
	}

	results := make([]BacklinkResult, 0)
	for _, path := range index.paths {
		if path == target.path {
			continue
		}
		file := index.files[path]
		inFence := false
		for lineNumber, lineStart := 1, 0; ; lineNumber++ {
			lineEnd := strings.IndexByte(file.content[lineStart:], '\n')
			line := file.content[lineStart:]
			if lineEnd >= 0 {
				line = file.content[lineStart : lineStart+lineEnd]
			}
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~") {
				inFence = !inFence
			} else if !inFence {
				_, _, mention := standaloneTitleRangeOutsideLinks(line, title)
				if mention {
					results = append(results, BacklinkResult{
						Path:      file.path,
						Name:      file.name,
						LineNum:   lineNumber,
						Snippet:   strings.TrimSpace(line),
						Context:   relationshipContext(file.content, lineNumber),
						MatchText: title,
						Mtime:     file.mtime,
					})
				}
			}
			if lineEnd < 0 {
				break
			}
			lineStart += lineEnd + 1
		}
	}

	sort.Slice(results, func(i, j int) bool {
		if results[i].Mtime != results[j].Mtime {
			return results[i].Mtime > results[j].Mtime
		}
		if results[i].Path != results[j].Path {
			return results[i].Path < results[j].Path
		}
		return results[i].LineNum < results[j].LineNum
	})
	return results, nil
}

// LinkUnlinkedMention replaces one plain-text mention with a vault link in the
// user's selected link style. The caller saves dirty buffers before invoking
// it; this method then updates the same in-memory index used by Relationships.
func (a *App) LinkUnlinkedMention(sourcePath string, lineNumber int, targetPath string, style string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	sourcePath, err := vaultRelativePath(sourcePath)
	if err != nil || !strings.HasSuffix(strings.ToLower(sourcePath), ".md") {
		return &SaveFileResult{Success: false, Error: "A Markdown source note is required"}, nil
	}
	targetPath, err = vaultRelativePath(targetPath)
	if err != nil || !strings.HasSuffix(strings.ToLower(targetPath), ".md") {
		return &SaveFileResult{Success: false, Error: "A Markdown target note is required"}, nil
	}
	if sourcePath == targetPath {
		return &SaveFileResult{Success: false, Error: "A note cannot link one of its own mentions"}, nil
	}

	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, err
	}
	target, found := index.files[targetPath]
	if !found {
		return &SaveFileResult{Success: false, Error: "The target note no longer exists"}, nil
	}
	source, found := index.files[sourcePath]
	if !found {
		return &SaveFileResult{Success: false, Error: "The source note no longer exists"}, nil
	}
	title := strings.TrimSuffix(target.name, filepath.Ext(target.name))
	lines := strings.Split(source.content, "\n")
	if lineNumber < 1 || lineNumber > len(lines) || !relationshipLineIsLinkable(lines, lineNumber) {
		return &SaveFileResult{Success: false, Error: "That mention is no longer available to link"}, nil
	}
	line := lines[lineNumber-1]
	start, end, found := standaloneTitleRangeOutsideLinks(line, title)
	if !found {
		if lineLinksToVaultPath(line, sourcePath, targetPath) {
			return &SaveFileResult{Success: false, Error: "That line already links to this note"}, nil
		}
		return &SaveFileResult{Success: false, Error: "The plain-text mention changed before it could be linked"}, nil
	}

	replacement := "[" + title + "](" + markdownMentionTarget(targetPath) + ")"
	if strings.EqualFold(strings.TrimSpace(style), "wikilink") {
		replacement = "[[" + targetPath + "|" + title + "]]"
	}
	lines[lineNumber-1] = line[:start] + replacement + line[end:]
	updated := strings.Join(lines, "\n")

	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if err := writeRootFileAtomic(root, sourcePath, []byte(updated), 0644); err != nil {
		return nil, err
	}
	info, err := root.Stat(sourcePath)
	if err != nil {
		return nil, fmt.Errorf("inspect linked mention: %w", err)
	}
	mtime := a.recordFileVersionLocked(a.vaultAbsolutePath(sourcePath), info)
	a.updateVaultIndexFileLocked(sourcePath, info, updated)
	a.markInternalVaultWriteLocked(sourcePath)
	return &SaveFileResult{Success: true, Mtime: mtime, Path: sourcePath}, nil
}

var wikiRelationshipLinkRE = regexp.MustCompile(`\[\[([^\]\r\n]+)\]\]`)

func lineLinksToVaultPath(line, sourcePath, targetPath string) bool {
	for _, match := range markdownBacklinkRE.FindAllStringSubmatch(line, -1) {
		if len(match) == 3 && vaultLinkTarget(sourcePath, match[2], false) == targetPath {
			return true
		}
	}
	for _, match := range wikiRelationshipLinkRE.FindAllStringSubmatch(line, -1) {
		if len(match) != 2 {
			continue
		}
		target, _, _ := strings.Cut(match[1], "|")
		if vaultLinkTarget(sourcePath, target, true) == targetPath {
			return true
		}
	}
	return false
}

func vaultLinkTarget(sourcePath, raw string, implicitMarkdown bool) string {
	candidate := strings.TrimSpace(raw)
	if candidate == "" || strings.HasPrefix(candidate, "#") || strings.Contains(candidate, "://") ||
		strings.HasPrefix(strings.ToLower(candidate), "mailto:") {
		return ""
	}
	candidate, _, _ = strings.Cut(candidate, "#")
	candidate, _, _ = strings.Cut(candidate, "?")
	decoded, err := url.PathUnescape(candidate)
	if err != nil {
		return ""
	}
	candidate = strings.TrimSpace(decoded)
	if candidate == "" {
		return ""
	}
	if implicitMarkdown && filepath.Ext(candidate) == "" {
		candidate += ".md"
	}
	if strings.HasPrefix(candidate, "/") {
		candidate = strings.TrimPrefix(candidate, "/")
	} else {
		candidate = filepath.Join(filepath.Dir(sourcePath), candidate)
	}
	clean := filepath.ToSlash(filepath.Clean(candidate))
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		return ""
	}
	return clean
}

func standaloneTitleRangeOutsideLinks(line, title string) (int, int, bool) {
	linkRanges := make([][]int, 0)
	linkRanges = append(linkRanges, markdownBacklinkRE.FindAllStringIndex(line, -1)...)
	linkRanges = append(linkRanges, wikiRelationshipLinkRE.FindAllStringIndex(line, -1)...)
	title = strings.TrimSpace(title)
	needle := []rune(title)
	haystack := []rune(line)
	if len(needle) == 0 || len(needle) > len(haystack) {
		return 0, 0, false
	}
	byteOffsets := make([]int, 0, len(haystack)+1)
	for byteOffset := range line {
		byteOffsets = append(byteOffsets, byteOffset)
	}
	byteOffsets = append(byteOffsets, len(line))
	for startRune := 0; startRune <= len(haystack)-len(needle); startRune++ {
		endRune := startRune + len(needle)
		if !strings.EqualFold(string(haystack[startRune:endRune]), title) {
			continue
		}
		start, end := byteOffsets[startRune], byteOffsets[endRune]
		withinLink := false
		for _, linkRange := range linkRanges {
			if start < linkRange[1] && end > linkRange[0] {
				withinLink = true
				break
			}
		}
		if !withinLink && (startRune == 0 || !isTitleWordRune(haystack[startRune-1])) &&
			(endRune == len(haystack) || !isTitleWordRune(haystack[endRune])) {
			return start, end, true
		}
	}
	return 0, 0, false
}

func markdownMentionTarget(targetPath string) string {
	parts := strings.Split(filepath.ToSlash(targetPath), "/")
	for index, part := range parts {
		parts[index] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

func relationshipLineIsLinkable(lines []string, lineNumber int) bool {
	inFence := false
	for index, line := range lines {
		trimmed := strings.TrimSpace(line)
		if index == lineNumber-1 {
			return !inFence && !strings.HasPrefix(trimmed, "```") && !strings.HasPrefix(trimmed, "~~~")
		}
		if strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~") {
			inFence = !inFence
		}
	}
	return false
}

func isTitleWordRune(value rune) bool {
	return unicode.IsLetter(value) || unicode.IsDigit(value) || value == '_'
}

func relationshipContext(content string, lineNumber int) string {
	if lineNumber < 1 {
		return ""
	}
	lines := strings.Split(content, "\n")
	index := lineNumber - 1
	if index >= len(lines) {
		return ""
	}
	start, end := index, index
	for start > 0 && relationshipContextLine(lines[start-1]) {
		start--
	}
	for end+1 < len(lines) && relationshipContextLine(lines[end+1]) {
		end++
	}
	context := strings.TrimSpace(strings.Join(lines[start:end+1], " "))
	const maxContextRunes = 360
	runes := []rune(context)
	if len(runes) > maxContextRunes {
		return string(runes[:maxContextRunes-1]) + "…"
	}
	return context
}

func relationshipContextLine(line string) bool {
	trimmed := strings.TrimSpace(line)
	return trimmed != "" && !strings.HasPrefix(trimmed, "#") && !strings.HasPrefix(trimmed, "```") && !strings.HasPrefix(trimmed, "~~~")
}
