package grammar

func (s *grammarScan) wordChoices(i int) {
	t, prev, next := s.tokens[i], s.at(i, -1), s.at(i, 1)
	if t.word == "were" && in(prev.word, "know knows knew remember forgot find found check asked") && pronoun(next.word) && s.at(i, 2).word != "" && s.finite(i+2) {
		s.emit("WereWhere", "Use “where” to introduce this reference to a place.", i, i, "where")
	}
	if t.word == "were" && s.initial(i) && in(next.word, "am is are was were do does did can could will would should") && pronoun(s.at(i, 2).word) {
		s.emit("WereWhere", "Use “where” to ask about a place in this question.", i, i, "where")
	}
	if t.word == "where" && in(prev.word, "we you they") && s.subjectPosition(i-1) && next.word != "" && s.predicate(i+1) {
		s.emit("WereWhere", "Use “were”, the past-tense verb, with this subject and predicate.", i, i, "were")
	}
	if t.word == "where" && s.initial(i) && in(next.word, "we you they") && s.at(i, 2).word != "" && s.predicate(i+2) {
		s.emit("WereWhere", "Use “were” to ask whether this past-tense description was true.", i, i, "were")
	}
	if t.word == "every" && next.word == "day" && in(s.at(i, 2).word, "thing things life lives use uses language speech clothes clothing routine routines activity activities item items object objects problem problems concern concerns") {
		s.emit("Everyday", "Use “everyday” as an adjective meaning ordinary or usual before this noun.", i, i+1, "everyday")
	}
	if t.word == "everyday" && !in(prev.word, "a an the my your our their his her its word term called named labeled") {
		adverbial := in(next.word, "i you he she it we they")
		if s.terminal(i) && in(prev.word, "do does did used learned draw draws drew work works worked walk walks walked exercise exercises run runs swim swims read reads write writes go goes come comes commute commutes it them school home") {
			adverbial = true
		}
		if adverbial {
			s.emit("Everyday", "Use “every day” when you mean on each day.", i, i, "every day")
		}
	}
}
