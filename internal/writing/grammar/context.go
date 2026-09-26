package grammar

import (
	"strings"
	"unicode"
)

// grammarScan owns bounded context for one pure analysis. A missing token is
// never substituted with a word from another clause or protected fragment.
type grammarScan struct {
	lex        Lexicon
	chars      []rune
	tokens     []token
	findings   []Finding
	apostrophe rune
}

func newGrammarScan(lex Lexicon, chars []rune, tokens []token, findings []Finding) *grammarScan {
	s := &grammarScan{lex: lex, chars: chars, tokens: tokens, findings: findings, apostrophe: '\''}
	straight, curly, first := 0, 0, rune(0)
	for i, c := range chars {
		if (c != '\'' && c != '’') || i == 0 || i+1 == len(chars) || !unicode.IsLetter(chars[i-1]) || !unicode.IsLetter(chars[i+1]) {
			continue
		}
		if first == 0 {
			first = c
		}
		if c == '’' {
			curly++
		} else {
			straight++
		}
	}
	if curly > straight || curly == straight && first == '’' {
		s.apostrophe = '’'
	}
	return s
}

func (s *grammarScan) at(i, offset int) token {
	j := i + offset
	if i < 0 || i >= len(s.tokens) || j < 0 || j >= len(s.tokens) || s.tokens[i].clause != s.tokens[j].clause {
		return token{}
	}
	return s.tokens[j]
}

func (s *grammarScan) initial(i int) bool {
	if i == 0 {
		return true
	}
	if s.tokens[i-1].clause == s.tokens[i].clause {
		return false
	}
	gap := string(s.chars[s.tokens[i-1].to:s.tokens[i].from])
	return strings.ContainsAny(gap, ".!?") || strings.Contains(gap, "\n\n") || strings.Contains(gap, "\r\n\r\n")
}

// afterComma reports a clause that begins directly after a comma.
func (s *grammarScan) afterComma(i int) bool {
	if i <= 0 || i >= len(s.tokens) || s.tokens[i-1].clause == s.tokens[i].clause {
		return false
	}
	return strings.TrimSpace(string(s.chars[s.tokens[i-1].to:s.tokens[i].from])) == ","
}

func (s *grammarScan) subjectPosition(i int) bool {
	return s.initial(i) || in(s.at(i, -1).word, "if unless because although while when that and but whether think thinks thought believe believes suppose suspect assume guess hope know knows knew")
}

// terminal excludes hyphenated modifiers and comma-separated adjective lists.
func (s *grammarScan) terminal(i int) bool {
	if i < 0 || i >= len(s.tokens) {
		return false
	}
	for _, c := range s.chars[s.tokens[i].to:] {
		if unicode.IsSpace(c) {
			continue
		}
		return strings.ContainsRune(".!?", c)
	}
	return true
}

func (s *grammarScan) emit(rule, message string, first, last int, replacement string) {
	if first < 0 || last >= len(s.tokens) || last < first || s.tokens[first].clause != s.tokens[last].clause {
		return
	}
	a, b := s.tokens[first], s.tokens[last]
	actual := string(s.chars[a.from:b.to])
	// Vale's bridge describes one line per alert. A cross-line removal remains
	// useful advice, anchored to its first word, without inventing an invalid span.
	if strings.ContainsAny(actual, "\r\n") {
		b, actual, replacement = a, a.actual, ""
	}
	s.findings = append(s.findings, Finding{rule, message, actual, replacement, a.from, b.to})
}

func (s *grammarScan) matchStyle(replacement, actual string) string {
	if replacement == "" {
		return ""
	}
	if strings.Contains(actual, "’") || !strings.Contains(actual, "'") && s.apostrophe == '’' {
		replacement = strings.ReplaceAll(replacement, "'", "’")
	}
	letters, upper := 0, 0
	for _, c := range actual {
		if unicode.IsLetter(c) {
			letters++
			if unicode.IsUpper(c) {
				upper++
			}
		}
	}
	if letters > 0 && letters == upper {
		return strings.ToUpper(replacement)
	}
	a, r := []rune(actual), []rune(replacement)
	if len(a) > 0 && len(r) > 0 && unicode.IsUpper(a[0]) {
		r[0] = unicode.ToUpper(r[0])
	}
	return string(r)
}

func (s *grammarScan) expand() error {
	for i := range s.tokens {
		s.usagePrepositions(i)
		s.usageWordChoices(i)
		s.usageConstructions(i)
		s.nounSubjectAgreement(i)
		s.massQuantifier(i)
		s.phraseCorrections(i)
		s.phraseConstructions(i)
		s.commaSplice(i)
		s.mechanics(i)
		s.verbConstructions(i)
		s.nounConstructions(i)
		s.homophones(i)
		s.wordChoices(i)
		s.nounVerbConfusions(i)
		s.pronounConstructions(i)
		s.commonErrors(i)
		if len(s.findings) > MaxFindings {
			return ErrWorkLimit
		}
	}
	return nil
}

func (s *grammarScan) lower(i int) bool {
	return i >= 0 && i < len(s.tokens) && s.tokens[i].actual == s.tokens[i].word
}

func pronoun(word string) bool { return in(word, "i you he she it we they") }
func be(word string) bool      { return in(word, "am is are was were be been being") }
func modal(word string) bool   { return in(word, "can could will would shall should may might must") }
func copular(word string) bool {
	return be(word) || in(word, "i'm you're he's she's it's we're they're that's there's what's who's isn't aren't wasn't weren't")
}

func (s *grammarScan) modalContext(i int) bool {
	return modal(s.at(i, 0).word) && pronoun(s.at(i, -1).word) && (s.subjectPosition(i-1) || s.at(i, -2).word == "")
}

// A small set of predicate readings avoids converting possessive noun phrases
// such as "its running costs" and "your right to vote" into contractions.
func (s *grammarScan) predicate(i int) bool {
	if i < 0 || i >= len(s.tokens) {
		return false
	}
	w := s.tokens[i].word
	for n := 0; n < 3 && in(w, "already really very quite so still never always often usually probably certainly definitely not just totally surprisingly exceptionally absolutely barely far"); n++ {
		if s.at(i, 1).word == "" {
			return false
		}
		i++
		w = s.tokens[i].word
	}
	next := s.at(i, 1).word
	if in(w, "a an") {
		return next != "" && s.nominalHead(i+1) >= 0
	}
	if w == "been" {
		return s.at(i, 1).word != ""
	}
	if in(w, "had got") && (in(next, "a an the no some nothing something anything") || s.lex.isParticiple(next)) {
		return true
	}
	if w == "because" {
		return pronoun(next) || next == "the"
	}
	if w == "time" && in(next, "to for") {
		return true
	}
	if w == "going" && next == "to" {
		return true
	}
	if in(w, "here there outside inside online offline ahead behind abroad away asleep alive alone") {
		return s.terminal(i) || in(next, "now today tonight tomorrow already again with for because")
	}
	if in(w, "raining snowing sleeping waiting arriving leaving working looking coming trying going moving running wondering answering") {
		return s.terminal(i) || in(next, "today tomorrow yesterday tonight now here there again outside inside hard late together at for with on in from to because over behind through where")
	}
	if in(w, "configured installed prepared completed finished allowed invited supposed expected known committed dedicated") && in(next, "by to for as with") {
		return true
	}
	if !in(w, "able unable available aware careful certain comfortable correct difficult easy enough fair fine happy helpful impossible late likely necessary possible quiet ready right safe serious sorry sure tired true useful welcome wrong expensive hungry thirsty old young cold hot loud high low nice common unusual important impressive hard ambitious similar accessible cool proud patient calm brave excited kind delightful awake dedicated loyal") {
		return false
	}
	if w == "right" && next == "to" {
		return false
	}
	return s.terminal(i) || in(next, "about with for to that of because if whether what how when where why")
}

// nominalHead inspects at most five modifiers and one common-noun head. It
// declines proper names and words with equally plausible verb/adjective roles.
func (s *grammarScan) nominalHead(start int) int {
	if start < 0 || start >= len(s.tokens) {
		return -1
	}
	for j := start; j < len(s.tokens) && j <= start+5; j++ {
		t := s.at(start, j-start)
		if t.word == "" || t.actual != t.word {
			return -1
		}
		if in(t.word, "a an the not many few all most more less enough some any every each another both no none several") {
			return -1
		}
		if ordinal(t.word) || t.word == "own" && s.at(j, 1).word != "" {
			continue
		}
		if in(t.word, "best worst first last young old poor rich") && s.at(j, 1).word == "" {
			return -1
		}
		labels := s.lex.words[t.word]
		if labels&(singularNoun|pluralNoun) != 0 {
			if labels&gerund != 0 && massUnit(t.word) == "" && (s.at(j, 1).word == "" || !s.finite(j+1)) {
				return -1
			}
			if labels&adjective != 0 && s.at(j, 1).word != "" && !s.finite(j+1) {
				following := s.at(j, 1).word
				if s.lex.words[following]&(singularNoun|pluralNoun|adjective) != 0 && !in(following, "of for with from to in on at by about") {
					continue
				}
			}
			if in(t.word, "able unable available aware careful certain comfortable happy helpful impossible late likely necessary possible ready safe serious sorry sure tired true useful welcome wrong hungry thirsty nice common important impressive accessible proud patient brave excited delightful awake dedicated loyal") {
				return -1
			}
			return j
		}
		if labels&(adjective|adverb) == 0 {
			return -1
		}
	}
	return -1
}

func (s *grammarScan) finite(i int) bool {
	w := s.at(i, 0).word
	return be(w) || modal(w) || in(w, "has have had did does do") || s.lex.words[w]&third != 0 || s.lex.words[w]&past != 0 || strings.HasSuffix(w, "ed") && s.lex.lemma(w) != ""
}

func (s *grammarScan) possessiveSlot(i, head int) bool {
	if head < 0 {
		return false
	}
	// A following finite verb disambiguates a possessive subject from a
	// contraction with a predicate noun: "they're doctors" stays untouched.
	if s.subjectPosition(i) && s.at(head, 1).word != "" && s.finite(head+1) {
		return true
	}
	prev := s.at(i, -1).word
	return in(prev, "in on at under over beside behind near within without with from into onto inside outside during despite for of by against about bring brought take took taking give gave giving open opened close closed repair repaired clean cleaned change changed changing check checked checking update updated updating lose lost keep kept raise raised lower lowered follow followed protect protected wag wagged read reading borrow borrowed carry carried admire admired revise revised frame framed ignore ignored visualize prioritize hinder hindered forget forgot forgotten like likes liked understand understood reached celebrated failed finished completed saved places place maintain")
}
