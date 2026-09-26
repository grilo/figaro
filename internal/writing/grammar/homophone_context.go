package grammar

import (
	"strings"
	"unicode"
)

func (s *grammarScan) homophoneSubject(i int) bool {
	if s.subjectPosition(i) {
		return true
	}
	prev := s.at(i, -1).word
	if in(prev, "say says said doubt doubts assumed guessed hoped") {
		return true
	}
	return in(prev, "me you him her us them") && in(s.at(i, -2).word, "tell tells told assure assures assured inform informed")
}

func (s *grammarScan) contractionPredicate(i int) bool {
	if s.possessiveGerundSubject(i) {
		return false
	}
	if s.predicate(i) {
		return true
	}
	if i < 0 || i >= len(s.tokens) {
		return false
	}
	w, next := s.tokens[i].word, s.at(i, 1).word
	for n := 0; n < 3 && in(w, "already really very quite so still never always often usually probably certainly definitely not just totally surprisingly exceptionally absolutely barely far too"); n++ {
		if next == "" {
			return false
		}
		i++
		w, next = s.tokens[i].word, s.at(i, 1).word
	}
	if in(w, "my your his her our their the") {
		head := s.nominalHead(i + 1)
		return head >= 0 && (s.terminal(head) || in(s.at(head, 1).word, "of in on at with for who that"))
	}
	if in(w, "in on at under near inside outside") {
		if w == "on" && next == "the" && s.at(i, 2).word == "way" && s.at(i, 3).word == "to" {
			return in(s.at(i, 4).word, "a an the my your his her our their") && s.terminalNominal(i+5)
		}
		return in(next, "a an the my your his her our their") && s.at(i, 2).word != "" && s.terminalNominal(i+2)
	}
	if in(w, "called named") {
		return next != "" && s.terminal(i+1)
	}
	if in(w, "someone somebody something somewhere nobody nothing anyone anything everything") {
		return s.terminal(i) || in(next, "who that worth safe on to")
	}
	// A proper-name predicate must end before another ordinary noun or verb:
	// "its Katie" is clear, while "its Google integration" is possession.
	if s.tokens[i].actual != w && unicode.IsUpper([]rune(s.tokens[i].actual)[0]) {
		for n := 0; n < 3; n++ {
			if s.terminal(i) {
				return true
			}
			v := s.at(i, 1)
			if v.word == "" || v.actual == v.word {
				return false
			}
			i++
		}
	}
	if in(w, "planning answering") && in(next, "a an the any some no my your his her our their") {
		return s.at(i, 2).word != "" && s.terminalNominal(i+2)
	}
	// “Its not clear who owns it”: an evaluative adjective with a clausal
	// complement. “its clear glass” and “its worth increased” stay possessive.
	if in(w, "clear unclear obvious") {
		return s.terminal(i) || in(next, "who what which whether how why when where if that to")
	}
	if w == "worth" {
		return next == "it" || next != "" && s.lex.words[next]&gerund != 0 && !s.finite(i+1)
	}
	if in(w, "available ready committed dedicated invited tired happy sorry offline online warm cold awake calm brave loyal") {
		return s.terminal(i) || in(next, "until yet now today tonight tomorrow right for")
	}
	return false
}

// A gerund subject can have its own modifiers or objects before the finite
// predicate: "your running today surprised us" does not need "you're".
func (s *grammarScan) possessiveGerundSubject(i int) bool {
	if i < 0 || i >= len(s.tokens) {
		return false
	}
	start := i
	for n := 0; n < 3 && in(s.at(start, i-start).word, "not always never just only"); n++ {
		i++
	}
	word := s.at(start, i-start).word
	if word == "" || s.lex.words[word]&gerund == 0 {
		return false
	}
	// Infinitives and their auxiliary chains belong to the gerund phrase:
	// "going to have been served" still needs a later finite predicate.
	// Keep scanning after the chain for "going to be served surprised us".
	nonfinite := ""
	if in(word, "being having") {
		nonfinite = "participle"
	}
	for n := 1; n <= 8; n++ {
		v := s.at(i, n)
		if v.word == "" || in(v.word, "who that which because although if when where") {
			break
		}
		if v.word == "to" {
			nonfinite = "base"
			continue
		}
		if nonfinite != "" && (v.word == "not" || s.lex.words[v.word]&adverb != 0) {
			continue
		}
		if nonfinite == "base" && (in(v.word, "be have") || s.lex.words[v.word]&base != 0) ||
			nonfinite == "participle" && (v.word == "being" || s.lex.isParticiple(v.word)) {
			nonfinite = ""
			if in(v.word, "be have been being") {
				nonfinite = "participle"
			}
			continue
		}
		nonfinite = ""
		if in(v.word, "am is are was were") || modal(v.word) || irregularLemmas[v.word] != "" || strings.HasSuffix(v.word, "ed") && s.lex.lemma(v.word) != "" {
			return true
		}
	}
	return false
}

func (s *grammarScan) terminalNominal(start int) bool {
	head := s.nominalHead(start)
	for n := 0; head >= 0 && n < 5; n++ {
		if s.terminal(head) {
			return true
		}
		v := s.at(head, 1)
		if in(v.word, "now already today tonight") && s.terminal(head+1) {
			return true
		}
		if v.word == "" || s.finite(head+1) || s.lex.words[v.word]&(singularNoun|pluralNoun) == 0 {
			break
		}
		head++
	}
	return false
}

func (s *grammarScan) existentialNoun(i int) bool {
	if i < 0 || i >= len(s.tokens) {
		return false
	}
	cue := s.tokens[i].word
	if numberCue(cue) != 0 || in(cue, "no any some more enough") {
		i++
	}
	w := s.at(i, 0).word
	if w == "" || !s.lower(i) {
		return false
	}
	// Existentials accept indefinite bare plurals and mass nouns. A present
	// participle can also be a noun, but only a reviewed one is admitted here.
	head := s.nominalHead(i)
	if head < 0 && in(w, "warning warnings time changes delays issues fingerprints candles deadlines consequences") {
		head = i
	}
	return head >= 0 && (numberCue(cue) != 0 || in(cue, "no any some more enough") || s.lex.words[w]&pluralNoun != 0 || massUnit(w) != "")
}

func (s *grammarScan) placeEnding(i int) bool {
	return s.terminal(i) || s.followedByComma(i) || in(s.at(i, 1).word, "at on in by after before until again now today yesterday tonight and")
}

func ordinal(word string) bool {
	for _, suffix := range []string{"st", "nd", "rd", "th"} {
		if number, ok := strings.CutSuffix(word, suffix); ok && number != "" {
			for _, c := range number {
				if c < '0' || c > '9' {
					return false
				}
			}
			return true
		}
	}
	return false
}
