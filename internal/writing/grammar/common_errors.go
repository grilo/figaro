package grammar

import (
	"strings"
	"unicode"
)

// Policy 9 checks for frequent errors found in a fresh document review. Each
// requires a reviewed syntactic cue on both sides; the same spellings are
// valid words in other contexts, so a missing cue always abstains.
func (s *grammarScan) commonErrors(i int) {
	s.weatherWhether(i)
	s.compoundObjectMe(i)
	s.lessFewer(i)
	s.timePossessive(i)
	s.couldCareLess(i)
}

// “decide weather to keep” and “know weather it will rain” introduce a choice
// or an indirect question. “the weather,” “weather conditions” and “check
// weather reports” keep the noun.
func (s *grammarScan) weatherWhether(i int) {
	t, prev, next := s.tokens[i], s.at(i, -1).word, s.at(i, 1).word
	if t.word != "weather" || !s.lower(i) || s.followedByHyphen(i) || in(prev, "the a an this that our your their my his her its of for in bad good") {
		return
	}
	cue := in(prev, "decide decides decided deciding determine determines determined choose chooses chose know knows knew ask asks asked asking wonder wonders wondered wondering discuss discussed debate debated debating consider considered considering confirm confirmed check checked checking see unsure sure clear doubt question matter matters")
	clause := false
	switch {
	case next == "or" && s.at(i, 2).word == "not":
		clause = true
	case next == "to" && s.lex.words[s.at(i, 2).word]&base != 0 && s.lower(i+2) && s.at(i, 2).word != "be":
		// “We consider weather to be a risk” keeps the noun; only verbs of
		// choosing or uncertainty introduce “whether to”.
		clause = in(prev, "decide decides decided deciding determine determines determined choose chooses chose know knows knew ask asks asked asking wonder wonders wondered wondering debate debated debating unsure sure")
	case pronoun(next):
		verb := s.at(i, 2).word
		plain := in(next, "i we you they") && s.lex.words[verb]&base != 0 && s.lower(i+2)
		clause = cue && verb != "" && (s.finite(i+2) || plain)
	case in(next, "the this that our their my your his her") && in(prev, "sure unsure clear know knew wonder wondered decide decided determine check confirm ask asked"):
		head := s.nominalHead(i + 2)
		clause = head >= 0 && s.at(head, 1).word != "" && s.finite(head+1)
	}
	if clause {
		s.emit("WeatherWhether", "Use “whether” to introduce a choice or an indirect question.", i, i, "whether")
	}
}

// A coordinated “I” after a preposition or a reviewed object-taking verb is
// an object: “send it to Ana and I on Friday.” A following verb means “I”
// starts a new clause (“I wrote to Ana and I will call Bruno”) and abstains.
func (s *grammarScan) compoundObjectMe(i int) {
	t := s.tokens[i]
	if t.actual != "I" || s.at(i, -1).word != "and" {
		return
	}
	// The first conjunct: a capitalized name (one or two words), an object
	// pronoun, or a determiner with at most two modifiers and a noun head.
	and := i - 1
	start := -1
	first := s.at(and, -1)
	name := func(t token) bool {
		return t.word != "" && t.actual != t.word && unicode.IsUpper([]rune(t.actual)[0]) && !pronoun(t.word) && s.lex.words[t.word]&(base|third|past|adjective|adverb) == 0
	}
	switch {
	case in(first.word, "you him her them us"):
		start = and - 1
	case name(first):
		start = and - 1
		if name(s.at(and, -2)) {
			start = and - 2
		}
	default:
		for n := 2; n <= 4; n++ {
			if in(s.at(and, -n).word, "my our your his her their the") {
				if s.nominalHead(and-n+1) == and-1 && s.lex.words[first.word]&(singularNoun|pluralNoun) != 0 {
					start = and - n
				}
				break
			}
		}
	}
	if start < 0 || s.at(i, start-1-i).word == "" {
		return
	}
	governor := s.tokens[start-1].word
	if governor != "between" {
		preposition := in(governor, "to for with from about at by of without among toward towards behind beside")
		verb := in(governor, "thank thanks thanked invite invites invited tell tells told ask asks asked email emails emailed call calls called help helps helped join joins joined meet meets met send sends sent give gives gave show shows showed pay pays paid hire hires hired teach teaches taught contact contacts contacted remind reminds reminded include includes included")
		after := s.at(i, 1).word
		// Only a boundary or a reviewed adjunct shows the phrase has ended.
		ended := s.terminal(i) || s.followedByComma(i) || in(after, "on at in by for before after during about tomorrow today yesterday tonight next last this soon later again too as")
		if !(preposition || verb) || !ended {
			return
		}
		// “said to Ana and I” can be followed by an unmarked clause only after
		// an adverbial; a finite verb after the adjunct keeps the subject reading.
		if in(after, "on at in by before after during") && s.at(i, 3).word != "" && s.finite(i+3) && s.lex.words[s.at(i, 3).word]&noun == 0 {
			return
		}
	}
	s.emit("CompoundObjectMe", "Use “me” when this pronoun is the object of a verb or preposition.", i-1, i, "and me")
}

// “less” with a plural count noun: “less queries” → “fewer queries.” Mass
// nouns, measures (“less money/time/years”), comparatives (“less expensive
// options”), correlatives (“the less people know”) and compounds with a
// singular head (“less sales tax”) abstain.
func (s *grammarScan) lessFewer(i int) {
	t, prev := s.tokens[i], s.at(i, -1).word
	// After a noun, “less” can mean minus: “the price less fees.”
	nounBefore := !in(prev, "far even still") && s.lex.words[prev]&noun != 0 && s.lex.words[prev]&(past|third) == 0 && !be(prev) && !modal(prev)
	// A hyphenated suffix (“watcher-less paths”) is not a quantifier.
	suffix := t.from > 0 && strings.ContainsRune("-‐‑", s.chars[t.from-1])
	if t.word != "less" || suffix || nounBefore || in(prev, "the no much or") || s.at(i, 1).word == "" || !s.lower(i+1) || s.followedByHyphen(i+1) {
		return
	}
	head := s.at(i, 1).word
	labels := s.lex.words[head]
	if labels&pluralNoun == 0 || labels&(singularNoun|adjective|adverb) != 0 || massUnit(head) != "" {
		return
	}
	if in(head, "years months weeks days hours minutes seconds dollars euros pounds cents miles kilometers kilometres meters metres feet inches calories bytes kilobytes megabytes gigabytes percent points degrees earnings savings winnings proceeds thanks news means series species data media criteria clothes goods funds resources") {
		return
	}
	next := s.at(i, 2).word
	if s.lex.words[next]&noun != 0 && !in(next, "at in on of for to from with by than as about during after before over under across per now here there today") {
		// A following noun is a compound head unless it is clearly a verb
		// followed by its object: “Less queries hit the database.”
		if s.lex.words[next]&(base|third|past) == 0 || !in(s.at(i, 3).word, "the a an my our your their this that these those it them us me him her") {
			return
		}
	}
	if in(next, "and or nor") {
		return
	}
	s.emit("LessFewer", "Use “fewer” with plural nouns that can be counted.", i, i, "fewer")
}

// “last years prices” → “last year's prices.” A preceding determiner marks
// the plural noun phrase “the last years of his life,” and a following
// preposition, pronoun or verb keeps the plural reading.
func (s *grammarScan) timePossessive(i int) {
	t := s.tokens[i]
	singular := map[string]string{"years": "year's", "weeks": "week's", "months": "month's", "nights": "night's", "quarters": "quarter's"}[t.word]
	prev := s.at(i, -1)
	if singular == "" || !s.lower(i) || s.followedByHyphen(i) || !in(prev.word, "last next this") || prev.actual != prev.word && !s.initial(i-1) {
		return
	}
	// A preceding determiner makes a plural noun phrase; a preceding subject
	// makes “last” a verb (“These batteries last years longer”).
	before := s.at(i, -2).word
	if in(before, "the these those my your our their his her its over past few many several recent first final") || pronoun(before) || s.lex.words[before]&pluralNoun != 0 {
		return
	}
	next := s.at(i, 1)
	if next.word == "" || next.actual != next.word || in(next.word, "of in on at for to and or but ago before after") || pronoun(next.word) || s.lex.words[next.word]&gerund != 0 {
		return
	}
	// “Last years saw growth” uses a past verb, not a possessed noun.
	if s.nominalHead(i+1) < 0 || s.lex.words[next.word]&(past|comparative) != 0 {
		return
	}
	s.emit("TimePossessive", "Use the possessive form of this time expression before a noun.", i, i, singular)
}

// “could care less” usually means the opposite of its literal wording. The
// informal American idiom is common, so this is advice without a guessed edit.
func (s *grammarScan) couldCareLess(i int) {
	if s.tokens[i].word != "could" || s.at(i, 1).word != "care" || s.at(i, 2).word != "less" || !in(s.at(i, -1).word, "i you he she we they") {
		return
	}
	// A comparison states a literal amount: “could care less about X than Y.”
	for n := 3; n <= 9; n++ {
		if s.at(i, n).word == "than" {
			return
		}
	}
	s.emit("CouldCareLess", "If you mean that you do not care at all, the standard idiom is “couldn’t care less”.", i, i+2, "")
}
