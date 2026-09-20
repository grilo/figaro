package grammar

// A determiner, an unambiguous common noun and an adjacent auxiliary provide
// enough evidence for these narrow decisions. Attraction across prepositional
// phrases, collective nouns, invariant nouns and singular counterfactual
// “were” deliberately remain outside this rule.
func (s *grammarScan) nounSubjectAgreement(i int) {
	if in(s.at(i, -1).word, "and or nor") || !s.subjectPosition(i) || !in(s.tokens[i].word, "the a an this that these those my your his her our their") {
		return
	}
	head := -1
	for offset := 1; offset <= 5; offset++ {
		token := s.at(i, offset)
		labels := s.lex.words[token.word]
		if token.word == "" || token.actual != token.word || labels&(noun|adjective|adverb) == 0 || in(token.word, "of in on with and or nor between among for from to at by near under over through about before after without within during against beside beneath behind beyond despite until since than as") {
			break
		}
		if labels&noun != 0 && in(s.at(i, offset+1).word, "is are was were has have") {
			head = i + offset
			break
		}
	}
	if head < 0 || s.at(i, head-i).word == "" {
		return
	}
	w := s.tokens[head].word
	if in(w, "series species means fish sheep deer police staff team family group lot number couple pair majority minority percent cent dollars pounds years miles hours minutes news data media crew class government public people") || massUnit(w) != "" {
		return
	}
	labels := s.lex.words[w]
	// “The poor/dead/blind” can denote groups. A dictionary noun label does
	// not disambiguate a nominalized adjective from a singular common noun.
	if s.tokens[i].word == "the" && labels&adjective != 0 {
		return
	}
	plural := labels&pluralNoun != 0 && labels&singularNoun == 0
	singular := labels&singularNoun != 0 && labels&pluralNoun == 0
	cue := numberCue(s.tokens[i].word)
	if cue == 1 && plural || cue == 2 && singular {
		return
	}
	verb := s.at(head, 1).word
	replacement := ""
	if plural {
		switch verb {
		case "is":
			replacement = "are"
		case "was":
			replacement = "were"
		case "has":
			if s.lex.isParticiple(s.at(head, 2).word) {
				replacement = "have"
			}
		}
	} else if singular {
		if verb == "are" {
			replacement = "is"
		} else if verb == "have" && s.at(i, -1).word != "that" && s.lex.isParticiple(s.at(head, 2).word) {
			replacement = "has"
		}
	}
	if replacement != "" {
		s.emit("NounSubjectAgreement", "Match the auxiliary verb to this singular or plural noun subject.", head+1, head+1, replacement)
	}
}

func (s *grammarScan) massQuantifier(i int) {
	if s.tokens[i].word != "fewer" {
		return
	}
	head := i + 1
	for n := 0; n < 2 && in(s.at(i, head-i).word, "useful available unnecessary fresh clean cold hot spare extra valuable relevant reliable"); n++ {
		head++
	}
	w, next := s.at(i, head-i).word, s.at(i, head-i+1).word
	if massUnit(w) == "" && !in(w, "time money effort water air milk rice sand research evidence traffic software") {
		return
	}
	// In “fewer research papers”, research modifies a countable head.
	if in(next, "and or nor") || s.lex.words[next]&(noun|adjective) != 0 {
		return
	}
	s.emit("MassNouns", "Use “less” for this uncountable amount.", i, i, "less")
}
