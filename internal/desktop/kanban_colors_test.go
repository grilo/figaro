package desktop

import (
	"os"
	"testing"
)

func kanbanColorsOf(t *testing.T, result map[string]interface{}) map[string]string {
	t.Helper()
	if success, _ := result["success"].(bool); !success {
		t.Fatalf("operation failed: %v", result)
	}
	colors, _ := result["colors"].(map[string]string)
	return colors
}

func TestKanbanColorOutlivesEmptiedColumnAndRestart(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "tasks.md", "- [ ] Call the bank #urgent\n- [ ] Plan #review\n")
	app.syncKanbanColumns()
	result, err := app.SetColumnColor("urgent", "#ef4444")
	if err != nil {
		t.Fatal(err)
	}
	kanbanColorsOf(t, result)

	// Completing the only #urgent task empties and removes the column.
	if _, err := app.UpdateTaskTag("tasks.md", 1, "urgent", "done"); err != nil {
		t.Fatalf("UpdateTaskTag: %v", err)
	}
	// Another color change must not prune the unused hashtag's color.
	result, err = app.SetColumnColor("review", "#22c55e")
	if err != nil {
		t.Fatal(err)
	}
	if colors := kanbanColorsOf(t, result); colors["urgent"] != "#ef4444" {
		t.Fatalf("emptied column color was pruned: %v", colors)
	}

	// A restart loads colors before the vault index exists; nothing is pruned.
	restarted := OpenApp(vaultPath, testAssets)
	writeTestFile(t, vaultPath, "later.md", "- [ ] New emergency #urgent\n")
	restarted.syncKanbanColumns()
	columns, err := restarted.GetKanbanColumns()
	if err != nil {
		t.Fatal(err)
	}
	colors, _ := columns["colors"].(map[string]string)
	if colors["urgent"] != "#ef4444" || colors["review"] != "#22c55e" {
		t.Fatalf("reused #urgent lost its color after restart: %v", colors)
	}
}

func TestKanbanEmptiedColumnCanBeColoredRenamedAndDeleted(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	app.syncKanbanColumns()

	// The board keeps an emptied column visible; its controls still work.
	result, err := app.SetColumnColor("someday", "#3b82f6")
	if err != nil {
		t.Fatal(err)
	}
	kanbanColorsOf(t, result)
	result, err = app.RenameKanbanColumn("someday", "later")
	if err != nil {
		t.Fatal(err)
	}
	if colors := kanbanColorsOf(t, result); colors["later"] != "#3b82f6" || colors["someday"] != "" {
		t.Fatalf("renaming an empty column did not move its color: %v", colors)
	}
	result, err = app.DeleteKanbanColumn("later")
	if err != nil {
		t.Fatal(err)
	}
	if colors := kanbanColorsOf(t, result); colors["later"] != "" {
		t.Fatalf("deleting a column must forget its color: %v", colors)
	}

	for _, invalid := range []string{"", "9lives", "two words", "../x"} {
		result, err := app.SetColumnColor(invalid, "#000000")
		if err != nil {
			t.Fatal(err)
		}
		if success, _ := result["success"].(bool); success {
			t.Fatalf("SetColumnColor accepted invalid hashtag %q", invalid)
		}
	}
}
