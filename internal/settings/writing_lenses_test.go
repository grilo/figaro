package settings

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestWritingLensesValidateIndependentCombinations(t *testing.T) {
	for _, value := range []WritingLensesPreferences{DefaultWritingLenses(), {Language: "es", Lenses: []string{"spelling", "direct"}}} {
		if err := ValidateWritingLenses(value); err != nil {
			t.Fatal(err)
		}
	}
	for _, value := range []WritingLensesPreferences{{Language: "fr"}, {Language: "none", Lenses: []string{"unknown"}}, {Language: "en-US", Lenses: []string{"plain", "plain"}}} {
		if ValidateWritingLenses(value) == nil {
			t.Fatalf("accepted invalid choices: %#v", value)
		}
	}
}

func TestWritingLensesMigrationPreservesUnknownFieldsAndUnrelatedDocuments(t *testing.T) {
	before := []byte(`{"version":2,"preferences":{"primary":"direct","overlays":["spelling"],"profile":"standard","language":"en-US","future":42},"documents":{"Memo.md":{"dismissed":["keep"]},"opaque":"retain"}}`)
	_, migrated, err := ReadWritingLenses(before, "Memo.md")
	if err != nil || !reflect.DeepEqual(migrated.Lenses, []string{"direct", "spelling"}) {
		t.Fatalf("migration: %#v %v", migrated, err)
	}
	planned, err := PlanWritingLensesSave(before, "Memo.md", WritingLensesPreferences{Language: "en-GB", Lenses: []string{}})
	if err != nil {
		t.Fatal(err)
	}
	var record map[string]json.RawMessage
	_ = json.Unmarshal(planned, &record)
	var preferences map[string]json.RawMessage
	_ = json.Unmarshal(record["preferences"], &preferences)
	if string(preferences["future"]) != "42" || preferences["profile"] != nil || preferences["primary"] != nil {
		t.Fatalf("metadata: %s", planned)
	}
	var documents map[string]json.RawMessage
	_ = json.Unmarshal(record["documents"], &documents)
	if string(documents["opaque"]) != `"retain"` {
		t.Fatal("opaque document lost")
	}
	_, value, err := ReadWritingLenses(planned, "Memo.md")
	if err != nil || len(value.Lenses) != 0 || value.Language != "en-GB" {
		t.Fatalf("explicit empty selection lost: %#v %v", value, err)
	}
	_, value, err = ReadWritingLenses(planned, "Fresh.md")
	if err != nil || !reflect.DeepEqual(value, migrated) {
		t.Fatalf("legacy defaults lost: %#v %v", value, err)
	}
}

func TestWritingLensesSaveRejectsCorruptOrNewerMetadata(t *testing.T) {
	for _, raw := range []string{`null`, `{broken`, `{"version":4}`, `{"version":3,"documents":null}`, `{"version":3,"documents":{"Memo.md":null}}`, `{"version":3,"preferences":{"lenses":["unknown"]}}`} {
		if _, err := PlanWritingLensesSave([]byte(raw), "Memo.md", DefaultWritingLenses()); err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
}

func TestWritingLensesApplyAllIncludingFormulaicPreservesExtensionsAndUpdatesExistingAndFutureDocuments(t *testing.T) {
	before := []byte(`{"version":3,"future":true,"preferences":{"language":"none","lenses":[],"extension":42},"documents":{"A.md":{"preferences":{"language":"es","lenses":["spelling"],"extension":7},"dismissed":["keep"]},"B.md":{"preferences":{"language":"en-US","lenses":["direct"]}}}}`)
	want := WritingLensesPreferences{Language: "en-GB", Lenses: []string{"plain", "direct", "consistency", "grammar", "readability", "inclusive", "formulaic"}}
	planned, err := PlanWritingLensesApplyAll(before, want)
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"A.md", "B.md", "Future.md"} {
		_, got, err := ReadWritingLenses(planned, path)
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("%s: %#v %v", path, got, err)
		}
	}
	var record map[string]json.RawMessage
	_ = json.Unmarshal(planned, &record)
	if string(record["future"]) != "true" {
		t.Fatal("unknown root metadata lost")
	}
	var documents map[string]map[string]json.RawMessage
	_ = json.Unmarshal(record["documents"], &documents)
	var dismissed []string
	_ = json.Unmarshal(documents["A.md"]["dismissed"], &dismissed)
	if !reflect.DeepEqual(dismissed, []string{"keep"}) {
		t.Fatal("document metadata lost")
	}
	var preferences map[string]json.RawMessage
	_ = json.Unmarshal(documents["A.md"]["preferences"], &preferences)
	if string(preferences["extension"]) != "7" {
		t.Fatal("preference extension lost")
	}
}

func TestWritingLensesApplyAllRejectsMalformedOrUnsupportedRecords(t *testing.T) {
	for _, raw := range []string{`null`, `{broken`, `{"version":4}`, `{"version":3,"documents":{"A.md":null}}`, `{"version":3,"documents":{"A.md":{"preferences":{"language":"unsupported"}}}}`} {
		if _, err := PlanWritingLensesApplyAll([]byte(raw), DefaultWritingLenses()); err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
}
