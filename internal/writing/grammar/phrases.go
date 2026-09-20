package grammar

import "strings"

func (s *grammarScan) phraseCorrections(i int) {
	for _, pattern := range s.lex.phrases[s.tokens[i].word] {
		last := i + len(pattern.words) - 1
		if last >= len(s.tokens) {
			continue
		}
		matched := true
		for n, word := range pattern.words {
			t := s.at(i, n)
			if t.word != word || n > 0 && t.actual != t.word && t.actual != strings.ToUpper(t.word) {
				matched = false
				break
			}
		}
		if matched && !s.followedByHyphen(last) && s.phraseAllowed(pattern.rule, i, last) {
			s.emit(pattern.rule, "Use “"+pattern.replacement+"” in this expression.", i, last, pattern.replacement)
		}
	}
}

func (s *grammarScan) followedByHyphen(i int) bool {
	end := s.tokens[i].to
	return end < len(s.chars) && strings.ContainsRune("-‐‑‒–", s.chars[end])
}

func (s *grammarScan) phraseAllowed(rule string, first, last int) bool {
	prev, next := s.at(first, -1).word, s.at(last, 1).word
	switch rule {
	case "EveryTime", "PassersBy":
		return !s.identifierEdge(first)
	case "DueDiligence":
		return in(prev, "the my your his her its our their")
	case "EnMasse":
		return in(prev, "arrived left resigned voted moved quit gathered marched protested") && !in(next, "production media communication transit transport education storage manufacturing")
	case "EnRoute":
		return (copular(prev) || in(prev, "currently now")) && next == "to"
	case "InHindsight":
		return !in(next, "bias biases research studies study")
	case "OneAndTheSame":
		return copular(prev) && (s.terminal(last) || s.followedByComma(last) || in(next, "thing person as"))
	case "OnceInAWhile":
		return !in(next, "loop loops")
	case "RulesOfThumb", "PointsOfView":
		return numberCue(prev) == 2 || prev == "multiple"
	case "StateOfTheArt":
		return copular(prev) && s.terminal(last)
	case "OneFellSwoop":
		return in(prev, "in with at")
	case "Notwithstanding":
		return in(prev, "proceed proceeded continue continued went carried") && in(next, "the a an") && in(s.at(last, 2).word, "rain delay delays difficulty difficulties risk risks danger")
	case "Henceforth":
		return true
	case "Whereas":
		return first > 0 && s.followedByComma(first-1) && (pronoun(next) && s.finite(last+2) || s.lex.words[next]&pluralNoun != 0 && (s.finite(last+2) || s.lex.words[s.at(last, 2).word]&base != 0))
	case "Beforehand":
		return in(prev, "prepared knew know planned decided agreed told asked informed arranged booked") && (s.terminal(last) || in(next, "if whether when that"))
	case "Alongside":
		return in(next, "a an the my your his her its our their this that") || in(prev, "stood pulled drifted walked came") && (s.terminal(last) || s.followedByComma(last))
	case "OvertimeCompoundNoun":
		return in(prev, "a an the my your his her its our their received includes included confirmed reviewed tracks tracked submit covers covered saw audit audits audited") && in(next, "pay wages rates claim claims approval approvals shifts hours details")
	case "Itself":
		// Preserve unhyphenated drafts of self-sufficient/self-sustaining too.
		return !in(next, "sufficient sustaining supporting contained aware employed made taught directed governing service assessment esteem explanatory regulating destruct destructs destructed healing replicating modifying updating signing hosting refreshing")
	case "Misunderstood":
		return pronoun(prev) || copular(prev) || in(prev, "have has had having been being")
	case "Misused":
		// "We miss used books" has a noun phrase after the verb "miss".
		return copular(prev) || in(prev, "have has had having been being")
	case "Misunderstand":
		return in(prev, "i we you they") || modal(prev) || prev == "to" && in(s.at(first, -2).word, "want wants wanted need needs needed try tries tried going able likely tend tends tended")
	case "Albeit":
		if modal(prev) {
			return false
		}
		for offset := -1; offset >= -4; offset-- {
			if in(s.at(first, offset).word, "let lets letting") {
				return false
			}
		}
		return true
	case "AllOfASudden":
		return next == "" || pronoun(next)
	case "AsFollows":
		return !in(next, "up on through")
	case "AtAllCosts":
		return !in(next, "level levels center centers centre centres point points price prices category categories")
	case "BeckAndCall":
		return s.at(first, -2).word == "at" && (in(prev, "my your his her its our their") || strings.HasSuffix(prev, "'s"))
	case "CaseInPoint":
		return (prev == "a" || first == 0 || s.tokens[first-1].clause != s.tokens[first].clause) && (next == "" || in(next, "is was would could"))
	case "FreeRein":
		if next == "of" {
			return false
		}
		for offset := -1; offset >= -3; offset-- {
			if in(s.at(first, offset).word, "give gives gave given giving allow allows allowed grant grants granted granting") {
				return true
			}
		}
		return false
	case "PeaceOfMind":
		return prev == "for" || in(prev, "me you him her us them") && in(s.at(first, -2).word, "give gives gave given giving bring brings brought offer offers offered")
	case "Ado":
		return prev == "without"
	case "ExplanationMark":
		return !in(next, "scheme schemes allocation allocations criteria rubric rubrics")
	case "GetUsedTo":
		return !in(next, "necessity late course")
	case "LookForwardTo":
		if in(next, "the a an my your his her our their") {
			next = s.at(last, 2).word
		}
		return in(next, "visit holiday trip reply response meeting weekend party event arrival opportunity break vacation") || s.lex.words[next]&gerund != 0
	case "ResponsibilityFor":
		if !in(prev, "take takes took taken taking assume assumes assumed assuming claim claims claimed claiming") {
			return false
		}
		if in(next, "the a an this that my your our their") {
			next = s.at(last, 2).word
		}
		return s.lex.words[next]&gerund != 0 || in(next, "project task problem mistake error failure accident outcome result results work")
	case "WroteToRote":
		for offset := -1; offset >= -5; offset-- {
			if in(s.at(first, offset).word, "learn learned learnt learning memorize memorized memorise memorised memorizing memorising know knows knew recite recited") {
				return true
			}
		}
		return false
	case "OutOfSync":
		return (copular(prev) || in(prev, "get gets getting got become becomes became becoming")) && !in(next, "fitting fittings pipe pipes water drain drains")
	case "Furthermore", "Meanwhile", "Therefore":
		return (first == 0 || s.tokens[first-1].clause != s.tokens[first].clause) && s.followedByComma(last)
	}
	return true
}

// A split spelling or confused word can masquerade as a finite verb.
// Prefer the reviewed lexical correction at that exact occurrence; do
// not remove agreement advice elsewhere or suppress unrelated grammar rules.
func preferWordBoundaryCorrections(findings []Finding) []Finding {
	starts := make(map[int]bool)
	for _, finding := range findings {
		if in(finding.Rule, "Misunderstood Misunderstand Misused SeamToSeem DoesOrDose HopHope PiqueInterest DoMistake") && finding.Replacement != "" {
			starts[finding.From] = true
		}
	}
	if len(starts) == 0 {
		return findings
	}
	result := findings[:0]
	for _, finding := range findings {
		if finding.Rule != "PronounVerbAgreement" || !starts[finding.From] {
			result = append(result, finding)
		}
	}
	return result
}
