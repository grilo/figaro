package desktop

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestOrderedKanbanCardsReconcilesMovedLinesAndAppendsNewCards(t *testing.T) {
	cards := []KanbanCard{
		{File: "tasks.md", Line: 2, Text: "First"},
		{File: "tasks.md", Line: 3, Text: "Second"},
		{File: "tasks.md", Line: 4, Text: "New"},
	}
	order := []KanbanCardOrderRef{
		{File: "tasks.md", Line: 20, Text: "Second"},
		{File: "tasks.md", Line: 2, Text: "First"},
	}

	ordered := orderedKanbanCards(cards, order)
	got := []string{ordered[0].Text, ordered[1].Text, ordered[2].Text}
	if want := []string{"Second", "First", "New"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("ordered cards = %v, want %v", got, want)
	}
}

func TestSetKanbanCardOrderPersistsBoardOrderInVault(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "tasks.md", "- [ ] First #todo\n- [ ] Second #todo\n")
	app.syncKanbanColumns()

	result, err := app.SetKanbanCardOrder("todo", []KanbanCardOrderRef{
		{File: "tasks.md", Line: 2, Text: "Second"},
		{File: "tasks.md", Line: 1, Text: "First"},
	})
	if err != nil || result["success"] != true {
		t.Fatalf("SetKanbanCardOrder result=%v err=%v", result, err)
	}
	board, err := app.GetKanbanBoard()
	if err != nil {
		t.Fatalf("GetKanbanBoard: %v", err)
	}
	if got := []string{board["todo"][0].Text, board["todo"][1].Text}; !reflect.DeepEqual(got, []string{"Second", "First"}) {
		t.Fatalf("persisted board order = %v", got)
	}
	home, err := app.GetHomeTasks(2)
	if err != nil || len(home) != 2 || home[0].Text != "Second" || home[1].Text != "First" {
		t.Fatalf("Home task order = %#v err=%v", home, err)
	}
	if info, err := os.Stat(filepath.Join(vaultPath, kanbanOrderPath)); err != nil || info.Mode().Perm() != 0600 {
		t.Fatalf("Kanban order config mode=%v err=%v", info, err)
	}
}

func TestSetKanbanCardOrderRejectsPathEscapeWithoutWriting(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	result, err := app.SetKanbanCardOrder("todo", []KanbanCardOrderRef{{File: "../outside.md", Line: 1, Text: "Nope"}})
	if err != nil || result["success"] != false {
		t.Fatalf("SetKanbanCardOrder result=%v err=%v", result, err)
	}
	if _, err := os.Stat(filepath.Join(vaultPath, kanbanOrderPath)); !os.IsNotExist(err) {
		t.Fatalf("unsafe order request wrote config: %v", err)
	}
}
