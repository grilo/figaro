package search

import (
	"math"
	"reflect"
	"sort"
	"strings"
	"testing"
)

func TestNormalizeAndParseQueryIgnoreAccentsAndRepeatedTerms(t *testing.T) {
	if got, want := Normalize("CAFÉ déjà", false), "cafe deja"; got != want {
		t.Fatalf("Normalize() = %q, want %q", got, want)
	}
	query := ParseQuery("Café cafe ROAD", true)
	if got, want := query.Terms, []QueryTerm{
		{Original: "Café", Normalized: "cafe", Sensitive: "Cafe"},
		{Original: "ROAD", Normalized: "road", Sensitive: "ROAD"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("ParseQuery() terms = %#v, want %#v", got, want)
	}
}

func TestAnalyzeNormalizedMatchesUnicodeTokenAnalysis(t *testing.T) {
	value := "Café release_2 東京 １２"
	if got, want := AnalyzeNormalized(Normalize(value, false)), Analyze(value, false); !reflect.DeepEqual(got, want) {
		t.Fatalf("AnalyzeNormalized() = %#v, want %#v", got, want)
	}
}

func TestScoreUsesFieldWeightsSaturationAndCoverage(t *testing.T) {
	query := ParseQuery("release checklist", false)
	variants := [][]Variant{
		{{Term: "release", Kind: MatchExact, Weight: 1}},
		{{Term: "checklist", Kind: MatchExact, Weight: 1}},
	}
	corpus := CorpusStats{
		DocumentCount:     3,
		AverageLengths:    [FieldCount]float64{2, 3, 2, 3, 6},
		DocumentFrequency: map[string]int{"release": 2, "checklist": 2},
	}
	titleDocument := DocumentStats{}
	titleDocument.Fields[FieldTitle] = Analyze("Release Checklist", false)
	titleDocument.Fields[FieldBody] = Analyze("ordinary prose", false)
	bodyDocument := DocumentStats{}
	bodyDocument.Fields[FieldTitle] = Analyze("Meeting", false)
	bodyDocument.Fields[FieldBody] = Analyze("release checklist release checklist release checklist", false)

	titleScore := Score(titleDocument, query, variants, corpus, GlobalProfile())
	bodyScore := Score(bodyDocument, query, variants, corpus, GlobalProfile())
	if titleScore.Score <= bodyScore.Score {
		t.Fatalf("title score %.4f must exceed repeated body score %.4f", titleScore.Score, bodyScore.Score)
	}
	if !titleScore.TitleMatch || titleScore.MatchedTerms != 2 {
		t.Fatalf("title score explanation = %#v", titleScore)
	}
	if math.IsNaN(titleScore.Score) || math.IsInf(titleScore.Score, 0) {
		t.Fatalf("invalid score %v", titleScore.Score)
	}
}

func TestBoundedEditDistanceAndThresholdStayConservative(t *testing.T) {
	if got := MaxEditDistance("cat"); got != 0 {
		t.Fatalf("short term distance = %d, want 0", got)
	}
	if got := MaxEditDistance("deploymnet"); got != 2 {
		t.Fatalf("long term distance = %d, want 2", got)
	}
	if got := BoundedEditDistance("deploymnet", "deployment", 2); got != 2 {
		t.Fatalf("transposition distance = %d, want 2", got)
	}
	if got := BoundedEditDistance("release", "unrelated", 2); got <= 2 {
		t.Fatalf("unrelated distance = %d, want outside bound", got)
	}
}

func TestVariantExpansionOrdersExactPrefixAndUsefulFuzzyTerms(t *testing.T) {
	vocabulary := []string{"deploy", "deployment", "enjoyment", "release"}
	exactAndPrefix := ExactAndPrefixVariants("deploy", vocabulary, true, 10)
	if got, want := exactAndPrefix, []Variant{
		{Term: "deploy", Kind: MatchExact, Weight: 1},
		{Term: "deployment", Kind: MatchPrefix, Weight: 0.72},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("ExactAndPrefixVariants() = %#v, want %#v", got, want)
	}
	fuzzy := FuzzyVariants("relese", vocabulary, map[string]int{"release": 9}, 3)
	if len(fuzzy) != 1 || fuzzy[0].Term != "release" || fuzzy[0].Kind != MatchFuzzy {
		t.Fatalf("FuzzyVariants() = %#v", fuzzy)
	}
}

func TestBestPassagePrefersLineContainingMoreQueryTerms(t *testing.T) {
	query := ParseQuery("release checklist", false)
	variants := [][]Variant{
		{{Term: "release", Kind: MatchExact, Weight: 1}},
		{{Term: "checklist", Kind: MatchExact, Weight: 1}},
	}
	passage := BestPassage("release mentioned first\nThe release checklist is ready\nchecklist again", query, variants)
	if passage.Line != 2 || passage.Text != "The release checklist is ready" || passage.MatchingLines != 3 {
		t.Fatalf("BestPassage() = %#v", passage)
	}
}

func TestAnalyzeMatchingCaseFiltersInsensitiveCandidates(t *testing.T) {
	query := ParseQuery("Release", true)
	variants := [][]Variant{{{Term: "release", Kind: MatchExact, Weight: 1}}}
	field := AnalyzeMatchingCase("release Release RELEASE", query, variants)
	if got := field.Frequency("release"); got != 1 {
		t.Fatalf("case-sensitive frequency = %d, want 1", got)
	}
}

func TestExtractMarkdownHeadingsSkipsFrontmatterAndFences(t *testing.T) {
	source := "---\ntitle: Hidden\n---\n# Release Plan\nText\nSetext title\n---\n```md\n# Example\n```"
	if got, want := ExtractMarkdownHeadings(source), "Release Plan\nSetext title"; got != want {
		t.Fatalf("ExtractMarkdownHeadings() = %q, want %q", got, want)
	}
}

// BestPassage is the reference: it normalizes, tokenizes and counts each line.
// The index-backed variant must choose the same line, excerpt, terms and count.
func TestBestPassageNormalizedAgreesWithBestPassage(t *testing.T) {
	documents := []string{
		"",
		"release mentioned first\nThe release checklist is ready\nchecklist again",
		"# Release plan\n\nThe RELEASE is planned.\r\nA café résumé for the release_notes file.\r\n",
		"Übergröße naïve façade\n\tindented release42 and 42release\nrelease-candidate; pre-release\n",
		"no terms here\n\n\n   \nstill nothing",
		"prerelease only as a substring\nunreleased too\n## Heading with checklist",
		"snake_case_release and release_ and _release\nRelease, release. (release) [release]\n",
		"ﬁnal ligature ﬁle and ｆｕｌｌwidth ｒｅｌｅａｓｅ\nDž digraph and İstanbul release\n",
		strings.Repeat("filler line without the word\n", 40) + "the release checklist\n" + strings.Repeat("release again\n", 3),
	}
	vocabularyFor := func(content string) []string {
		seen := map[string]struct{}{}
		for _, token := range Tokens(content, false) {
			seen[token] = struct{}{}
		}
		vocabulary := make([]string, 0, len(seen))
		for token := range seen {
			vocabulary = append(vocabulary, token)
		}
		sort.Strings(vocabulary)
		return vocabulary
	}
	queries := []string{"release", "release checklist", "rel", "a", "cafe resume", "check", "relaese", "42", "release_notes", "file", "the", "istanbul", "c++ release", "zzz"}

	for documentIndex, content := range documents {
		normalized := Normalize(content, false)
		vocabulary := vocabularyFor(content)
		frequency := map[string]int{}
		for _, token := range vocabulary {
			frequency[token] = 1
		}
		for _, raw := range queries {
			query := ParseQuery(raw, false)
			variantSets := map[string][][]Variant{"none": make([][]Variant, len(query.Terms)), "expanded": make([][]Variant, len(query.Terms))}
			for termIndex, term := range query.Terms {
				expanded := ExactAndPrefixVariants(term.Normalized, vocabulary, termIndex == len(query.Terms)-1, 256)
				expanded = append(expanded, FuzzyVariants(term.Normalized, vocabulary, frequency, 8)...)
				// A repeated, a weightless and a never-tokenized variant must not change the answer.
				expanded = append(expanded, Variant{Term: term.Normalized, Kind: MatchExact, Weight: 0},
					Variant{Term: "re-lease", Kind: MatchFuzzy, Weight: 0.9}, Variant{Term: term.Normalized, Kind: MatchPrefix, Weight: 0.2})
				variantSets["expanded"][termIndex] = expanded
			}
			variantSets["short"] = variantSets["expanded"][:len(query.Terms)/2]
			for name, variants := range variantSets {
				want := BestPassage(content, query, variants)
				got := BestPassageNormalized(content, normalized, query, variants)
				if !reflect.DeepEqual(got, want) {
					t.Fatalf("document %d, query %q, %s variants:\n got %#v\nwant %#v", documentIndex, raw, name, got, want)
				}
			}
		}
	}
}

func TestBestPassageNormalizedFallsBackWhenItCannotUseTheFoldedText(t *testing.T) {
	content := "Release notes\nthe release"
	sensitive := ParseQuery("Release", true)
	variants := [][]Variant{{{Term: "release", Kind: MatchExact, Weight: 1}}}
	if got, want := BestPassageNormalized(content, Normalize(content, false), sensitive, variants), BestPassage(content, sensitive, variants); !reflect.DeepEqual(got, want) {
		t.Fatalf("case-sensitive passage = %#v, want %#v", got, want)
	}
	insensitive := ParseQuery("release", false)
	// A folded text with a different line structure is never trusted.
	if got, want := BestPassageNormalized(content, "release notes the release", insensitive, variants), BestPassage(content, insensitive, variants); !reflect.DeepEqual(got, want) {
		t.Fatalf("misaligned passage = %#v, want %#v", got, want)
	}
}

func BenchmarkBestPassage(b *testing.B) {
	content := strings.Repeat("The quarterly release checklist is ready for review by the team.\nA line about something else entirely, with café and naïve words.\n", 2000)
	normalized := Normalize(content, false)
	query := ParseQuery("the release", false)
	variants := [][]Variant{{{Term: "the", Kind: MatchExact, Weight: 1}}, {{Term: "release", Kind: MatchExact, Weight: 1}, {Term: "released", Kind: MatchPrefix, Weight: 0.7}}}
	b.Run("reference", func(b *testing.B) {
		for index := 0; index < b.N; index++ {
			BestPassage(content, query, variants)
		}
	})
	b.Run("normalized", func(b *testing.B) {
		for index := 0; index < b.N; index++ {
			BestPassageNormalized(content, normalized, query, variants)
		}
	})
}
