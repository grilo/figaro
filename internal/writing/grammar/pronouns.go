package grammar

import (
	"strings"
	"unicode"
)

func (s *grammarScan) pronounConstructions(i int) {
	t, next := s.tokens[i], s.at(i, 1)
	if t.word == "me" && s.initial(i) && next.word == "and" {
		name := s.at(i, 2)
		metalinguistic := in(s.at(i, 3).word, "are were") && s.at(i, 4).word == "the" && in(s.at(i, 5).word, "words terms names pronouns")
		if name.word != "" && unicode.IsUpper([]rune(name.actual)[0]) && !pronoun(name.word) && s.subjectVerb(i+3) && !metalinguistic {
			s.emit("SubjectPronoun", "Use “I” in this compound subject and put the other person first.", i, i+2, name.actual+" and I")
		}
	}
	if s.initial(i) && in(t.word, "my your her his their our") {
		head := s.nominalHead(i + 1)
		if head < 0 && t.actual == strings.ToUpper(t.word) && next.word != "" && next.actual == strings.ToUpper(next.word) && s.lex.words[next.word]&(singularNoun|pluralNoun) != 0 {
			head = i + 1
		}
		if head >= 0 && s.at(head, 1).word == "and" && s.at(head, 2).word == "me" && s.subjectVerb(head+3) {
			s.emit("CompoundSubjectI", "Use “I” when this pronoun is part of the subject.", head+2, head+2, "I")
		}
	}
	if s.initial(i) && t.word == "has" && in(next.word, "i you we they") {
		j := i + 2
		if s.at(i, 2).word == "not" {
			j++
		}
		w := s.at(i, j-i).word
		if w != "" && (s.lex.isParticiple(w) || irregularLemmas[w] != "" || in(w, "a an the any some enough")) {
			s.emit("HavePronoun", "Use “have” with this pronoun in a question.", i, i, "have")
		}
	}
	if s.initial(i) && t.word == "do" && next.word == "i" {
		j := i + 2
		if s.at(i, 2).word == "not" {
			j++
		}
		w, after := s.at(i, j-i).word, s.at(i, j-i+1).word
		if in(w, "interested excited tired ready curious comfortable prepared overwhelmed confident available worried annoyed relieved frustrated surprised anxious calm satisfied concerned") && (s.terminal(j) || in(after, "in about after for what to by with that yet now today until") || s.lex.words[after]&gerund != 0) {
			s.emit("DoIAdjective", "Use “am I” when asking whether this description applies to you.", i, i, "am")
		}
	}
	// Keep uncertain point-of-view repairs advisory. Object/subject sequences
	// can introduce clauses ("tell me they left"), and object/object sequences
	// can be grammatical ("give me it"). Repeated identical words have an
	// existing provider, and uppercase IT/US can be ordinary abbreviations.
	if next.word == "" || t.word == next.word || in(t.actual, "IT US") || in(next.actual, "IT US") {
		return
	}
	badPair := pronoun(t.word) && pronoun(next.word) && s.subjectPosition(i)
	badPair = badPair || in(t.word, "my your our their its") && pronoun(next.word)
	if !badPair || i > 0 && in(s.at(i, -1).word, "i you he she it we they my your our their its") {
		return
	}
	last := i + 1
	for n := 0; n < 3 && pronoun(s.at(last, 1).word); n++ {
		last++
	}
	metalinguistic := s.tokens[last].word == "i" && in(s.at(last, 1).word, "statements messages pronouns words")
	if s.subjectVerb(last+1) && !metalinguistic {
		s.emit("MultipleSequentialPronouns", "Review these adjacent pronouns; the intended point of view is unclear.", i, last, "")
	}
}

func (s *grammarScan) subjectVerb(i int) bool {
	return i >= 0 && i < len(s.tokens) && s.at(i, -1).word != "" && (s.finite(i) || s.lex.words[s.tokens[i].word]&base != 0 || irregularLemmas[s.tokens[i].word] != "")
}
