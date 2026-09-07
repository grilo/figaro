package activity

import (
	"slices"
	"strings"
	"testing"
)

func revision(id, source string) Snapshot {
	return Snapshot{Revision: id, Path: "note.md", Timestamp: float64(len(id)), Source: source}
}
func lineRevision(doc Document, line int) string {
	id := doc.Lines[line].Event
	if id < 0 {
		return ""
	}
	return doc.Events[id].Revision
}

func TestPrependingMeetingDoesNotRefreshExistingPassageDates(t *testing.T) {
	before := "# Old meeting\n\nKeep the agreed launch date.\nThe form has three fields."
	after := "# New meeting\n\nDiscuss the next release.\n\n" + before
	doc := Build([]Snapshot{revision("old", before), revision("today", after)}, true)
	for i := 0; i < 4; i++ {
		if got := lineRevision(doc, i+4); got != "old" {
			t.Fatalf("shifted old line %d attributed to %q", i, got)
		}
	}
	if lineRevision(doc, 0) != "today" {
		t.Fatal("new heading did not get its own date")
	}
}
func TestEditingOlderParagraphKeepsNeighborsAndPriorChangeHistory(t *testing.T) {
	doc := Build([]Snapshot{revision("old", "First passage.\n\nFive fields.\n\nLast passage."), revision("today", "First passage.\n\nThree fields.\n\nLast passage.")}, true)
	if lineRevision(doc, 0) != "old" || lineRevision(doc, 4) != "old" || lineRevision(doc, 2) != "today" {
		t.Fatalf("wrong line attribution: %#v", doc)
	}
	event := doc.Events[doc.Lines[2].Event]
	if event.Before != "Five fields." || event.After != "Three fields." || event.Kind != "edited" || len(event.Parents) != 1 {
		t.Fatalf("wrong passage history: %#v", event)
	}
}
func TestMovedUniquePassagesKeepTheirOriginalDates(t *testing.T) {
	doc := Build([]Snapshot{revision("old", "Alpha passage.\nBeta passage.\nGamma passage."), revision("today", "Gamma passage.\nAlpha passage.\nBeta passage.")}, true)
	for i := range doc.Lines {
		if lineRevision(doc, i) != "old" {
			t.Fatalf("moved line got refreshed: %#v", doc)
		}
	}
}
func TestRepeatedLinesUseLocalContextWithoutCopyingAttributionToNewCopies(t *testing.T) {
	before := []string{"top", "same", "one", "same", "bottom"}
	after := []string{"new", "same", "top", "same", "one", "same", "bottom"}
	got := MatchLines(before, after)
	if !slices.Equal(got, []int{-1, -1, 0, 1, 2, 3, 4}) {
		t.Fatalf("duplicate mapping: %v", got)
	}
}
func TestPartialHistoryDoesNotInventOldDates(t *testing.T) {
	doc := Build([]Snapshot{revision("boundary", "Old passage.\nOld ending."), revision("today", "New passage.\nOld passage.\nOld ending.")}, false)
	if !doc.Partial || lineRevision(doc, 0) != "today" || lineRevision(doc, 1) != "" || lineRevision(doc, 2) != "" {
		t.Fatalf("partial attribution: %#v", doc)
	}
}
func TestLineEndingChangesAndUnicodePreserveAttribution(t *testing.T) {
	doc := Build([]Snapshot{revision("old", "Olá 👋\r\nOne more line.\r\n"), revision("today", "Olá 👋\nOne more line.\n")}, true)
	for i := range doc.Lines {
		if lineRevision(doc, i) != "old" {
			t.Fatal("line ending normalization changed the activity date")
		}
	}
}
func TestLargeNotePrependPreservesAllUnchangedLines(t *testing.T) {
	source := strings.Repeat("A repeated line in a long meeting note.\n", 20000)
	doc := Build([]Snapshot{revision("old", source), revision("today", "New meeting.\n"+source)}, true)
	for i := 1; i < len(doc.Lines); i++ {
		if lineRevision(doc, i) != "old" {
			t.Fatalf("line %d was refreshed", i)
		}
	}
	if !doc.Events[0].Excerpt {
		t.Fatal("large stored excerpt was not labelled")
	}
}

func TestLargeAmbiguousDuplicateChangesAreUnknownInsteadOfFalselyDated(t *testing.T) {
	before := "start\n" + strings.Repeat("same\nother\n", 400) + "end"
	after := "changed start\n" + strings.Repeat("other\nsame\n", 400) + "changed end"
	result := Build([]Snapshot{{Revision: "old", Source: before, Timestamp: 1}, {Revision: "new", Source: after, Timestamp: 2}}, true)
	if !result.Partial || result.Lines[100].Event != -1 {
		t.Fatal("ambiguous copies acquired invented dates")
	}
	if result.Events[result.Lines[0].Event].Revision != "new" {
		t.Fatal("new text lost its known date")
	}
}
