package grammar

import "strings"

// Comma-splice advice is deliberately limited to two substantial clauses with
// explicit subjects and finite predicates. It offers no guessed conjunction or
// punctuation edit. Opaque technical subjects may participate, but their hidden
// contents are never inspected or joined to adjacent words.
func (s *grammarScan) commaSplice(i int) {
	if i+1 >= len(s.tokens) {
		return
	}
	t, next := s.tokens[i], s.tokens[i+1]
	gap := string(s.chars[t.to:next.from])
	if strings.Trim(gap, " \t") != "," || !strings.HasPrefix(gap, ", ") {
		return // spacing has its own rule; do not compete with that correction
	}
	comma := t.to
	left, right := comma, comma+1
	for left > 0 && comma-left < 512 {
		if strings.ContainsRune(".!?;:,", s.chars[left-1]) || s.chars[left-1] == '\n' && left > 1 && s.chars[left-2] == '\n' {
			break
		}
		left--
	}
	for right < len(s.chars) && right-comma < 512 {
		if strings.ContainsRune(".!?;:,", s.chars[right]) || s.chars[right] == '\n' && right+1 < len(s.chars) && s.chars[right+1] == '\n' {
			break
		}
		right++
	}
	if comma-left >= 512 || right-comma >= 512 {
		return
	}
	// A, B, and C is a coordinated list of clauses. A later conjunction
	// licenses the earlier commas too; do not review them as isolated pairs.
	for at := right; at < len(s.chars) && at-comma < 512; at++ {
		if strings.ContainsRune(".!?;:", s.chars[at]) {
			break
		}
		if s.chars[at] == ',' {
			end := at + 1
			for end < len(s.chars) && end-at < 12 && (s.chars[end] == ' ' || s.chars[end] == '\t' || s.chars[end] == '\n') {
				end++
			}
			start := end
			for end < len(s.chars) && end-start < 4 && s.chars[end] >= 'a' && s.chars[end] <= 'z' {
				end++
			}
			if in(string(s.chars[start:end]), "and or nor but yet so") && (end == len(s.chars) || s.chars[end] == ' ' || s.chars[end] == '\n') {
				return
			}
		}
	}
	before, after := string(s.chars[left:comma]), string(s.chars[comma+1:right])
	if !s.independentClause(before) || !s.independentClause(after) {
		return
	}
	s.findings = append(s.findings, Finding{"CommaSplice", "These clauses appear to stand on their own. Review whether this comma needs a conjunction, a semicolon, or a sentence break.", ",", "", comma, comma + 1})
}

func (s *grammarScan) independentClause(text string) bool {
	words := strings.Fields(strings.ToLower(text))
	if len(words) < 4 {
		return false // short rhetorical lists and parenthetical “I think” abstain
	}
	finite := func(word string) bool {
		return in(word, "is are was were am has have had do does did") || modal(word) || s.lex.words[word]&(past|third) != 0
	}
	head := -1
	if pronoun(words[0]) || strings.Trim(words[0], "\uFFFC") == "" {
		head = 0
	} else if in(words[0], "the a an this that these those my your his her our their") {
		for j := 1; j+1 < len(words) && j <= 5; j++ {
			labels := s.lex.words[words[j]]
			if labels&noun != 0 && finite(words[j+1]) {
				head = j
				break
			}
			if labels&(noun|adjective|adverb) == 0 {
				break
			}
		}
	}
	if head < 0 {
		return false // subordinators, relatives, imperatives and fragments abstain
	}
	verb := head + 1
	for n := 0; n < 2 && verb < len(words) && in(words[verb], "then still already just also never always often usually now"); n++ {
		verb++
	}
	return verb < len(words)-1 && finite(words[verb])
}
