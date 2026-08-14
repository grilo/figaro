package search

import (
	"math"
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

// Field identifies one independently weighted part of a Markdown note.
type Field uint8

const (
	FieldTitle Field = iota
	FieldHeadings
	FieldTags
	FieldPath
	FieldBody
	FieldCount
)

// MatchKind records how a query term reached one indexed term.
type MatchKind uint8

const (
	MatchExact MatchKind = iota
	MatchPrefix
	MatchFuzzy
)

// TermFrequency is a compact, sorted term/count pair.
type TermFrequency struct {
	Term  string
	Count int
}

// FieldStats contains the values needed by BM25F for one document field.
type FieldStats struct {
	Length int
	Terms  []TermFrequency
}

// DocumentStats contains every searchable field for one note.
type DocumentStats struct {
	Fields [FieldCount]FieldStats
}

// CorpusStats contains collection-wide values used by BM25F.
type CorpusStats struct {
	DocumentCount     int
	AverageLengths    [FieldCount]float64
	DocumentFrequency map[string]int
}

// Profile gives a search surface its field priorities without changing the
// underlying index or scoring rule.
type Profile struct {
	FieldWeights [FieldCount]float64
	FieldB       [FieldCount]float64
	K1           float64
}

// Variant is one indexed term that can satisfy a query term.
type Variant struct {
	Term     string
	Kind     MatchKind
	Distance int
	Weight   float64
}

// QueryTerm retains both the common folded key and its case-preserving form.
type QueryTerm struct {
	Original   string
	Normalized string
	Sensitive  string
}

// Query is a deterministic tokenized search request.
type Query struct {
	Raw           string
	CaseSensitive bool
	Terms         []QueryTerm
}

// ScoreResult explains the small part of ranking needed by the UI adapter.
type ScoreResult struct {
	Score        float64
	MatchedTerms int
	TitleMatch   bool
	Terms        []string
}

// Passage is the strongest source line for a ranked document.
type Passage struct {
	Line          int
	Text          string
	MatchingLines int
	Terms         []string
}

var wordRE = regexp.MustCompile(`[\p{L}\p{N}_]+`)

// Normalize removes compatibility accents while optionally preserving case.
// Original Markdown is never changed; this representation exists only in the
// search index.
func Normalize(value string, caseSensitive bool) string {
	decomposed := norm.NFKD.String(value)
	var builder strings.Builder
	builder.Grow(len(decomposed))
	for _, current := range decomposed {
		if unicode.Is(unicode.Mn, current) {
			continue
		}
		if !caseSensitive {
			current = unicode.ToLower(current)
		}
		builder.WriteRune(current)
	}
	return builder.String()
}

// Tokens applies the same Unicode-aware token boundary rules to indexed text
// and queries.
func Tokens(value string, caseSensitive bool) []string {
	return wordRE.FindAllString(Normalize(value, caseSensitive), -1)
}

// Analyze builds a sorted frequency table without retaining another copy of
// the source text.
func Analyze(value string, caseSensitive bool) FieldStats {
	return AnalyzeNormalized(Normalize(value, caseSensitive))
}

// AnalyzeNormalized avoids a second Unicode fold when an index adapter already
// retains the normalized representation. It walks word boundaries without
// materializing a second slice containing every token occurrence.
func AnalyzeNormalized(value string) FieldStats {
	counts := make(map[string]int)
	length := 0
	start := -1
	finish := func(end int) {
		if start < 0 {
			return
		}
		counts[value[start:end]]++
		length++
		start = -1
	}
	for offset, current := range value {
		if current == '_' || unicode.IsLetter(current) || unicode.IsNumber(current) {
			if start < 0 {
				start = offset
			}
			continue
		}
		finish(offset)
	}
	finish(len(value))
	terms := make([]TermFrequency, 0, len(counts))
	for term, count := range counts {
		terms = append(terms, TermFrequency{Term: term, Count: count})
	}
	sort.Slice(terms, func(i, j int) bool { return terms[i].Term < terms[j].Term })
	return FieldStats{Length: length, Terms: terms}
}

// Frequency reads one term from a sorted field table.
func (field FieldStats) Frequency(term string) int {
	position := sort.Search(len(field.Terms), func(index int) bool {
		return field.Terms[index].Term >= term
	})
	if position >= len(field.Terms) || field.Terms[position].Term != term {
		return 0
	}
	return field.Terms[position].Count
}

// ParseQuery tokenizes once and removes repeated terms so repeated typing does
// not accidentally multiply one concept's score.
func ParseQuery(value string, caseSensitive bool) Query {
	rawTerms := wordRE.FindAllString(value, -1)
	seen := make(map[string]struct{}, len(rawTerms))
	terms := make([]QueryTerm, 0, len(rawTerms))
	for _, raw := range rawTerms {
		normalized := Normalize(raw, false)
		if normalized == "" {
			continue
		}
		if _, duplicate := seen[normalized]; duplicate {
			continue
		}
		seen[normalized] = struct{}{}
		terms = append(terms, QueryTerm{
			Original:   raw,
			Normalized: normalized,
			Sensitive:  Normalize(raw, true),
		})
	}
	return Query{Raw: value, CaseSensitive: caseSensitive, Terms: terms}
}

// GlobalProfile prioritizes names and structure while retaining complete body
// retrieval. The b values keep short title/path fields from being normalized
// as aggressively as prose.
func GlobalProfile() Profile {
	return Profile{
		FieldWeights: [FieldCount]float64{8, 5, 3, 2, 1},
		FieldB:       [FieldCount]float64{0.2, 0.45, 0.2, 0.3, 0.75},
		K1:           1.2,
	}
}

// LinkProfile shares the scorer but strongly favors recognizable note targets.
func LinkProfile() Profile {
	return Profile{
		FieldWeights: [FieldCount]float64{12, 2, 1, 4, 0.25},
		FieldB:       [FieldCount]float64{0.15, 0.35, 0.2, 0.25, 0.75},
		K1:           1.2,
	}
}

// TitleProfile backs the existing explicit Titles filter.
func TitleProfile() Profile {
	return Profile{
		FieldWeights: [FieldCount]float64{1, 0, 0, 0, 0},
		FieldB:       [FieldCount]float64{0.2, 0, 0, 0, 0},
		K1:           1.2,
	}
}

// Score applies the canonical field-frequency aggregation followed by BM25's
// saturation. Prefix and fuzzy quality are deliberate multipliers around the
// scorer rather than hidden changes to BM25F itself.
func Score(document DocumentStats, query Query, variants [][]Variant, corpus CorpusStats, profile Profile) ScoreResult {
	if corpus.DocumentCount <= 0 || len(query.Terms) == 0 {
		return ScoreResult{}
	}
	k1 := profile.K1
	if k1 <= 0 {
		k1 = 1.2
	}
	result := ScoreResult{Terms: make([]string, 0, len(query.Terms))}
	seenTerms := make(map[string]struct{})
	for termIndex := range query.Terms {
		if termIndex >= len(variants) {
			break
		}
		bestScore := 0.0
		bestTerm := ""
		bestTitle := false
		for _, variant := range variants[termIndex] {
			weightedFrequency := 0.0
			titleMatch := false
			for fieldIndex := Field(0); fieldIndex < FieldCount; fieldIndex++ {
				fieldWeight := profile.FieldWeights[fieldIndex]
				if fieldWeight <= 0 {
					continue
				}
				field := document.Fields[fieldIndex]
				frequency := field.Frequency(variant.Term)
				if frequency <= 0 {
					continue
				}
				if fieldIndex == FieldTitle {
					titleMatch = true
				}
				averageLength := corpus.AverageLengths[fieldIndex]
				if averageLength <= 0 {
					averageLength = 1
				}
				b := profile.FieldB[fieldIndex]
				lengthNormalization := 1 - b + b*float64(field.Length)/averageLength
				if lengthNormalization <= 0 {
					lengthNormalization = 1
				}
				weightedFrequency += fieldWeight * float64(frequency) / lengthNormalization
			}
			if weightedFrequency <= 0 {
				continue
			}
			documentFrequency := corpus.DocumentFrequency[variant.Term]
			if documentFrequency <= 0 {
				documentFrequency = 1
			}
			idf := math.Log(1 + (float64(corpus.DocumentCount-documentFrequency)+0.5)/(float64(documentFrequency)+0.5))
			contribution := variant.Weight * idf * (weightedFrequency * (k1 + 1)) / (weightedFrequency + k1)
			if contribution > bestScore {
				bestScore = contribution
				bestTerm = variant.Term
				bestTitle = titleMatch
			}
		}
		if bestScore <= 0 {
			continue
		}
		result.Score += bestScore
		result.MatchedTerms++
		result.TitleMatch = result.TitleMatch || bestTitle
		if _, seen := seenTerms[bestTerm]; !seen {
			seenTerms[bestTerm] = struct{}{}
			result.Terms = append(result.Terms, bestTerm)
		}
	}
	if result.MatchedTerms == 0 {
		return ScoreResult{}
	}
	coverage := float64(result.MatchedTerms) / float64(len(query.Terms))
	result.Score *= 0.7 + 0.3*coverage
	if result.MatchedTerms == len(query.Terms) && len(query.Terms) > 1 {
		result.Score *= 1.15
	}
	return result
}

// UniqueTerms returns a stable union for index contribution updates.
func UniqueTerms(document DocumentStats, fields ...Field) []string {
	termCount := 0
	for _, fieldIndex := range fields {
		if fieldIndex >= FieldCount {
			continue
		}
		termCount += len(document.Fields[fieldIndex].Terms)
	}
	terms := make([]string, 0, termCount)
	for _, fieldIndex := range fields {
		if fieldIndex >= FieldCount {
			continue
		}
		for _, term := range document.Fields[fieldIndex].Terms {
			terms = append(terms, term.Term)
		}
	}
	if len(terms) == 0 {
		return nil
	}
	sort.Strings(terms)
	unique := terms[:1]
	for _, term := range terms[1:] {
		if term != unique[len(unique)-1] {
			unique = append(unique, term)
		}
	}
	return unique
}

// MaxEditDistance deliberately avoids fuzzy matching short terms, for which a
// one-character edit would be too permissive.
func MaxEditDistance(term string) int {
	length := utf8.RuneCountInString(term)
	if length < 4 {
		return 0
	}
	if length < 8 {
		return 1
	}
	return 2
}

// ExactAndPrefixVariants expands only the final in-progress query term. A
// stable cap prevents a one- or two-letter prefix from materializing the whole
// vocabulary before the user finishes typing.
func ExactAndPrefixVariants(term string, vocabulary []string, allowPrefix bool, limit int) []Variant {
	if term == "" {
		return nil
	}
	if limit <= 0 {
		limit = 256
	}
	variants := make([]Variant, 0, min(limit, 16))
	position := sort.SearchStrings(vocabulary, term)
	if position < len(vocabulary) && vocabulary[position] == term {
		variants = append(variants, Variant{Term: term, Kind: MatchExact, Weight: 1})
	}
	if !allowPrefix || utf8.RuneCountInString(term) < 2 {
		return variants
	}
	for index := position; index < len(vocabulary) && len(variants) < limit; index++ {
		candidate := vocabulary[index]
		if !strings.HasPrefix(candidate, term) {
			break
		}
		if candidate == term {
			continue
		}
		variants = append(variants, Variant{Term: candidate, Kind: MatchPrefix, Weight: 0.72})
	}
	return variants
}

// FuzzyVariants finds a small deterministic correction set. Document
// frequency breaks equal-distance ties so suggestions prefer useful vault
// vocabulary over obscure one-off tokens.
func FuzzyVariants(term string, vocabulary []string, documentFrequency map[string]int, limit int) []Variant {
	maximum := MaxEditDistance(term)
	if maximum == 0 {
		return nil
	}
	if limit <= 0 {
		limit = 8
	}
	variants := make([]Variant, 0, limit)
	for _, candidate := range vocabulary {
		if candidate == term || strings.HasPrefix(candidate, term) {
			continue
		}
		distance := BoundedEditDistance(term, candidate, maximum)
		if distance > maximum {
			continue
		}
		weight := 0.52
		if distance > 1 {
			weight = 0.34
		}
		variants = append(variants, Variant{
			Term: candidate, Kind: MatchFuzzy, Distance: distance, Weight: weight,
		})
	}
	sort.Slice(variants, func(i, j int) bool {
		if variants[i].Distance != variants[j].Distance {
			return variants[i].Distance < variants[j].Distance
		}
		leftFrequency := documentFrequency[variants[i].Term]
		rightFrequency := documentFrequency[variants[j].Term]
		if leftFrequency != rightFrequency {
			return leftFrequency > rightFrequency
		}
		return variants[i].Term < variants[j].Term
	})
	if len(variants) > limit {
		variants = variants[:limit]
	}
	return variants
}

// BoundedEditDistance computes Levenshtein distance and stops once a match is
// known to be outside the caller's useful range.
func BoundedEditDistance(left, right string, maximum int) int {
	leftRunes := []rune(left)
	rightRunes := []rune(right)
	if difference := len(leftRunes) - len(rightRunes); difference > maximum || difference < -maximum {
		return maximum + 1
	}
	previous := make([]int, len(rightRunes)+1)
	current := make([]int, len(rightRunes)+1)
	for index := range previous {
		previous[index] = index
	}
	for leftIndex, leftRune := range leftRunes {
		current[0] = leftIndex + 1
		rowMinimum := current[0]
		for rightIndex, rightRune := range rightRunes {
			cost := 0
			if leftRune != rightRune {
				cost = 1
			}
			deletion := previous[rightIndex+1] + 1
			insertion := current[rightIndex] + 1
			substitution := previous[rightIndex] + cost
			current[rightIndex+1] = min(deletion, insertion, substitution)
			rowMinimum = min(rowMinimum, current[rightIndex+1])
		}
		if rowMinimum > maximum {
			return maximum + 1
		}
		previous, current = current, previous
	}
	return previous[len(rightRunes)]
}

// AnalyzeMatchingCase retains lower/accent-folded index keys only when their
// original spelling satisfies the case-sensitive query. It keeps case mode a
// query-time cost instead of duplicating the complete index.
func AnalyzeMatchingCase(value string, query Query, variants [][]Variant) FieldStats {
	lowerTokens := Tokens(value, false)
	sensitiveTokens := Tokens(value, true)
	counts := make(map[string]int)
	for tokenIndex, lowerToken := range lowerTokens {
		if tokenIndex >= len(sensitiveTokens) {
			break
		}
		sensitiveToken := sensitiveTokens[tokenIndex]
		matched := false
		for queryIndex, queryTerm := range query.Terms {
			if queryIndex >= len(variants) {
				break
			}
			for _, variant := range variants[queryIndex] {
				if variant.Term != lowerToken {
					continue
				}
				switch variant.Kind {
				case MatchExact:
					matched = sensitiveToken == queryTerm.Sensitive
				case MatchPrefix:
					matched = strings.HasPrefix(sensitiveToken, queryTerm.Sensitive)
				case MatchFuzzy:
					matched = BoundedEditDistance(sensitiveToken, queryTerm.Sensitive, variant.Distance) <= variant.Distance
				}
				if matched {
					break
				}
			}
			if matched {
				break
			}
		}
		if matched {
			counts[lowerToken]++
		}
	}
	terms := make([]TermFrequency, 0, len(counts))
	for term, count := range counts {
		terms = append(terms, TermFrequency{Term: term, Count: count})
	}
	sort.Slice(terms, func(i, j int) bool { return terms[i].Term < terms[j].Term })
	return FieldStats{Length: len(lowerTokens), Terms: terms}
}

func lineMatch(line string, query Query, variants [][]Variant) (float64, []string) {
	field := Analyze(line, false)
	if query.CaseSensitive {
		field = AnalyzeMatchingCase(line, query, variants)
	}
	score := 0.0
	matched := make([]string, 0, len(query.Terms))
	for queryIndex, queryTerm := range query.Terms {
		bestWeight := 0.0
		bestTerm := ""
		if queryIndex < len(variants) {
			for _, variant := range variants[queryIndex] {
				if field.Frequency(variant.Term) > 0 && variant.Weight > bestWeight {
					bestWeight = variant.Weight
					bestTerm = variant.Term
				}
			}
		}
		if bestWeight == 0 {
			foldedLine := Normalize(line, query.CaseSensitive)
			needle := queryTerm.Normalized
			if query.CaseSensitive {
				needle = queryTerm.Sensitive
			}
			if needle != "" && strings.Contains(foldedLine, needle) {
				bestWeight = 0.35
				bestTerm = queryTerm.Normalized
			}
		}
		if bestWeight > 0 {
			score += 10 + bestWeight
			matched = append(matched, bestTerm)
		}
	}
	if score > 0 && strings.HasPrefix(strings.TrimSpace(line), "#") {
		score += 0.5
	}
	return score, matched
}

// BestPassage selects the line with the greatest query-term coverage rather
// than the earliest matching line. MatchingLines remains exact for the result
// metadata and navigation contract.
func BestPassage(content string, query Query, variants [][]Variant) Passage {
	best := Passage{}
	bestScore := 0.0
	for lineNumber, lineStart := 1, 0; ; lineNumber++ {
		lineEnd := strings.IndexByte(content[lineStart:], '\n')
		line := content[lineStart:]
		if lineEnd >= 0 {
			line = content[lineStart : lineStart+lineEnd]
		}
		score, terms := lineMatch(line, query, variants)
		if score > 0 {
			best.MatchingLines++
			if score > bestScore {
				bestScore = score
				best.Line = lineNumber
				best.Text = strings.TrimSpace(line)
				best.Terms = terms
			}
		}
		if lineEnd < 0 {
			break
		}
		lineStart += lineEnd + 1
	}
	return best
}

// ExtractMarkdownHeadings returns searchable heading labels while excluding
// frontmatter and fenced examples.
func ExtractMarkdownHeadings(content string) string {
	lines := strings.Split(content, "\n")
	frontmatter := len(lines) > 0 && strings.TrimSpace(strings.TrimSuffix(lines[0], "\r")) == "---"
	fenceCharacter := byte(0)
	headings := make([]string, 0)
	for index, rawLine := range lines {
		line := strings.TrimSuffix(rawLine, "\r")
		trimmed := strings.TrimSpace(line)
		if frontmatter {
			if index > 0 && (trimmed == "---" || trimmed == "...") {
				frontmatter = false
			}
			continue
		}
		if strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~") {
			current := trimmed[0]
			if fenceCharacter == 0 {
				fenceCharacter = current
			} else if fenceCharacter == current {
				fenceCharacter = 0
			}
			continue
		}
		if fenceCharacter != 0 {
			continue
		}
		if strings.HasPrefix(trimmed, "#") {
			markerEnd := 0
			for markerEnd < len(trimmed) && markerEnd < 6 && trimmed[markerEnd] == '#' {
				markerEnd++
			}
			if markerEnd > 0 && markerEnd < len(trimmed) && (trimmed[markerEnd] == ' ' || trimmed[markerEnd] == '\t') {
				label := strings.TrimSpace(strings.TrimRight(strings.TrimSpace(trimmed[markerEnd:]), "#"))
				if label != "" {
					headings = append(headings, label)
				}
				continue
			}
		}
		if trimmed != "" && index+1 < len(lines) {
			underline := strings.TrimSpace(strings.TrimSuffix(lines[index+1], "\r"))
			if len(underline) >= 1 && (allRune(underline, '=') || allRune(underline, '-')) {
				headings = append(headings, trimmed)
			}
		}
	}
	return strings.Join(headings, "\n")
}

func allRune(value string, wanted rune) bool {
	if value == "" {
		return false
	}
	for _, current := range value {
		if current != wanted {
			return false
		}
	}
	return true
}
