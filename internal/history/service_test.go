package history

import (
	"os"
	"path/filepath"
	"runtime"
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

func assertFileStatusMatchesFullWorktreeOracle(t *testing.T, service *Service, paths ...string) {
	t.Helper()
	worktree, err := service.repo.Worktree()
	if err != nil {
		t.Fatalf("Worktree: %v", err)
	}
	status, err := worktree.Status()
	if err != nil {
		t.Fatalf("full worktree Status oracle: %v", err)
	}
	for _, path := range paths {
		fileStatus, exists := status[filepath.ToSlash(path)]
		want := exists && (fileStatus.Staging != git.Unmodified || fileStatus.Worktree != git.Unmodified)
		got, statusErr := service.HasUncommittedChanges(path)
		if statusErr != nil {
			t.Fatalf("HasUncommittedChanges(%q): %v", path, statusErr)
		}
		if got != want {
			t.Errorf("HasUncommittedChanges(%q) = %v, want full-status oracle %v (%c%c)",
				path, got, want, fileStatus.Staging, fileStatus.Worktree)
		}
	}
}

func TestFileUncommittedStatusMatchesFullWorktreeStateMatrix(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(t *testing.T, dir string, service *Service) []string
	}{
		{
			name: "clean tracked file",
			mutate: func(_ *testing.T, _ string, _ *Service) []string {
				return []string{"active.md"}
			},
		},
		{
			name: "modified tracked file",
			mutate: func(t *testing.T, dir string, _ *Service) []string {
				writeHistoryFixture(t, filepath.Join(dir, "active.md"), "modified\n")
				return []string{"active.md"}
			},
		},
		{
			name: "staged tracked file",
			mutate: func(t *testing.T, dir string, service *Service) []string {
				writeHistoryFixture(t, filepath.Join(dir, "active.md"), "staged\n")
				worktree, err := service.repo.Worktree()
				if err != nil {
					t.Fatalf("Worktree: %v", err)
				}
				if _, err := worktree.Add("active.md"); err != nil {
					t.Fatalf("stage active.md: %v", err)
				}
				return []string{"active.md"}
			},
		},
		{
			name: "deleted tracked file",
			mutate: func(t *testing.T, dir string, _ *Service) []string {
				if err := os.Remove(filepath.Join(dir, "active.md")); err != nil {
					t.Fatalf("remove active.md: %v", err)
				}
				return []string{"active.md"}
			},
		},
		{
			name: "untracked file",
			mutate: func(t *testing.T, dir string, _ *Service) []string {
				writeHistoryFixture(t, filepath.Join(dir, "new.md"), "untracked\n")
				return []string{"active.md", "new.md"}
			},
		},
		{
			name: "ignored file",
			mutate: func(t *testing.T, dir string, _ *Service) []string {
				ignorePath := filepath.Join(dir, ".gitignore")
				ignore, err := os.ReadFile(ignorePath)
				if err != nil {
					t.Fatalf("read .gitignore: %v", err)
				}
				writeHistoryFixture(t, ignorePath, string(ignore)+"ignored.md\n")
				writeHistoryFixture(t, filepath.Join(dir, "ignored.md"), "ignored\n")
				return []string{"ignored.md"}
			},
		},
		{
			name: "nested ignore and negation",
			mutate: func(t *testing.T, dir string, _ *Service) []string {
				if err := os.MkdirAll(filepath.Join(dir, "notes"), 0755); err != nil {
					t.Fatalf("create nested ignore directory: %v", err)
				}
				writeHistoryFixture(t, filepath.Join(dir, "notes", ".gitignore"), "*.md\n!kept.md\n")
				writeHistoryFixture(t, filepath.Join(dir, "notes", "ignored.md"), "ignored\n")
				writeHistoryFixture(t, filepath.Join(dir, "notes", "kept.md"), "kept\n")
				return []string{"notes/ignored.md", "notes/kept.md"}
			},
		},
		{
			name: "executable mode change",
			mutate: func(t *testing.T, dir string, _ *Service) []string {
				if runtime.GOOS == "windows" {
					t.Skip("Windows does not expose Git executable-bit changes")
				}
				if err := os.Chmod(filepath.Join(dir, "active.md"), 0755); err != nil {
					t.Fatalf("make active.md executable: %v", err)
				}
				return []string{"active.md"}
			},
		},
		{
			name: "staged deletion recreated in worktree",
			mutate: func(t *testing.T, dir string, service *Service) []string {
				if err := os.Remove(filepath.Join(dir, "active.md")); err != nil {
					t.Fatalf("remove active.md before staging deletion: %v", err)
				}
				worktree, err := service.repo.Worktree()
				if err != nil {
					t.Fatalf("Worktree: %v", err)
				}
				if _, err := worktree.Add("active.md"); err != nil {
					t.Fatalf("stage active.md deletion: %v", err)
				}
				writeHistoryFixture(t, filepath.Join(dir, "active.md"), "tracked\n")
				return []string{"active.md"}
			},
		},
		{
			name: "worktree rename",
			mutate: func(t *testing.T, dir string, _ *Service) []string {
				if err := os.Rename(filepath.Join(dir, "active.md"), filepath.Join(dir, "renamed.md")); err != nil {
					t.Fatalf("rename active.md: %v", err)
				}
				return []string{"active.md", "renamed.md"}
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			dir := t.TempDir()
			service, err := New(dir)
			if err != nil {
				t.Fatalf("New: %v", err)
			}
			writeHistoryFixture(t, filepath.Join(dir, "active.md"), "tracked\n")
			if err := service.CommitFile("active.md"); err != nil {
				t.Fatalf("CommitFile(active.md): %v", err)
			}

			assertFileStatusMatchesFullWorktreeOracle(t, service, test.mutate(t, dir, service)...)
		})
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

func TestArchiveSnapshotReturnsExactCommitAndReconstructableFiles(t *testing.T) {
	dir := t.TempDir()
	service, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "Drafts", "nested"), 0755); err != nil {
		t.Fatal(err)
	}
	writeHistoryFixture(t, filepath.Join(dir, "Drafts", "note.md"), "one\n")
	writeHistoryFixture(t, filepath.Join(dir, "Drafts", "nested", "two.md"), "two\n")

	hash, err := service.ArchivePathSnapshotWithVaultLocked("Drafts")
	if err != nil || hash == "" {
		t.Fatalf("ArchivePathSnapshotWithVaultLocked = %q, %v", hash, err)
	}
	files, err := service.GetPathSnapshotWithVaultLocked("Drafts", hash)
	if err != nil {
		t.Fatalf("GetPathSnapshotWithVaultLocked: %v", err)
	}
	if len(files) != 2 || files[0].Path != "Drafts/nested/two.md" || string(files[0].Data) != "two\n" || files[1].Path != "Drafts/note.md" || string(files[1].Data) != "one\n" {
		t.Fatalf("snapshot files = %#v", files)
	}

	unchangedHash, err := service.ArchivePathSnapshotWithVaultLocked("Drafts")
	if err != nil || unchangedHash != hash {
		t.Fatalf("unchanged archive = %q, %v; want %q", unchangedHash, err, hash)
	}
}

func TestArchiveSnapshotDoesNotResurrectAFileRemovedBeforeDirectoryDeletion(t *testing.T) {
	dir := t.TempDir()
	service, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "Drafts"), 0755); err != nil {
		t.Fatal(err)
	}
	writeHistoryFixture(t, filepath.Join(dir, "Drafts", "keep.md"), "keep\n")
	writeHistoryFixture(t, filepath.Join(dir, "Drafts", "removed.md"), "old\n")
	if err := service.CommitFile("Drafts/keep.md"); err != nil {
		t.Fatal(err)
	}
	if err := service.CommitFile("Drafts/removed.md"); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(dir, "Drafts", "removed.md")); err != nil {
		t.Fatal(err)
	}

	hash, err := service.ArchivePathSnapshotWithVaultLocked("Drafts")
	if err != nil || hash == "" {
		t.Fatalf("ArchivePathSnapshotWithVaultLocked = %q, %v", hash, err)
	}
	files, err := service.GetPathSnapshotWithVaultLocked("Drafts", hash)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 || files[0].Path != "Drafts/keep.md" {
		t.Fatalf("exact snapshot = %#v; removed file was resurrected", files)
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
