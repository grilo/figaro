// Package links contains pure Markdown link rewriting used when vault paths
// move. Keeping it independent from Wails lets it be tested as ordinary Go
// text transformation logic.
package links

import (
	"net/url"
	"path/filepath"
	"regexp"
	"strings"

	"figaro/internal/vault"
)

// These cover ordinary Markdown/image links and reference definitions. The
// rewriter leaves code fences untouched and preserves optional titles,
// fragments, aliases, and surrounding Markdown syntax.
var (
	markdownInlineLinkRe    = regexp.MustCompile(`(!?\[[^\]\r\n]*\]\(\s*)(<[^>\r\n]+>|[^)\s\r\n]+)([^)\r\n]*\))`)
	markdownReferenceLinkRe = regexp.MustCompile(`^(\s*\[[^\]\r\n]+\]:\s*)(<[^>\r\n]+>|[^\s\r\n]+)([^\r\n]*)`)
	wikiLinkRe              = regexp.MustCompile(`\[\[([^\]\r\n]+)\]\]`)
)

type markdownLinkPathStyle uint8

const (
	markdownVaultPath markdownLinkPathStyle = iota
	markdownRelativePath
	markdownRootPath
)

// NormalizeVaultPath returns a slash-separated vault-relative path.
func NormalizeVaultPath(value string) string {
	value = filepath.ToSlash(value)
	return strings.Trim(value, "/")
}

// MovedVaultPath maps an exact path or a child of oldRel to its new location.
func MovedVaultPath(value string, oldRel string, newRel string) string {
	value = NormalizeVaultPath(value)
	oldRel = NormalizeVaultPath(oldRel)
	newRel = NormalizeVaultPath(newRel)
	if value == oldRel {
		return newRel
	}
	if strings.HasPrefix(value, oldRel+"/") {
		return newRel + value[len(oldRel):]
	}
	return value
}

// RewriteMarkdownLinksForMove rewrites links whose target moved, and adjusts
// explicit relative links in a Markdown document that itself moved. The latter
// preserves the meaning of links within a moved folder.
func RewriteMarkdownLinksForMove(content string, sourceRel string, futureSourceRel string, oldRel string, newRel string) string {
	return rewriteMarkdownLinksForPathMapping(content, sourceRel, futureSourceRel, oldRel, newRel)
}

// RewriteMarkdownLinksForCopy adjusts links in one newly copied Markdown
// document. Targets inside sourceRoot follow the copied tree, while relative
// targets outside it continue to resolve to the original vault item. Callers
// deliberately apply this only to copied files; incoming links elsewhere in
// the vault must keep pointing to the source.
func RewriteMarkdownLinksForCopy(content string, sourceRel string, copiedSourceRel string, sourceRoot string, copiedRoot string) string {
	return rewriteMarkdownLinksForPathMapping(content, sourceRel, copiedSourceRel, sourceRoot, copiedRoot)
}

func rewriteMarkdownLinksForPathMapping(content string, sourceRel string, futureSourceRel string, oldRel string, newRel string) string {
	lines := strings.SplitAfter(content, "\n")
	inFence := false
	for index, line := range lines {
		trimmed := strings.TrimLeft(line, " \t")
		if strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~") {
			inFence = !inFence
			continue
		}
		if inFence {
			continue
		}

		line = markdownInlineLinkRe.ReplaceAllStringFunc(line, func(match string) string {
			parts := markdownInlineLinkRe.FindStringSubmatch(match)
			destination, changed := rewriteMarkdownDestination(parts[2], sourceRel, futureSourceRel, oldRel, newRel)
			if !changed {
				return match
			}
			return parts[1] + destination + parts[3]
		})
		line = markdownReferenceLinkRe.ReplaceAllStringFunc(line, func(match string) string {
			parts := markdownReferenceLinkRe.FindStringSubmatch(match)
			destination, changed := rewriteMarkdownDestination(parts[2], sourceRel, futureSourceRel, oldRel, newRel)
			if !changed {
				return match
			}
			return parts[1] + destination + parts[3]
		})
		lines[index] = wikiLinkRe.ReplaceAllStringFunc(line, func(match string) string {
			return rewriteWikiLinkForMove(match, oldRel, newRel)
		})
	}
	return strings.Join(lines, "")
}

func rewriteMarkdownDestination(destination string, sourceRel string, futureSourceRel string, oldRel string, newRel string) (string, bool) {
	bracketed := strings.HasPrefix(destination, "<") && strings.HasSuffix(destination, ">")
	pathValue := destination
	if bracketed {
		pathValue = destination[1 : len(destination)-1]
	}
	pathValue, suffix := splitMarkdownLinkSuffix(pathValue)
	if pathValue == "" || isExternalMarkdownDestination(pathValue) {
		return destination, false
	}

	decoded, err := url.PathUnescape(pathValue)
	if err != nil {
		return destination, false
	}
	targetRel, style, ok := resolveMarkdownLinkTarget(sourceRel, decoded)
	if !ok {
		return destination, false
	}
	futureTargetRel := MovedVaultPath(targetRel, oldRel, newRel)
	targetMoved := futureTargetRel != targetRel
	sourceMoved := sourceRel != futureSourceRel
	if !targetMoved && !(sourceMoved && style == markdownRelativePath) {
		return destination, false
	}

	formatted, err := formatMarkdownLinkTarget(futureTargetRel, futureSourceRel, style)
	if err != nil {
		return destination, false
	}
	if bracketed {
		formatted = "<" + formatted + ">"
	}
	formatted += suffix
	if formatted == destination {
		return destination, false
	}
	return formatted, true
}

func splitMarkdownLinkSuffix(value string) (string, string) {
	if index := strings.IndexAny(value, "?#"); index >= 0 {
		return value[:index], value[index:]
	}
	return value, ""
}

func isExternalMarkdownDestination(value string) bool {
	if strings.HasPrefix(value, "#") || strings.HasPrefix(value, "//") {
		return true
	}
	parsed, err := url.Parse(value)
	return err == nil && parsed.IsAbs()
}

func resolveMarkdownLinkTarget(sourceRel string, destination string) (string, markdownLinkPathStyle, bool) {
	style := markdownVaultPath
	candidate := destination
	switch {
	case strings.HasPrefix(destination, "/"):
		style = markdownRootPath
		candidate = strings.TrimLeft(destination, "/")
	case destination == "." || destination == ".." || strings.HasPrefix(destination, "./") || strings.HasPrefix(destination, "../"):
		style = markdownRelativePath
		sourceDir := filepath.Dir(filepath.FromSlash(sourceRel))
		candidate = filepath.Join(sourceDir, filepath.FromSlash(destination))
	}
	clean, err := vault.RelativePath(filepath.ToSlash(candidate))
	if err != nil || clean == "." {
		return "", style, false
	}
	return filepath.ToSlash(clean), style, true
}

func formatMarkdownLinkTarget(targetRel string, sourceRel string, style markdownLinkPathStyle) (string, error) {
	targetRel = NormalizeVaultPath(targetRel)
	if style == markdownRelativePath {
		sourceDir := filepath.Dir(filepath.FromSlash(sourceRel))
		relative, err := filepath.Rel(sourceDir, filepath.FromSlash(targetRel))
		if err != nil {
			return "", err
		}
		targetRel = filepath.ToSlash(relative)
		if !strings.HasPrefix(targetRel, ".") {
			targetRel = "./" + targetRel
		}
	}
	escaped := escapeMarkdownLinkPath(targetRel)
	if style == markdownRootPath {
		return "/" + escaped, nil
	}
	return escaped, nil
}

func escapeMarkdownLinkPath(value string) string {
	parts := strings.Split(filepath.ToSlash(value), "/")
	for index, part := range parts {
		parts[index] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

func rewriteWikiLinkForMove(match string, oldRel string, newRel string) string {
	body := match[2 : len(match)-2]
	target, alias, hasAlias := strings.Cut(body, "|")
	trimmedTarget := strings.TrimSpace(target)
	if trimmedTarget == "" {
		return match
	}

	pathValue, suffix := splitMarkdownLinkSuffix(trimmedTarget)
	decoded, err := url.PathUnescape(pathValue)
	if err != nil || isExternalMarkdownDestination(decoded) {
		return match
	}
	hadRootPrefix := strings.HasPrefix(decoded, "/")
	implicitMarkdownExtension := !strings.HasSuffix(strings.ToLower(decoded), ".md")
	if implicitMarkdownExtension {
		decoded += ".md"
	}
	clean, err := vault.RelativePath(decoded)
	if err != nil || clean == "." {
		return match
	}
	futureTarget := MovedVaultPath(filepath.ToSlash(clean), oldRel, newRel)
	if futureTarget == filepath.ToSlash(clean) {
		return match
	}
	if implicitMarkdownExtension && strings.HasSuffix(strings.ToLower(futureTarget), ".md") {
		futureTarget = futureTarget[:len(futureTarget)-len(".md")]
	}
	if hadRootPrefix {
		futureTarget = "/" + futureTarget
	}

	leadingSpace := target[:len(target)-len(strings.TrimLeft(target, " \t"))]
	trailingSpace := target[len(strings.TrimRight(target, " \t")):]
	updated := "[[" + leadingSpace + futureTarget + suffix + trailingSpace
	if hasAlias {
		updated += "|" + alias
	}
	return updated + "]]"
}
