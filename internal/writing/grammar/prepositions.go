package grammar

// Only reviewed complements license these corrections. A preposition can also
// introduce a place, time, reason or literal comparison, so adjacency alone is
// insufficient. All lookahead remains inside the scan's existing clause.
func (s *grammarScan) complementWord(i int) string {
	return s.at(i, s.complementHead(i)-i).word
}

func (s *grammarScan) complementHead(i int) int {
	head := i + 1
	if in(s.at(i, 1).word, "a an the my your his her its our their this that these those every") {
		head++
	}
	// Bounded, reviewed modifiers; do not skip arbitrary nouns or finite verbs.
	for n := 0; n < 2 && in(s.at(i, head-i).word, "one two three first second requested college sudden stubborn dreaded expired rusted crumbling loose slippery innovative embodied previous recommended well written uniform dashed"); n++ {
		head++
	}
	return head
}

func (s *grammarScan) usagePrepositions(i int) {
	t := s.tokens[i]
	prev, next := s.at(i, -1).word, s.at(i, 1).word
	head := s.complementWord(i)
	activity := s.lex.words[head]&gerund != 0
	topic := activity || in(head, "music art science history astronomy mathematics math maths programming teaching reading writing project problem issue situation danger risks risk work research technology politics software possibilities ideas automation tech finance web mapping data scope id computer ai ais")
	rule, replacement := "", ""
	switch t.word {
	case "for":
		accused := in(prev, "accused accusing") && in(s.at(i, -2).word, "am is are was were be been being got gets getting") || in(prev, "me you him her us them") && in(s.at(i, -2).word, "accuse accuses accused accusing")
		stranded := prev == "accused" && s.terminal(i) && (s.at(i, -4).word == "what" || s.at(i, -5).word == "what")
		if accused && (activity || in(head, "theft fraud murder cheating it this that")) || stranded {
			rule, replacement = "AccuseOf", "of"
		} else if in(prev, "aspire aspires aspired aspiring") && in(next, "be become achieve learn catch greatness excellence success leadership") {
			rule, replacement = "AspireTo", "to"
		} else if in(prev, "await awaits awaited awaiting") && in(head, "reply response results result arrival visit decision news announcement verdict letter package delivery feedback answer course rise") {
			last := i + 1
			if s.complementHead(i) > last {
				last++
			}
			s.emit("AwaitFor", "Use a direct object after “await”.", i, last, string(s.chars[s.tokens[i+1].from:s.tokens[last].to]))
		}
	case "in":
		if prev == "good" && (activity || in(head, "music mathematics math maths chess sports tennis football cooking")) {
			rule, replacement = "GoodAt", "at"
		}
	case "about":
		if prev == "fascinated" && topic {
			rule, replacement = "FascinatedBy", "by"
		} else if prev == "care" && in(s.at(i, -2).word, "take takes took taken taking") && (in(head, "child children baby babies son daughter mother father parents patient patients dog cat pet pets") || in(s.at(i, -2).word, "takes took taken taking") && (in(next, "this that it") || in(head, "making analysis output routes option"))) {
			rule, replacement = "TakeCareOf", "of"
		} else if prev == "aware" && topic {
			rule, replacement = "AwareOf", "of"
		} else if prev == "beware" && (in(next, "a an the my your his her our their") || in(head, "scams fraud risks dangers dogs traffic")) {
			rule, replacement = "BewareOf", "of"
		}
	case "from":
		if prev == "jealous" && (in(next, "me you him her us them") || in(head, "success achievements achievement wealth talent attention fame praise")) {
			rule, replacement = "JealousOf", "of"
		} else if prev == "inspired" && in(next, "a an the my your his her our their") && in(head, "book story poem film movie music work speech painting example teacher") {
			rule, replacement = "InspiredBy", "by"
		}
	case "of":
		if prev == "passionate" && topic {
			rule, replacement = "PassionateAbout", "about"
		} else if prev == "pride" && in(s.at(i, -2).word, "take takes took taken taking") && (activity || in(next, "my your his her its our their") || in(head, "code work craftsmanship")) {
			rule, replacement = "TakePrideIn", "in"
		} else if in(prev, "reason reasons") && activity && !in(s.at(i, -2).word, "by for") && s.at(i, -3).word != "for" && s.at(i, -4).word != "for" {
			rule, replacement = "ReasonForDoing", "for"
		} else if prev == "curious" && (topic || in(next, "why what how whether")) && !in(s.at(i, -2).word, "the most") {
			rule, replacement = "CuriousAbout", "about"
		} else if in(prev, "laugh laughed laughing laughs") && (s.initial(i-1) || in(prev, "laughed laughing laughs") || pronoun(s.at(i, -2).word) || copular(s.at(i, -2).word) || in(s.at(i, -2).word, "not don't")) && (in(next, "me you him her us them") || in(head, "teammate friend colleague neighbor neighbour") || s.lex.words[next]&properNoun != 0 && !s.lower(i+1)) {
			rule, replacement = "LaughOfAt", "at"
		}
	case "on":
		if prev == "curious" && (in(next, "why what how whether") || in(head, "requirements results")) {
			rule, replacement = "CuriousAbout", "about"
		}
	case "against":
		if prev == "cure" && (s.initial(i-1) || in(s.at(i, -2).word, "a the")) && in(head, "cancer disease diseases illness malaria tuberculosis infection infections flu plague") {
			rule, replacement = "CureFor", "for"
		} else if prev == "beware" && next == "mixing" {
			rule, replacement = "BewareOf", "of"
		}
	case "with", "regarding", "concerning":
		if prev == "beware" {
			last, danger := i, head
			if t.word == "with" && next == "regard" && s.at(i, 2).word == "to" {
				last, danger = i+2, s.complementWord(i+2)
			}
			if in(danger, "wire wires railing railings guardrail guardrails coupon coupons scams fraud dangers risks crashing") {
				s.emit("BewareOf", "Use “of” before this danger.", i, last, "of")
			}
		}
	case "to":
		if prev == "look" && s.at(i, -2).word == "a" && in(s.at(i, -3).word, "take takes took taken taking have has had having") && in(next, "a an the my your his her our their this that both it them") && !(in(next, "it them") && in(s.at(i, -3).word, "have has had having")) {
			rule, replacement = "TakeALookTo", "at"
		}
	case "like":
		if prev == "similar" && (copular(s.at(i, -2).word) || in(s.at(i, -2).word, "feel feels felt seem seems seemed look looks looked")) && in(next, "a an the my your his her our their this that every mine yours his hers ours theirs") {
			rule, replacement = "SimilarLike", "to"
		}
	case "favour", "favor":
		if prev == "in" && s.lex.words[next]&gerund != 0 {
			rule, replacement = "InFavourOfDoing", t.actual+" of"
		}
	case "except":
		if next == "of" && (prev == "the" && s.at(i, -2).word == "with" || prev == "with" || in(prev, "possible notable") && s.at(i, -2).word == "the" && s.at(i, -3).word == "with") {
			rule, replacement = "ExceptOf", "exception"
		}
	}
	if replacement != "" {
		s.emit(rule, "Use “"+replacement+"” with this expression and complement.", i, i, replacement)
	}
}
