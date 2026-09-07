package desktop

import (
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"figaro/internal/settings"
)

func saveWritingMoveState(t *testing.T, app *App, path string) {
	t.Helper()
	if err := app.WritingLensesSave(path, settings.WritingLensesPreferences{Language: "en-GB", Lenses: []string{"spelling", "formulaic"}}); err != nil {
		t.Fatal(err)
	}
	for _, decision := range []settings.WritingDecision{
		{ID: "acronym", Type: "acronym", Language: "en-GB", Acronym: "XYZ"},
		{ID: "ignore", Type: "occurrence", Language: "en-GB", Kind: "style.wordiness", Title: "Shorter phrase", Text: "in order to", Before: "work ", After: " help", ExactOnly: true},
	} {
		if _, err := app.WritingDecisionsChange(path, settings.WritingDecisionChange{Action: "add", Decision: decision}); err != nil {
			t.Fatal(err)
		}
	}
}
func assertWritingMoved(t *testing.T, dir, oldPath, newPath string) {
	t.Helper()
	app := NewApp(dir)
	choices, err := app.WritingLensesLoad(newPath)
	if err != nil || choices.Language != "en-GB" || !reflect.DeepEqual(choices.Lenses, []string{"spelling", "formulaic"}) {
		t.Fatal(choices, err)
	}
	decisions, err := app.WritingDecisionsLoad(newPath)
	if err != nil || len(decisions) != 2 || decisions[0].ID != "acronym" || !decisions[1].ExactOnly {
		t.Fatal(decisions, err)
	}
	prior, err := app.WritingDecisionsLoad(oldPath)
	if err != nil || len(prior) != 0 {
		t.Fatal(prior, err)
	}
	if _, err = app.WritingDecisionsChange(newPath, settings.WritingDecisionChange{Action: "remove", ID: "ignore"}); err != nil {
		t.Fatal(err)
	}
	if info, err := os.Stat(filepath.Join(dir, writingDecisionsPath)); err != nil || (runtime.GOOS != "windows" && info.Mode().Perm() != 0600) {
		t.Fatalf("permissions: %v %v", info, err)
	}
}
func TestWritingStateFollowsFileRenameFolderMoveAndMergeAfterRestart(t *testing.T) {
	for _, kind := range []string{"rename", "folder", "merge"} {
		t.Run(kind, func(t *testing.T) {
			dir := t.TempDir()
			app := NewApp(dir)
			source := "Folder/Note.md"
			writeTestFile(t, dir, source, "We work in order to help XYZ.\n")
			saveWritingMoveState(t, app, source)
			destination := "Folder/Renamed.md"
			var result *SaveFileResult
			var err error
			switch kind {
			case "rename":
				result, err = app.RenamePathWithLinkUpdates(source, destination, false)
			case "folder":
				destination = "Archive/Folder/Note.md"
				result, err = app.MovePath("Folder", "Archive")
			case "merge":
				writeTestFile(t, dir, "Archive/Folder/Note.md", "Keep destination.\n")
				if err = app.WritingLensesSave("Archive/Folder/Note.md", settings.WritingLensesPreferences{Language: "es", Lenses: []string{"spelling"}}); err != nil {
					t.Fatal(err)
				}
				destination = "Archive/Folder/Note (copy).md"
				result, err = app.MergeDirectory("Folder", "Archive")
				if readTestFile(t, dir, "Archive/Folder/Note.md") != "Keep destination.\n" {
					t.Fatal("overwrote destination")
				}
				prefs, e := app.WritingLensesLoad("Archive/Folder/Note.md")
				if e != nil || prefs.Language != "es" {
					t.Fatal(prefs, e)
				}
			}
			if err != nil || !result.Success {
				t.Fatalf("move: %+v %v", result, err)
			}
			assertWritingMoved(t, dir, source, destination)
			if got := readTestFile(t, dir, destination); got != "We work in order to help XYZ.\n" {
				t.Fatal(got)
			}
		})
	}
}
func TestWritingMovePreflightRejectsConflictsCorruptionAndEscapingSymlinks(t *testing.T) {
	for _, kind := range []string{"conflict", "corrupt", "symlink"} {
		t.Run(kind, func(t *testing.T) {
			dir := t.TempDir()
			app := NewApp(dir)
			writeTestFile(t, dir, "Note.md", "Keep source.")
			saveWritingMoveState(t, app, "Note.md")
			if kind == "conflict" {
				saveWritingMoveState(t, app, "New.md")
			}
			if kind == "corrupt" {
				writeTestFile(t, dir, writingDecisionsPath, "{broken")
			}
			if kind == "symlink" {
				outside := t.TempDir()
				writeTestFile(t, outside, "decisions.json", "private")
				if err := os.Remove(filepath.Join(dir, writingDecisionsPath)); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(filepath.Join(outside, "decisions.json"), filepath.Join(dir, writingDecisionsPath)); err != nil {
					t.Skip(err)
				}
			}
			before := readTestFile(t, dir, writingLensesPath)
			result, err := app.RenamePath("Note.md", "New.md")
			if err == nil && (result == nil || result.Success) {
				t.Fatalf("unsafe move: %v", result)
			}
			if readTestFile(t, dir, "Note.md") != "Keep source." || readTestFile(t, dir, writingLensesPath) != before {
				t.Fatal("failed move changed source or metadata")
			}
			if _, err = os.Stat(filepath.Join(dir, "New.md")); !os.IsNotExist(err) {
				t.Fatal("destination created")
			}
		})
	}
}
func TestWritingMoveRollbackRestoresRootedMetadataBytesAndPermissions(t *testing.T) {
	dir := t.TempDir()
	app := NewApp(dir)
	saveWritingMoveState(t, app, "Note.md")
	before := readTestFile(t, dir, writingLensesPath)
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	changes, err := planWritingPathMove(root, "Note.md", "New.md")
	if err != nil {
		t.Fatal(err)
	}
	rollback, err := applyWritingPathMove(root, changes)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(readTestFile(t, dir, writingLensesPath), "New.md") {
		t.Fatal("not relocated")
	}
	if err = rollback(); err != nil {
		t.Fatal(err)
	}
	if readTestFile(t, dir, writingLensesPath) != before {
		t.Fatal("rollback lost original bytes")
	}
	entries, _ := os.ReadDir(filepath.Join(dir, ".config"))
	for _, entry := range entries {
		if strings.Contains(entry.Name(), ".tmp-") {
			t.Fatal("left temporary file")
		}
	}
}

func TestWritingMoveRestoresFirstFileWhenSecondAtomicWriteMeetsEscapingSymlink(t *testing.T) {
	dir, outside := t.TempDir(), t.TempDir()
	app := NewApp(dir)
	saveWritingMoveState(t, app, "Note.md")
	original := readTestFile(t, dir, writingLensesPath)
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	changes, err := planWritingPathMove(root, "Note.md", "New.md")
	if err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, outside, "private.json", "outside unchanged")
	if err = os.Remove(filepath.Join(dir, writingDecisionsPath)); err != nil {
		t.Fatal(err)
	}
	if err = os.Symlink(filepath.Join(outside, "private.json"), filepath.Join(dir, writingDecisionsPath)); err != nil {
		t.Skip(err)
	}
	if _, err = applyWritingPathMove(root, changes); err == nil {
		t.Fatal("escaping write accepted")
	}
	if readTestFile(t, dir, writingLensesPath) != original {
		t.Fatal("first file was not rolled back")
	}
	if readTestFile(t, outside, "private.json") != "outside unchanged" {
		t.Fatal("outside file changed")
	}
}

func TestWritingMergeConflictRollsBackPreparedCopyNamesAndWritingState(t *testing.T) {
	dir := t.TempDir()
	app := NewApp(dir)
	writeTestFile(t, dir, "Folder/Note.md", "Source.")
	writeTestFile(t, dir, "Archive/Folder/Note.md", "Destination.")
	saveWritingMoveState(t, app, "Folder/Note.md")
	saveWritingMoveState(t, app, "Archive/Folder/Note (copy).md")
	result, err := app.MergeDirectory("Folder", "Archive")
	if err != nil || result.Success || !strings.Contains(result.Error, "saved writing data already exists") {
		t.Fatalf("merge: %+v %v", result, err)
	}
	if readTestFile(t, dir, "Folder/Note.md") != "Source." || readTestFile(t, dir, "Archive/Folder/Note.md") != "Destination." {
		t.Fatal("merge changed existing files")
	}
	for _, path := range []string{"Folder/Note.md", "Archive/Folder/Note (copy).md"} {
		values, e := NewApp(dir).WritingDecisionsLoad(path)
		if e != nil || len(values) != 2 {
			t.Fatalf("lost %s decisions: %v %v", path, values, e)
		}
	}
	if _, err = os.Stat(filepath.Join(dir, "Folder/Note (copy).md")); !os.IsNotExist(err) {
		t.Fatal("left prepared collision name")
	}
}
