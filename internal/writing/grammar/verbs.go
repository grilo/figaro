package grammar

func (s *grammarScan) verbConstructions(i int) {
	t, next := s.tokens[i], s.at(i, 1)
	if in(t.word, "did didn't didnt") {
		v := i + 1
		if s.at(i, v-i).word == "not" {
			v++
		}
		if pronoun(s.at(i, v-i).word) {
			v++
		}
		word := s.at(i, v-i)
		if word.word != "" && !in(word.word, "is are am was were been being") {
			if replacement := s.lex.lemma(word.word); replacement != "" && !in(word.word, "goes does has") && (s.lex.isParticiple(word.word) || s.lex.words[word.word]&past != 0 || irregularLemmas[word.word] != "") {
				s.emit("DidPast", "Use the base form of the verb after “did”, including questions and negatives.", v, v, replacement)
			}
		}
	}
	if s.modalContext(i) {
		// These pairs conflict in standard written English. Regional pairs such
		// as “might could” are withheld, and the writer chooses the intended modal.
		if in(t.word+"/"+next.word, "will/can will/must will/should will/may would/can would/must should/will can/will") && s.at(i, 2).word != "" && s.lex.words[s.at(i, 2).word]&base != 0 {
			s.emit("DoubleModal", "Review these two modal verbs. Use the one that expresses the intended ability, obligation, or future meaning.", i, i+1, "")
		}
		if s.at(i, 1).word != "" && s.predicate(i+1) && !in(next.word, "a an been time right quiet") && !(next.word == "kind" && s.at(i, 2).word == "of") {
			s.emit("ModalBeAdjective", "Use “be” between this modal verb and the adjective.", i+1, i+1, "be "+next.actual)
		}
	}
	if t.word == "out" && next.word == "to" && s.at(i, 2).word == "be" && pronoun(s.at(i, -1).word) && (s.subjectPosition(i-1) || in(s.at(i, -2).word, "as then")) {
		s.emit("OughtToBe", "Use “ought to be” when expressing what should be true.", i, i, "ought")
	}
	if in(t.word, "let lets letting") && in(next.word, "me him her it us them you anyone anybody everyone everybody someone somebody nobody") {
		if s.at(i, 2).word == "to" {
			v := i + 3
			for n := 0; n < 2 && in(s.at(i, v-i).word, "only just not"); n++ {
				v++
			}
			if s.lex.words[s.at(i, v-i).word]&base != 0 && s.lower(v) {
				replacement := string(s.chars[s.tokens[i+3].from:s.tokens[v].to])
				s.emit("LetToDo", "Use the base verb directly after “let” and its object, without “to”.", i+2, v, replacement)
			}
		}
	}
	if in(t.word, "discuss discusses discussed discussing") && next.word == "about" && s.at(i, 2).word != "" {
		amount := s.at(i, 2).word
		objectBefore := false
		for n := 1; n <= 5; n++ {
			if in(s.at(i, -n).word, "something anything nothing everything what") {
				objectBefore = true
			}
		}
		if !objectBefore && !numeric(amount) && !in(amount, "one two three four five six seven eight nine ten a an half several many few some all most each every both") {
			s.emit("Discuss", "Use “discuss” directly with the topic; this “about” is unnecessary.", i, i+1, t.actual)
		}
	}
	if next.word == "to" && in(s.at(i, 2).word, "me him her us them you") {
		ask := in(t.word, "ask asks asked asking")
		tell := in(t.word, "tell tells told telling") && pronoun(s.at(i, -1).word) && s.initial(i-1)
		if ask || tell {
			s.emit("AskNoPreposition", "Put the person directly after this verb, without “to”.", i+1, i+2, s.tokens[i+2].actual)
		}
	}
	if in(t.word, "allow allows allowed allowing") && next.word == "to" && s.at(i, 2).word != "" && s.lower(i+2) {
		passive := false
		for n := 1; n <= 4; n++ {
			prev := s.at(i, -n).word
			if prev == "" {
				break
			}
			if copular(prev) || in(prev, "get gets got gotten getting") {
				passive = true
				break
			}
			if !in(prev, "not never always often usually really still also already previously once") {
				break
			}
		}
		if !passive {
			if gerund := s.lex.ing(s.at(i, 2).word); gerund != "" {
				if in(t.word, "allowed allowing") {
					gerund = ""
				}
				s.emit("AllowTo", "Name who is allowed to act, or use the -ing form for the permitted activity.", i+1, i+2, gerund)
			}
		}
	}
	if t.word == "worth" && next.word == "to" && s.at(i, 2).word != "" && s.lower(i+2) {
		if gerund := s.lex.ing(s.at(i, 2).word); gerund != "" {
			s.emit("WorthToDo", "Use the -ing form after “worth”, rather than an infinitive with “to”.", i+1, i+2, gerund)
		}
	}
}
