package lint

import (
	"context"
	"errors"
	"runtime"
	"sort"
	"strings"
	"sync"

	"github.com/vale-cli/vale/v3/internal/check"
	"github.com/vale-cli/vale/v3/internal/core"
	"github.com/vale-cli/vale/v3/internal/nlp"
)

// A Linter lints a File.
type Linter struct {
	ctx       context.Context
	Manager   *check.Manager
	nonGlobal bool

	// inScope lists the rules whose scope matches a given block scope, keyed by
	// the block's scope and parent.
	//
	// Whether a rule's scope matches depends on nothing else, and a document
	// has a handful of distinct block scopes against several hundred rules --
	// so the answer was being recomputed for every rule on every block, which
	// was the largest part of deciding what to run.
	inScope *sync.Map
}

// scopedRule is a rule together with the name it was registered under.
type scopedRule struct {
	name string
	rule check.Rule
}

type lintResult struct {
	file *core.File
	err  error
}

// LintString src according to its format.
func (l *Linter) LintString(src string) ([]*core.File, error) {

	linted := l.lintFile(src)
	return []*core.File{linted.file}, linted.err
}

// lintFile creates a new `File` from the path `src` and selects a linter based
// on its format.
func (l *Linter) lintFile(src string) lintResult {
	var err error
	if err := l.cancelled(); err != nil {
		return lintResult{err: err}
	}

	file, err := core.NewFile(src, l.Manager.Config)
	if err != nil {
		return lintResult{err: err}
	} else if len(file.Checks) == 0 && len(file.BaseStyles) == 0 {
		if len(l.Manager.Config.GBaseStyles) == 0 && len(l.Manager.Config.GChecks) == 0 {
			// There's nothing to do; bail early.
			return lintResult{file: file}
		}
	}

	// Determine what NLP tasks this particular file needs; the goal is to do
	// the least amount of work possible.
	file.Context = l.ctx
	file.NLP = l.Manager.AssignNLP(file)
	file.NLP.Context = l.ctx
	if file.NormedExt != ".txt" || file.NLP.Endpoint != "" {
		return lintResult{err: errors.New("embedded Vale accepts local projected prose only")}
	}
	err = l.lintTxt(file)

	if err == nil {
		// Run all rules with `scope: raw`
		//
		// NOTE: We need to use `f.Lines` (instead of `f.Content`) to ensure
		// that we don't include any markup preprocessing.
		//
		// See #248, #306.
		raw := nlp.NewBlock("", strings.Join(file.Lines, ""), "raw"+file.RealExt)
		err = l.lintBlock(file, raw, len(file.Lines), 0, true)
	}

	// A transformed file's alerts live in the stylesheet's output, which the
	// sanitizer's shifts say nothing about.
	if err == nil && file.Transform == "" {
		file.MapAlertsToSource()
	}

	return lintResult{file, err}
}

// lintProse segments blk and runs every applicable rule over the results.
//
// split says whether blk holds paragraphs; a heading or a list item is prose,
// but not a paragraph. See nlp.Info.Compute.
func (l *Linter) lintProse(f *core.File, blk nlp.Block, lines int, split bool) error {
	if err := l.cancelled(); err != nil {
		return err
	}
	blks, err := f.NLP.Compute(&blk, split)
	if err != nil {
		return core.NewE100("NLP.Compute", err)
	}

	// FIXME: This is required for paragraphs that lack a newline delimiter:
	//
	// p1
	// p2
	//
	// See fixtures/i18n for an example.
	needsLookup := strings.Count(blk.Text, "\n") > 0 || f.Lookup

	// Segmenting hands back blocks that differ in scope but not always in
	// text, so a rule matching both runs twice over the same string. The second
	// run reports nothing the first did not, and it was once worth tracking
	// which rules had already seen a text to skip it.
	//
	// It no longer is: the prefilter now turns a repeat away cheaply, leaving
	// the bookkeeping to cost more than the work it saved -- 38% of the peak
	// memory on a plain-text run, for no time back.
	for _, b := range blks {
		err = l.lintBlock(f, b, lines, 0, needsLookup)
		if err != nil {
			return err
		}
	}

	return nil
}

func (l *Linter) lintTxt(f *core.File) error {
	block := nlp.NewBlock("", f.Content, "text"+f.MetaScope+f.RealExt)
	return l.lintProse(f, block, len(f.Lines), true)
}

func (l *Linter) lintLines(f *core.File) error {
	block := nlp.NewBlock("", f.Content, "text"+f.MetaScope+f.RealExt)
	return l.lintBlock(f, block, len(f.Lines), 0, true)
}

// concurrentKinds names the extension points whose Run reads nothing but the
// block it is given.
//
// The rest reach into the file: `consistency` and `conditional` accumulate
// matches on it, `sequence` tags through a cache it owns, `metric` reads its
// counts, and `spelling` holds a dictionary of its own. Those keep the serial
// pass.
var concurrentKinds = map[string]bool{
	"capitalization": true,
	"existence":      true,
	"occurrence":     true,
	"readability":    true,
	"repetition":     true,
	"script":         true,
	"substitution":   true,
}

// blockWorkers bounds rule concurrency across the whole run, not per block:
// files are already linted in parallel, and a pool per block would multiply by
// however many are in flight.
var blockWorkers = make(chan struct{}, min(2, runtime.GOMAXPROCS(0)))

// parallelFloor is the block size below which running rules concurrently costs
// more than it saves. A variable so a test can force either path over the same
// input.
var parallelFloor = 4096

// lintBlock runs every applicable rule over blk.
//
// Rules that only read the block run concurrently; the rest run in order
// afterwards. Alerts are added in rule order either way, so which rule wins a
// span, and what `ChkToCtx` holds when a later one is formatted, do not depend
// on the scheduler.
func (l *Linter) lintBlock(f *core.File, blk nlp.Block, lines, pad int, lookup bool) error {
	if err := l.cancelled(); err != nil {
		return err
	}
	f.StartBlock()

	rules := l.inScopeFor(blk)

	// Below the floor the bookkeeping concurrency needs -- two slices the
	// length of the rule set, per block -- costs more than the rules do. Most
	// blocks are a paragraph.
	if len(blk.Text) < parallelFloor {
		return l.lintBlockSerial(f, blk, rules, lines, pad, lookup)
	}

	found := make([][]core.Alert, len(rules))
	wanted := make([]bool, len(rules))

	var todo []int
	for i, r := range rules {
		if !l.shouldRun(r.name, f, r.rule) {
			continue
		}
		wanted[i] = true
		if concurrentKinds[r.rule.Fields().Extends] {
			todo = append(todo, i)
		}
	}

	if err := l.runConcurrently(f, blk, rules, todo, found); err != nil {
		return err
	}

	for i, r := range rules {
		if !wanted[i] || found[i] != nil {
			continue
		}
		alerts, err := l.runRule(r.rule, blk, f)
		if err != nil {
			return err
		}
		found[i] = alerts
	}

	for i, r := range rules {
		if !wanted[i] {
			continue
		}
		info := r.rule.Fields()
		for j := range found[i] {
			if f.QueryComments(r.name + "[" + found[i][j].Match + "]") {
				continue
			}
			setLevel(&found[i][j], f, info, r.name)
			f.AddAlert(found[i][j], blk, lines, pad, lookup)
		}
	}

	return nil
}

// setLevel finishes an alert, reporting it at the level this file gives its
// rule.
//
// Assigning the severity rather than leaving it to FormatAlert is what makes a
// per-format level take effect: a check builds its alerts with the level it was
// compiled with already set, and FormatAlert only fills a severity that is
// still empty. See #965.
func setLevel(a *core.Alert, f *core.File, info check.Definition, name string) {
	level := f.Level(name, info.Level)

	core.FormatAlert(a, info.Limit, level, name)
	a.Severity = level
}

// lintBlockSerial is lintBlock without the concurrency, and without what it
// costs to set up.
func (l *Linter) lintBlockSerial(f *core.File, blk nlp.Block, rules []scopedRule, lines, pad int, lookup bool) error {
	for _, r := range rules {
		name, chk := r.name, r.rule
		if !l.shouldRun(name, f, chk) {
			continue
		}

		info := chk.Fields()

		alerts, err := l.runRule(chk, blk, f)
		if err != nil {
			return err
		}
		for i := range alerts {
			if f.QueryComments(name + "[" + alerts[i].Match + "]") {
				continue
			}
			setLevel(&alerts[i], f, info, name)
			f.AddAlert(alerts[i], blk, lines, pad, lookup)
		}
	}

	return nil
}

// runConcurrently fills found[i] for each rule named in todo.
//
// An empty result is stored as a non-nil slice so the serial pass can tell a
// rule that ran and found nothing from one it has yet to run.
func (l *Linter) runConcurrently(f *core.File, blk nlp.Block, rules []scopedRule, todo []int, found [][]core.Alert) error {
	if len(todo) < 2 {
		return nil
	}

	var (
		wg     sync.WaitGroup
		mu     sync.Mutex
		failed error
	)

	for _, i := range todo {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			select {
			case blockWorkers <- struct{}{}:
			case <-l.ctx.Done():
				mu.Lock()
				if failed == nil {
					failed = l.ctx.Err()
				}
				mu.Unlock()
				return
			}
			defer func() { <-blockWorkers }()

			alerts, err := l.runRule(rules[i].rule, blk, f)
			if alerts == nil {
				alerts = []core.Alert{}
			}

			mu.Lock()
			defer mu.Unlock()
			if err != nil && failed == nil {
				failed = err
			}
			found[i] = alerts
		}(i)
	}

	wg.Wait()

	return failed
}

// lookup reads a setting given for a rule, falling back to one given for the
// style it belongs to.
func lookup(settings map[string]bool, rule, style string) (bool, bool) {
	if val, ok := settings[rule]; ok {
		return val, true
	}
	val, ok := settings[style]
	return val, ok
}

// inScopeFor returns the rules that could run on blk, by scope alone.
//
// Built once per distinct block scope and reused. Everything else shouldRun
// weighs -- in-text comments, the file's own settings, the minimum level --
// varies per file and is still decided there.
func (l *Linter) inScopeFor(blk nlp.Block) []scopedRule {
	key := blk.Scope + "\x00" + blk.Parent
	if l.inScope != nil {
		if hit, ok := l.inScope.Load(key); ok {
			return hit.([]scopedRule) //nolint:errcheck // only []scopedRule is stored
		}
	}

	rules := l.Manager.Rules()
	found := make([]scopedRule, 0, len(rules))
	for name, chk := range rules {
		if check.NewScope(chk.Fields().Scope).Matches(blk) {
			found = append(found, scopedRule{name: name, rule: chk})
		}
	}

	// A stable order, so that two blocks of the same scope are linted in the
	// same sequence rather than in whatever order the map produced.
	sort.Slice(found, func(i, j int) bool { return found[i].name < found[j].name })

	if l.inScope != nil {
		l.inScope.Store(key, found)
	}

	return found
}

func (l *Linter) shouldRun(name string, f *core.File, chk check.Rule) bool {
	minLevel := l.Manager.Config.MinAlertLevel
	run := false

	details := chk.Fields()

	// Configuration addresses the defining rule: a `consistency` alert's
	// name carries a matched term, and a rule's own name may span
	// subdirectories, so the rule is found by name, not by dot-count.
	// See #129.
	name = l.Manager.RuleForAlert(name)

	if f.QueryComments(name) {
		// It has been disabled via an in-text comment.
		return false
	} else if core.LevelToInt[f.Level(name, details.Level)] < minLevel {
		// The level this file gives the rule, which a section may have changed
		// for this format alone. See #965.
		return false
	}

	style := core.StyleName(name)

	// Has the check been disabled for this extension?
	//
	// The rule's own setting is looked for first and the style's only after,
	// so that `proselint = NO` can turn a style off while
	// `proselint.Typography = YES` keeps one of its rules.
	if val, ok := lookup(f.Checks, name, style); ok && !run {
		if !val {
			return false
		}
		run = true
	}

	// Has the check been disabled for all extensions?
	if val, ok := lookup(l.Manager.Config.GChecks, name, style); ok && !run {
		if !val {
			return false
		}
		run = true
	}

	if !run && !core.StringInSlice(style, f.BaseStyles) {
		return false
	}

	return true
}
