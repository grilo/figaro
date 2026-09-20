package writing

import (
	"crypto/sha256"
	"encoding/json"
	"figaro/internal/writing/grammar"
	"fmt"
	"github.com/vale-cli/vale/v3/embedded"
	"io/fs"
	"os"
	"reflect"
	"strings"
	"testing"
)

type grammarFixture struct {
	Rule, Source, Actual string
	Replacements, Valid  []string
	Additional           []struct {
		Source, Actual string
		Replacements   []string
	}
}

func grammarFixtures(t *testing.T) []grammarFixture {
	t.Helper()
	b, err := os.ReadFile("../../tests/fixtures/writing-grammar.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []grammarFixture
	if err = json.Unmarshal(b, &fixtures); err != nil {
		t.Fatal(err)
	}
	return fixtures
}
func grammarAlerts(t *testing.T, e *Engine, text string) []embedded.Alert {
	t.Helper()
	out, err := e.Analyze("grammar", text)
	if err != nil {
		t.Fatal(err)
	}
	var files map[string][]embedded.Alert
	if err = json.Unmarshal([]byte(out), &files); err != nil {
		t.Fatal(err)
	}
	return files["stdin.txt"]
}
func isGrammarRule(rule string) bool {
	return strings.HasPrefix(rule, "Harper.") || strings.HasPrefix(rule, "FigaroGrammar.")
}
func TestGrammarReviewedPositiveAndValidCorpus(t *testing.T) {
	e, err := Open()
	if err != nil {
		t.Fatal(err)
	}
	defer e.Close()
	for _, f := range grammarFixtures(t) {
		t.Run(f.Rule, func(t *testing.T) {
			cases := append([]struct {
				Source, Actual string
				Replacements   []string
			}{{f.Source, f.Actual, f.Replacements}}, f.Additional...)
			for _, c := range cases {
				for _, prefix := range []string{"", "😀 Café.\r\n"} {
					source := prefix + c.Source
					alerts := grammarAlerts(t, e, source)
					found := 0
					for _, a := range alerts {
						if a.Check != f.Rule {
							if isGrammarRule(a.Check) {
								t.Errorf("competing grammar on %q: %+v", source, a)
							}
							continue
						}
						found++
						if a.Match != c.Actual {
							t.Fatalf("wrong match: %+v", a)
						}
						line := strings.Split(source, "\n")[a.Line-1]
						if string([]rune(line)[a.Span[0]-1:a.Span[1]]) != a.Match {
							t.Fatalf("wrong span: %+v", a)
						}
						if len(c.Replacements) != len(a.Action.Params) || len(c.Replacements) > 0 && !reflect.DeepEqual(a.Action.Params, c.Replacements) {
							t.Fatalf("wrong fixes: %+v", a)
						}
						for _, replacement := range c.Replacements {
							// Apply the returned coordinates, not the first matching
							// substring (the target “me” can follow the word “Some”).
							lines := strings.Split(source, "\n")
							runes := []rune(lines[a.Line-1])
							lines[a.Line-1] = string(runes[:a.Span[0]-1]) + replacement + string(runes[a.Span[1]:])
							corrected := strings.Join(lines, "\n")
							for _, after := range grammarAlerts(t, e, corrected) {
								if isGrammarRule(after.Check) {
									t.Errorf("correction left a grammar warning: %q: %+v", corrected, after)
								}
							}
						}
					}
					if found != 1 {
						t.Fatalf("%q: wanted one %s, got %+v", source, f.Rule, alerts)
					}
				}
			}
			for _, source := range f.Valid {
				for _, a := range grammarAlerts(t, e, source) {
					if isGrammarRule(a.Check) {
						t.Errorf("false positive on %q: %+v", source, a)
					}
				}
			}
		})
	}
}
func TestGrammarLexicalRulesDoNotBridgeProtectedOrParagraphBoundaries(t *testing.T) {
	data, err := bundled.ReadFile("styles/config/dictionaries/harper.dict")
	if err != nil {
		t.Fatal(err)
	}
	lex := grammar.NewLexicon(string(data))
	for _, source := range []string{"She ￼ go home.", "She\n\ngo home.", "I want\n\ngo home.", "I could, of course, go."} {
		f, err := lex.Analyze(source)
		if err != nil || len(f) != 0 {
			t.Fatalf("%q: %+v %v", source, f, err)
		}
	}
	if _, err := lex.Analyze(strings.Repeat("word ", grammar.MaxTokens+1)); err != grammar.ErrWorkLimit {
		t.Fatal("missing explicit work limit", err)
	}
}
func TestGrammarAssetsMatchPinnedManifest(t *testing.T) {
	data, err := bundled.ReadFile("styles/Harper/SOURCE.json")
	if err != nil {
		t.Fatal(err)
	}
	var m struct{ Files map[string]string }
	if err = json.Unmarshal(data, &m); err != nil {
		t.Fatal(err)
	}
	paths, _ := fs.Glob(bundled, "styles/Harper/*.yml")
	ported := 0
	for _, f := range grammarFixtures(t) {
		if strings.HasPrefix(f.Rule, "Harper.") {
			ported++
		}
	}
	if len(paths) != ported {
		t.Fatalf("rule corpus does not cover inventory: %d", len(paths))
	}
	for p, want := range m.Files {
		b, err := bundled.ReadFile("styles/" + p)
		if err != nil {
			t.Fatal(err)
		}
		if got := fmt.Sprintf("%x", sha256.Sum256(b)); got != want {
			t.Errorf("pin changed: %s", p)
		}
	}
}

func TestGrammarProvenanceCoversReviewedGoRules(t *testing.T) {
	data, err := os.ReadFile("grammar/SOURCE.json")
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		PolicyVersion string
		NewRuleIDs    []string
		Reference     struct {
			Version, License  string
			SourceFilesSHA256 map[string]string
		}
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.PolicyVersion != grammar.Version || manifest.Reference.Version == "" || manifest.Reference.License != "Apache-2.0" || len(manifest.Reference.SourceFilesSHA256) == 0 {
		t.Fatal("missing or stale grammar provenance")
	}
	reviewed := map[string]bool{}
	for _, row := range grammarFixtures(t) {
		if name, ok := strings.CutPrefix(row.Rule, "FigaroGrammar."); ok {
			reviewed[name] = true
		}
	}
	for _, name := range []string{"PronounVerbAgreement", "IAmAgreement", "PronounInflectionBe", "InflectedVerbAfterTo", "ModalOf", "MissingTo"} {
		if !reviewed[name] {
			t.Fatalf("missing original grammar corpus: %s", name)
		}
		delete(reviewed, name)
	}
	for _, name := range manifest.NewRuleIDs {
		if !reviewed[name] {
			t.Fatalf("unreviewed or duplicate provenance rule: %s", name)
		}
		delete(reviewed, name)
	}
	if len(reviewed) != 0 {
		t.Fatalf("grammar rules without provenance: %v", reviewed)
	}
}

func TestGrammarBridgeFixturesMatchCurrentNativeEngine(t *testing.T) {
	data, err := os.ReadFile("../../tests/fixtures/writing-grammar-native.json")
	if err != nil {
		t.Fatal(err)
	}
	type sample struct {
		Rule, Name, ProjectionText string
		Native                     map[string][]json.RawMessage
	}
	var fixtures struct{ Fixtures, Probes []sample }
	if err = json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	e, err := Open()
	if err != nil {
		t.Fatal(err)
	}
	defer e.Close()
	for _, s := range append(fixtures.Fixtures, fixtures.Probes...) {
		t.Run(s.Rule+s.Name, func(t *testing.T) {
			output, err := e.Analyze("bridge", s.ProjectionText)
			if err != nil {
				t.Fatal(err)
			}
			var got map[string][]json.RawMessage
			if err = json.Unmarshal([]byte(output), &got); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(canonicalJSONAlerts(got["stdin.txt"]), canonicalJSONAlerts(s.Native["stdin.txt"])) {
				t.Fatalf("native bridge fixture drift: %s", output)
			}
		})
	}
}

func TestGrammarContractionAdviceKeepsOtherOccurrencesAndRules(t *testing.T) {
	correction := embedded.Alert{Check: "FigaroGrammar.TheirToTheyre", Line: 2, Span: []int{5, 9}}
	correction.Action.Name = "replace"
	correction.Action.Params = []string{"they're"}
	matching := embedded.Alert{Check: "Harper.TheMy", Line: 2, Span: []int{5, 13}}
	otherColumn := embedded.Alert{Check: "Harper.TheMy", Line: 2, Span: []int{20, 28}}
	otherLine := embedded.Alert{Check: "Harper.TheMy", Line: 3, Span: []int{5, 13}}
	otherRule := embedded.Alert{Check: "Harper.TheMy2", Line: 2, Span: []int{5, 13}}
	input := []embedded.Alert{matching, otherColumn, otherLine, otherRule, correction}
	if got := mergeGrammarAlerts(input); !reflect.DeepEqual(got, input[1:]) {
		t.Fatalf("unrelated advice was removed: %+v", got)
	}
	correction.Action.Name = ""
	if got := mergeGrammarAlerts([]embedded.Alert{matching, correction}); len(got) != 2 {
		t.Fatal("advice without a correction must remain", got)
	}
}
