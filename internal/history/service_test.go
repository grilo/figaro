package history

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-git/go-git/v5"
)

func writeHistoryFixture(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("write fixture %s: %v", path, err)
	}
}

func TestNewPreservesGitignoreAndExcludesConfig(t *testing.T) {
	dir := t.TempDir()
	writeHistoryFixture(t, filepath.Join(dir, ".gitignore"), "node_modules/\n")

	if _, err := New(dir); err != nil {
		t.Fatalf("New: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dir, ".gitignore"))
	if err != nil {
		t.Fatalf("read gitignore: %v", err)
	}
	if got := string(data); !strings.Contains(got, "node_modules/\n") || !strings.Contains(got, ".config/\n") {
		t.Fatalf("gitignore was not preserved and extended: %q", got)
	}
}

func TestServiceDoesNotCommitWithoutChanges(t *testing.T) {
	dir := t.TempDir()
	service, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	path := filepath.Join(dir, "test.md")
	writeHistoryFixture(t, path, "# test\n")
	if err := service.CommitFile("test.md"); err != nil {
		t.Fatalf("first CommitFile: %v", err)
	}
	before, err := service.GetFileHistory("test.md")
	if err != nil {
		t.Fatalf("GetFileHistory: %v", err)
	}
	if err := service.CommitFile("test.md"); err != nil {
		t.Fatalf("second CommitFile: %v", err)
	}
	after, err := service.GetFileHistory("test.md")
	if err != nil {
		t.Fatalf("GetFileHistory after second commit: %v", err)
	}
	if len(after) != len(before) {
		t.Fatalf("CommitFile without changes created a commit: %d -> %d", len(before), len(after))
	}
}

func TestFileUncommittedStatusTracksOnlyTheRequestedPath(t *testing.T) {
	dir := t.TempDir()
	service, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	writeHistoryFixture(t, filepath.Join(dir, "active.md"), "first\n")
	writeHistoryFixture(t, filepath.Join(dir, "other.md"), "other\n")

	dirty, err := service.HasUncommittedChanges("active.md")
	if err != nil || !dirty {
		t.Fatalf("new active note status = %v, %v; want dirty", dirty, err)
	}
	if err := service.CommitFile("active.md"); err != nil {
		t.Fatalf("CommitFile: %v", err)
	}
	dirty, err = service.HasUncommittedChanges("active.md")
	if err != nil || dirty {
		t.Fatalf("committed active note status = %v, %v; want clean", dirty, err)
	}
	otherDirty, err := service.HasUncommittedChanges("other.md")
	if err != nil || !otherDirty {
		t.Fatalf("untracked other note status = %v, %v; want dirty", otherDirty, err)
	}

	writeHistoryFixture(t, filepath.Join(dir, "active.md"), "second\n")
	dirty, err = service.HasUncommittedChanges("active.md")
	if err != nil || !dirty {
		t.Fatalf("modified active note status = %v, %v; want dirty", dirty, err)
	}
}

func TestFileHistoryCountsOnlyCommitsThatChangedTheRequestedFile(t *testing.T) {
	dir := t.TempDir()
	service, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	writeHistoryFixture(t, filepath.Join(dir, "active.md"), "first\n")
	if err := service.CommitFile("active.md"); err != nil {
		t.Fatalf("commit active.md: %v", err)
	}
	writeHistoryFixture(t, filepath.Join(dir, "other.md"), "other\n")
	if err := service.CommitFile("other.md"); err != nil {
		t.Fatalf("commit other.md: %v", err)
	}

	history, err := service.GetFileHistory("active.md")
	if err != nil {
		t.Fatalf("GetFileHistory(active.md): %v", err)
	}
	if len(history) != 1 {
		t.Fatalf("active.md history = %#v, want only its one changing commit", history)
	}
}

func TestCommitFileRefusesUnrelatedStagedChangesWithoutChangingTheIndex(t *testing.T) {
	dir := t.TempDir()
	service, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	writeHistoryFixture(t, filepath.Join(dir, "active.md"), "active\n")
	writeHistoryFixture(t, filepath.Join(dir, "staged.md"), "staged\n")
	worktree, err := service.repo.Worktree()
	if err != nil {
		t.Fatalf("Worktree: %v", err)
	}
	if _, err := worktree.Add("staged.md"); err != nil {
		t.Fatalf("stage unrelated file: %v", err)
	}

	err = service.CommitFile("active.md")
	if err == nil || !strings.Contains(err.Error(), "staged.md has staged changes") {
		t.Fatalf("CommitFile error = %v; want unrelated-stage refusal", err)
	}
	status, err := worktree.Status()
	if err != nil {
		t.Fatalf("Status: %v", err)
	}
	if status["staged.md"].Staging == git.Unmodified {
		t.Fatal("unrelated staged change was removed")
	}
	if status["active.md"].Staging != git.Untracked {
		t.Fatalf("active note was staged despite refusal: %q", status["active.md"].Staging)
	}
}

func TestSuccessfulCommitNotifiesTheFrontendStatusPath(t *testing.T) {
	dir := t.TempDir()
	service, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	notified := make(chan struct{}, 1)
	service.SetCommitCallback(func() { notified <- struct{}{} })
	writeHistoryFixture(t, filepath.Join(dir, "note.md"), "changed\n")

	if err := service.CommitFile("note.md"); err != nil {
		t.Fatalf("CommitFile: %v", err)
	}
	select {
	case <-notified:
	case <-time.After(time.Second):
		t.Fatal("successful commit did not notify the status listener")
	}
}

func TestAutoCommitInterval(t *testing.T) {
	dir := t.TempDir()
	service, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	path := filepath.Join(dir, "test.md")
	writeHistoryFixture(t, path, "# initial\n")
	if err := service.CommitFile("test.md"); err != nil {
		t.Fatalf("initial CommitFile: %v", err)
	}
	before, err := service.GetFileHistory("test.md")
	if err != nil {
		t.Fatalf("history before timer: %v", err)
	}

	service.StartAutoCommit(1)
	t.Cleanup(func() { service.StartAutoCommit(0) })
	writeHistoryFixture(t, path, "# modified\n")

	time.Sleep(250 * time.Millisecond)
	early, err := service.GetFileHistory("test.md")
	if err != nil {
		t.Fatalf("early history: %v", err)
	}
	if len(early) != len(before) {
		t.Fatalf("auto-commit ran before its one-second interval: %d -> %d", len(before), len(early))
	}

	time.Sleep(1000 * time.Millisecond)
	after, err := service.GetFileHistory("test.md")
	if err != nil {
		t.Fatalf("history after timer: %v", err)
	}
	if len(after) < len(before)+1 {
		t.Fatalf("timer did not commit a modified file: %d -> %d", len(before), len(after))
	}
}
