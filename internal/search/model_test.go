package search

import (
	"math"
	"reflect"
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
