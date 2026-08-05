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
	otherHistory, err := service.GetFileHistory("other.md")
	if err != nil {
		t.Fatalf("GetFileHistory(other.md): %v", err)
	}
	if len(otherHistory) != 0 {
		t.Fatalf("committing active.md also recorded other.md: %#v", otherHistory)
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

func TestArchivePathWithVaultLockedRecordsEveryCurrentFileBeforeDeletion(t *testing.T) {
	dir := t.TempDir()
	service, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "Drafts"), 0755); err != nil {
		t.Fatalf("create archive fixture directory: %v", err)
	}
	writeHistoryFixture(t, filepath.Join(dir, ".gitignore"), ".config/\nDrafts/private.md\n")
	writeHistoryFixture(t, filepath.Join(dir, "Drafts", "note.md"), "latest note\n")
	writeHistoryFixture(t, filepath.Join(dir, "Drafts", "private.md"), "ignored but recoverable\n")

	if err := service.ArchivePathWithVaultLocked("Drafts"); err != nil {
		t.Fatalf("ArchivePathWithVaultLocked: %v", err)
	}
	for path, want := range map[string]string{
		"Drafts/note.md":    "latest note\n",
		"Drafts/private.md": "ignored but recoverable\n",
	} {
		entries, err := service.GetFileHistory(path)
		if err != nil {
			t.Fatalf("GetFileHistory(%s): %v", path, err)
		}
		if len(entries) != 1 || !strings.HasPrefix(entries[0].Message, "archive before delete: Drafts") {
			t.Fatalf("history for %s = %#v, want one archive revision", path, entries)
		}
		content, err := service.GetFileVersion(path, entries[0].Hash)
		if err != nil {
			t.Fatalf("GetFileVersion(%s): %v", path, err)
		}
		if content != want {
			t.Fatalf("archived %s = %q, want %q", path, content, want)
		}
	}
}

func TestArchivePathWithVaultLockedDoesNotCreateARedundantRevision(t *testing.T) {
	dir := t.TempDir()
	service, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	writeHistoryFixture(t, filepath.Join(dir, "note.md"), "already recorded\n")
	if err := service.CommitFile("note.md"); err != nil {
		t.Fatalf("CommitFile: %v", err)
	}

	if err := service.ArchivePathWithVaultLocked("note.md"); err != nil {
		t.Fatalf("ArchivePathWithVaultLocked: %v", err)
	}
	entries, err := service.GetFileHistory("note.md")
	if err != nil {
		t.Fatalf("GetFileHistory: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("unchanged pre-delete archive created a redundant revision: %#v", entries)
	}
}

func TestArchivePathWithVaultLockedRefusesUnrelatedStagedChangesWithoutStagingTarget(t *testing.T) {
	dir := t.TempDir()
	service, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	writeHistoryFixture(t, filepath.Join(dir, "delete-me.md"), "keep until archived\n")
	writeHistoryFixture(t, filepath.Join(dir, "staged.md"), "staged elsewhere\n")
	worktree, err := service.repo.Worktree()
	if err != nil {
		t.Fatalf("Worktree: %v", err)
	}
	if _, err := worktree.Add("staged.md"); err != nil {
		t.Fatalf("stage unrelated file: %v", err)
	}

	err = service.ArchivePathWithVaultLocked("delete-me.md")
	if err == nil || !strings.Contains(err.Error(), "staged.md has staged changes") {
		t.Fatalf("ArchivePathWithVaultLocked error = %v; want unrelated-stage refusal", err)
	}
	status, err := worktree.Status()
	if err != nil {
		t.Fatalf("Status: %v", err)
	}
	if status["staged.md"].Staging == git.Unmodified {
		t.Fatal("unrelated staged change was removed")
	}
	if status["delete-me.md"].Staging != git.Untracked {
		t.Fatalf("delete target was staged despite refusal: %q", status["delete-me.md"].Staging)
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
