// Package grammar contains conservative English grammar decisions. It has no
// editor, filesystem, clock, or application state dependencies.
package grammar

import (
	"errors"
	"sort"
	"strings"
	"unicode"
)

const Version = "9"
const MaxTokens = 65536
const MaxFindings = 32768

var ErrWorkLimit = errors.New("grammar analysis exceeds work limit")

type tags uint16

const (
	base tags = 1 << iota
	third
	past
	participle
	gerund
	noun
	singularNoun
	pluralNoun
	adjective
	adverb
	properNoun
	comparative
	superlative
)

type Lexicon struct {
	words   map[string]tags
	phrases map[string][]phrasePattern
}

// NewLexicon reads the pinned Harper dictionary's tab-separated lexical labels.
func NewLexicon(dictionary string) Lexicon {
	words := map[string]tags{}
	for line := range strings.SplitSeq(dictionary, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 || strings.HasPrefix(line, "#") {
			continue
		}
		var labels tags
		for _, label := range fields[1:] {
			switch label {
			case "VB", "VBP":
				labels |= base
			case "VBZ":
				labels |= third
			case "VBD":
				labels |= past
			case "VBN":
				labels |= participle
			case "VBG":
				labels |= gerund
			case "NN":
				labels |= noun | singularNoun
			case "NNS":
				labels |= noun | pluralNoun
			case "NNP", "NNPS":
				labels |= noun | properNoun
			case "JJ":
				labels |= adjective
			case "JJR":
				labels |= adjective | comparative
			case "JJS":
				labels |= adjective | superlative
			case "RB", "RBR", "RBS":
				labels |= adverb
			}
		}
		words[fields[0]] = labels
	}
	// The port can retain only a proper-name reading for ordinary lowercase
	// words (for example the surname Day). Restore these reviewed common nouns.
	for _, word := range []string{"day", "week", "month", "year", "right", "house", "friend"} {
		words[word] |= noun | singularNoun
		words[word+"s"] |= noun | pluralNoun
	}
	return Lexicon{words: words, phrases: newPhraseIndex()}
}

type Finding struct {
	Rule, Message, Actual, Replacement string
	From, To                           int
}
type token struct {
	word, actual     string
	from, to, clause int
}

// Analyze returns rune offsets. Punctuation, masked text and paragraph breaks
// end a clause; a rule never invents adjacency across them.
func (l Lexicon) Analyze(text string) ([]Finding, error) {
	chars := []rune(text)
	tokens := []token{}
	clause := 0
	for i := 0; i < len(chars); {
		if !unicode.IsLetter(chars[i]) && !unicode.IsDigit(chars[i]) {
			if !unicode.IsSpace(chars[i]) || chars[i] == '\n' && i+1 < len(chars) && chars[i+1] == '\n' {
				clause++
			}
			i++
			continue
		}
		start := i
		i++
		for i < len(chars) && (unicode.IsLetter(chars[i]) || unicode.IsDigit(chars[i]) || (chars[i] == '\'' || chars[i] == '’') && i+1 < len(chars) && unicode.IsLetter(chars[i+1])) {
			i++
		}
		actual := string(chars[start:i])
		tokens = append(tokens, token{strings.ToLower(strings.ReplaceAll(actual, "’", "'")), actual, start, i, clause})
		if len(tokens) > MaxTokens {
			return nil, ErrWorkLimit
		}
	}
	findings := []Finding{}
	add := func(rule, message string, t token, replacement string) {
		findings = append(findings, Finding{rule, message, t.actual, replacement, t.from, t.to})
	}
	for i, t := range tokens {
		if i+1 >= len(tokens) || t.clause != tokens[i+1].clause {
			continue
		}
		v := tokens[i+1]
		// An unambiguous clause-initial pronoun avoids questions, compound subjects,
		// object pronouns and embedded subjunctives such as "I insist that he go".
		initial := i == 0
		if i > 0 && tokens[i-1].clause != t.clause {
			gap := string(chars[tokens[i-1].to:t.from])
			initial = strings.ContainsAny(gap, ".!?") || strings.Contains(gap, "\n\n")
		}
		if initial {
			if t.word == "i" && (v.word == "is" || v.word == "are") {
				add("IAmAgreement", "Use “am” with “I” in the present tense.", v, "am")
			}
			if in(t.word, "he she it") && (v.word == "are" || v.word == "am") {
				add("PronounInflectionBe", "Match the present-tense form of “be” to the subject.", v, "is")
			}
			if in(t.word, "we they you") && (v.word == "is" || v.word == "am") {
				add("PronounInflectionBe", "Match the present-tense form of “be” to the subject.", v, "are")
			}
			if in(t.word, "he she it") && l.words[v.word]&base != 0 && l.words[v.word]&past == 0 && irregularLemmas[v.word] == "" && !in(v.word, "read cut put hurt let set hit shut split spread cast cost quit broadcast input output upset burst fit beat bid shed rid thrust bet wet saw found fell lay rose bore bound wound ground out") && !in(v.word, "be am is are can may must shall will ought") {
				if replacement := l.singular(v.word); replacement != "" {
					add("PronounVerbAgreement", "Match the present-tense verb to this pronoun.", v, replacement)
				}
			}
			nounSubject := t.word == "you" && l.words[v.word]&pluralNoun != 0 && i+2 < len(tokens) && tokens[i+2].clause == t.clause && (be(tokens[i+2].word) || modal(tokens[i+2].word))
			if in(t.word, "i we they you") && l.words[v.word]&third != 0 && !in(v.word, "is has") && !nounSubject {
				if replacement := l.lemma(v.word); replacement != "" {
					add("PronounVerbAgreement", "Match the present-tense verb to this pronoun.", v, replacement)
				}
			} else if in(t.word, "i we they you") && v.word == "has" {
				add("PronounVerbAgreement", "Use “have” with this pronoun.", v, "have")
			}
		}
		if t.word == "to" && i > 0 && tokens[i-1].clause == t.clause && in(tokens[i-1].word, "want wants wanted need needs needed try tries tried plan plans planned hope hopes hoped able ready willing") {
			if replacement := l.lemma(v.word); replacement != "" && replacement != v.word {
				add("InflectedVerbAfterTo", "Use the base form of the verb after this infinitive “to”.", v, replacement)
			}
		}
		modal := in(t.word, "could would should") || in(t.word, "might must") && (initial || i > 0 && in(tokens[i-1].word, "i you he she it we they"))
		if modal && v.word == "of" && i+2 < len(tokens) && tokens[i+2].clause == t.clause && l.isParticiple(tokens[i+2].word) {
			add("ModalOf", "Use “have” after this modal verb.", v, "have")
		}
		if in(t.word, "want wants wanted") && l.words[v.word]&base != 0 && (l.words[v.word]&noun == 0 || in(v.word, "go be do learn understand know say see ask tell leave return")) && v.actual == v.word {
			add("MissingTo", "Use “to” before this infinitive verb.", v, "to "+v.actual)
		}
		if len(findings) > MaxFindings {
			return nil, ErrWorkLimit
		}
	}
	s := newGrammarScan(l, chars, tokens, findings)
	if err := s.expand(); err != nil {
		return nil, err
	}
	findings = preferWordBoundaryCorrections(s.findings)
	// Keep the native coordinate adapter linear even when a later rule examines
	// an earlier token. Stable ordering also gives repeated occurrences one order.
	sort.SliceStable(findings, func(i, j int) bool { return findings[i].From < findings[j].From })
	for i := range findings {
		findings[i].Replacement = s.matchStyle(findings[i].Replacement, findings[i].Actual)
	}
	return findings, nil
}
func in(word, list string) bool { return word != "" && strings.Contains(" "+list+" ", " "+word+" ") }
func (l Lexicon) singular(word string) string {
	candidate := word + "s"
	switch {
	case word == "have":
		candidate = "has"
	case strings.HasSuffix(word, "y") && len(word) > 1 && !strings.ContainsRune("aeiou", rune(word[len(word)-2])):
		candidate = word[:len(word)-1] + "ies"
	case strings.HasSuffix(word, "s"), strings.HasSuffix(word, "x"), strings.HasSuffix(word, "z"), strings.HasSuffix(word, "ch"), strings.HasSuffix(word, "sh"), word == "go", word == "do":
		candidate = word + "es"
	}
	if l.words[candidate]&third != 0 {
		return candidate
	}
	return ""
}
func (l Lexicon) lemma(word string) string {
	if in(word, "saw fell found") {
		return "" // also valid base verbs; the intended sense is not established
	}
	if lemma := irregularLemmas[word]; lemma != "" && !in(word, "saw fell found") {
		return lemma
	}
	if l.words[word]&base != 0 && !strings.HasSuffix(word, "ed") {
		return ""
	}
	if base := irregularLemmas[word]; base != "" {
		return base
	}
	candidates := []string{}
	for _, suffix := range []string{"s", "es", "ed", "ing"} {
		if stem, ok := strings.CutSuffix(word, suffix); ok && len(stem) > 1 {
			candidates = append(candidates, stem)
			if suffix == "ed" || suffix == "ing" {
				candidates = append(candidates, stem+"e")
				if len(stem) > 2 && stem[len(stem)-1] == stem[len(stem)-2] {
					candidates = append(candidates, stem[:len(stem)-1])
				}
			}
		}
	}
	for _, suffix := range []string{"ies", "ied"} {
		if stem, ok := strings.CutSuffix(word, suffix); ok {
			candidates = append(candidates, stem+"y")
		}
	}
	found := ""
	for _, candidate := range candidates {
		if l.words[candidate]&base != 0 {
			if found != "" && found != candidate {
				return ""
			}
			found = candidate
		}
	}
	return found
}

// The port labels many regular past forms VB, so verify their morphology too.
func (l Lexicon) isParticiple(word string) bool {
	return l.words[word]&participle != 0 || strings.HasSuffix(word, "ed") && l.lemma(word) != ""
}
