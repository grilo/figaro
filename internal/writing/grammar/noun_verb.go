package grammar

import "strings"

// These lexical pairs are shared by US and UK English. Practice/practise,
// licence/license and emphasis/emphasise/emphasize need a dialect-aware policy.
var nounToVerb = map[string]string{
	"advice": "advise", "breath": "breathe", "complaint": "complain", "belief": "believe", "intent": "intend",
}
var verbToNoun = map[string]string{
	"advise": "advice", "breathe": "breath", "complain": "complaint", "believe": "belief", "intend": "intent",
}

func (s *grammarScan) nounVerbConfusions(i int) {
	t, prev, next := s.tokens[i], s.at(i, -1), s.at(i, 1)
	verb := nounToVerb[t.word]
	if verb != "" && (s.lower(i) || t.actual == strings.ToUpper(t.word)) {
		if subject, ok := s.actionSlot(i); ok {
			// The noun also conceals agreement in "she belief". Only choose a
			// finite form when the subject is explicit; modals take the base form.
			if in(subject, "he she it") {
				verb = s.lex.singular(verb)
			}
			if verb != "" {
				s.emit("NounVerbConfusion", "Use the verb form for this action.", i, i, verb)
			}
		}
	}
	if noun := verbToNoun[t.word]; noun != "" && s.nounSlot(i) {
		s.emit("NounVerbConfusion", "Use the noun form in this noun phrase.", i, i, noun)
	}
	// Weight is also a valid verb: weight samples, scores or survey responses.
	// A question about someone's own weight establishes the intended sense.
	if t.word == "weight" && in(prev.word, "i you he she it we they") && in(s.at(i, -2).word, "do does did") && s.at(i, -3).word == "much" && s.at(i, -4).word == "how" && s.terminal(i) {
		s.emit("NounVerbConfusion", "Use “weigh” when asking how heavy someone or something is.", i, i, "weigh")
	}
	if in(t.word, "affect affects") {
		// Affect is a real psychological noun. Only reviewed expressions about
		// consequences justify changing it; "flat affect" remains untouched.
		phrase := in(prev.word, "side adverse after special placebo ripple snowball greenhouse immediate opposite")
		if in(prev.word, "sound little no great") {
			phrase = s.nounSlot(i) || in(s.at(i, -2).word, "had have has with to")
		}
		if in(prev.word, "positive negative") {
			phrase = next.word == "on" && s.nounSlot(i)
		}
		if prev.word == "strong" && next.word == "on" && s.at(i, -2).word == "a" && in(s.at(i, -3).word, "have has had having") {
			phrase = true
		}
		if t.word == "affect" && in(prev.word, "in into take takes took taking") {
			phrase = true
		}
		if t.word == "affect" && prev.word == "and" && s.at(i, -2).word == "cause" {
			phrase = true
		}
		if t.word == "affect" && next.word == "of" && in(s.at(i, 2).word, "caffeine inflation weather temperature heat rain noise") && s.nounSlot(i) {
			phrase = true
		}
		// The same modifier can be the subject of a verb: "The sound affects
		// sleep" and "The positive affect of the patient" need no guessed fix.
		if phrase && (s.terminal(i) || s.followedByComma(i) || be(next.word) || modal(next.word) || in(next.word, "of on from and across throughout after at tomorrow today yesterday")) {
			replacement := "effect"
			if t.word == "affects" {
				replacement = "effects"
			}
			s.emit("NounVerbConfusion", "Use “effect” for the result or consequence in this expression.", i, i, replacement)
		}
	}
	if t.word == "effect" && in(next.word, "me you him her us them everyone everybody someone somebody") {
		_, action := s.actionSlot(i)
		// A demonstrative or bounded noun subject also establishes a modal
		// verb slot. Possessive objects ("effect everyone's release") abstain.
		if modal(prev.word) {
			subject, determiner := s.at(i, -2).word, s.at(i, -3).word
			action = action || in(subject, "this that these those") || s.lex.words[subject]&noun != 0 && in(determiner, "a an the this that these those my your his her our their")
		}
		if action {
			s.emit("NounVerbConfusion", "Use “affect” when the intended meaning is to influence someone.", i, i, "affect")
		}
	}
}

// actionSlot recognizes bounded grammatical cues, never arbitrary dictionary
// noun/verb labels. The returned subject is only for a bare finite verb.
func (s *grammarScan) actionSlot(i int) (string, bool) {
	j := i - 1
	for n := 0; n < 2 && in(s.at(i, j-i).word, "always never only just really still often usually sometimes also not"); n++ {
		j--
	}
	prev := s.at(i, j-i).word
	if pronoun(prev) {
		before := s.at(i, j-i-1).word
		if modal(before) || in(before, "do does did don't doesn't didn't") {
			return "", true
		}
		if in(prev, "you it") && !s.initial(j) && !in(before, "if unless because although while when that whether what how why where think thinks thought believe believes suppose suspect assume guess hope know knows knew") {
			return "", false
		}
		return prev, true
	}
	if prev == "please" || modal(prev) && s.modalContext(j) || in(prev, "do does did don't doesn't didn't") && s.at(i, j-i-1).word != "" {
		return "", true
	}
	if prev == "to" && in(s.at(i, j-i-1).word, "want wants wanted need needs needed try tries tried going able ready willing remember remembers remembered tend tends tended like likes liked how") {
		return "", true
	}
	return "", false
}

func (s *grammarScan) nounSlot(i int) bool {
	prev := s.at(i, -1).word
	if prev == "better" && in(s.at(i, -2).word, "had have has") {
		return false
	}
	if in(prev, "a an the my your our their his her its some much") {
		return true
	}
	// An adjective alone is not enough: "We better advise her" uses a verb.
	if s.lex.words[prev]&adjective != 0 || in(prev, "good bad sound helpful useful valuable practical deep") {
		return in(s.at(i, -2).word, "a an the my your our their his her its some much has have had give gives gave giving offered offer offers offering need needs needed") || in(prev, "good bad sound helpful useful valuable practical deep")
	}
	return prev == "of" && in(s.at(i, -2).word, "piece pieces bit bits lack lots plenty")
}
