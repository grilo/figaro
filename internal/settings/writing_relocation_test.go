package settings

import (
	"encoding/json"
	"testing"
)

func TestWritingPathMovePreservesDocumentChoicesDecisionsAndOpaqueFields(t *testing.T) {
	for _, decisions := range []bool{false, true} {
		entry := `{"preferences":{"language":"en-GB","lenses":["spelling","formulaic"]},"future":[1,2]}`
		version := "3"
		if decisions {
			version = "1"
			entry = `{"decisions":[{"id":"saved","type":"acronym","language":"en-US","acronym":"XYZ"}],"future":[1,2]}`
		}
		data := []byte(`{"version":` + version + `,"extra":"keep","documents":{"Folder/Note.md":` + entry + `,"Folder/Sub/N.md":` + entry + `,"Folderish/N.md":{"opaque":true},"Unrelated":"future"}}`)
		moved, err := PlanWritingPathMove(data, "Folder", "Archive/Folder", decisions)
		if err != nil {
			t.Fatal(err)
		}
		var record struct {
			Extra     string
			Documents map[string]json.RawMessage
		}
		if err = json.Unmarshal(moved, &record); err != nil {
			t.Fatal(err)
		}
		if record.Extra != "keep" || len(record.Documents) != 4 || record.Documents["Folder/Note.md"] != nil || record.Documents["Archive/Folder/Sub/N.md"] == nil || string(record.Documents["Unrelated"]) != `"future"` {
			t.Fatalf("lost state: %s", moved)
		}
		if decisions {
			_, d, e := ReadWritingDecisions(moved, "Archive/Folder/Note.md")
			if e != nil || len(d) != 1 || d[0].ID != "saved" {
				t.Fatalf("decisions: %v %v", d, e)
			}
		} else {
			_, p, e := ReadWritingLenses(moved, "Archive/Folder/Note.md")
			if e != nil || p.Language != "en-GB" || len(p.Lenses) != 2 {
				t.Fatalf("choices: %v %v", p, e)
			}
		}
	}
}
func TestWritingPathMoveRejectsConflictingDestinationAndCorruptRecords(t *testing.T) {
	for _, data := range []string{`{"version":3,"documents":{"A.md":{},"B.md":{}}}`, `{"version":4}`, `{"version":3,"documents":{"A.md":null}}`, `{broken`} {
		if _, err := PlanWritingPathMove([]byte(data), "A.md", "B.md", false); err == nil {
			t.Fatalf("accepted %s", data)
		}
	}
	data := []byte(`{"version":3,"documents":{"Other.md":{"opaque":true}}}`)
	got, err := PlanWritingPathMove(data, "A.md", "B.md", false)
	if err != nil || string(got) != string(data) {
		t.Fatalf("unrelated record rewritten: %s %v", got, err)
	}
}
