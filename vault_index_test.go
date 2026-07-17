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
