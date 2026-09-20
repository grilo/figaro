package writing

import "github.com/vale-cli/vale/v3/embedded"

// mergeGrammarAlerts gives a reviewed contraction correction precedence over
// the port's generic doubled-determiner advice at the exact same start. Other
// rule families and other occurrences retain their independent evidence.
func mergeGrammarAlerts(alerts []embedded.Alert) []embedded.Alert {
	covered := map[[2]int]bool{}
	for _, alert := range alerts {
		if len(alert.Span) != 2 || alert.Action.Name != "replace" {
			continue
		}
		switch alert.Check {
		case "FigaroGrammar.ItsContraction", "FigaroGrammar.TheirToTheyre", "FigaroGrammar.YourPredicateAdjective":
			covered[[2]int{alert.Line, alert.Span[0]}] = true
		}
	}
	if len(covered) == 0 {
		return alerts
	}
	result := make([]embedded.Alert, 0, len(alerts))
	for _, alert := range alerts {
		if alert.Check == "Harper.TheMy" && len(alert.Span) == 2 && covered[[2]int{alert.Line, alert.Span[0]}] {
			continue
		}
		result = append(result, alert)
	}
	return result
}
