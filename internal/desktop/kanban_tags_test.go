package desktop

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

func TestHashtagEditsMatchTagsInAnyLetterCase(t *testing.T) {
	for _, test := range []struct {
		content  string
		tag      string
		replaced string
		removed  string
	}{
		{content: "- [ ] Fix #TODO", tag: "todo", replaced: "- [ ] Fix #wip", removed: "- [ ] Fix "},
		{content: "#ToDo first\nthen #todo \tand #TODO\n", tag: "todo", replaced: "#wip first\nthen #wip \tand #wip\n", removed: "first\nthen and \n"},
		{content: "- [ ] Fix #todo", tag: "TODO", replaced: "- [ ] Fix #wip", removed: "- [ ] Fix "},
		// Not standalone tags: an anchor, a longer name, trailing punctuation.
		{content: "[guide](#TODO) #TODOS #todo-list #Todo, #todo_x", tag: "todo", replaced: "[guide](#TODO) #TODOS #todo-list #Todo, #todo_x", removed: "[guide](#TODO) #TODOS #todo-list #Todo, #todo_x"},
		{content: "nothing tagged here", tag: "todo", replaced: "nothing tagged here", removed: "nothing tagged here"},
		// Hashtag names are ASCII: a look-alike letter is a different word.
		{content: "see #taſk and #TASK", tag: "task", replaced: "see #taſk and #wip", removed: "see #taſk and "},
	} {
		if got := replaceHashtag(test.content, test.tag, "wip"); got != test.replaced {
			t.Errorf("replaceHashtag(%q, %q) = %q, want %q", test.content, test.tag, got, test.replaced)
		}
		if got := removeHashtag(test.content, test.tag); got != test.removed {
			t.Errorf("removeHashtag(%q, %q) = %q, want %q", test.content, test.tag, got, test.removed)
		}
	}
}

// TestHashtagScannerAgreesWithBoundaryPattern pins the direct scanner to the
// regular expression it replaced (now case-insensitive), including the awkward
// boundaries: repeated markers, tags at either end, and names that cannot end
// a tag at all.
func TestHashtagScannerAgreesWithBoundaryPattern(t *testing.T) {
	reference := func(content, tag string) [][2]int {
		pattern := regexp.MustCompile(`(?i)#` + regexp.QuoteMeta(tag) + `\b`)
		var ranges [][2]int
		for _, match := range pattern.FindAllStringIndex(content, -1) {
			if isHashtagBoundaryOK(content, match[0], match[1]) {
				ranges = append(ranges, [2]int{match[0], match[1]})
			}
		}
		return ranges
	}
	contents := []string{
		"", "#", "##", "#a", "#A", "#a #a", "#a#a #a", "##a #a", "x#a #a", "#a\t#A\n#a",
		"#ab #a #abc #a-b #a_b #a1", "#a-b #A-B", " #a-b ", "#a- #a", "#a. #a! (#a) #a",
		"#todo #TODO #ToDo #todos #todo", "- [ ] ship it #Done\r\n- [x] old #done #DONE",
		"#a-", "tail #a", "#a tail", "é#a #a é", "#é #a",
	}
	tags := []string{"", "a", "A", "ab", "a-b", "a-", "a_b", "a1", "todo", "done", "-", "#a", "a#a", "é"}
	for _, content := range contents {
		for _, tag := range tags {
			got, want := standaloneHashtagRanges(content, tag), reference(content, tag)
			if len(got) != len(want) {
				t.Errorf("standaloneHashtagRanges(%q, %q) = %v, pattern finds %v", content, tag, got, want)
				continue
			}
			for index := range got {
				if got[index] != want[index] {
					t.Errorf("standaloneHashtagRanges(%q, %q) = %v, pattern finds %v", content, tag, got, want)
					break
				}
			}
		}
	}
}

func TestUpdateTaskTagMovesCardWhoseTagIsWrittenInAnotherCase(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "tasks.md", "- [ ] Fix bug #TODO\n- [ ] Other #todo\n")

	board, err := app.GetKanbanBoard()
	if err != nil {
		t.Fatalf("GetKanbanBoard: %v", err)
	}
	if len(board["todo"]) != 2 || board["todo"][0].Text != "Fix bug" {
		t.Fatalf("todo column = %#v, want both cards with the tag stripped from the title", board["todo"])
	}

	result, err := app.UpdateTaskTag("tasks.md", 1, "todo", "wip")
	if err != nil || !result.Success {
		t.Fatalf("UpdateTaskTag on a mixed-case tag: result=%+v err=%v", result, err)
	}
	if got, want := readTestFile(t, vaultPath, "tasks.md"), "- [ ] Fix bug #wip\n- [ ] Other #todo\n"; got != want {
		t.Fatalf("note after moving the card = %q, want %q", got, want)
	}

	removed, err := app.RemoveTagFromTask("tasks.md", 1, "WIP")
	if err != nil || !removed.Success {
		t.Fatalf("RemoveTagFromTask with another letter case: result=%+v err=%v", removed, err)
	}
	if got, want := readTestFile(t, vaultPath, "tasks.md"), "- [ ] Fix bug \n- [ ] Other #todo\n"; got != want {
		t.Fatalf("note after removing the tag = %q, want %q", got, want)
	}
}

func TestRenameAndDeleteKanbanColumnCoverEveryLetterCaseOfTheTag(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "notes.md", "- [ ] One #Review\n- [ ] Two #REVIEW\n- [ ] Three #review\n")
	app.syncKanbanColumns()

	result, err := app.RenameKanbanColumn("review", "checked")
	if err != nil {
		t.Fatalf("RenameKanbanColumn: %v", err)
	}
	if success, _ := result["success"].(bool); !success {
		t.Fatalf("RenameKanbanColumn failed: %v", result["error"])
	}
	if got, want := readTestFile(t, vaultPath, "notes.md"), "- [ ] One #checked\n- [ ] Two #checked\n- [ ] Three #checked\n"; got != want {
		t.Fatalf("note after renaming the column = %q, want %q", got, want)
	}
	board, err := app.GetKanbanBoard()
	if err != nil || len(board["checked"]) != 3 || len(board["review"]) != 0 {
		t.Fatalf("board after rename = %#v, err=%v; want all three cards in checked", board, err)
	}

	writeTestFile(t, vaultPath, "notes.md", "- [ ] One #Checked\n- [ ] Two #CHECKED\n")
	app.syncKanbanColumns()
	result, err = app.DeleteKanbanColumn("checked")
	if err != nil {
		t.Fatalf("DeleteKanbanColumn: %v", err)
	}
	if success, _ := result["success"].(bool); !success {
		t.Fatalf("DeleteKanbanColumn failed: %v", result["error"])
	}
	if got, want := readTestFile(t, vaultPath, "notes.md"), "- [ ] One \n- [ ] Two \n"; got != want {
		t.Fatalf("note after deleting the column = %q, want %q", got, want)
	}
}

func TestRenameKanbanColumnRefusesNamesReadAsHexColors(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	const note = "- [ ] Keep me visible #review\n"
	writeTestFile(t, vaultPath, "notes.md", note)
	app.syncKanbanColumns()
	if _, err := app.SetColumnColor("review", "#336699"); err != nil {
		t.Fatalf("SetColumnColor: %v", err)
	}

	for _, name := range []string{"bad", "add", "decade", "FACADE", " abc "} {
		result, err := app.RenameKanbanColumn("review", name)
		if err != nil {
			t.Fatalf("RenameKanbanColumn(%q): %v", name, err)
		}
		if success, _ := result["success"].(bool); success || result["error"] != hexColorColumnNameError {
			t.Fatalf("RenameKanbanColumn(%q) = %#v, want the hex-color refusal", name, result)
		}
		if got := readTestFile(t, vaultPath, "notes.md"); got != note {
			t.Fatalf("refused rename to %q rewrote the note: %q", name, got)
		}
	}
	columns, err := app.GetKanbanColumns()
	if err != nil {
		t.Fatalf("GetKanbanColumns: %v", err)
	}
	if !strings.Contains(strings.Join(columns["columns"].([]string), " "), "review") ||
		columns["colors"].(map[string]string)["review"] != "#336699" {
		t.Fatalf("refused renames changed the column or its color: %#v", columns)
	}

	// Four or five hex-looking characters are an ordinary tag.
	result, err := app.RenameKanbanColumn("review", "bead")
	if err != nil {
		t.Fatalf("RenameKanbanColumn(bead): %v", err)
	}
	if success, _ := result["success"].(bool); !success {
		t.Fatalf("RenameKanbanColumn(bead) failed: %v", result["error"])
	}
	board, err := app.GetKanbanBoard()
	if err != nil || len(board["bead"]) != 1 {
		t.Fatalf("board after renaming to bead = %#v, err=%v", board, err)
	}
}

func TestUpdateTaskTagRefusesNewTagReadAsHexColor(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	const note = "- [ ] Keep me visible #todo\n"
	writeTestFile(t, vaultPath, "tasks.md", note)

	result, err := app.UpdateTaskTag("tasks.md", 1, "todo", "fed")
	if err != nil {
		t.Fatalf("UpdateTaskTag: %v", err)
	}
	if result.Success || result.Error != hexColorColumnNameError {
		t.Fatalf("UpdateTaskTag to a hex-color tag = %+v, want the hex-color refusal", result)
	}
	if got := readTestFile(t, vaultPath, "tasks.md"); got != note {
		t.Fatalf("refused tag change rewrote the note: %q", got)
	}
}
