package grammar

import "strings"

// Curated irregular forms are lexical facts, kept separate from context policy.
var irregularLemmas = map[string]string{
	"went": "go", "gone": "go", "did": "do", "done": "do", "has": "have", "had": "have",
	"was": "be", "were": "be", "been": "be", "is": "be", "are": "be", "am": "be",
	"ate": "eat", "eaten": "eat", "wrote": "write", "written": "write", "ran": "run", "saw": "see", "seen": "see",
	"took": "take", "taken": "take", "made": "make", "gave": "give", "given": "give", "spoke": "speak", "spoken": "speak",
	"bought": "buy", "brought": "bring", "thought": "think", "caught": "catch", "taught": "teach", "fought": "fight",
	"heard": "hear", "said": "say", "told": "tell", "knew": "know", "known": "know", "understood": "understand", "misunderstood": "misunderstand",
	"found": "find", "lost": "lose", "left": "leave", "felt": "feel", "kept": "keep", "slept": "sleep",
	"became": "become", "began": "begin", "begun": "begin", "came": "come", "chose": "choose", "chosen": "choose",
	"drove": "drive", "driven": "drive", "broke": "break", "broken": "break", "fell": "fall", "fallen": "fall",
	"forgot": "forget", "forgotten": "forget", "grew": "grow", "grown": "grow", "flew": "fly", "flown": "fly",
	"drank": "drink", "drunk": "drink", "sang": "sing", "sung": "sing", "swam": "swim", "swum": "swim",
	"sent": "send", "spent": "spend", "built": "build", "won": "win", "wore": "wear", "worn": "wear",
	"met": "meet", "paid": "pay", "sold": "sell", "held": "hold", "stood": "stand", "sat": "sit",
}

func (l Lexicon) ing(word string) string {
	if l.words[word]&base == 0 {
		return ""
	}
	candidates := []string{word + "ing"}
	if stem, ok := strings.CutSuffix(word, "e"); ok && !strings.HasSuffix(word, "ee") {
		candidates = append(candidates, stem+"ing")
	}
	if stem, ok := strings.CutSuffix(word, "ie"); ok {
		candidates = append(candidates, stem+"ying")
	}
	if len(word) > 1 {
		candidates = append(candidates, word+word[len(word)-1:]+"ing")
	}
	found := ""
	for _, candidate := range candidates {
		if l.words[candidate]&gerund == 0 {
			continue
		}
		if found != "" && found != candidate {
			return ""
		}
		found = candidate
	}
	return found
}

func (l Lexicon) plural(word string) string {
	if replacement := map[string]string{"child": "children", "person": "people", "man": "men", "woman": "women", "mouse": "mice", "goose": "geese", "tooth": "teeth", "foot": "feet", "criterion": "criteria", "phenomenon": "phenomena"}[word]; replacement != "" {
		return replacement
	}
	if l.words[word]&singularNoun == 0 || l.words[word]&pluralNoun != 0 {
		return ""
	}
	candidate := word + "s"
	switch {
	case strings.HasSuffix(word, "y") && len(word) > 1 && !strings.ContainsRune("aeiou", rune(word[len(word)-2])):
		candidate = word[:len(word)-1] + "ies"
	case strings.HasSuffix(word, "s"), strings.HasSuffix(word, "x"), strings.HasSuffix(word, "z"), strings.HasSuffix(word, "ch"), strings.HasSuffix(word, "sh"):
		candidate = word + "es"
	}
	if l.words[candidate]&pluralNoun != 0 {
		return candidate
	}
	return ""
}
