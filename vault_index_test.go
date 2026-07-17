package main

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/fsnotify/fsnotify"
)

func TestVaultIndexUpdatesKnownSaveWithoutRewalkingVault(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "tasks.md", "- [ ] Old task #todo\n")
	writeTestFile(t, vaultPath, "other.md", "Unrelated note\n")

	board, err := app.GetKanbanBoard()
	if err != nil {
		t.Fatalf("initial GetKanbanBoard: %v", err)
	}
	if got := board["todo"]; len(got) != 1 || strings.TrimSpace(got[0].Text) != "Old task" {
		t.Fatalf("initial todo cards = %#v, want Old task", got)
	}
	initialIndex := app.vaultIndex
	if initialIndex == nil {
		t.Fatal("GetKanbanBoard did not build the shared vault index")
	}

	saved, err := app.SaveFile("tasks.md", "- [ ] Updated task #review\n[Launch](2025-02-14.md)\n", 0)
	if err != nil || !saved.Success {
		t.Fatalf("SaveFile: result=%+v err=%v", saved, err)
	}
	if app.vaultIndex != initialIndex {
		t.Fatal("saving one known note replaced the vault index instead of updating it incrementally")
	}

	board, err = app.GetKanbanBoard()
	if err != nil {
		t.Fatalf("GetKanbanBoard after save: %v", err)
	}
	if len(board["todo"]) != 0 {
		t.Fatalf("stale todo cards after save = %#v", board["todo"])
	}
	if got := board["review"]; len(got) != 1 || strings.TrimSpace(got[0].Text) != "Updated task" {
		t.Fatalf("review cards after save = %#v, want Updated task", got)
	}

	results, err := app.SearchFiles("Updated task", false)
	if err != nil || len(results) != 1 || results[0].Path != "tasks.md" {
		t.Fatalf("SearchFiles after indexed save = %#v, err=%v", results, err)
	}
	month, err := app.GetCalendarMonthData(2025, 2)
	if err != nil {
		t.Fatalf("GetCalendarMonthData after indexed save: %v", err)
	}
	if got, want := month.DaysWithLinks, []int{14}; !reflect.DeepEqual(got, want) {
		t.Fatalf("DaysWithLinks after indexed save = %v, want %v", got, want)
	}
}

func TestVaultWatcherChangesUpdateOnlyAffectedIndexedNote(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "tasks.md", "- [ ] Existing #todo\n")

	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("initial GetKanbanBoard: %v", err)
	}
	initialIndex := app.vaultIndex
	if err := os.WriteFile(filepath.Join(vaultPath, "tasks.md"), []byte("- [ ] External change #review\n"), 0644); err != nil {
		t.Fatalf("external write: %v", err)
	}
	app.handleVaultFilesystemChanges([]vaultWatchChange{{
		Path: filepath.Join(vaultPath, "tasks.md"),
		Op:   fsnotify.Write,
	}})
	if app.vaultIndex != initialIndex {
		t.Fatal("a one-file watcher write rebuilt the full vault index")
	}
	board, err := app.GetKanbanBoard()
	if err != nil {
		t.Fatalf("GetKanbanBoard after external write: %v", err)
	}
	if len(board["todo"]) != 0 || len(board["review"]) != 1 {
		t.Fatalf("board after external write = %#v, want one review card", board)
	}

	writeTestFile(t, vaultPath, "new.md", "- [ ] New note #done\n")
	app.handleVaultFilesystemChanges([]vaultWatchChange{{
		Path: filepath.Join(vaultPath, "new.md"),
		Op:   fsnotify.Create,
	}})
	board, err = app.GetKanbanBoard()
	if err != nil || len(board["done"]) != 1 {
		t.Fatalf("board after external create = %#v, err=%v", board, err)
	}

	if err := os.Remove(filepath.Join(vaultPath, "new.md")); err != nil {
		t.Fatalf("external remove: %v", err)
	}
	app.handleVaultFilesystemChanges([]vaultWatchChange{{
		Path: filepath.Join(vaultPath, "new.md"),
		Op:   fsnotify.Remove,
	}})
	board, err = app.GetKanbanBoard()
	if err != nil || len(board["done"]) != 0 {
		t.Fatalf("board after external remove = %#v, err=%v", board, err)
	}
}

func TestVaultIndexKeepsUnchangedDerivedContributionsOnKnownSave(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "tasks.md", "- [ ] Replace me #todo\n[Today](2025-02-14.md)\n")
	writeTestFile(t, vaultPath, "stable.md", "- [ ] Keep me #later\n[Stable date](2025-02-15.md)\n")

	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("initial GetKanbanBoard: %v", err)
	}
	initialCalendar := app.vaultIndex.calendar
	stableCards := app.vaultIndex.cardsByTag["later"]
	if len(stableCards) != 1 {
		t.Fatalf("stable cards = %#v, want one later card", stableCards)
	}
	stableCard := &stableCards[0]

	saved, err := app.SaveFile("tasks.md", "- [ ] Replacement #review\n[Tomorrow](2025-02-16.md)\n", 0)
	if err != nil || !saved.Success {
		t.Fatalf("SaveFile: result=%+v err=%v", saved, err)
	}
	if app.vaultIndex.calendar != initialCalendar {
		t.Fatal("known save rebuilt the full calendar projection")
	}
	updatedStableCards := app.vaultIndex.cardsByTag["later"]
	if len(updatedStableCards) != 1 || &updatedStableCards[0] != stableCard {
		t.Fatalf("known save rebuilt unchanged Kanban contributions: %#v", updatedStableCards)
	}

	month, err := app.GetCalendarMonthData(2025, 2)
	if err != nil {
		t.Fatalf("GetCalendarMonthData: %v", err)
	}
	if got, want := month.DaysWithLinks, []int{15, 16}; !reflect.DeepEqual(got, want) {
		t.Fatalf("DaysWithLinks after replacement = %v, want %v", got, want)
	}
	board, err := app.GetKanbanBoard()
	if err != nil {
		t.Fatalf("GetKanbanBoard after save: %v", err)
	}
	if len(board["todo"]) != 0 || len(board["later"]) != 1 || len(board["review"]) != 1 {
		t.Fatalf("board after replacement = %#v", board)
	}
}

func TestVaultIndexUpdatesSearchAndBacklinksWithoutReplacingUnchangedProjection(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "source.md", "Old searchable phrase\n[Target](target.md)\n")
	writeTestFile(t, vaultPath, "stable.md", "[Stable-target](stable-target.md)\n")

	if _, err := app.SearchFiles("searchable", false); err != nil {
		t.Fatalf("initial SearchFiles: %v", err)
	}
	stableBacklinks := app.vaultIndex.backlinksByTarget["stable-target.md"]
	if len(stableBacklinks) != 1 {
		t.Fatalf("stable backlinks = %#v, want one contribution", stableBacklinks)
	}
	stableBacklink := &stableBacklinks[0]

	saved, err := app.SaveFile("source.md", "Replacement searchable phrase\n[Next](next.md)\n", 0)
	if err != nil || !saved.Success {
		t.Fatalf("SaveFile: result=%+v err=%v", saved, err)
	}

	oldResults, err := app.SearchFiles("old searchable", false)
	if err != nil || len(oldResults) != 0 {
		t.Fatalf("old indexed search results = %#v, err=%v", oldResults, err)
	}
	newResults, err := app.SearchFiles("replacement searchable", false)
	if err != nil || len(newResults) != 1 || newResults[0].Path != "source.md" {
		t.Fatalf("replacement indexed search results = %#v, err=%v", newResults, err)
	}
	oldBacklinks, err := app.SearchBacklinks("target.md")
	if err != nil || len(oldBacklinks) != 0 {
		t.Fatalf("stale backlinks after indexed save = %#v, err=%v", oldBacklinks, err)
	}
	newBacklinks, err := app.SearchBacklinks("next.md")
	if err != nil || len(newBacklinks) != 1 || newBacklinks[0].Path != "source.md" {
		t.Fatalf("replacement backlinks after indexed save = %#v, err=%v", newBacklinks, err)
	}
	updatedStableBacklinks := app.vaultIndex.backlinksByTarget["stable-target.md"]
	if len(updatedStableBacklinks) != 1 || &updatedStableBacklinks[0] != stableBacklink {
		t.Fatalf("known save rebuilt an unchanged backlink contribution: %#v", updatedStableBacklinks)
	}
}
