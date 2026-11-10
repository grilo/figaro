package activity

import (
	"bytes"
	"encoding/json"
	"errors"
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

func TestPlanPathMoveTellsUnrecordableMovesFromABrokenHistory(t *testing.T) {
	revision := strings.Repeat("a", 40)
	existing, err := PlanPathMove(nil, "Old.md", "New.md", revision)
	if err != nil {
		t.Fatal(err)
	}

	for _, move := range [][2]string{
		{"Meetings/Notes.md", "Meetings/1:1 Alice.md"},
		{"a: note.md", "b.md"},
		{"Windows\\Path.md", "Path.md"},
	} {
		after, err := PlanPathMove(existing, move[0], move[1], revision)
		if !errors.Is(err, ErrPathNotRecordable) || after != nil {
			t.Fatalf("PlanPathMove(%q, %q) = %q, %v; want ErrPathNotRecordable and no rewrite", move[0], move[1], after, err)
		}
	}

	full := PathHistory{Version: 1}
	for index := 0; index < maxPathMoves; index++ {
		full.Moves = append(full.Moves, PathMove{From: "a.md", To: "b.md", Revision: revision})
	}
	fullData, err := json.Marshal(full)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ReadPathHistory(fullData); err != nil {
		t.Fatalf("a history holding exactly the maximum must stay readable: %v", err)
	}
	if after, err := PlanPathMove(fullData, "c.md", "d.md", revision); !errors.Is(err, ErrPathHistoryFull) || after != nil {
		t.Fatalf("PlanPathMove on a full history = %d bytes, %v; want ErrPathHistoryFull", len(after), err)
	}
	long := strings.Repeat("d", 4000) + ".md"
	longMove := PathMove{From: long, To: long, Revision: revision}
	encodedMove, err := json.Marshal(longMove)
	if err != nil {
		t.Fatal(err)
	}
	nearlyFull := PathHistory{Version: 1}
	for count := (MaxPathHistoryBytes - 64) / (len(encodedMove) + 1); count > 0; count-- {
		nearlyFull.Moves = append(nearlyFull.Moves, longMove)
	}
	nearlyFullData, err := json.Marshal(nearlyFull)
	if err != nil || len(nearlyFullData) > MaxPathHistoryBytes || len(nearlyFull.Moves) >= maxPathMoves {
		t.Fatalf("fixture is %d bytes in %d moves, err=%v; want a readable history just under the byte limit", len(nearlyFullData), len(nearlyFull.Moves), err)
	}
	if _, err := PlanPathMove(nearlyFullData, long, "e"+long, revision); !errors.Is(err, ErrPathHistoryFull) {
		t.Fatalf("PlanPathMove beyond the byte limit = %v; want ErrPathHistoryFull", err)
	}

	for name, data := range map[string][]byte{
		"corrupt":   []byte("{broken"),
		"version":   []byte(`{"version":2}`),
		"oversized": bytes.Repeat([]byte(" "), MaxPathHistoryBytes+1),
	} {
		_, err := PlanPathMove(data, "c.md", "d.md", revision)
		if err == nil || errors.Is(err, ErrPathNotRecordable) || errors.Is(err, ErrPathHistoryFull) {
			t.Fatalf("PlanPathMove on a %s history = %v; want an error that still stops the move", name, err)
		}
	}
	if _, err := PlanPathMove(existing, "c.md", "d.md", "not-a-revision"); err == nil ||
		errors.Is(err, ErrPathNotRecordable) || errors.Is(err, ErrPathHistoryFull) {
		t.Fatalf("PlanPathMove with an invalid revision = %v; want an ordinary error", err)
	}
}
