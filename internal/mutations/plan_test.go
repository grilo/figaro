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
