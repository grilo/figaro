package grammar

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// The independently reviewed minimal pairs also run at the pure boundary. The
// parent adapter suite separately verifies native coordinates and bridge JSON.
func TestReviewedPureGrammarCorpus(t *testing.T) {
	data, err := os.ReadFile("../../../tests/fixtures/writing-grammar.json")
	if err != nil {
		t.Fatal(err)
	}
	type example struct {
		Source, Actual string
		Replacements   []string
	}
	var rows []struct {
		Rule, Source, Actual string
		Replacements, Valid  []string
		Additional           []example
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		t.Fatal(err)
	}
	lex := testLexicon(t)
	for _, row := range rows {
		rule, ok := strings.CutPrefix(row.Rule, "FigaroGrammar.")
		if !ok {
			continue
		}
		t.Run(rule, func(t *testing.T) {
			examples := append([]example{{row.Source, row.Actual, row.Replacements}}, row.Additional...)
			for _, e := range examples {
				got, err := lex.Analyze(e.Source)
				if err != nil {
					t.Fatal(err)
				}
				count := 0
				for _, f := range got {
					if f.Rule != rule {
						continue
					}
					count++
					replacement := ""
					if len(e.Replacements) > 0 {
						replacement = e.Replacements[0]
					}
					if f.Actual != e.Actual || f.Replacement != replacement || string([]rune(e.Source)[f.From:f.To]) != f.Actual {
						t.Errorf("%q: %+v", e.Source, f)
					}
				}
				if count != 1 || len(got) != 1 {
					t.Errorf("%q: expected one %s, got %+v", e.Source, rule, got)
				}
				for _, f := range got {
					if f.Replacement == "" {
						continue
					}
					runes := []rune(e.Source)
					corrected := string(runes[:f.From]) + f.Replacement + string(runes[f.To:])
					if after, err := lex.Analyze(corrected); err != nil || len(after) > 0 {
						t.Errorf("correction %q: %+v %v", corrected, after, err)
					}
				}
			}
			for _, valid := range row.Valid {
				if got, err := lex.Analyze(valid); err != nil || len(got) > 0 {
					t.Errorf("valid %q: %+v %v", valid, got, err)
				}
			}
		})
	}
}

func TestGrammarAdvisoryBoundariesAndAuthoredStyle(t *testing.T) {
	lex := testLexicon(t)
	for _, c := range []struct{ source, rule, actual, replacement string }{
		{"Your welcome. It’s fine.", "YourPredicateAdjective", "Your", "You’re"},
		{"YOUR WELCOME.", "YourPredicateAdjective", "YOUR", "YOU'RE"},
		{"We let her to\nhelp.", "LetToDo", "to", ""},
		{"We will can go.", "DoubleModal", "will can", ""},
	} {
		got, err := lex.Analyze(c.source)
		if err != nil || len(got) != 1 || got[0].Rule != c.rule || got[0].Actual != c.actual || got[0].Replacement != c.replacement {
			t.Errorf("%q: %+v %v", c.source, got, err)
		}
	}
	for _, source := range []string{"Your ￼ welcome.", "Its\n\nraining.", "We let her to. Help us.", "There is ￼ two problems.", "one of the car park", "one of the really incredibly big red rubber ball", "one of the process main thread"} {
		if got, err := lex.Analyze(source); err != nil || len(got) > 0 {
			t.Errorf("boundary %q: %+v %v", source, got, err)
		}
	}
}

func TestBroadGrammarPreservesLiteralAndClauseBoundaries(t *testing.T) {
	lex := testLexicon(t)
	for _, source := range []string{
		"Please bare ￼ in mind the deadline.", "Please bare\n\nin mind the deadline.",
		"The case and point buttons are ready.", "Step back and call me.",
		"We need more better-trained nurses.", "Use item_21th and 21th_value.",
		"The label is version/21th.", "Use x,y coordinates.",
		"The number is 3,14159.", "The imaginary unit i is useful.",
		"Since five years is a long time, we should act.",
	} {
		if got, err := lex.Analyze(source); err != nil || len(got) > 0 {
			t.Errorf("boundary %q: %+v %v", source, got, err)
		}
	}
	for _, source := range []string{"Please bare in\nmind the deadline.", "We booked a 3\nday course."} {
		got, err := lex.Analyze(source)
		if err != nil || len(got) != 1 || got[0].Replacement != "" {
			t.Errorf("multi-line advice %q: %+v %v", source, got, err)
		}
	}
}

func TestSplitWordCorrectionKeepsOtherAgreementOccurrences(t *testing.T) {
	source := "She miss understood the instructions. They goes home."
	got, err := testLexicon(t).Analyze(source)
	if err != nil || len(got) != 2 {
		t.Fatalf("%+v %v", got, err)
	}
	if got[0].Rule != "Misunderstood" || got[0].Replacement != "misunderstood" || got[1].Rule != "PronounVerbAgreement" || got[1].Replacement != "go" {
		t.Fatalf("unrelated grammar changed: %+v", got)
	}
	for _, finding := range got {
		if string([]rune(source)[finding.From:finding.To]) != finding.Actual {
			t.Errorf("wrong source position: %+v", finding)
		}
	}
}

func TestBroadGrammarRepeatedUnicodeOffsetsAndWorkLimit(t *testing.T) {
	lex := testLexicon(t)
	source := strings.Repeat("😀 Please bare in mind. Café,mañana. ", 400)
	got, err := lex.Analyze(source)
	if err != nil || len(got) != 800 {
		t.Fatalf("findings %d: %v", len(got), err)
	}
	previous := -1
	runes := []rune(source)
	for _, finding := range got {
		if finding.From < previous || string(runes[finding.From:finding.To]) != finding.Actual {
			t.Fatalf("wrong repeated position: %+v", finding)
		}
		previous = finding.From
	}
	// The phrase index adds work without bypassing the existing explicit cap.
	if _, err := lex.Analyze(strings.Repeat("i went,home. ", MaxFindings/2+1)); err != ErrWorkLimit {
		t.Fatal("missing grammar work limit", err)
	}
}

func TestUsageGrammarLiteralProtectedAndClauseBoundaries(t *testing.T) {
	lex := testLexicon(t)
	for _, source := range []string{
		"She is good ￼ in swimming.", "She is good\n\nin swimming.",
		"The chairs ￼ is ready.", "The chairs. Is it ready?",
		"We need fewer ￼ time.", "We waited for along. Time passed.",
		"Suffice to say, we left.", "None the less, we continued.",
		"I crave for peace.", "She is fed up of waiting.",
		"The team's commitment towards equality is clear.",
	} {
		if got, err := lex.Analyze(source); err != nil || len(got) > 0 {
			t.Errorf("valid boundary %q: %+v %v", source, got, err)
		}
	}
	for _, c := range []struct{ source, actual, replacement string }{
		{"We waited for along\ntime.", "for", ""},
		{"LETS GO HOME.", "LETS", ""}, // Uppercase following words are ambiguous names/labels.
		{"Lets go home. It’s late.", "Lets", "Let’s"},
	} {
		got, err := lex.Analyze(c.source)
		if c.replacement == "" && c.actual == "LETS" {
			if err != nil || len(got) != 0 {
				t.Errorf("label: %+v %v", got, err)
			}
			continue
		}
		if err != nil || len(got) != 1 || got[0].Actual != c.actual || got[0].Replacement != c.replacement {
			t.Errorf("style %q: %+v %v", c.source, got, err)
		}
	}
}

func TestUsageGrammarPrioritiesRepeatedUnicodeAndWorkLimit(t *testing.T) {
	lex := testLexicon(t)
	source := "😀 He seam to understand. He dose not know. They goes home."
	got, err := lex.Analyze(source)
	if err != nil || len(got) != 3 || got[0].Rule != "SeamToSeem" || got[1].Rule != "DoesOrDose" || got[2].Rule != "PronounVerbAgreement" {
		t.Fatalf("conflicting or missing corrections: %+v %v", got, err)
	}
	source = strings.Repeat("😀 The spare chairs is ready. We need fewer time. ", 300)
	got, err = lex.Analyze(source)
	if err != nil || len(got) != 600 {
		t.Fatalf("repeated usage: %d %v", len(got), err)
	}
	previous := -1
	for _, f := range got {
		if f.From <= previous || string([]rune(source)[f.From:f.To]) != f.Actual {
			t.Fatalf("incorrect Unicode position: %+v", f)
		}
		previous = f.From
	}
	if _, err := lex.Analyze(strings.Repeat("We need fewer time. ", MaxFindings+1)); err != ErrWorkLimit {
		t.Fatal("usage grammar bypassed work limit", err)
	}
}
