package history

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"figaro/internal/vault"
	"github.com/go-git/go-billy/v5"
	"github.com/go-git/go-billy/v5/osfs"
	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/storage"
)

// Keep real on-disk Git storage; intercept only the object-write boundary.
type interceptedHistoryStorage struct {
	storage.Storer
	beforeWrite func(plumbing.EncodedObject) error
}

func (s *interceptedHistoryStorage) SetEncodedObject(obj plumbing.EncodedObject) (plumbing.Hash, error) {
	if err := s.beforeWrite(obj); err != nil {
		return plumbing.ZeroHash, err
	}
	return s.Storer.SetEncodedObject(obj)
}
func historyTestService(t *testing.T) (*Service, string) {
	t.Helper()
	dir := t.TempDir()
	h, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}
	return h, dir
}
func waitHistoryResult(t *testing.T, result <-chan error) {
	t.Helper()
	select {
	case err := <-result:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("operation blocked behind slow Git I/O")
	}
}
func assertHistoryContent(t *testing.T, h *Service, want string) {
	t.Helper()
	head, err := h.repo.Head()
	if err != nil {
		t.Fatal(err)
	}
	commit, err := h.repo.CommitObject(head.Hash())
	if err != nil {
		t.Fatal(err)
	}
	file, err := commit.File("note.md")
	if err != nil {
		t.Fatal(err)
	}
	got, err := file.Contents()
	if err != nil || got != want {
		t.Fatalf("committed content = %q, %v; want %q", got, err, want)
	}
}

func TestSlowHistoryCommitAllowsAtomicSaveAndKeepsCapturedRevision(t *testing.T) {
	h, dir := historyTestService(t)
	var paths, contents sync.RWMutex
	h.SetVaultLocks(&paths, &contents)
	writeHistoryFixture(t, filepath.Join(dir, "note.md"), "captured revision")
	entered, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	defer once.Do(func() { close(release) })
	original := h.repo.Storer
	h.repo.Storer = &interceptedHistoryStorage{Storer: original, beforeWrite: func(obj plumbing.EncodedObject) error {
		if obj.Type() == plumbing.BlobObject {
			close(entered)
			<-release
		}
		return nil
	}}
	committed := make(chan error, 1)
	go func() { committed <- h.CommitFile("note.md") }()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("snapshot was not captured")
	}
	saved := make(chan error, 1)
	go func() {
		contents.Lock()
		defer contents.Unlock()
		root, err := os.OpenRoot(dir)
		if err != nil {
			saved <- err
			return
		}
		defer root.Close()
		saved <- vault.WriteFileAtomic(root, "note.md", []byte("newer edit on disk"), 0644)
	}()
	waitHistoryResult(t, saved)
	if paths.TryLock() {
		paths.Unlock()
		t.Fatal("Git did not protect path identity")
	}
	once.Do(func() { close(release) })
	waitHistoryResult(t, committed)
	h.repo.Storer = original
	assertHistoryContent(t, h, "captured revision")
	dirty, err := h.HasUncommittedChanges("note.md")
	if err != nil || !dirty {
		t.Fatalf("newer saved edit should remain dirty: %v, %v", dirty, err)
	}
	if err := h.CommitFile("note.md"); err != nil {
		t.Fatal(err)
	}
	assertHistoryContent(t, h, "newer edit on disk")
}

func TestCommitFailureRestoresIndexAndPreservesDiskAndHead(t *testing.T) {
	for _, objectType := range []plumbing.ObjectType{plumbing.BlobObject, plumbing.TreeObject, plumbing.CommitObject} {
		t.Run(objectType.String(), func(t *testing.T) {
			h, dir := historyTestService(t)
			writeHistoryFixture(t, filepath.Join(dir, "note.md"), "old")
			if err := h.CommitFile("note.md"); err != nil {
				t.Fatal(err)
			}
			before, err := h.repo.Storer.Index()
			if err != nil {
				t.Fatal(err)
			}
			writeHistoryFixture(t, filepath.Join(dir, "note.md"), "new")
			original := h.repo.Storer
			h.repo.Storer = &interceptedHistoryStorage{Storer: original, beforeWrite: func(obj plumbing.EncodedObject) error {
				if obj.Type() == objectType {
					return errors.New("injected disk failure")
				}
				return nil
			}}
			if err := h.CommitFile("note.md"); err == nil {
				t.Fatal("wanted write failure")
			}
			h.repo.Storer = original
			after, err := original.Index()
			if err != nil {
				t.Fatal(err)
			}
			// Restoring the index changes its filesystem timestamp, not staged entries.
			if !reflect.DeepEqual(before.Entries, after.Entries) {
				t.Fatal("failed commit changed index entries")
			}
			assertHistoryContent(t, h, "old")
			data, err := os.ReadFile(filepath.Join(dir, "note.md"))
			if err != nil || string(data) != "new" {
				t.Fatalf("saved note lost: %q %v", data, err)
			}
			if err := h.CommitFile("note.md"); err != nil {
				t.Fatal(err)
			}
			assertHistoryContent(t, h, "new")
		})
	}
}

func TestCommitRefusesExternalIndexChangeDuringSnapshotWrite(t *testing.T) {
	h, dir := historyTestService(t)
	writeHistoryFixture(t, filepath.Join(dir, "note.md"), "new note")
	writeHistoryFixture(t, filepath.Join(dir, "other.md"), "external staging")
	original := h.repo.Storer
	var once sync.Once
	h.repo.Storer = &interceptedHistoryStorage{Storer: original, beforeWrite: func(obj plumbing.EncodedObject) error {
		if obj.Type() == plumbing.BlobObject {
			once.Do(func() {
				// A separate repository handle stands in for another Git client.
				external, err := New(dir)
				if err != nil {
					t.Fatal(err)
				}
				wt, err := external.repo.Worktree()
				if err != nil {
					t.Fatal(err)
				}
				if _, err = wt.Add("other.md"); err != nil {
					t.Fatal(err)
				}
			})
		}
		return nil
	}}
	err := h.CommitFile("note.md")
	if err == nil || !strings.Contains(err.Error(), "Git changed") {
		t.Fatalf("wanted concurrent-index refusal, got %v", err)
	}
	idx, err := original.Index()
	if err != nil {
		t.Fatal(err)
	}
	if len(idx.Entries) != 1 || idx.Entries[0].Name != "other.md" {
		t.Fatalf("external staging overwritten: %+v", idx.Entries)
	}
}

func TestCommitRejectsUnrelatedStagedDeletion(t *testing.T) {
	h, dir := historyTestService(t)
	for _, name := range []string{"note.md", "other.md"} {
		writeHistoryFixture(t, filepath.Join(dir, name), "original")
		if err := h.CommitFile(name); err != nil {
			t.Fatal(err)
		}
	}
	wt, err := h.repo.Worktree()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := wt.Remove("other.md"); err != nil {
		t.Fatal(err)
	}
	writeHistoryFixture(t, filepath.Join(dir, "note.md"), "new")
	if err := h.CommitFile("note.md"); err == nil || !strings.Contains(err.Error(), "other.md has staged changes") {
		t.Fatalf("wanted staged deletion refusal, got %v", err)
	}
	assertHistoryContent(t, h, "original")
}

func TestCommitTargetIgnoreDeletionAndRootContainment(t *testing.T) {
	h, dir := historyTestService(t)
	writeHistoryFixture(t, filepath.Join(dir, ".gitignore"), "*.tmp\n")
	writeHistoryFixture(t, filepath.Join(dir, "ignored.tmp"), "ignored")
	if err := h.CommitFile("ignored.tmp"); err != nil {
		t.Fatal(err)
	}
	if hash, err := h.historyHeadHash(); err != nil || hash != plumbing.ZeroHash {
		t.Fatalf("ignored file committed: %s %v", hash, err)
	}
	writeHistoryFixture(t, filepath.Join(dir, "note.md"), "original")
	if err := h.CommitFile("note.md"); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(dir, "note.md")); err != nil {
		t.Fatal(err)
	}
	if err := h.CommitFile("note.md"); err != nil {
		t.Fatal(err)
	}
	head, err := h.repo.Head()
	if err != nil {
		t.Fatal(err)
	}
	commit, err := h.repo.CommitObject(head.Hash())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := commit.File("note.md"); err == nil {
		t.Fatal("deleted file remains in revision")
	}
	if err := h.CommitFile("../escape.md"); err == nil {
		t.Fatal("accepted path escape")
	}
	outside := t.TempDir()
	writeHistoryFixture(t, filepath.Join(outside, "secret.md"), "secret")
	if err := os.Symlink(outside, filepath.Join(dir, "outside")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if err := h.CommitFile("outside/secret.md"); err == nil {
		t.Fatal("followed directory symlink outside root")
	}
}

type noWorktreeWalk struct{ billy.Filesystem }

func (f noWorktreeWalk) ReadDir(string) ([]os.FileInfo, error) {
	return nil, errors.New("unexpected whole-worktree traversal")
}

func TestSingleFileCommitDoesNotWalkUnrelatedWorktree(t *testing.T) {
	h, dir := historyTestService(t)
	writeHistoryFixture(t, filepath.Join(dir, "note.md"), "first")
	if err := h.CommitFile("note.md"); err != nil {
		t.Fatal(err)
	}
	repo, err := git.Open(h.repo.Storer, noWorktreeWalk{osfs.New(dir)})
	if err != nil {
		t.Fatal(err)
	}
	h.repo = repo
	writeHistoryFixture(t, filepath.Join(dir, "note.md"), "second")
	if err := h.CommitFile("note.md"); err != nil {
		t.Fatal(err)
	}
	assertHistoryContent(t, h, "second")
}

func TestCommitRefusesGitMetadata(t *testing.T) {
	h, _ := historyTestService(t)
	if err := h.CommitFile(".git/config"); err == nil {
		t.Fatal("accepted Git metadata as a note")
	}
	if hash, err := h.historyHeadHash(); err != nil || hash != plumbing.ZeroHash {
		t.Fatalf("Git metadata committed: %s %v", hash, err)
	}
}
