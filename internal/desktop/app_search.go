package desktop

import (
	"path/filepath"
	"sort"
	"strings"
)

// ============================================================================
// 3. Search
// ============================================================================

// SearchMatch holds a single line match.
type SearchMatch struct {
	Line int    `json:"line"`
	Text string `json:"text"`
}

// SearchResult holds per-file search results.
type SearchResult struct {
	Path       string        `json:"path"`
	Name       string        `json:"name"`
	Matches    []SearchMatch `json:"matches"`
	MatchCount int           `json:"match_count"`
	Mtime      float64       `json:"mtime"`
}

// searchPreview returns the first matching line and the exact match count.
// The search dropdown only displays these two facts, so retaining every
// matching line would needlessly allocate and serialize large result payloads
// for broad searches.
func searchPreview(content, query string, caseSensitive bool) ([]SearchMatch, int) {
	var first SearchMatch
	matchCount := 0
	for lineNumber, lineStart := 1, 0; ; lineNumber++ {
		lineEnd := strings.IndexByte(content[lineStart:], '\n')
		line := content[lineStart:]
		if lineEnd >= 0 {
			line = content[lineStart : lineStart+lineEnd]
		}
		check := line
		if !caseSensitive {
			check = strings.ToLower(line)
		}
		if strings.Contains(check, query) {
			matchCount++
			if matchCount == 1 {
				first = SearchMatch{Line: lineNumber, Text: strings.TrimSpace(line)}
			}
		}
		if lineEnd < 0 {
			break
		}
		lineStart += lineEnd + 1
	}
	if matchCount == 0 {
		return nil, 0
	}
	return []SearchMatch{first}, matchCount
}

// SearchFiles searches all .md files in the vault for a query string.
func (a *App) SearchFiles(query string, caseSensitive bool) ([]SearchResult, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, err
	}

	searchQuery := query
	candidates := map[string]struct{}(nil)
	if !caseSensitive {
		searchQuery = strings.ToLower(query)
		candidates = index.searchCandidates(searchQuery)
	}

	var results []SearchResult
	for _, path := range index.paths {
		if candidates != nil {
			if _, found := candidates[path]; !found {
				continue
			}
		}
		file := index.files[path]
		content := file.content
		if !caseSensitive {
			content = file.searchLower
		}
		if !strings.Contains(content, searchQuery) {
			continue
		}

		matches, matchCount := searchPreview(file.content, searchQuery, caseSensitive)
		if matchCount > 0 {
			results = append(results, SearchResult{
				Path:       file.path,
				Name:       file.name,
				Matches:    matches,
				MatchCount: matchCount,
				Mtime:      file.mtime,
			})
		}
	}
	sort.Slice(results, func(i, j int) bool {
		return results[i].Mtime > results[j].Mtime
	})
	return results, nil
}

// BacklinkResult holds one backlink match.
type BacklinkResult struct {
	Path      string  `json:"path"`
	Name      string  `json:"name"`
	LineNum   int     `json:"line_num"`
	Snippet   string  `json:"snippet"`
	Context   string  `json:"context"`
	MatchText string  `json:"match_text"`
	Mtime     float64 `json:"mtime"`
}

// SearchBacklinks finds all notes that link to the given target note.
func (a *App) SearchBacklinks(targetPath string) ([]BacklinkResult, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, err
	}

	targetName := strings.TrimSuffix(filepath.Base(targetPath), ".md")
	targetRel := strings.ReplaceAll(targetPath, "\\", "/")

	// Wails serializes a nil Go slice as null. Backlinks are a collection, so
	// preserve the API contract and return [] when no notes link to the target.
	results := make([]BacklinkResult, 0)
	bySource := make(map[string]BacklinkResult)
	for _, target := range []string{targetRel, targetName + ".md"} {
		for _, backlink := range index.backlinksByTarget[strings.ToLower(target)] {
			previous, found := bySource[backlink.Path]
			if !found || backlink.LineNum < previous.LineNum {
				bySource[backlink.Path] = backlink
			}
		}
	}
	for _, backlink := range bySource {
		backlink.Context = relationshipContext(index.files[backlink.Path].content, backlink.LineNum)
		backlink.MatchText = targetName
		results = append(results, backlink)
	}
	sort.Slice(results, func(i, j int) bool {
		return results[i].Mtime > results[j].Mtime
	})
	return results, nil
}
