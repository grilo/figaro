package writing

import (
	"context"
	"io/fs"

	"figaro/internal/writing/grammar"
	"github.com/vale-cli/vale/v3/embedded"
)

type grammarAnalyzer struct {
	vale    *embedded.Engine
	lexicon grammar.Lexicon
}

func newGrammarAnalyzer(rules fs.FS) (*grammarAnalyzer, error) {
	dictionary, err := fs.ReadFile(rules, "config/dictionaries/harper.dict")
	if err != nil {
		return nil, err
	}
	vale, err := embedded.New(rules)
	if err != nil {
		return nil, err
	}
	return &grammarAnalyzer{vale: vale, lexicon: grammar.NewLexicon(string(dictionary))}, nil
}
func (a *grammarAnalyzer) Analyze(ctx context.Context, text string) ([]embedded.Alert, error) {
	alerts, err := a.vale.Analyze(ctx, text)
	if err != nil {
		return nil, err
	}
	// The pure pass is bounded; the coordinator owns cancellation and deadlines.
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	findings, err := a.lexicon.Analyze(text)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	// Convert rune offsets in one pass, preserving repeated matches and Unicode.
	line, column, pos := 1, 1, 0
	chars := []rune(text)
	for _, finding := range findings {
		// Rules at the same token are possible, so locate from the containing line.
		if finding.From < pos {
			line, column, pos = 1, 1, 0
		}
		for pos < finding.From {
			if chars[pos] == '\n' {
				line++
				column = 1
			} else {
				column++
			}
			pos++
		}
		alert := embedded.Alert{Check: "FigaroGrammar." + finding.Rule, Message: finding.Message, Severity: "warning", Match: finding.Actual, Line: line, Span: []int{column, column + finding.To - finding.From - 1}}
		if finding.Replacement != "" {
			alert.Action.Name = "replace"
			alert.Action.Params = []string{finding.Replacement}
		}
		alerts = append(alerts, alert)
	}
	// Never return a partial collection after an intermediate bound is reached.
	if len(alerts) > 32768 {
		return nil, grammar.ErrWorkLimit
	}
	return mergeGrammarAlerts(alerts), nil
}
