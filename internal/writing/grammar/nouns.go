package grammar

import (
	"strconv"
	"strings"
)

func numeric(word string) bool {
	if word == "" {
		return false
	}
	for _, c := range word {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// numberCue is intentionally narrower than number agreement in English.
// “some”, “no”, fractions, measures, collectives and invariant nouns abstain.
func numberCue(word string) int {
	if in(word, "a an one this that each every") {
		return 1
	}
	if in(word, "two three four five six seven eight nine ten eleven twelve these those many several few both") {
		return 2
	}
	if numeric(word) {
		if n, err := strconv.Atoi(word); err == nil && n > 1 {
			return 2
		}
		if word == "1" {
			return 1
		}
	}
	return 0
}

func (s *grammarScan) nounConstructions(i int) {
	t := s.tokens[i]
	if t.word == "amount" && s.at(i, 1).word == "of" && in(s.at(i, 2).word, "times attempts retries files documents items records errors requests") {
		// Count only discrete reviewed heads; keep measured amounts and noun
		// modifiers such as “amount of error correction” outside this decision.
		head := s.at(i, 2)
		next := s.at(i, 3).word
		boundary := in(next, "per to in on for from with without before after during between") || s.finite(i+3)
		if !in(next, "and or nor") && (boundary || s.lex.words[next]&(noun|adjective) == 0) {
			first, replacement := i, "number of "+head.actual
			if s.at(i, -1).word == "an" {
				first, replacement = i-1, "a "+replacement
			}
			s.emit("CountableAmount", "Use “number” for these individually countable items.", first, i+2, replacement)
		}
	}
	if t.word == "there" || t.word == "there's" {
		verb, start := i+1, i+2
		if t.word == "there's" {
			verb, start = i, i+1
		}
		if s.at(i, -1).word == "is" || s.at(i, -1).word == "are" {
			verb, start = i-1, i+1
			if !s.initial(verb) {
				start = len(s.tokens)
			}
		} else if !s.subjectPosition(i) {
			start = len(s.tokens)
		}
		if start < len(s.tokens) && s.at(i, start-i).word != "" && in(s.tokens[verb].word, "is are was were there's") {
			head := s.nominalHead(start + 1)
			cue := numberCue(s.tokens[start].word)
			if cue == 0 && s.lex.words[s.tokens[start].word]&pluralNoun != 0 {
				head, cue = start, 2
			}
			if head >= 0 && cue != 0 && s.at(start, head-start).word != "" {
				w := s.tokens[head].word
				labels := s.lex.words[w]
				ambiguous := in(w, "series species means fish sheep deer police staff team family group lot number couple pair majority minority percent cent dollars pounds years miles hours minutes") || massUnit(w) != ""
				for k := head + 1; k <= head+3; k++ {
					if in(s.at(head, k-head).word, "and or nor") {
						ambiguous = true
					}
				}
				if !ambiguous && (cue == 2 && labels&pluralNoun != 0 || cue == 1 && labels&singularNoun != 0 && labels&pluralNoun == 0) {
					v, replacement := s.tokens[verb].word, ""
					if cue == 2 {
						replacement = map[string]string{"is": "are", "was": "were", "there's": "there are"}[v]
					}
					if cue == 1 && (v != "were" || s.initial(i)) {
						replacement = map[string]string{"are": "is", "were": "was"}[v]
					}
					if replacement != "" {
						s.emit("ThereIsAgreement", "Match the existential verb to the clearly singular or plural noun phrase.", verb, verb, replacement)
					}
				}
			}
		}
	}
	if t.word == "one" && s.at(i, 1).word == "of" && s.at(i, 2).word == "the" {
		head := s.nominalHead(i + 3)
		// The first noun can modify a later noun ("car park", "rubber
		// ball"). Without a complete phrase parse, do not pluralize that modifier.
		compound := head >= 0 && s.lex.words[s.at(head, 1).word]&(noun|adjective) != 0
		if head >= 0 && !compound && s.at(i, head-i).word != "" {
			w := s.tokens[head].word
			if !in(w, "team staff crew family class group government public police press media series species fish sheep deer") && massUnit(w) == "" {
				if plural := s.lex.plural(w); plural != "" {
					s.emit("OneOfTheSingular", "Use a plural noun for the group after “one of the”.", head, head, plural)
				}
			}
		}
	}
	count := numberCue(s.at(i, -1).word)
	if s.at(i, -1).word == "another" {
		count = 1
	}
	modifier := s.lex.words[s.at(i, 1).word]&(singularNoun|pluralNoun) != 0 && !s.finite(i+1)
	// The mass noun can modify a participial compound: a software rendered
	// game, an information based system. Its article belongs to the final noun.
	modifier = modifier || s.lex.isParticiple(s.at(i, 1).word) && s.lex.words[s.at(i, 2).word]&(singularNoun|pluralNoun) != 0 && !s.finite(i+2)
	if unit := massUnit(t.word); unit != "" && s.lower(i) && count != 0 && !in(s.at(i, -1).word, "this that") && !modifier {
		prev := s.at(i, -1)
		if count == 1 {
			determiner := prev.actual
			if in(prev.word, "a an") {
				determiner = "a"
				if unit == "item" {
					determiner = "an"
				}
			}
			s.emit("MassNouns", "This noun is normally uncountable. Use a countable unit when referring to one or more items.", i-1, i, determiner+" "+unit+" of "+t.actual)
		} else {
			s.emit("MassNouns", "Use a countable unit before this uncountable noun.", i, i, unit+"s of "+t.actual)
		}
	}
	if stem, ok := strings.CutSuffix(t.word, "s"); ok && massUnit(stem) != "" && s.lower(i) {
		prev := s.at(i, -1).word
		if numberCue(prev) != 0 || in(prev, "some much my your our their his her its more less useful helpful important unnecessary available bad good need needs needed provide provides provided received receive") {
			unit := massUnit(stem)
			if numberCue(prev) != 1 {
				unit += "s"
			}
			s.emit("MassNouns", "Use a countable unit rather than pluralizing this uncountable noun.", i, i, unit+" of "+stem)
		}
	}
	if in(t.word, "criterion criteria phenomenon phenomena") {
		cue := numberCue(s.at(i, -1).word)
		if cue == 0 && s.lex.words[s.at(i, -1).word]&adjective != 0 {
			cue = numberCue(s.at(i, -2).word)
		}
		replacement := ""
		if cue == 1 {
			replacement = map[string]string{"criteria": "criterion", "phenomena": "phenomenon"}[t.word]
		}
		if cue == 2 {
			replacement = map[string]string{"criterion": "criteria", "phenomenon": "phenomena"}[t.word]
		}
		if replacement != "" {
			s.emit("CriteriaPhenomena", "Use “criterion/phenomenon” for one and “criteria/phenomena” for more than one.", i, i, replacement)
		}
	}
	if t.word == "elses" && in(s.at(i, -1).word, "someone somebody anyone anybody everyone everybody something anything nobody nothing") && s.nominalHead(i+1) >= 0 && s.at(i, 1).word != "" {
		s.emit("ElsePossessive", "Use the possessive “else’s” before the thing belonging to someone else.", i, i, "else's")
	}
	if len(t.word) == 6 && strings.HasSuffix(t.word, "'s") && numeric(t.word[:4]) && t.word[3] == '0' && in(t.word[:1], "1 2") {
		prev, next := s.at(i, -1).word, s.at(i, 1).word
		if in(prev, "in during throughout through since from until before after the early late mid") && (s.terminal(i) || in(next, "and or to through until were are have saw brought changed gave") || s.followedByComma(i)) {
			s.emit("PluralDecades", "A plural decade takes “s” without an apostrophe. Keep the apostrophe when you intend a possessive.", i, i, t.word[:4]+"s")
		}
	}
}

func massUnit(word string) string {
	if in(word, "advice information info equipment furniture luggage homework software") {
		return "piece"
	}
	if word == "clothing" {
		return "item"
	}
	return ""
}

func (s *grammarScan) followedByComma(i int) bool {
	for _, c := range s.chars[s.tokens[i].to:] {
		if c == ' ' || c == '\t' {
			continue
		}
		return c == ','
	}
	return false
}
