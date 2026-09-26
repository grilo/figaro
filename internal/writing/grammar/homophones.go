package grammar

import "strings"

func (s *grammarScan) homophones(i int) {
	t, next, prev := s.tokens[i], s.at(i, 1), s.at(i, -1)
	if next.word != "" && in(t.word, "it's they're you're there you") {
		head := s.nominalHead(i + 1)
		// "You programmers are welcome" is valid apposition. Only reviewed
		// non-human possession heads justify changing the bare pronoun "you".
		youSubject := t.word != "you" || s.subjectPosition(i) && head >= 0 && s.at(head, 1).word != "" && s.finite(head+1) && in(s.tokens[head].word, "comment comments feedback idea ideas proposal proposals plan plans work code knowledge imagination note notes report reports combination approach approaches design designs argument arguments assumption assumptions result results suggestion suggestions car cars house houses home homes")
		if youSubject && s.possessiveSlot(i, head) {
			rule, replacement := "", ""
			switch t.word {
			case "it's":
				rule, replacement = "ItsPossessive", "its"
			case "they're":
				rule, replacement = "TheyreToTheir", "their"
			case "you're", "you":
				rule, replacement = "PossessiveYour", "your"
			case "there":
				// “There lies the problem” is a locative subject inversion.
				if be(next.word) || modal(next.word) || in(next.word, "have has had") {
					break
				}
				if head == i+1 && s.lex.words[next.word]&(third|past) != 0 && in(prev.word, "in on over under near from outside inside") && (s.at(head, 1).word == "" || !s.finite(head+1)) {
					break
				}
				rule, replacement = "ThereToTheir", "their"
			}
			if rule != "" {
				s.emit(rule, "Use the possessive form before this noun phrase.", i, i, replacement)
			}
		}
	}
	if next.word != "" && s.homophoneSubject(i) && s.contractionPredicate(i+1) {
		rule, replacement := "", ""
		switch t.word {
		case "its":
			rule, replacement = "ItsContraction", "it's"
		case "their":
			rule, replacement = "TheirToTheyre", "they're"
		case "your":
			rule, replacement = "YourPredicateAdjective", "you're"
		}
		if rule != "" {
			s.emit(rule, "Use the subject and verb contraction for this predicate.", i, i, replacement)
		}
	}
	if t.word == "their" {
		// Indefinite noun phrases establish the existential “there is/are”.
		nounStart := i + 2
		verb := be(next.word) || in(next.word, "isn't aren't wasn't weren't")
		if modal(next.word) && s.at(i, 2).word == "be" {
			verb, nounStart = true, i+3
		}
		if in(next.word, "has have had") && s.at(i, 2).word == "been" {
			verb, nounStart = true, i+3
		}
		if s.at(i, nounStart-i).word == "not" {
			nounStart++
		}
		// A comma-joined clause (“…almost done, their is one table left”)
		// cannot use possessive “their” before a verb either.
		if (s.homophoneSubject(i) || s.afterComma(i)) && verb && s.at(i, nounStart-i).word != "" && s.existentialNoun(nounStart) {
			s.emit("TheirToThere", "Use “there” to introduce something that exists or is present.", i, i, "there")
		} else if s.placeEnding(i) && in(prev.word, "over from near around out in up down right go going went been meet stop stopped wait waiting standing paused park") {
			s.emit("TheirToThere", "Use “there” when referring to a place.", i, i, "there")
		} else if s.terminal(i) && in(prev.word, "it them me us him her") {
			for n := 2; n <= 4; n++ {
				if in(s.at(i, -n).word, "put puts place placed leave leaves left keep kept bring brought take took") {
					s.emit("TheirToThere", "Use “there” when referring to a place.", i, i, "there")
					break
				}
			}
		}
	}
	if t.word == "then" && in(prev.word, "better worse more less fewer greater bigger smaller taller shorter higher lower older younger cheaper faster slower stronger safer easier harder sooner later earlier nearer longer wider closer") && next.word != "" {
		comparison := in(next.word, "i you he she it we they me him her us them before ever expected anticipated planned usual necessary") || numberCue(next.word) != 0
		if in(next.word, "the my your his her our their its") && s.nominalHead(i+2) >= 0 && s.at(i, 2).word != "" {
			comparison = true
		}
		if comparison {
			s.emit("ThenThan", "Use “than” to introduce the other side of this comparison.", i, i, "than")
		}
	}
	if t.word == "than" && in(prev.word, "back since until by") && (s.terminal(i) || s.followedByComma(i)) {
		s.emit("ThenThan", "Use “then” when referring to that time.", i, i, "then")
	}
	if t.word == "too" {
		infinitive := in(prev.word, "want wants wanted need needs needed going able ready willing try tries tried hope hopes hoped plan plans planned intend intends intended") && s.lex.words[next.word]&base != 0 && s.lower(i+1)
		preposition := in(prev.word, "go goes went going come came coming walk walked walking drive drove driving return returned returning send sent sending give gave giving talk talking spoke speak listen listening close next according due") && in(next.word, "a an the my your our their his her its me him us them you")
		if infinitive || preposition {
			s.emit("ToTwoToo", "Use “to” for this infinitive or preposition; “too” means also or excessively.", i, i, "to")
		}
	}
	if t.word == "to" && next.word != "" && in(prev.word, "am is are was were feel feels felt seem seems seemed look looks looked become became") && s.lex.words[next.word]&adjective != 0 && !in(next.word, "ready quiet right clear clean free correct work") {
		if s.predicate(i + 1) {
			s.emit("ToTwoToo", "Use “too” when you mean excessively.", i, i, "too")
		}
	}
	if t.word == "to" && s.terminal(i) && i > 0 && strings.TrimSpace(string(s.chars[s.tokens[i-1].to:t.from])) == "," {
		// Require an ordinary complete clause, not an isolated list fragment.
		for n := 1; n <= 7 && i-n >= 0; n++ {
			if in(s.tokens[i-n].word, "want wants like likes love loves do does can will am is are") {
				s.emit("ToTwoToo", "Use “too” when you mean also.", i, i, "too")
				break
			}
			if n > 1 && s.tokens[i-n].clause != s.tokens[i-n+1].clause {
				break
			}
		}
	}
}
