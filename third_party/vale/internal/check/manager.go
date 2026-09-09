// Adapted from Vale v3.20.0: in-memory rule management only.
package check

import (
	"fmt"
	"github.com/vale-cli/vale/v3/internal/core"
	"github.com/vale-cli/vale/v3/internal/nlp"
	"strings"
)

// Manager controls the loading and validating of the check extension points.
type Manager struct {
	Config *core.Config

	scopes       map[string]struct{}
	rules        map[string]Rule
	styles       []string
	needsTagging bool
}

// AddRule adds the given rule to the manager.
func (mgr *Manager) AddRule(name string, rule Rule) error {
	if _, found := mgr.rules[name]; !found {
		mgr.rules[name] = rule
		return nil
	}
	return fmt.Errorf("the rule '%s' has already been added", name)
}

// RuleForAlert maps an alert's check name back to the rule that defines it.
//
// Most alerts carry their rule's name already. A `consistency` rule names its
// alerts `Style.Rule.<term>`, and a rule may itself sit in a subdirectory
// (`Std.dates.TimeFormat`), so neither dot-counting nor position says where
// the rule ends: the longest known prefix does. An unknown name falls back to
// its first two segments, which is the historical reading (see #129).
func (mgr *Manager) RuleForAlert(name string) string {
	if _, ok := mgr.rules[name]; ok {
		return name
	}

	for prefix := name; strings.Contains(prefix, "."); {
		prefix = prefix[:strings.LastIndex(prefix, ".")]
		if _, ok := mgr.rules[prefix]; ok {
			return prefix
		}
	}

	if parts := strings.Split(name, "."); len(parts) > 2 {
		return parts[0] + "." + parts[1]
	}
	return name
}

// Rules are all of the Manager's compiled `Rule`s.
func (mgr *Manager) Rules() map[string]Rule {
	return mgr.rules
}

// HasScope returns `true` if the manager has a rule that applies to `scope`.
func (mgr *Manager) HasScope(scope string) bool {
	_, found := mgr.scopes[scope]
	return found
}

// NeedsTagging indicates if POS tagging is needed.
func (mgr *Manager) NeedsTagging() bool {
	return mgr.needsTagging
}

// AssignNLP determines what NLP tasks a file needs.
func (mgr *Manager) AssignNLP(f *core.File) nlp.Info {
	return nlp.Info{
		Scope:        f.RealExt,
		Segmentation: mgr.HasScope("sentence"),
		Splitting:    mgr.HasScope("paragraph"),
		Tagging:      mgr.NeedsTagging(),
		Endpoint:     f.NLP.Endpoint,
		Lang:         f.NLP.Lang,
	}
}
func (mgr *Manager) addCheck(file []byte, chkName, path string) error {
	rule, taggedPOS, err := mgr.compileCheck(file, chkName, path)
	if err != nil {
		return err
	}
	return mgr.registerCheck(chkName, rule, taggedPOS)
}

// compileCheck turns a rule's source into a Rule.
//
// It reads mgr.Config but does not touch mgr's mutable state, so it is safe to
// run concurrently for different rules. Everything that writes to the Manager
// is in registerCheck.
func (mgr *Manager) compileCheck(file []byte, chkName, path string) (Rule, bool, error) {

	generic, err := parse(file, path)
	if err != nil {
		return nil, false, err
	}

	generic["name"] = chkName
	generic["path"] = path

	if level, ok := mgr.Config.RuleToLevel[chkName]; ok {
		generic["level"] = level
	} else if level, ok = mgr.Config.RuleToLevel[core.StyleName(chkName)]; ok {
		generic["level"] = level
	} else if _, ok = generic["level"]; !ok {
		generic["level"] = "warning"
	}

	for param, val := range mgr.Config.RuleToParams[chkName] {
		generic[param] = val
	}
	if scope, ok := generic["scope"]; scope == nil || !ok {

		if extends, _ := generic["extends"].(string); extends != "sequence" {
			generic["scope"] = []string{"text"}
		}
	}

	rule, err := buildRule(mgr.Config, generic)
	if err != nil {
		return nil, false, err
	}

	pos, ok := generic["pos"]
	return rule, ok && pos != "", nil
}

// scopeBases names the block families a declared scope needs built.
//
// A scope may chain terms with `&`, and each term asks for its own family:
// `paragraph & ~heading` needs paragraph splitting as much as `paragraph`
// does. Reading the whole chain as one name left HasScope false, splitting
// off, and the rule silently matching nothing. See #1133.
//
// A negated term asks for a family's absence, which needs nothing built.
func scopeBases(s string) []string {
	bases := []string{}
	for _, part := range strings.Split(s, "&") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "~") {
			continue
		}
		bases = append(bases, strings.Split(part, ".")[0])
	}
	return bases
}

// registerCheck records a compiled rule and what it implies for the run.
func (mgr *Manager) registerCheck(chkName string, rule Rule, taggedPOS bool) error {
	for _, s := range rule.Fields().Scope {
		for _, base := range scopeBases(s) {
			mgr.scopes[base] = struct{}{}
		}
	}

	if rule.Fields().Extends == "sequence" || taggedPOS {
		mgr.needsTagging = true
	}

	return mgr.AddRule(chkName, rule)
}
