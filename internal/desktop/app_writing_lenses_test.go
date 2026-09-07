package desktop

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"figaro/internal/settings"
)

func TestWritingLensesIncludingFormulaicPersistWithoutChangingNotes(t *testing.T) {
	dir := t.TempDir()
	app := NewApp(dir)
	want := settings.WritingLensesPreferences{Language: "en-US", Lenses: []string{"direct", "spelling", "plain", "consistency", "grammar", "readability", "inclusive", "formulaic"}}
	if _, err := app.WritingLensesLoad("Memo.md"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, writingLensesPath)); !os.IsNotExist(err) {
		t.Fatalf("read created preferences: %v", err)
	}
	writeTestFile(t, dir, "Memo.md", "We should be doing a task.\n")
	if err := app.WritingLensesSave("Memo.md", want); err != nil {
		t.Fatal(err)
	}
	got, err := NewApp(dir).WritingLensesLoad("Memo.md")
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("reopened preferences = %#v, %v", got, err)
	}
	if got := readTestFile(t, dir, "Memo.md"); got != "We should be doing a task.\n" {
		t.Fatalf("note changed: %q", got)
	}
	data := readTestFile(t, dir, writingLensesPath)
	var stored struct {
		Version int `json:"version"`
	}
	if err := json.Unmarshal([]byte(data), &stored); err != nil || stored.Version != 3 {
		t.Fatalf("invalid schema: %s", data)
	}
}

func TestWritingLensesSavePreservesUnknownSectionsAndRejectsInvalidFiles(t *testing.T) {
	dir := t.TempDir()
	app := NewApp(dir)
	want := settings.WritingLensesPreferences{Language: "none", Lenses: []string{"plain"}}
	writeTestFile(t, dir, writingLensesPath, `{"version":1,"documents":{"Memo.md":{"dismissed":["keep"]}}}`)
	if err := app.WritingLensesSave("Memo.md", want); err != nil {
		t.Fatal(err)
	}
	var record map[string]json.RawMessage
	if err := json.Unmarshal([]byte(readTestFile(t, dir, writingLensesPath)), &record); err != nil {
		t.Fatal(err)
	}
	var documents map[string]map[string]json.RawMessage
	if err := json.Unmarshal(record["documents"], &documents); err != nil {
		t.Fatalf("document decisions were lost: %s", record["documents"])
	}
	var dismissed []string
	if json.Unmarshal(documents["Memo.md"]["dismissed"], &dismissed) != nil || !reflect.DeepEqual(dismissed, []string{"keep"}) {
		t.Fatal("dismissed metadata lost")
	}
	for _, invalid := range []string{`{broken`, `null`, `{"version":4}`, `{"version":1,"preferences":{"primary":"unknown"}}`} {
		writeTestFile(t, dir, writingLensesPath, invalid)
		if err := app.WritingLensesSave("Memo.md", want); err == nil {
			t.Fatalf("accepted invalid metadata %q", invalid)
		}
		if got := readTestFile(t, dir, writingLensesPath); got != invalid {
			t.Fatalf("invalid metadata overwritten: %q", got)
		}
	}
}

func TestWritingLensesSaveCannotFollowConfigSymlinkOutsideVault(t *testing.T) {
	dir, outside := t.TempDir(), t.TempDir()
	if err := os.Symlink(outside, filepath.Join(dir, ".config")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	writeTestFile(t, outside, "writing-lenses.json", `{"version":1}`)
	if err := NewApp(dir).WritingLensesSave("Memo.md", settings.DefaultWritingLenses()); err == nil {
		t.Fatal("write followed outside config symlink")
	}
	if got := readTestFile(t, outside, "writing-lenses.json"); got != `{"version":1}` {
		t.Fatalf("outside file changed: %s", got)
	}
}

func TestWritingLensesVersionOneMigrationIsExplicitAndKeepsUnknownPreferenceFields(t *testing.T) {
	dir := t.TempDir()
	app := NewApp(dir)
	original := `{"version":1,"preferences":{"primary":"plain","overlays":[],"future":"keep"},"documents":{"private":"retain"}}`
	writeTestFile(t, dir, writingLensesPath, original)
	value, err := app.WritingLensesLoad("Memo.md")
	if err != nil {
		t.Fatal(err)
	}
	if value.Language != "none" {
		t.Fatalf("unsafe migration defaults: %#v", value)
	}
	if readTestFile(t, dir, writingLensesPath) != original {
		t.Fatal("read migrated metadata")
	}
	value.Language = "en-GB"
	if err = app.WritingLensesSave("Memo.md", value); err != nil {
		t.Fatal(err)
	}
	var record map[string]json.RawMessage
	if err = json.Unmarshal([]byte(readTestFile(t, dir, writingLensesPath)), &record); err != nil {
		t.Fatal(err)
	}
	var fields map[string]json.RawMessage
	if err = json.Unmarshal(record["preferences"], &fields); err != nil {
		t.Fatal(err)
	}
	if string(record["version"]) != "3" || string(fields["future"]) != `"keep"` || string(record["documents"]) == "" {
		t.Fatal("migration lost metadata")
	}
	loaded, err := NewApp(dir).WritingLensesLoad("Memo.md")
	if err != nil || !reflect.DeepEqual(value, loaded) {
		t.Fatalf("new settings did not persist: %#v %v", loaded, err)
	}
}

func TestWritingLensCombinationsAreIndependentAcrossDocumentsAndRestarts(t *testing.T) {
	dir := t.TempDir()
	app := NewApp(dir)
	first := settings.WritingLensesPreferences{Language: "en-US", Lenses: []string{"spelling", "direct"}}
	second := settings.WritingLensesPreferences{Language: "es", Lenses: []string{"spelling"}}
	if err := app.WritingLensesSave("First.md", first); err != nil {
		t.Fatal(err)
	}
	if err := app.WritingLensesSave("Second.md", second); err != nil {
		t.Fatal(err)
	}
	for name, want := range map[string]settings.WritingLensesPreferences{"First.md": first, "Second.md": second, "Fresh.md": settings.DefaultWritingLenses()} {
		got, err := NewApp(dir).WritingLensesLoad(name)
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("%s: %#v, %v", name, got, err)
		}
	}
	info, err := os.Stat(filepath.Join(dir, writingLensesPath))
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatalf("permissions: %v %v", info, err)
	}
}

func TestWritingLensesApplyAllPersistsAcrossRestartWithoutChangingDocuments(t *testing.T) {
	dir := t.TempDir()
	app := NewApp(dir)
	writeTestFile(t, dir, "Memo.md", "teh original note\n")
	if err := app.WritingLensesSave("Memo.md", settings.DefaultWritingLenses()); err != nil {
		t.Fatal(err)
	}
	want := settings.WritingLensesPreferences{Language: "es", Lenses: []string{"spelling"}}
	if err := app.WritingLensesApplyAll(want); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"Memo.md", "Fresh.md"} {
		got, err := NewApp(dir).WritingLensesLoad(path)
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("%s: %#v %v", path, got, err)
		}
	}
	if got := readTestFile(t, dir, "Memo.md"); got != "teh original note\n" {
		t.Fatal("note text changed")
	}
	corrupt := `{"version":3,"documents":{"Memo.md":null}}`
	writeTestFile(t, dir, writingLensesPath, corrupt)
	if err := app.WritingLensesApplyAll(want); err == nil {
		t.Fatal("accepted corrupt preferences")
	}
	if got := readTestFile(t, dir, writingLensesPath); got != corrupt {
		t.Fatal("corrupt file overwritten")
	}
}
