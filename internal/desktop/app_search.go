package desktop

import (
	"path/filepath"
	"sort"
	"strings"

	searchmodel "figaro/internal/search"
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
	Path         string        `json:"path"`
	Name         string        `json:"name"`
	Matches      []SearchMatch `json:"matches"`
	MatchCount   int           `json:"match_count"`
	Mtime        float64       `json:"mtime"`
	Score        float64       `json:"score,omitempty"`
	TitleMatch   bool          `json:"title_match,omitempty"`
	MatchedTerms []string      `json:"matched_terms,omitempty"`
}

// NoteSearchRequest selects one relevance profile without exposing scoring
// constants across the Wails boundary.
type NoteSearchRequest struct {
	CaseSensitive bool   `json:"case_sensitive"`
	TitleOnly     bool   `json:"title_only"`
	Profile       string `json:"profile"`
	Limit         int    `json:"limit"`
	Suggest       bool   `json:"suggest"`
}

// NoteSearchResponse keeps a correction available even when there are no
// result rows to carry metadata.
type NoteSearchResponse struct {
	Results    []SearchResult `json:"results"`
	Suggestion string         `json:"suggestion,omitempty"`
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
			check = searchmodel.Normalize(line, false)
		} else {
			check = searchmodel.Normalize(line, true)
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

	searchQuery := searchmodel.Normalize(query, caseSensitive)
	candidates := map[string]struct{}(nil)
	if !caseSensitive {
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
		content := file.searchLower
		if caseSensitive {
			content = searchmodel.Normalize(file.content, true)
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

func appendUniqueVariants(existing []searchmodel.Variant, additions ...searchmodel.Variant) []searchmodel.Variant {
	seen := make(map[string]struct{}, len(existing)+len(additions))
	for _, variant := range existing {
		seen[variant.Term] = struct{}{}
	}
	for _, variant := range additions {
		if _, duplicate := seen[variant.Term]; duplicate {
			continue
		}
		seen[variant.Term] = struct{}{}
		existing = append(existing, variant)
	}
	return existing
}

func candidatePaths(postings map[string][]string, variants [][]searchmodel.Variant) map[string]struct{} {
	candidates := make(map[string]struct{})
	for _, termVariants := range variants {
		for _, variant := range termVariants {
			for _, path := range postings[variant.Term] {
				candidates[path] = struct{}{}
			}
		}
	}
	return candidates
}

func hasVariantKind(variants []searchmodel.Variant, kind searchmodel.MatchKind) bool {
	for _, variant := range variants {
		if variant.Kind == kind {
			return true
		}
	}
	return false
}

func expandRankedQuery(index *vaultIndex, query searchmodel.Query) ([][]searchmodel.Variant, int) {
	variants := make([][]searchmodel.Variant, len(query.Terms))
	for termIndex, term := range query.Terms {
		variants[termIndex] = searchmodel.ExactAndPrefixVariants(
			term.Normalized,
			index.searchVocabulary,
			termIndex == len(query.Terms)-1,
			256,
		)
	}
	exactPrefixCount := len(candidatePaths(index.searchTermPostings, variants))
	for termIndex, term := range query.Terms {
		if exactPrefixCount <= 3 || (!hasVariantKind(variants[termIndex], searchmodel.MatchExact) &&
			!hasVariantKind(variants[termIndex], searchmodel.MatchPrefix)) {
			variants[termIndex] = appendUniqueVariants(
				variants[termIndex],
				searchmodel.FuzzyVariants(
					term.Normalized,
					index.searchVocabulary,
					index.searchDocumentFrequency,
					8,
				)...,
			)
		}
	}
	return variants, exactPrefixCount
}

func rankedDocumentForCase(
	file vaultIndexedFile,
	query searchmodel.Query,
	variants [][]searchmodel.Variant,
) searchmodel.DocumentStats {
	if !query.CaseSensitive {
		return file.searchDocument
	}
	document := searchmodel.DocumentStats{}
	document.Fields[searchmodel.FieldTitle] = searchmodel.AnalyzeMatchingCase(
		strings.TrimSuffix(file.name, filepath.Ext(file.name)), query, variants,
	)
	document.Fields[searchmodel.FieldHeadings] = searchmodel.AnalyzeMatchingCase(file.searchHeadings, query, variants)
	document.Fields[searchmodel.FieldTags] = searchmodel.AnalyzeMatchingCase(strings.Join(file.tags, " "), query, variants)
	document.Fields[searchmodel.FieldPath] = searchmodel.AnalyzeMatchingCase(
		strings.TrimSuffix(file.path, filepath.Ext(file.path)), query, variants,
	)
	document.Fields[searchmodel.FieldBody] = searchmodel.AnalyzeMatchingCase(file.content, query, variants)
	return document
}

func suggestedRankedQuery(query searchmodel.Query, variants [][]searchmodel.Variant, exactPrefixCount int) string {
	if exactPrefixCount > 3 || len(query.Terms) == 0 {
		return ""
	}
	suggested := make([]string, len(query.Terms))
	changed := false
	for termIndex, term := range query.Terms {
		suggested[termIndex] = term.Original
		if termIndex >= len(variants) || hasVariantKind(variants[termIndex], searchmodel.MatchExact) ||
			hasVariantKind(variants[termIndex], searchmodel.MatchPrefix) {
			continue
		}
		for _, variant := range variants[termIndex] {
			if variant.Kind != searchmodel.MatchFuzzy {
				continue
			}
			suggested[termIndex] = variant.Term
			changed = changed || suggested[termIndex] != term.Normalized
			break
		}
	}
	if !changed {
		return ""
	}
	return strings.Join(suggested, " ")
}

func searchProfile(request NoteSearchRequest) searchmodel.Profile {
	if request.TitleOnly {
		return searchmodel.TitleProfile()
	}
	if request.Profile == "links" {
		return searchmodel.LinkProfile()
	}
	return searchmodel.GlobalProfile()
}

// SearchNotes performs natural multi-term retrieval and relevance ranking over
// the already-current native vault index. It never reads files or mutates the
// index while servicing a query.
func (a *App) SearchNotes(query string, request NoteSearchRequest) (*NoteSearchResponse, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, err
	}

	planned := searchmodel.ParseQuery(strings.TrimSpace(query), request.CaseSensitive)
	response := &NoteSearchResponse{Results: make([]SearchResult, 0)}
	if len(planned.Terms) == 0 {
		return response, nil
	}
	variants, exactPrefixCount := expandRankedQuery(index, planned)
	candidates := candidatePaths(index.searchTermPostings, variants)
	if len(planned.Terms) == 1 && request.Profile != "links" {
		for path := range index.searchCandidates(planned.Terms[0].Normalized) {
			candidates[path] = struct{}{}
		}
		for _, path := range index.paths {
			file := index.files[path]
			foldedTitle := searchmodel.Normalize(strings.TrimSuffix(file.name, filepath.Ext(file.name)), false)
			foldedPath := searchmodel.Normalize(strings.TrimSuffix(file.path, filepath.Ext(file.path)), false)
			if strings.Contains(foldedTitle, planned.Terms[0].Normalized) ||
				strings.Contains(foldedPath, planned.Terms[0].Normalized) {
				candidates[path] = struct{}{}
			}
		}
	}

	profile := searchProfile(request)
	corpus := index.searchCorpusStats()
	passages := make(map[string]searchmodel.Passage)
	for path := range candidates {
		file, found := index.files[path]
		if !found {
			continue
		}
		document := rankedDocumentForCase(file, planned, variants)
		explanation := searchmodel.Score(document, planned, variants, corpus, profile)
		passage := searchmodel.Passage{}
		if !request.TitleOnly && request.Profile != "links" {
			var cached bool
			passage, cached = passages[file.content]
			if !cached {
				passage = searchmodel.BestPassage(file.content, planned, variants)
				passages[file.content] = passage
			}
		}
		if explanation.Score <= 0 && len(planned.Terms) == 1 {
			needle := planned.Terms[0].Normalized
			if request.CaseSensitive {
				needle = planned.Terms[0].Sensitive
			}
			title := searchmodel.Normalize(strings.TrimSuffix(file.name, filepath.Ext(file.name)), request.CaseSensitive)
			pathValue := searchmodel.Normalize(strings.TrimSuffix(file.path, filepath.Ext(file.path)), request.CaseSensitive)
			explanation.TitleMatch = strings.Contains(title, needle)
			if explanation.TitleMatch || (!request.TitleOnly && strings.Contains(pathValue, needle)) || passage.MatchingLines > 0 {
				explanation.Score = 0.01
				explanation.MatchedTerms = 1
				explanation.Terms = []string{planned.Terms[0].Normalized}
			}
		}
		if explanation.Score <= 0 {
			continue
		}
		matches := make([]SearchMatch, 0, 1)
		if passage.Line > 0 {
			matches = append(matches, SearchMatch{Line: passage.Line, Text: passage.Text})
		}
		matchedTerms := explanation.Terms
		if len(passage.Terms) > 0 {
			matchedTerms = appendUniqueStrings(matchedTerms, passage.Terms...)
		}
		response.Results = append(response.Results, SearchResult{
			Path: file.path, Name: file.name, Matches: matches,
			MatchCount: passage.MatchingLines, Mtime: file.mtime,
			Score: explanation.Score, TitleMatch: explanation.TitleMatch,
			MatchedTerms: matchedTerms,
		})
	}
	sort.Slice(response.Results, func(i, j int) bool {
		if response.Results[i].Score != response.Results[j].Score {
			return response.Results[i].Score > response.Results[j].Score
		}
		if response.Results[i].Mtime != response.Results[j].Mtime {
			return response.Results[i].Mtime > response.Results[j].Mtime
		}
		return response.Results[i].Path < response.Results[j].Path
	})
	if request.Limit > 0 && len(response.Results) > request.Limit {
		response.Results = response.Results[:request.Limit]
	}
	if request.Suggest {
		response.Suggestion = suggestedRankedQuery(planned, variants, exactPrefixCount)
	}
	return response, nil
}

func appendUniqueStrings(existing []string, additions ...string) []string {
	seen := make(map[string]struct{}, len(existing)+len(additions))
	for _, value := range existing {
		seen[value] = struct{}{}
	}
	for _, value := range additions {
		if value == "" {
			continue
		}
		if _, duplicate := seen[value]; duplicate {
			continue
		}
		seen[value] = struct{}{}
		existing = append(existing, value)
	}
	return existing
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
