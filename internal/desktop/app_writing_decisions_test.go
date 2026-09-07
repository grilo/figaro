package desktop

import (
	"figaro/internal/settings"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
)

func TestWritingDecisionsSurviveRestartAndRestoreWithoutChangingNotes(t *testing.T) {
	dir := t.TempDir()
	app := NewApp(dir)
	values, err := app.WritingDecisionsLoad("Memo.md")
	if err != nil || len(values) != 0 {
		t.Fatal(values, err)
	}
	if _, err := os.Stat(filepath.Join(dir, writingDecisionsPath)); !os.IsNotExist(err) {
		t.Fatal("load wrote config")
	}
	writeTestFile(t, dir, "Memo.md", "The SLO is ready. teh")
	commands := []settings.WritingDecisionChange{
		{Action: "add", Decision: settings.WritingDecision{ID: "acronym", Type: "acronym", Language: "en-US", Acronym: "SLO"}},
		{Action: "add", Decision: settings.WritingDecision{ID: "word", Type: "occurrence", Language: "en-US", Kind: "grammar.spelling", Title: "Spelling", Text: "teh", Before: "The SLO is ready. "}},
	}
	var group sync.WaitGroup
	for _, command := range commands {
		group.Go(func() {
			if _, err := app.WritingDecisionsChange("Memo.md", command); err != nil {
				t.Error(err)
			}
		})
	}
	group.Wait()
	reopened := NewApp(dir)
	values, err = reopened.WritingDecisionsLoad("Memo.md")
	if err != nil || len(values) != 2 {
		t.Fatal(values, err)
	}
	other, err := reopened.WritingDecisionsLoad("Other.md")
	if err != nil || len(other) != 0 {
		t.Fatal("leaked", other, err)
	}
	if _, err := reopened.WritingDecisionsChange("Memo.md", settings.WritingDecisionChange{Action: "remove", ID: "acronym"}); err != nil {
		t.Fatal(err)
	}
	values, err = NewApp(dir).WritingDecisionsLoad("Memo.md")
	if err != nil || len(values) != 1 || values[0].ID != "word" {
		t.Fatal(values, err)
	}
	if readTestFile(t, dir, "Memo.md") != "The SLO is ready. teh" {
		t.Fatal("note changed")
	}
	info, err := os.Stat(filepath.Join(dir, writingDecisionsPath))
	if err != nil || (runtime.GOOS != "windows" && info.Mode().Perm()&0077 != 0) {
		t.Fatal("permissions", info, err)
	}
}

func TestWritingDecisionsPreserveUnreadableStateAndRejectOutsideSymlinks(t *testing.T) {
	dir, outside := t.TempDir(), t.TempDir()
	app := NewApp(dir)
	command := settings.WritingDecisionChange{Action: "add", Decision: settings.WritingDecision{ID: "one", Type: "acronym", Language: "en-US", Acronym: "SLO"}}
	for _, invalid := range []string{"", "{broken", `{"version":99,"documents":{}}`} {
		writeTestFile(t, dir, writingDecisionsPath, invalid)
		if _, err := app.WritingDecisionsLoad("Memo.md"); err == nil {
			t.Fatal("loaded invalid")
		}
		if _, err := app.WritingDecisionsChange("Memo.md", command); err == nil {
			t.Fatal("overwrote invalid")
		}
		if readTestFile(t, dir, writingDecisionsPath) != invalid {
			t.Fatal("original changed")
		}
	}
	if err := os.Remove(filepath.Join(dir, writingDecisionsPath)); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, outside, "decisions.json", `{"version":1,"documents":{}}`)
	if err := os.Symlink(filepath.Join(outside, "decisions.json"), filepath.Join(dir, writingDecisionsPath)); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if _, err := app.WritingDecisionsChange("Memo.md", command); err == nil {
		t.Fatal("followed outside symlink")
	}
	if readTestFile(t, outside, "decisions.json") != `{"version":1,"documents":{}}` {
		t.Fatal("outside data changed")
	}
}

func TestWritingDecisionUpdatedAnchorsSurviveNativeStorageRestart(t *testing.T) {
	dir := t.TempDir()
	app := NewApp(dir)
	writeTestFile(t, dir, "Memo.md", "We utilize concise language.")
	d := settings.WritingDecision{ID: "one", Type: "occurrence", Language: "en-US", Kind: "lexicon.complex-word", Title: "Simpler word", Text: "utilize", Before: "We ", After: " clear language."}
	if _, err := app.WritingDecisionsChange("Memo.md", settings.WritingDecisionChange{Action: "add", Decision: d}); err != nil {
		t.Fatal(err)
	}
	d.After = " concise language."
	d.ExactOnly = true
	if _, err := app.WritingDecisionsChange("Memo.md", settings.WritingDecisionChange{Action: "reanchor", Anchors: []settings.WritingDecision{d}}); err != nil {
		t.Fatal(err)
	}
	values, err := NewApp(dir).WritingDecisionsLoad("Memo.md")
	if err != nil || len(values) != 1 || values[0].After != d.After || !values[0].ExactOnly {
		t.Fatal(values, err)
	}
	if readTestFile(t, dir, "Memo.md") != "We utilize concise language." {
		t.Fatal("reanchor changed note")
	}
}
