package history

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
)

func commitActivityFixture(t *testing.T, h *Service, path, source string, day int) string {
	t.Helper()
	if err := os.WriteFile(filepath.Join(h.repoPath, path), []byte(source), 0644); err != nil {
		t.Fatal(err)
	}
	worktree, err := h.repo.Worktree()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = worktree.Add(path); err != nil {
		t.Fatal(err)
	}
	hash, err := worktree.Commit("fixture", &git.CommitOptions{Author: &object.Signature{Name: "Test", Email: "test@example.invalid", When: time.Date(2026, 9, day, 12, 0, 0, 0, time.UTC)}})
	if err != nil {
		t.Fatal(err)
	}
	return hash.String()
}

func TestActivityDatesSurvivePrependingAndServiceRestartWithoutChangingFiles(t *testing.T) {
	dir := t.TempDir()
	h, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}
	old := commitActivityFixture(t, h, "note.md", "Older meeting.\nKeep the launch date.", 3)
	latest := commitActivityFixture(t, h, "note.md", "New meeting.\n\nOlder meeting.\nKeep the launch date.", 7)
	restarted, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}
	result, err := restarted.GetFileActivity("note.md")
	if err != nil {
		t.Fatal(err)
	}
	if result.Events[result.Lines[0].Event].Revision != latest || result.Events[result.Lines[2].Event].Revision != old {
		t.Fatalf("wrong persisted dates: %#v", result)
	}
	status, err := restarted.repo.Worktree()
	if err != nil {
		t.Fatal(err)
	}
	dirty, err := status.Status()
	if err != nil || !dirty.IsClean() {
		t.Fatalf("activity modified vault: %v %v", dirty, err)
	}
	cached, err := restarted.GetFileActivity("note.md")
	if err != nil || cached != result {
		t.Fatal("same immutable revision did not reuse its cache")
	}
}
func TestActivityFollowsCommittedRenameAndRetainsOlderDates(t *testing.T) {
	dir := t.TempDir()
	h, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}
	old := commitActivityFixture(t, h, "old.md", "Old meeting.\nKeep the launch date.", 3)
	worktree, _ := h.repo.Worktree()
	if _, err = worktree.Move("old.md", "new.md"); err != nil {
		t.Fatal(err)
	}
	if _, err = worktree.Commit("rename", &git.CommitOptions{Author: &object.Signature{Name: "Test", Email: "test@example.invalid", When: time.Date(2026, 9, 7, 12, 0, 0, 0, time.UTC)}}); err != nil {
		t.Fatal(err)
	}
	result, err := h.GetFileActivity("new.md")
	if err != nil {
		t.Fatal(err)
	}
	if result.Source != "Old meeting.\nKeep the launch date." || result.Events[result.Lines[0].Event].Revision != old {
		t.Fatalf("rename changed attribution: %#v", result)
	}
}
func TestActivityNeverDatesAnUncommittedNoteAndRejectsEscapingPaths(t *testing.T) {
	dir := t.TempDir()
	h, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(dir, "draft.md"), []byte("Not recorded."), 0644); err != nil {
		t.Fatal(err)
	}
	result, err := h.GetFileActivity("draft.md")
	if err != nil || len(result.Events) != 0 {
		t.Fatalf("invented uncommitted history: %#v %v", result, err)
	}
	for _, path := range []string{"../outside.md", "/outside.md", "folder\\outside.md"} {
		if _, err = h.GetFileActivity(path); err == nil {
			t.Fatalf("accepted %q", path)
		}
	}
}
func TestBoundedActivityWalkReportsUnknownBaseline(t *testing.T) {
	dir := t.TempDir()
	h, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}
	commitActivityFixture(t, h, "note.md", "Old meeting.", 3)
	head, _ := h.repo.Head()
	commit, _ := h.repo.CommitObject(head.Hash())
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	snapshots, complete, err := readActivitySnapshots(ctx, commit, "note.md")
	if err != nil || complete || len(snapshots) != 1 {
		t.Fatalf("bounded history should retain an unknown baseline: %v %v %v", snapshots, complete, err)
	}
}
