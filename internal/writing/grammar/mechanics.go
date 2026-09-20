package grammar

import (
	"strings"
	"unicode"
)

func (s *grammarScan) mechanics(i int) {
	t := s.tokens[i]
	if len(t.word) > 2 {
		number, suffix := t.word[:len(t.word)-2], t.word[len(t.word)-2:]
		if numeric(number) && in(suffix, "st nd rd th") && !s.identifierEdge(i) {
			correct := "th"
			last := number[len(number)-1]
			teens := len(number) > 1 && number[len(number)-2] == '1'
			if !teens {
				switch last {
				case '1':
					correct = "st"
				case '2':
					correct = "nd"
				case '3':
					correct = "rd"
				}
			}
			if suffix != correct {
				s.emit("CorrectNumberSuffix", "Use the ordinal suffix that matches this number.", i, i, number+correct)
			}
		}
	}
	if t.actual == "i" {
		next, prev := s.at(i, 1).word, s.at(i, -1).word
		position := s.subjectPosition(i) || modal(prev) || in(prev, "do did have had am was")
		predicate := s.lex.words[next]&(base|past|third) != 0 || copular(next) || modal(next) || in(next, "don't didn't haven't hadn't can't couldn't won't wouldn't")
		if position && predicate && !s.identifierEdge(i) && !s.mathematicalPronoun(i) {
			s.emit("CapitalizePersonalPronouns", "Capitalize the first-person pronoun “I”.", i, i, "I")
		}
	}
	if in(t.word, "i'm i'll i've i'd") && strings.HasPrefix(t.actual, "i") {
		s.emit("CapitalizePersonalPronouns", "Capitalize “I” in this contraction.", i, i, "I"+t.actual[1:])
	}
	if numeric(t.word) && s.at(i, 1).word == "day" && in(s.at(i, -1).word, "a an the this that my your his her our their") && !s.followedByHyphen(i+1) {
		head := s.at(i, 2).word
		if in(head, "training working") {
			head = s.at(i, 3).word
		}
		if in(head, "trip course program programme event workshop holiday vacation period stay break tour challenge conference seminar retreat schedule week") {
			s.emit("HyphenateNumberDay", "Join the number and “day” with a hyphen when they modify this noun.", i, i+1, t.actual+"-day")
		}
	}
	if i+1 >= len(s.tokens) {
		return
	}
	next := s.tokens[i+1]
	// Only commas between ordinary words are eligible. Keep numeric
	// separators, single-letter coordinates and authored newlines untouched.
	if len([]rune(t.word)) < 2 || len([]rune(next.word)) < 2 || !lettersAndApostrophes(t.word) || !lettersAndApostrophes(next.word) {
		return
	}
	gap := string(s.chars[t.to:next.from])
	if strings.Count(gap, ",") != 1 || strings.ContainsAny(gap, "\r\n") || strings.Trim(gap, " \t,") != "" {
		return
	}
	comma := strings.IndexByte(gap, ',')
	if comma == 0 && comma+1 < len(gap) {
		return
	}
	s.findings = append(s.findings, Finding{"CommaFixes", "Use no space before this comma and a space after it.", gap, ", ", t.to, next.from})
}

func (s *grammarScan) mathematicalPronoun(i int) bool {
	next := s.at(i, 1).word
	if in(next, "equals divides exceeds") {
		return true
	}
	if be(next) {
		value := s.at(i, 2).word
		if in(value, "a an") {
			value = s.at(i, 3).word
		}
		return numeric(value) || in(value, "integer number variable index negative positive zero even odd undefined null")
	}
	return false
}

func (s *grammarScan) identifierEdge(i int) bool {
	t := s.tokens[i]
	for _, pos := range []int{t.from - 1, t.to} {
		if pos >= 0 && pos < len(s.chars) && (s.chars[pos] == '_' || s.chars[pos] == '/' || s.chars[pos] == '\\') {
			return true
		}
	}
	return false
}

func lettersAndApostrophes(word string) bool {
	for _, c := range word {
		if !unicode.IsLetter(c) && c != '\'' {
			return false
		}
	}
	return true
}
