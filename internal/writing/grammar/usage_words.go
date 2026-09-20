package grammar

// Word-choice corrections require a reviewed syntactic or semantic neighbor;
// all of these spellings are legitimate words in other contexts.
func (s *grammarScan) usageWordChoices(i int) {
	t := s.tokens[i]
	prev, next := s.at(i, -1).word, s.at(i, 1).word
	rule, replacement := "", ""
	switch t.word {
	case "peak", "peaks", "peaked", "peaking", "peek", "peeks", "peeked", "peeking":
		if in(next, "my your his her its our their") && in(s.at(i, 2).word, "interest curiosity") {
			rule = "PiqueInterest"
			replacement = map[string]string{"peak": "pique", "peaks": "piques", "peaked": "piqued", "peaking": "piquing", "peek": "pique", "peeks": "piques", "peeked": "piqued", "peeking": "piquing"}[t.word]
			if in(t.word, "peak peek") && in(prev, "he she it") {
				replacement = "piques"
			}
			if in(t.word, "peaks peeks") && in(prev, "i you we they") {
				replacement = "pique"
			}
		}
	case "quiet":
		if in(next, "often frequently usually") || in(prev, "can't cannot couldn't doesn't don't didn't won't wouldn't") && s.lex.words[next]&base != 0 || copular(prev) && in(next, "remarkable impressive") {
			rule, replacement = "QuiteQuiet", "quite"
		}
	case "quite":
		if in(prev, "very too") && copular(s.at(i, -2).word) && (s.terminal(i) || in(next, "here there")) {
			rule, replacement = "QuiteQuiet", "quiet"
		}
	case "principle":
		if in(prev, "a an the my your his her our their this that") && in(next, "investigator engineer architect author designer developer scientist objective goal reason concern priority job role focus responsibility duties") {
			rule, replacement = "PrincipleToPrincipalRoleNoun", "principal"
		}
	case "loose":
		if prev == "to" && in(s.complementWord(i), "game games job jobs file files money time weight opportunity chance chances life lives") {
			rule, replacement = "ToLoseTooLoose", "lose"
		}
	case "lose":
		if prev == "too" && copular(s.at(i, -2).word) && s.terminal(i) {
			rule, replacement = "ToLoseTooLoose", "loose"
		}
	case "boarder", "boarders":
		styling := next == "with" && (in(s.complementWord(i+1), "css style width") || s.at(i, 2).word == "a" && s.at(i, 3).word == "dashed" && s.at(i, 4).word == "style")
		if next == "between" && in(s.complementWord(i+1), "countries states nations regions sections panels") || in(next, "of around") && in(s.complementWord(i+1), "image page table picture photograph country container element text div") || styling {
			rule, replacement = "BoarderBorder", "border"
			if t.word == "boarders" {
				replacement = "borders"
			}
		}
	case "seam", "seams", "seamed":
		subject := prev
		if in(prev, "all both still always never") || modal(prev) || in(prev, "can't cannot couldn't don't doesn't didn't") {
			subject = s.at(i, -2).word
		}
		if (pronoun(subject) || in(subject, "everything something nothing everybody everyone somebody someone")) && (next == "to" && s.lex.words[s.at(i, 2).word]&base != 0 || in(next, "i you he she it we they") && (s.finite(i+2) || in(s.at(i, 2).word, "cannot can't couldn't don't doesn't didn't")) || next == "alright" && s.terminal(i+1)) {
			rule = "SeamToSeem"
			replacement = map[string]string{"seam": "seem", "seams": "seems", "seamed": "seemed"}[t.word]
			if t.word == "seams" && in(subject, "i you we they") {
				replacement = "seem"
			}
			if t.word == "seam" && !modal(prev) && !in(prev, "can't cannot couldn't don't doesn't didn't") && in(subject, "he she it everything something nothing everybody everyone somebody someone") {
				replacement = "seems"
			}
		}
	case "dose":
		question := false
		if in(prev, "what when why where how") {
			if in(next, "this that") && s.lex.words[s.at(i, 2).word]&base != 0 {
				question = true
			} else if in(next, "a an the this that") {
				// A noun subject followed by a base verb distinguishes “What dose
				// this sign mean?” from the valid noun “what dose it takes”.
				for n := 2; n <= 4; n++ {
					word, following := s.at(i, n).word, s.at(i, n+1).word
					if s.lex.words[word]&(noun|adjective) == 0 {
						break
					}
					if s.lex.words[word]&singularNoun != 0 && s.lex.words[following]&base != 0 && s.lex.words[following]&third == 0 {
						question = true
						break
					}
				}
			}
		}
		if in(prev, "he she it") && (next == "not" || s.lex.words[next]&base != 0 && s.lower(i+1)) || (s.initial(i) || in(prev, "what when why where how")) && in(next, "he she it") && s.lex.words[s.at(i, 2).word]&base != 0 || question {
			rule, replacement = "DoesOrDose", "does"
		}
	case "safe":
		auxiliary := prev
		if in(prev, "definitely still always never really") {
			auxiliary = s.at(i, -2).word
		}
		if (auxiliary == "to" || modal(auxiliary) || in(auxiliary, "couldn't can't cannot wouldn't")) && (in(s.complementWord(i), "file files money time life lives work progress document documents company resources nation changes") || in(next, "me you him her us them") && in(s.at(i, 2).word, "money time")) {
			rule, replacement = "SafeToSave", "save"
		}
	case "save":
		if (copular(prev) || in(prev, "it this that") && be(s.at(i, -2).word) && s.initial(i-2)) && next == "to" && s.lex.words[s.at(i, 2).word]&base != 0 {
			rule, replacement = "SaveToSafe", "safe"
		}
	case "aloud":
		if copular(prev) && next == "to" && s.lex.words[s.at(i, 2).word]&base != 0 {
			rule, replacement = "WasAloud", "allowed"
		}
	case "chord", "chords":
		if in(prev, "spinal umbilical") || prev == "electrical" && !in(next, "progression progressions harmony harmonies music") || prev == "vocal" && (in(next, "vibrations therapy injury injuries") || in(next, "was were are is") && in(s.at(i, 2).word, "sore damaged injured inflamed")) {
			rule, replacement = "SpinalChord", "cord"
			if t.word == "chords" {
				replacement = "cords"
			}
		}
	case "hop", "hops", "hopped":
		subject, verb := next, s.at(i, 2).word
		if subject == "that" {
			subject, verb = s.at(i, 2).word, s.at(i, 3).word
		}
		if pronoun(prev) && pronoun(subject) && (s.lex.words[verb]&(base|third|past) != 0 || be(verb) || modal(verb)) {
			rule = "HopHope"
			replacement = map[string]string{"hop": "hope", "hops": "hopes", "hopped": "hoped"}[t.word]
			if t.word == "hops" && in(prev, "i you we they") {
				replacement = "hope"
			}
			if t.word == "hop" && in(prev, "he she it") {
				replacement = "hopes"
			}
		}
	}
	if replacement != "" {
		s.emit(rule, "Use “"+replacement+"” for this meaning.", i, i, replacement)
	}
}

func (s *grammarScan) usageConstructions(i int) {
	t := s.tokens[i]
	prev, next := s.at(i, -1).word, s.at(i, 1).word
	invitation := s.initial(i) || in(prev, "so then") || prev == "end" && s.at(i, -2).word == "the" && s.at(i, -3).word == "in"
	if t.word == "lets" && invitation && s.lower(i+1) && s.lex.words[next]&base != 0 && s.lex.words[next]&(third|past) == 0 {
		s.emit("LetsConfusion", "Use “let’s” for “let us”.", i, i, "let's")
	}
	if t.word == "let's" && (in(prev, "he she it") || s.lex.words[prev]&singularNoun != 0 && in(s.at(i, -2).word, "the this that my your his her our their")) && in(next, "me you him her us them") && s.lex.words[s.at(i, 2).word]&base != 0 {
		s.emit("LetsConfusion", "Use “lets” for allowing someone to do something.", i, i, "lets")
	}
	if replacement := map[string]string{"do": "make", "does": "makes", "did": "made", "done": "made", "doing": "making"}[t.word]; replacement != "" {
		head := i + 2
		if in(next, "a an the my your his her our their some many several one two three this that these those") {
			if in(s.at(i, 2).word, "big small serious terrible repeated common") {
				head++
			}
			if in(s.at(i, head-i).word, "mistake mistakes") && s.lex.words[s.at(i, head-i+1).word]&(base|third) == 0 && !(in(t.word, "do does did") && (s.initial(i) || in(prev, "when why how where what whether"))) {
				if t.word == "do" && in(prev, "he she it") {
					replacement = "makes"
				}
				if t.word == "does" && in(prev, "i you we they") {
					replacement = "make"
				}
				s.emit("DoMistake", "Use “make” with “mistake”.", i, i, replacement)
			}
		}
	}
	if replacement := map[string]string{"me": "mine", "you": "yours", "him": "his", "us": "ours", "them": "theirs"}[t.word]; replacement != "" && prev == "of" && in(s.at(i, -2).word, "friend friends enemy enemies") && (in(s.at(i, -2).word, "friends enemies") || in(s.at(i, -3).word, "a an the some many old close good best")) && (s.terminal(i) || s.finite(i+1)) {
		s.emit("FriendOfMe", "Use the independent possessive after “a friend/enemy of”.", i, i, replacement)
	}
	if in(t.word, "have has had having") {
		first, hard := i+1, i+1
		if in(next, "extremely really very real") {
			hard++
		}
		activity := s.lex.words[s.at(i, hard-i+2).word]&gerund != 0 || s.at(i, hard-i+2).word == "to" && s.lex.words[s.at(i, hard-i+3).word]&base != 0
		if s.at(i, hard-i).word == "hard" && s.at(i, hard-i+1).word == "time" && activity {
			article := "a "
			if next == "extremely" {
				article = "an "
			}
			s.emit("HaveAHardTime", "Use an article in “have a hard time” before an activity.", first, first, article+s.tokens[first].actual)
		}
	}
	if in(t.word, "compared compares") && (s.at(i, -3).word == "how" && (s.at(i, -2).word == "does" && in(prev, "it this that he she") || s.at(i, -2).word == "do" && in(prev, "they these those we you"))) {
		s.emit("HowDoesCompared", "Use the base verb “compare” after “do/does”.", i, i, "compare")
	}
}
