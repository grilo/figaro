package activity

import (
	"strings"
	"testing"
)

func TestActivityPathIdentityHandlesFolderMovesReuseAndMultipleRenamesAtOneRevision(t *testing.T) {
	revision := strings.Repeat("a", 40)
	data, err := PlanPathMove(nil, "Folder/Note.md", "Folder/Renamed.md", revision)
	if err != nil {
		t.Fatal(err)
	}
	data, err = PlanPathMove(data, "Folder", "Archive/Folder", revision)
	if err != nil {
		t.Fatal(err)
	}
	history, err := ReadPathHistory(data)
	if err != nil {
		t.Fatal(err)
	}
	if got := PathAtRevision(history, "Archive/Folder/Renamed.md", revision); got != "Folder/Note.md" {
		t.Fatal(got)
	}
	if got := PathAtRevision(history, "Archive/Folder/Renamed.md", strings.Repeat("b", 40)); got != "Archive/Folder/Renamed.md" {
		t.Fatal(got)
	}
	if got := PathAtRevision(history, "Archive/Folderish/Renamed.md", revision); got != "Archive/Folderish/Renamed.md" {
		t.Fatal(got)
	}
}
func TestActivityPathHistoryRejectsCorruptionTrailingValuesAndOversizeMetadata(t *testing.T) {
	for _, data := range []string{`{"version":2}`, `{"version":1} {}`, `{"version":1,"unknown":true}`, `{"version":1,"moves":[{"from":"../escape","to":"note.md","revision":"bad"}]}`, strings.Repeat(" ", MaxPathHistoryBytes+1)} {
		if _, err := ReadPathHistory([]byte(data)); err == nil {
			t.Fatalf("accepted invalid history (%d bytes)", len(data))
		}
	}
}
