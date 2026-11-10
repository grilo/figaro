package mutations

import (
	"path/filepath"
	"testing"
)

func TestPlanMoveOffersMergeForSameNamedDirectories(t *testing.T) {
	plan := PlanMove("drafts/Notes", "archive", true, true, true, false)
	if plan.Destination != filepath.Join("archive", "Notes") ||
		plan.Error != "Destination directory already exists" ||
		!plan.MergeAvailable {
		t.Fatalf("unexpected plan: %+v", plan)
	}
}

func TestPlanMoveRejectsDirectoryDescendant(t *testing.T) {
	plan := PlanMove("Notes", filepath.Join("Notes", "nested"), true, false, false, false)
	if plan.Error != "Cannot move a directory into itself" {
		t.Fatalf("unexpected plan: %+v", plan)
	}
}

func TestValidateCopyHandlesCaseInsensitiveDescendant(t *testing.T) {
	if got := ValidateCopy("Notes", filepath.Join("notes", "nested"), true, true); got != RecursiveCopyError {
		t.Fatalf("unexpected validation result: %q", got)
	}
	if got := ValidateCopy("Notes", "Archive", true, false); got != "" {
		t.Fatalf("unrelated copy rejected: %q", got)
	}
}

func TestCollisionNamesPreserveCompoundDrawioExtension(t *testing.T) {
	if got := CopyCollisionName("flow.drawio.svg", false, 2); got != "flow copy 2.drawio.svg" {
		t.Fatalf("copy name = %q", got)
	}
	if got := ParenthesizedCopyCollisionName("flow.drawio.svg", false, 1); got != "flow (copy).drawio.svg" {
		t.Fatalf("merge name = %q", got)
	}
}

func TestCollisionNamesPreserveCompoundExcalidrawExtension(t *testing.T) {
	if got := CopyCollisionName("Board.Excalidraw.svg", false, 2); got != "Board copy 2.Excalidraw.svg" {
		t.Fatalf("copy name = %q", got)
	}
	if got := ParenthesizedCopyCollisionName("board.excalidraw.svg", false, 1); got != "board (copy).excalidraw.svg" {
		t.Fatalf("merge name = %q", got)
	}
}

func TestRenameDestinationOccupiedAllowsOnlyACaseChangeOfTheSameEntry(t *testing.T) {
	for _, test := range []struct {
		name                string
		oldPath, newPath    string
		exists, sameEntry   bool
		wantOccupied        bool
		wantCaseOnlyRenamed bool
	}{
		{name: "free destination", oldPath: "todo.md", newPath: "done.md"},
		{name: "free case variant on a case-sensitive volume", oldPath: "todo.md", newPath: "Todo.md", wantCaseOnlyRenamed: true},
		{name: "case change of the same entry", oldPath: "todo.md", newPath: "Todo.md", exists: true, sameEntry: true, wantCaseOnlyRenamed: true},
		{name: "case change of a nested note", oldPath: filepath.Join("Notes", "todo.md"), newPath: filepath.Join("Notes", "TODO.md"), exists: true, sameEntry: true, wantCaseOnlyRenamed: true},
		{name: "case change of a folder", oldPath: "notes", newPath: "Notes", exists: true, sameEntry: true, wantCaseOnlyRenamed: true},
		{name: "case variant that is another file", oldPath: "todo.md", newPath: "Todo.md", exists: true, wantOccupied: true, wantCaseOnlyRenamed: true},
		{name: "different name reaching the same file", oldPath: "todo.md", newPath: "alias.md", exists: true, sameEntry: true, wantOccupied: true},
		{name: "unchanged name", oldPath: "todo.md", newPath: "todo.md", exists: true, sameEntry: true, wantOccupied: true},
		{name: "case change of a parent folder only", oldPath: filepath.Join("Notes", "todo.md"), newPath: filepath.Join("notes", "todo.md"), exists: true, sameEntry: true, wantOccupied: true},
		{name: "case change and a move", oldPath: filepath.Join("Notes", "todo.md"), newPath: filepath.Join("Archive", "Todo.md"), exists: true, sameEntry: true, wantOccupied: true},
		{name: "another existing note", oldPath: "todo.md", newPath: "done.md", exists: true, wantOccupied: true},
	} {
		if got := IsCaseOnlyRename(test.oldPath, test.newPath); got != test.wantCaseOnlyRenamed {
			t.Errorf("%s: IsCaseOnlyRename(%q, %q) = %v, want %v", test.name, test.oldPath, test.newPath, got, test.wantCaseOnlyRenamed)
		}
		if got := RenameDestinationOccupied(test.oldPath, test.newPath, test.exists, test.sameEntry); got != test.wantOccupied {
			t.Errorf("%s: RenameDestinationOccupied(%q, %q, %v, %v) = %v, want %v", test.name, test.oldPath, test.newPath, test.exists, test.sameEntry, got, test.wantOccupied)
		}
	}
}
