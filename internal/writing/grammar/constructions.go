package grammar

import "strings"

func (s *grammarScan) phraseConstructions(i int) {
	t, next := s.tokens[i], s.at(i, 1)
	if in(t.word, "look looks looked looking") && next.word == "forward" && s.at(i, 2).word == "to" {
		verb, after := s.at(i, 3), s.at(i, 4)
		// Work/rest/travel can be nouns after "to". Require a clear verb or
		// a reviewed complement rather than inventing an -ing form for them.
		clear := s.lex.words[verb.word]&noun == 0 || in(verb.word, "see meet hear make receive provide discuss learn") || in(after.word, "with together from you him her us them")
		if clear && !strings.HasSuffix(verb.word, "ing") {
			if replacement := s.lex.ing(verb.word); replacement != "" {
				s.emit("LookingForwardTo", "Use the -ing verb form after “look forward to”.", i+3, i+3, replacement)
			}
		}
	}
	if t.word == "interested" && in(next.word, "on at about with") {
		head := s.at(i, 2).word
		if in(head, "a an the my your his her our their this that") {
			head = s.at(i, 3).word
		}
		// A later time, reason or representative is an adjunct, not the
		// topic: "interested on Monday / at the age of ten / on behalf of".
		if in(head, "music art science history software literature mathematics physics chemistry biology gardening learning programming photography cooking sports politics project proposal idea ideas offer course work research") || s.lex.words[head]&gerund != 0 {
			s.emit("InterestedIn", "Use “interested in” before this topic or activity.", i+1, i+1, "in")
		}
	}
	if t.word == "since" && !s.initial(i) {
		unit := i + 2
		amount := next.word
		if amount == "a" && s.at(i, 2).word == "few" {
			amount, unit = "few", i+3
		}
		if (numeric(amount) || in(amount, "a an one two three four five six seven eight nine ten eleven twelve twenty thirty several few")) && in(s.at(i, unit-i).word, "second seconds minute minutes hour hours day days week weeks month months year years decade decades") {
			after := s.at(unit, 1).word
			if !in(after, "ago old of") && !s.finite(unit+1) {
				s.emit("SinceDuration", "Use “for” with a duration; “since” introduces a starting point.", i, i, "for")
			}
		}
	}
	if in(t.word, "more most") && next.word != "" && !s.followedByHyphen(i+1) {
		labels := s.lex.words[next.word]
		compatible := t.word == "more" && labels&comparative != 0 || t.word == "most" && labels&superlative != 0
		after := s.at(i, 2).word
		// "More cheaper chairs" can count chairs. Only remove "more" in a
		// predicate/comparison, preserving noun modifiers and hyphenated words.
		clear := t.word == "most" || after == "" || in(after, "than to for with at on in because when if")
		if compatible && clear && (next.actual == next.word || next.actual == strings.ToUpper(next.word)) {
			s.emit("AdjectiveDoubleDegree", "This adjective already expresses the comparison; remove the extra degree word.", i, i+1, next.word)
		}
	}
	if t.word == "waist" && next.word == "of" {
		head := s.at(i, 2).word
		if in(head, "my your his her our their its") {
			head = s.at(i, 3).word
		}
		physical := head == "space" && in(s.at(i, 3).word, "suit suits")
		if in(head, "time money effort resources space energy") && !physical {
			s.emit("WaistWaste", "Use “waste” for the careless use of time, money or resources.", i, i, "waste")
		}
	}
	if t.word == "whether" && s.at(i, -1).word == "the" && !s.followedByHyphen(i) {
		weather := in(next.word, "forecast forecasts report reports update updates")
		if next.word == "in" {
			for offset := 2; offset <= 6; offset++ {
				if in(s.at(i, offset).word, "sunny rainy raining cloudy windy humid snowy snowing stormy") {
					weather = true
					break
				}
			}
		}
		if s.at(i, -2).word == "under" && (next.word == "" || in(next.word, "today tonight lately again")) {
			weather = true
		}
		if weather {
			s.emit("TheWhetherWeather", "Use “weather” for atmospheric conditions or the phrase “under the weather”.", i, i, "weather")
		}
	}
	if t.word == "use" && next.word == "to" && s.at(i, 2).word != "" {
		prev := s.at(i, -1).word
		existential := s.at(i, -2).word == "there" || be(prev) && i > 0 && s.initial(i-1)
		if (copular(prev) && !existential) || in(prev, "get gets getting got") {
			s.emit("UseToUsedTo", "Use “used to” when describing what someone is accustomed to.", i, i, "used")
		}
	}
	if t.word == "if" && s.initial(i) && pronoun(next.word) {
		aux, end := s.at(i, 2).word, i+2
		if aux == "would" && s.at(i, 3).word == "have" {
			end++
		} else if aux != "would've" {
			return
		}
		verb := end + 1
		if !s.lex.isParticiple(s.at(i, verb-i).word) {
			return
		}
		// Require a following comma-separated result clause. Embedded
		// questions ("I wonder if I would have...") are not counterfactuals.
		for j := verb; j < len(s.tokens) && j < verb+8; j++ {
			if s.at(i, j-i).word == "" {
				break
			}
			if s.followedByComma(j) && j+2 < len(s.tokens) && pronoun(s.tokens[j+1].word) && s.tokens[j+2].word == "would" {
				s.emit("IfWouldve", "If this describes an unreal past condition, use “had” after “if” rather than “would have”.", i+2, end, "")
				break
			}
		}
	}
}
