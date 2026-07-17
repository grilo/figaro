package links

import (
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
)

// LinkStyle is the vault-wide syntax Figaro uses when it creates note links.
type LinkStyle string

const (
	MarkdownLinkStyle LinkStyle = "markdown"
	WikiLinkStyle     LinkStyle = "wikilink"
)

var convertibleWikiLinkRe = regexp.MustCompile(`\[\[([^\]\r\n]+)\]\]`)

// ParseLinkStyle rejects unknown persisted or bridge-provided values.
func ParseLinkStyle(value string) (LinkStyle, bool) {
	switch LinkStyle(strings.ToLower(strings.TrimSpace(value))) {
	case MarkdownLinkStyle:
		return MarkdownLinkStyle, true
	case WikiLinkStyle:
		return WikiLinkStyle, true
	default:
		return "", false
	}
}

// ConvertVaultLinks rewrites only links which resolve to an existing Markdown
// note in the vault. External destinations, images, code, malformed links, and
// unresolved targets are returned byte-for-byte unchanged.
func ConvertVaultLinks(content string, sourceRel string, style LinkStyle, noteExists func(string) bool) (string, int) {
	if _, valid := ParseLinkStyle(string(style)); !valid || noteExists == nil {
		return content, 0
	}

	lines := strings.SplitAfter(content, "\n")
	inFence := false
	fenceMarker := byte(0)
	fenceLength := 0
	converted := 0
	for index, line := range lines {
		trimmed := strings.TrimLeft(line, " \t")
		if marker, length, ok := markdownFence(trimmed); ok {
			if !inFence {
				inFence, fenceMarker, fenceLength = true, marker, length
			} else if marker == fenceMarker && length >= fenceLength {
				inFence = false
			}
			continue
		}
		if inFence {
			continue
		}
		lines[index] = rewriteOutsideInlineCode(line, func(segment string) string {
			updated, count := convertLinkSegment(segment, sourceRel, style, noteExists)
			converted += count
			return updated
		})
	}
	return strings.Join(lines, ""), converted
}

func markdownFence(line string) (byte, int, bool) {
	if len(line) < 3 || (line[0] != '`' && line[0] != '~') {
		return 0, 0, false
	}
	marker := line[0]
	length := 0
	for length < len(line) && line[length] == marker {
		length++
	}
	return marker, length, length >= 3
}

func rewriteOutsideInlineCode(line string, rewrite func(string) string) string {
	var result strings.Builder
	for cursor := 0; cursor < len(line); {
		start := strings.IndexByte(line[cursor:], '`')
		if start < 0 {
			result.WriteString(rewrite(line[cursor:]))
			break
		}
		start += cursor
		result.WriteString(rewrite(line[cursor:start]))
		run := 1
		for start+run < len(line) && line[start+run] == '`' {
			run++
		}
		delimiter := strings.Repeat("`", run)
		endOffset := strings.Index(line[start+run:], delimiter)
		if endOffset < 0 {
			// An unmatched code delimiter is ambiguous. Preserve the rest rather
			// than risk rewriting source the author intended to keep literal.
			result.WriteString(line[start:])
			break
		}
		end := start + run + endOffset + run
		result.WriteString(line[start:end])
		cursor = end
	}
	return result.String()
}

func convertLinkSegment(segment string, sourceRel string, style LinkStyle, noteExists func(string) bool) (string, int) {
	count := 0
	segment = replaceUnescapedMatches(segment, convertibleWikiLinkRe, func(match string) string {
		converted, ok := convertWikiLink(match, sourceRel, style, noteExists)
		if !ok {
			return match
		}
		count++
		return converted
	})
	if style != WikiLinkStyle {
		return segment, count
	}
	segment = replaceUnescapedMatches(segment, markdownInlineLinkRe, func(match string) string {
		converted, ok := convertMarkdownLink(match, sourceRel, noteExists)
		if !ok {
			return match
		}
		count++
		return converted
	})
	return segment, count
}

func replaceUnescapedMatches(value string, expression *regexp.Regexp, replace func(string) string) string {
	matches := expression.FindAllStringIndex(value, -1)
	if len(matches) == 0 {
		return value
	}
	var result strings.Builder
	last := 0
	for _, bounds := range matches {
		result.WriteString(value[last:bounds[0]])
		match := value[bounds[0]:bounds[1]]
		backslashes := 0
		for index := bounds[0] - 1; index >= 0 && value[index] == '\\'; index-- {
			backslashes++
		}
		if backslashes%2 == 1 {
			result.WriteString(match)
		} else {
			result.WriteString(replace(match))
		}
		last = bounds[1]
	}
	result.WriteString(value[last:])
	return result.String()
}

func convertMarkdownLink(match string, sourceRel string, noteExists func(string) bool) (string, bool) {
	parts := markdownInlineLinkRe.FindStringSubmatch(match)
	if len(parts) != 4 || strings.HasPrefix(parts[1], "!") {
		return match, false
	}
	// Wikilinks cannot retain an inline Markdown title without losing data.
	if strings.TrimSpace(strings.TrimSuffix(parts[3], ")")) != "" {
		return match, false
	}
	open := parts[1]
	left := strings.IndexByte(open, '[')
	right := strings.LastIndex(open, "](")
	if left < 0 || right <= left {
		return match, false
	}
	label := open[left+1 : right]
	if !validWikiAlias(label) {
		return match, false
	}

	destination := strings.TrimSpace(parts[2])
	if strings.HasPrefix(destination, "<") && strings.HasSuffix(destination, ">") {
		destination = destination[1 : len(destination)-1]
	}
	target, suffix, ok := resolveExistingNote(sourceRel, destination, noteExists)
	if !ok || strings.HasPrefix(suffix, "?") {
		return match, false
	}
	return "[[" + target + suffix + "|" + strings.TrimSpace(label) + "]]", true
}

func convertWikiLink(match string, sourceRel string, style LinkStyle, noteExists func(string) bool) (string, bool) {
	body := match[2 : len(match)-2]
	targetText, alias, hasAlias := strings.Cut(body, "|")
	targetText = strings.TrimSpace(targetText)
	alias = strings.TrimSpace(alias)
	if targetText == "" || (hasAlias && !validWikiAlias(alias)) {
		return match, false
	}
	target, suffix, ok := resolveExistingNote(sourceRel, targetText, noteExists)
	if !ok || strings.HasPrefix(suffix, "?") {
		return match, false
	}
	if !hasAlias {
		alias = strings.TrimSuffix(filepath.Base(target), filepath.Ext(target))
	}
	if !validWikiAlias(alias) {
		return match, false
	}
	if style == WikiLinkStyle {
		converted := "[[" + target + suffix + "|" + alias + "]]"
		return converted, converted != match
	}
	converted := "[" + escapeMarkdownLabel(alias) + "](" + escapeMarkdownLinkPath(target) + suffix + ")"
	return converted, converted != match
}

func resolveExistingNote(sourceRel string, destination string, noteExists func(string) bool) (string, string, bool) {
	pathValue, suffix := splitMarkdownLinkSuffix(strings.TrimSpace(destination))
	if pathValue == "" || isExternalMarkdownDestination(pathValue) {
		return "", "", false
	}
	decoded, err := url.PathUnescape(pathValue)
	if err != nil || strings.ContainsAny(decoded, "|]\r\n") {
		return "", "", false
	}
	target, _, ok := resolveMarkdownLinkTarget(sourceRel, decoded)
	if !ok {
		return "", "", false
	}
	if !strings.HasSuffix(strings.ToLower(target), ".md") {
		target += ".md"
	}
	target = NormalizeVaultPath(target)
	if target == "" || !noteExists(target) {
		return "", "", false
	}
	return target, suffix, true
}

func validWikiAlias(alias string) bool {
	alias = strings.TrimSpace(alias)
	return alias != "" && !strings.Contains(alias, "|") && !strings.Contains(alias, "]]") && !strings.ContainsAny(alias, "\r\n")
}

func escapeMarkdownLabel(label string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `[`, `\[`, `]`, `\]`)
	return replacer.Replace(label)
}
