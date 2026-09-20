package grammar

import (
	"os"
	"strings"
	"testing"
)

func testLexicon(t *testing.T) Lexicon {
	t.Helper()
	b, err := os.ReadFile("../styles/config/dictionaries/harper.dict")
	if err != nil {
		t.Fatal(err)
	}
	return NewLexicon(string(b))
}
func TestConservativeGrammarCorrections(t *testing.T) {
	lex := testLexicon(t)
	for _, c := range []struct{ source, rule, actual, replacement string }{
		{"He have a pen.", "PronounVerbAgreement", "have", "has"},
		{"She try every day.", "PronounVerbAgreement", "try", "tries"},
		{"It work well.", "PronounVerbAgreement", "work", "works"},
		{"They works together.", "PronounVerbAgreement", "works", "work"},
		{"You has a pen.", "PronounVerbAgreement", "has", "have"},
		{"I does the work.", "PronounVerbAgreement", "does", "do"},
		{"I is here.", "IAmAgreement", "is", "am"},
		{"I are here.", "IAmAgreement", "are", "am"},
		{"She are here.", "PronounInflectionBe", "are", "is"},
		{"He am here.", "PronounInflectionBe", "am", "is"},
		{"We is here.", "PronounInflectionBe", "is", "are"},
		{"You am here.", "PronounInflectionBe", "am", "are"},
		{"They is here.", "PronounInflectionBe", "is", "are"},
		{"I want to went home.", "InflectedVerbAfterTo", "went", "go"},
		{"We need to tries again.", "InflectedVerbAfterTo", "tries", "try"},
		{"She is ready to working.", "InflectedVerbAfterTo", "working", "work"},
		{"I am willing to helped.", "InflectedVerbAfterTo", "helped", "help"},
		{"We could of gone home.", "ModalOf", "of", "have"},
		{"He should of written it.", "ModalOf", "of", "have"},
		{"They would of helped.", "ModalOf", "of", "have"},
		{"I want go home.", "MissingTo", "go", "to go"},
		{"They want be here.", "MissingTo", "be", "to be"},
		{"He wants do the work.", "MissingTo", "do", "to do"},
		{"We want learn more.", "MissingTo", "learn", "to learn"},
	} {
		t.Run(c.source, func(t *testing.T) {
			got, err := lex.Analyze(c.source)
			if err != nil {
				t.Fatal(err)
			}
			if len(got) != 1 || got[0].Rule != c.rule || got[0].Actual != c.actual || got[0].Replacement != c.replacement {
				t.Fatalf("unexpected findings: %+v", got)
			}
			f := got[0]
			runes := []rune(c.source)
			if string(runes[f.From:f.To]) != f.Actual {
				t.Fatal("inexact offsets")
			}
			corrected := string(runes[:f.From]) + f.Replacement + string(runes[f.To:])
			after, err := lex.Analyze(corrected)
			if err != nil || len(after) > 0 {
				t.Fatalf("correction is unstable: %q %+v %v", corrected, after, err)
			}
		})
	}
}
func TestValidAndAmbiguousGrammarIsLeftAlone(t *testing.T) {
	lex := testLexicon(t)
	for _, source := range []string{
		"She goes home.", "They work together.", "He has a pen.", "I have a pen.",
		"Does he go home?", "Did she go home?", "Can it work?", "Will they work?", "May he go home?",
		"I demand that he go home.", "We insist that she be here.", "He and she go home.", "John and I are here.",
		"He, she and I are here.", "I recommend that, in this case, he go home.",
		"She read a book yesterday.", "He put it there.", "It cost too much.", "She hit the ball.", "He cut the paper.",
		"They had worked together.", "If I were you, I would go.", "She was ready.", "I wish he were here.",
		"I want help.", "We need work.", "I want sleep.", "I want Go lessons.", "I need running shoes.",
		"I am used to working.", "We look forward to swimming.", "She is committed to helping.", "The key to growing plants is water.",
		"We should, of course, help.", "We could of course have helped.", "The might of Rome was great.", "The might of fallen empires is remembered.", "The must of aged wine is dark.", "All you need do is ask.", "I need go only once.", "The will of the people matters.",
		"I want\n\ngo home.", "She ￼ go home.", "He. Go home.", "She\n\ngo home.", "I want, go home.",
	} {
		if got, err := lex.Analyze(source); err != nil || len(got) > 0 {
			t.Errorf("false positive on %q: %+v %v", source, got, err)
		}
	}
}
func TestGrammarUnicodeCRLFRepeatAndExplicitWorkLimit(t *testing.T) {
	lex := testLexicon(t)
	source := "😀 Café.\r\nShe go home.\n\nShe go home."
	got, err := lex.Analyze(source)
	if err != nil || len(got) != 2 {
		t.Fatalf("%+v %v", got, err)
	}
	for _, f := range got {
		if string([]rune(source)[f.From:f.To]) != "go" {
			t.Fatal("wrong Unicode range")
		}
	}
	if got[0].From >= got[1].From {
		t.Fatal("repeated matches lost their positions")
	}
	if _, err := lex.Analyze(strings.Repeat("word ", MaxTokens+1)); err != ErrWorkLimit {
		t.Fatal("missing bound", err)
	}
}
