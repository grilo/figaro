// Package notenames contains pure note-name and content similarity rules.
package notenames

import (
	"path"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

const minimumCanonicalLength = 4

// CanonicalMarkdownName returns the punctuation-, spacing-, and case-insensitive
// identity for a Markdown filename. Very short identities are deliberately
// ignored because names such as C++ and C# are more likely to be distinct.
func CanonicalMarkdownName(value string) string {
	name := path.Base(strings.ReplaceAll(value, "\\", "/"))
	if !strings.EqualFold(path.Ext(name), ".md") {
		return ""
	}
	stem := name[:len(name)-len(path.Ext(name))]
	normalized := strings.ToLower(norm.NFKC.String(stem))
	var canonical strings.Builder
	runeCount := 0
	for _, character := range normalized {
		if unicode.IsLetter(character) || unicode.IsNumber(character) {
			canonical.WriteRune(character)
			runeCount++
		}
	}
	if runeCount < minimumCanonicalLength {
		return ""
	}
	return canonical.String()
}

// SubstantialContentOverlap applies a conservative set-based comparison. It
// requires enough meaningful vocabulary and at least 80% overlap so a routine
// filename reused in separate folders does not become a finding by itself.
func SubstantialContentOverlap(left, right string) bool {
	leftTerms := contentTerms(left)
	rightTerms := contentTerms(right)
	if len(leftTerms) < 8 || len(rightTerms) < 8 {
		return false
	}
	intersection := 0
	for term := range leftTerms {
		if _, found := rightTerms[term]; found {
			intersection++
		}
	}
	if intersection < 6 {
		return false
	}
	union := len(leftTerms) + len(rightTerms) - intersection
	return union > 0 && float64(intersection)/float64(union) >= 0.8
}

func contentTerms(content string) map[string]struct{} {
	normalized := strings.ToLower(norm.NFKC.String(content))
	terms := make(map[string]struct{})
	var current strings.Builder
	flush := func() {
		term := current.String()
		current.Reset()
		if len([]rune(term)) >= 3 {
			terms[term] = struct{}{}
		}
	}
	for _, character := range normalized {
		if unicode.IsLetter(character) || unicode.IsNumber(character) {
			current.WriteRune(character)
			continue
		}
		flush()
	}
	flush()
	return terms
}
