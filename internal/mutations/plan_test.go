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

func TestPlanMoveDoesNotOfferToMergeAFolderWithItself(t *testing.T) {
	for _, test := range []struct {
		name            string
		source, target  string
		caseInsensitive bool
	}{
		{name: "dropped on its own parent", source: filepath.Join("Projects", "Drafts"), target: "Projects"},
		{name: "top-level folder dropped on the vault root", source: "Drafts", target: "."},
		{name: "parent written in another case", source: filepath.Join("Projects", "Drafts"), target: "projects", caseInsensitive: true},
	} {
		plan := PlanMove(test.source, test.target, true, true, true, test.caseInsensitive)
		if plan.Error != SameFolderError || plan.MergeAvailable {
			t.Errorf("%s: PlanMove = %+v, want the folder reported as already there with no merge offer", test.name, plan)
		}
	}
	// A different folder of the same name still offers the merge, and a file
	// dropped on its own folder keeps the ordinary collision.
	if plan := PlanMove(filepath.Join("Projects", "Drafts"), "projects", true, true, true, false); !plan.MergeAvailable {
		t.Errorf("case-sensitive namesake = %+v, want a merge offer", plan)
	}
	if plan := PlanMove(filepath.Join("Projects", "note.md"), "Projects", false, true, false, false); plan.Error != "Destination exists" || plan.MergeAvailable {
		t.Errorf("file dropped on its own folder = %+v, want Destination exists", plan)
	}
}

func TestPlanDirectoryMergeRefusesSelfDescendantAndSelfOverwritingMerges(t *testing.T) {
	const intoItself = "Cannot move a directory into itself"
	namesakeError := func(folder, inner string) string {
		return `Cannot merge "` + folder + `" into the folder that contains it, because the "` + inner + `" folder inside it would take the place of the folder being merged. Rename or move that inner folder first.`
	}
	for _, test := range []struct {
		name            string
		source, target  string
		facts           DirectoryMergeFacts
		wantDestination string
		wantError       string
		wantNamesake    string
	}{
		{
			name:   "unrelated folders merge",
			source: "Drafts", target: "Archive",
			wantDestination: filepath.Join("Archive", "Drafts"),
		},
		{
			name:   "folder dropped on its own parent",
			source: filepath.Join("Projects", "Drafts"), target: "Projects",
			wantDestination: filepath.Join("Projects", "Drafts"),
			wantError:       SameFolderError,
		},
		{
			name:   "top-level folder dropped on the vault root",
			source: "Drafts", target: ".",
			wantDestination: "Drafts",
			wantError:       SameFolderError,
		},
		{
			name:   "case variant of its own parent on a case-insensitive volume",
			source: filepath.Join("Projects", "Drafts"), target: "projects",
			facts:           DirectoryMergeFacts{CaseInsensitive: true},
			wantDestination: filepath.Join("projects", "Drafts"),
			wantError:       SameFolderError,
		},
		{
			name:   "case variant is a separate folder on a case-sensitive volume",
			source: filepath.Join("Projects", "Drafts"), target: "projects",
			wantDestination: filepath.Join("projects", "Drafts"),
		},
		{
			name:   "adapter found the destination to be the source entry",
			source: filepath.Join("Projects", "Drafts"), target: "projects",
			facts:           DirectoryMergeFacts{DestinationIsSource: true},
			wantDestination: filepath.Join("projects", "Drafts"),
			wantError:       SameFolderError,
		},
		{
			name:   "target is the source",
			source: "Drafts", target: "Drafts",
			wantDestination: filepath.Join("Drafts", "Drafts"),
			wantError:       intoItself,
		},
		{
			name:   "target beneath the source",
			source: "Drafts", target: filepath.Join("Drafts", "old", "deep"),
			wantDestination: filepath.Join("Drafts", "old", "deep", "Drafts"),
			wantError:       intoItself,
		},
		{
			name:   "target beneath the source in another case",
			source: "Drafts", target: filepath.Join("drafts", "old"),
			facts:           DirectoryMergeFacts{CaseInsensitive: true},
			wantDestination: filepath.Join("drafts", "old", "Drafts"),
			wantError:       intoItself,
		},
		{
			name:   "adapter found the target inside the source",
			source: "Drafts", target: filepath.Join("drafts", "old"),
			facts:           DirectoryMergeFacts{TargetInsideSource: true},
			wantDestination: filepath.Join("drafts", "old", "Drafts"),
			wantError:       intoItself,
		},
		{
			name:   "sibling whose name starts with the source's name",
			source: "Drafts", target: "Drafts-old",
			wantDestination: filepath.Join("Drafts-old", "Drafts"),
		},
		{
			name:   "merge into the parent of the same name without an inner namesake",
			source: filepath.Join("X", "X"), target: ".",
			wantDestination: "X",
			wantNamesake:    filepath.Join("X", "X", "X"),
		},
		{
			name:   "merge into the parent of the same name with an inner namesake folder",
			source: filepath.Join("X", "X"), target: ".",
			facts:           DirectoryMergeFacts{NamesakeIsDirectory: true},
			wantDestination: "X",
			wantNamesake:    filepath.Join("X", "X", "X"),
			wantError:       namesakeError("X", "X"),
		},
		{
			name:   "merge into a higher ancestor with an inner namesake folder",
			source: filepath.Join("Area", "X", "sub", "X"), target: "Area",
			facts:           DirectoryMergeFacts{NamesakeIsDirectory: true},
			wantDestination: filepath.Join("Area", "X"),
			wantNamesake:    filepath.Join("Area", "X", "sub", "X", "sub", "X"),
			wantError:       namesakeError("X", "sub/X"),
		},
		{
			name:   "ancestor written in another case on a case-insensitive volume",
			source: filepath.Join("notes", "Notes"), target: ".",
			facts:           DirectoryMergeFacts{CaseInsensitive: true, NamesakeIsDirectory: true},
			wantDestination: "Notes",
			wantNamesake:    filepath.Join("notes", "Notes", "Notes"),
			wantError:       namesakeError("Notes", "Notes"),
		},
		{
			name:   "adapter found the destination among the source's ancestors",
			source: filepath.Join("notes", "Notes"), target: ".",
			facts:           DirectoryMergeFacts{SourceBelowDestination: "Notes", NamesakeIsDirectory: true},
			wantDestination: "Notes",
			wantNamesake:    filepath.Join("notes", "Notes", "Notes"),
			wantError:       namesakeError("Notes", "Notes"),
		},
		{
			name:   "case variant that is a separate folder has no namesake",
			source: filepath.Join("notes", "Notes"), target: ".",
			facts:           DirectoryMergeFacts{NamesakeIsDirectory: true},
			wantDestination: "Notes",
		},
	} {
		if got := DirectoryMergeNamesake(test.source, test.target, test.facts); got != test.wantNamesake {
			t.Errorf("%s: DirectoryMergeNamesake = %q, want %q", test.name, got, test.wantNamesake)
		}
		plan := PlanDirectoryMerge(test.source, test.target, test.facts)
		if plan.Destination != test.wantDestination || plan.Error != test.wantError {
			t.Errorf("%s: PlanDirectoryMerge = %+v, want destination %q and error %q", test.name, plan, test.wantDestination, test.wantError)
		}
	}
}
