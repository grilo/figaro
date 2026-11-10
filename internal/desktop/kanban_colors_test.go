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

func TestValidKanbanColorAdmitsOnlyHexColors(t *testing.T) {
	for _, color := range []string{"#ef4444", "#EF4444", "#3b82f6", "#000000"} {
		if !validKanbanColor(color) {
			t.Errorf("validKanbanColor(%q) = false, want a hex color accepted", color)
		}
	}
	for _, color := range []string{
		"",
		"red",
		"ef4444",
		"#ef444",
		"#ef44444",
		"#ef4444ff",
		"#fff",
		"#ggg",
		" #ef4444",
		"#ef4444 ",
		"#ef4444;background:url(https://example.com/x)",
		`#fff" onmouseover="alert(1)`,
		`red"></span><img src=x onerror=alert(1)>`,
		"var(--accent)",
		"rgb(255, 0, 0)",
		"url(javascript:alert(1))",
		"#fff\n",
	} {
		if validKanbanColor(color) {
			t.Errorf("validKanbanColor(%q) = true, want it refused", color)
		}
	}
}

// A vault's .config travels with it. A color the board could never have stored
// must not reach the page, where it is written into a style attribute.
func TestKanbanColorLoaderDropsValuesThatAreNotHexColors(t *testing.T) {
	_, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, ".config/kanban-colors.json", `{
  "urgent": "#ef4444",
  "review": "#3B82F6",
  "short": "#FFF",
  "styled": "#fff;background:url(https://example.com/track)",
  "markup": "red\"><img src=x onerror=alert(1)>",
  "named": "rebeccapurple",
  "token": "var(--accent)"
}`)

	restarted := OpenApp(vaultPath, testAssets)
	columns, err := restarted.GetKanbanColumns()
	if err != nil {
		t.Fatal(err)
	}
	colors, _ := columns["colors"].(map[string]string)
	if len(colors) != 2 || colors["urgent"] != "#ef4444" || colors["review"] != "#3B82F6" {
		t.Fatalf("loaded colors = %v, want only the two six-digit hex colors", colors)
	}
}

func TestSetColumnColorRejectsValuesThatAreNotHexColors(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	app.syncKanbanColumns()
	if _, err := app.SetColumnColor("urgent", "#ef4444"); err != nil {
		t.Fatal(err)
	}
	for _, color := range []string{"red", "#fff;color:red", `#fff" onclick="x`, "var(--accent)"} {
		result, err := app.SetColumnColor("urgent", color)
		if err != nil {
			t.Fatal(err)
		}
		if success, _ := result["success"].(bool); success {
			t.Fatalf("SetColumnColor accepted %q", color)
		}
	}
	columns, err := app.GetKanbanColumns()
	if err != nil {
		t.Fatal(err)
	}
	if colors, _ := columns["colors"].(map[string]string); colors["urgent"] != "#ef4444" {
		t.Fatalf("a refused color replaced the saved one: %v", colors)
	}
	// Clearing a color stays possible.
	result, err := app.SetColumnColor("urgent", "")
	if err != nil {
		t.Fatal(err)
	}
	if colors := kanbanColorsOf(t, result); colors["urgent"] != "" {
		t.Fatalf("clearing the color left %v", colors)
	}
}
