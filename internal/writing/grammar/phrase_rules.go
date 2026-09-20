package grammar

import "strings"

// These reviewed phrase mappings are adapted from Harper 2.10.0. SOURCE.json
// records the exact upstream files; contextual exceptions live in phrases.go.
// A mapping is a lexical fact, not permission to replace it in every context.
type phraseRule struct {
	rule  string
	pairs [][2]string
}

type phrasePattern struct {
	rule, replacement string
	words             []string
}

var phraseRules = []phraseRule{
	{"AllIntentsAndPurposes", [][2]string{
		{"for all intensive purposes", "for all intents and purposes"},
		{"for all intense purposes", "for all intents and purposes"},
		{"to all intensive purposes", "to all intents and purposes"},
	}},
	{"BareInMind", [][2]string{{"bare in mind", "bear in mind"}}},
	{"MootPoint", [][2]string{{"mute point", "moot point"}, {"point is mute", "point is moot"}}},
	{"Itself", [][2]string{{"it self", "itself"}}},
	{"Misunderstood", [][2]string{{"miss understood", "misunderstood"}}},
	{"AMeansToAnEnd", [][2]string{{"a mean to an end", "a means to an end"}}},
	{"AdNauseam", [][2]string{{"as nauseam", "ad nauseam"}}},
	{"Albeit", [][2]string{{"all be it", "albeit"}, {"al be it", "albeit"}, {"al beit", "albeit"}, {"all beit", "albeit"}, {"allbe it", "albeit"}}},
	{"AllOfASudden", [][2]string{{"all of the sudden", "all of a sudden"}, {"all of sudden", "all of a sudden"}, {"all the sudden", "all of a sudden"}}},
	{"AsFollows", [][2]string{{"as follow", "as follows"}}},
	{"AtAllCosts", [][2]string{{"at all cost", "at all costs"}}},
	{"BatedBreath", [][2]string{{"baited breath", "bated breath"}}},
	{"BeckAndCall", [][2]string{{"back and call", "beck and call"}}},
	{"CaseInPoint", [][2]string{{"case and point", "case in point"}}},
	{"FreeRein", [][2]string{{"free reign", "free rein"}}},
	{"InLieuOf", [][2]string{{"in lue of", "in lieu of"}}},
	{"InOfItself", [][2]string{{"in of itself", "in and of itself"}}},
	{"OnTheSpurOfTheMoment", [][2]string{
		{"on the spurt of the moment", "on the spur of the moment"},
		{"in the spur of the moment", "on the spur of the moment"},
		{"in the spurt of the moment", "on the spur of the moment"},
		{"at the spur of the moment", "on the spur of the moment"},
	}},
	{"PeaceOfMind", [][2]string{{"piece of mind", "peace of mind"}}},
	{"PerSe", [][2]string{{"per say", "per se"}}},
	{"SneakPeekPreview", [][2]string{{"sneak peak", "sneak peek"}}},
	{"WhetYourAppetite", [][2]string{{"wet your appetite", "whet your appetite"}}},
	{"Ado", [][2]string{{"further adieu", "further ado"}}},
	{"DigestiveTract", [][2]string{{"digestive track", "digestive tract"}, {"digestive tracks", "digestive tracts"}}},
	{"ExplanationMark", [][2]string{{"explanation mark", "exclamation mark"}, {"explanation marks", "exclamation marks"}, {"explanation point", "exclamation point"}}},
	{"ExtendOrExtent", [][2]string{
		{"a certain extend", "a certain extent"}, {"to an extend", "to an extent"},
		{"to some extend", "to some extent"}, {"to the extend that", "to the extent that"},
	}},
	{"GetUsedTo", [][2]string{
		{"get used of", "get used to"}, {"gets used of", "gets used to"}, {"getting used of", "getting used to"},
		{"got used of", "got used to"}, {"gotten used of", "gotten used to"},
	}},
	{"GrindToAHalt", [][2]string{
		{"grind to halt", "grind to a halt"}, {"grinds to halt", "grinds to a halt"},
		{"grinding to halt", "grinding to a halt"}, {"ground to halt", "ground to a halt"},
	}},
	{"InThisThatRegard", [][2]string{{"in this regards", "in this regard"}, {"in that regards", "in that regard"}}},
	{"InflectionPoint", [][2]string{{"infliction point", "inflection point"}, {"infliction points", "inflection points"}}},
	{"LookForwardTo", [][2]string{
		{"look forward for", "look forward to"}, {"looks forward for", "looks forward to"},
		{"looked forward for", "looked forward to"}, {"looking forward for", "looking forward to"},
	}},
	{"MakeDoWith", [][2]string{
		{"make due with", "make do with"}, {"makes due with", "makes do with"},
		{"made due with", "made do with"}, {"making due with", "making do with"},
	}},
	{"ResponsibilityFor", [][2]string{{"responsibility of", "responsibility for"}}},
	{"WreakHavoc", [][2]string{
		{"wreck havoc", "wreak havoc"}, {"wrecks havoc", "wreaks havoc"},
		{"wrecked havoc", "wreaked havoc"}, {"wrecking havoc", "wreaking havoc"},
	}},
	{"WroteToRote", [][2]string{{"by wrote", "by rote"}}},
	{"GetRidOf", [][2]string{
		{"get rid off", "get rid of"}, {"gets rid off", "gets rid of"}, {"getting rid off", "getting rid of"},
		{"got rid off", "got rid of"}, {"gotten rid off", "gotten rid of"},
		{"get ride of", "get rid of"}, {"gets ride of", "gets rid of"}, {"getting ride of", "getting rid of"},
		{"got ride of", "got rid of"}, {"gotten ride of", "gotten rid of"},
	}},
	{"StatuteOfLimitations", [][2]string{{"statue of limitations", "statute of limitations"}}},
	{"TrialAndError", [][2]string{{"trail and error", "trial and error"}}},
	{"ThanksALot", [][2]string{{"thanks lot", "thanks a lot"}}},
	{"InAnIdealWorld", [][2]string{{"in ideal world", "in an ideal world"}}},
	{"OutOfSync", [][2]string{{"out of sink", "out of sync"}}},
	{"Furthermore", [][2]string{{"further more", "furthermore"}}},
	{"Meanwhile", [][2]string{{"mean while", "meanwhile"}}},
	{"Therefore", [][2]string{{"there fore", "therefore"}}},
	{"Misunderstand", [][2]string{{"miss understand", "misunderstand"}}},
	{"Misused", [][2]string{{"miss used", "misused"}}},
	{"DoubleEdgedSword", [][2]string{
		{"double edged sword", "double-edged sword"}, {"double edge sword", "double-edged sword"},
		{"double edged swords", "double-edged swords"}, {"double edge swords", "double-edged swords"},
	}},
	{"BackhandedCompliment", [][2]string{
		{"back hand compliment", "backhanded compliment"}, {"backhand compliment", "backhanded compliment"},
		{"back hand compliments", "backhanded compliments"}, {"backhand compliments", "backhanded compliments"},
	}},
	{"InsteadOf", [][2]string{{"in stead of", "instead of"}}},
	{"AsOpposedTo", [][2]string{{"as oppose to", "as opposed to"}}},
	{"DueDiligence", [][2]string{{"do diligence", "due diligence"}}},
	{"EnMasse", [][2]string{{"in masse", "en masse"}, {"in mass", "en masse"}, {"on mass", "en masse"}, {"on masse", "en masse"}}},
	{"EnRoute", [][2]string{{"in route", "en route"}, {"on route", "en route"}}},
	{"ForALongTime", [][2]string{{"for along time", "for a long time"}}},
	{"HalfAnHour", [][2]string{{"half an our", "half an hour"}}},
	{"InHindsight", [][2]string{{"on hindsight", "in hindsight"}, {"in hind sight", "in hindsight"}, {"on hind sight", "in hindsight"}}},
	{"InTheSameVein", [][2]string{{"in the same vain", "in the same vein"}, {"in the same vane", "in the same vein"}, {"in same vain", "in the same vein"}, {"in same vein", "in the same vein"}}},
	{"OneAndTheSame", [][2]string{{"one in the same", "one and the same"}}},
	{"OnceInAWhile", [][2]string{{"once and a while", "once in a while"}, {"once awhile", "once in a while"}, {"once a while", "once in a while"}}},
	{"RulesOfThumb", [][2]string{{"rule of thumbs", "rules of thumb"}}},
	{"PointsOfView", [][2]string{{"point of views", "points of view"}}},
	{"PassersBy", [][2]string{{"passerbys", "passersby"}}},
	{"StateOfTheArt", [][2]string{{"state of art", "state of the art"}}},
	{"OneFellSwoop", [][2]string{{"one foul swoop", "one fell swoop"}, {"one fowl swoop", "one fell swoop"}}},
	{"Notwithstanding", [][2]string{{"not withstanding", "notwithstanding"}, {"not with standing", "notwithstanding"}}},
	{"Henceforth", [][2]string{{"hence forth", "henceforth"}}},
	{"Whereas", [][2]string{{"where as", "whereas"}}},
	{"Beforehand", [][2]string{{"before hand", "beforehand"}}},
	{"Alongside", [][2]string{{"along side", "alongside"}}},
	{"EveryTime", [][2]string{{"everytime", "every time"}}},
	{"OvertimeCompoundNoun", [][2]string{{"over time", "overtime"}}},
}

// Compile eagerly with the dictionary. Looking up the first word keeps the
// scan bounded by the small number of candidates for that word, not all rules.
func newPhraseIndex() map[string][]phrasePattern {
	index := make(map[string][]phrasePattern)
	for _, rule := range phraseRules {
		for _, pair := range rule.pairs {
			words := strings.Fields(pair[0])
			index[words[0]] = append(index[words[0]], phrasePattern{rule.rule, pair[1], words})
		}
	}
	return index
}
