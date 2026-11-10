package history

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/filemode"
	"github.com/go-git/go-git/v5/plumbing/format/index"
)

// archiveStatusOracle reads the same answers from go-git's complete status,
// which the archive used before it compared the index with HEAD directly.
func archiveStatusOracle(t *testing.T, service *Service, relPath string) ([]string, bool) {
	t.Helper()
	worktree, err := service.repo.Worktree()
	if err != nil {
		t.Fatalf("Worktree: %v", err)
	}
	status, err := worktree.Status()
	if err != nil {
		t.Fatalf("Status: %v", err)
	}
	outside := []string{}
	inside := false
	for path, file := range status {
		if file.Staging == git.Unmodified || file.Staging == git.Untracked {
			continue
		}
		if archiveContainsPath(relPath, path) {
			inside = true
		} else {
			outside = append(outside, path)
		}
	}
	sort.Strings(outside)
	return outside, inside
}

func archiveIndexStateOf(t *testing.T, service *Service, relPath string) archiveIndexState {
	t.Helper()
	headHash, err := service.historyHeadHash()
	if err != nil {
		t.Fatalf("historyHeadHash: %v", err)
	}
	head, err := service.headEntries(headHash)
	if err != nil {
		t.Fatalf("headEntries: %v", err)
	}
	idx, err := service.repo.Storer.Index()
	if err != nil {
		t.Fatalf("Index: %v", err)
	}
	return compareArchiveIndexWithHead(relPath, head, idx)
}

func TestArchiveIndexComparisonMatchesFullWorktreeStatus(t *testing.T) {
	type repository struct {
		dir      string
		service  *Service
		worktree *git.Worktree
	}
	write := func(t *testing.T, repo repository, path string, content string) {
		t.Helper()
		full := filepath.Join(repo.dir, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(full), 0755); err != nil {
			t.Fatal(err)
		}
		writeHistoryFixture(t, full, content)
	}
	stage := func(t *testing.T, repo repository, path string) {
		t.Helper()
		if _, err := repo.worktree.Add(path); err != nil {
			t.Fatalf("stage %s: %v", path, err)
		}
	}
	scenarios := map[string]func(t *testing.T, repo repository){
		"clean": func(*testing.T, repository) {},
		"unstaged edits and untracked files are not staged": func(t *testing.T, repo repository) {
			write(t, repo, "Other/x.md", "edited, not staged\n")
			write(t, repo, "Drafts/one.md", "edited, not staged\n")
			write(t, repo, "Other/untracked.md", "new\n")
			write(t, repo, "Drafts/untracked.md", "new\n")
		},
		"a tracked file missing from the worktree is not staged": func(t *testing.T, repo repository) {
			if err := os.Remove(filepath.Join(repo.dir, "Drafts", "two.md")); err != nil {
				t.Fatal(err)
			}
			if err := os.Remove(filepath.Join(repo.dir, "Other", "x.md")); err != nil {
				t.Fatal(err)
			}
		},
		"staged edit outside": func(t *testing.T, repo repository) {
			write(t, repo, "Other/x.md", "staged edit\n")
			stage(t, repo, "Other/x.md")
		},
		"staged addition outside": func(t *testing.T, repo repository) {
			write(t, repo, "Other/new.md", "staged new\n")
			stage(t, repo, "Other/new.md")
		},
		"staged removal outside": func(t *testing.T, repo repository) {
			if _, err := repo.worktree.Remove("a.md"); err != nil {
				t.Fatal(err)
			}
		},
		"staged edit, addition and removal inside": func(t *testing.T, repo repository) {
			write(t, repo, "Drafts/one.md", "staged edit\n")
			stage(t, repo, "Drafts/one.md")
			write(t, repo, "Drafts/deep/new.md", "staged new\n")
			stage(t, repo, "Drafts/deep/new.md")
			if _, err := repo.worktree.Remove("Drafts/two.md"); err != nil {
				t.Fatal(err)
			}
		},
		"a sibling whose name only starts like the archive is outside": func(t *testing.T, repo repository) {
			write(t, repo, "Drafts2/note.md", "staged new\n")
			stage(t, repo, "Drafts2/note.md")
			write(t, repo, "Drafts.md", "staged new\n")
			stage(t, repo, "Drafts.md")
		},
		"staged on both sides": func(t *testing.T, repo repository) {
			write(t, repo, "Drafts/one.md", "staged edit\n")
			stage(t, repo, "Drafts/one.md")
			write(t, repo, "Other/x.md", "staged edit\n")
			stage(t, repo, "Other/x.md")
			write(t, repo, "a.md", "staged edit\n")
			stage(t, repo, "a.md")
		},
	}
	for name, mutate := range scenarios {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			service, err := New(dir)
			if err != nil {
				t.Fatalf("New: %v", err)
			}
			worktree, err := service.repo.Worktree()
			if err != nil {
				t.Fatalf("Worktree: %v", err)
			}
			repo := repository{dir: dir, service: service, worktree: worktree}
			for _, path := range []string{"a.md", "Drafts/one.md", "Drafts/two.md", "Other/x.md"} {
				write(t, repo, path, "committed "+path+"\n")
				if err := service.CommitFile(path); err != nil {
					t.Fatalf("CommitFile(%s): %v", path, err)
				}
			}
			mutate(t, repo)

			for _, relPath := range []string{"Drafts", "Drafts/one.md", "a.md", "Other"} {
				wantOutside, wantInside := archiveStatusOracle(t, service, relPath)
				got := archiveIndexStateOf(t, service, relPath)
				if got.needsFullStatus {
					t.Fatalf("%s: ordinary index needed the full-status fallback", relPath)
				}
				gotOutside := got.stagedOutside
				if gotOutside == nil {
					gotOutside = []string{}
				}
				if !reflect.DeepEqual(gotOutside, wantOutside) || got.stagedInside != wantInside {
					t.Fatalf("%s: staged outside %v inside %v, full status says outside %v inside %v",
						relPath, gotOutside, got.stagedInside, wantOutside, wantInside)
				}
			}
		})
	}
}

func TestArchiveIndexComparisonDefersToFullStatusForUnmodelledEntries(t *testing.T) {
	hash := plumbing.NewHash("0123456789012345678901234567890123456789")
	head := map[string]gitPathState{"a.md": {exists: true, hash: hash, mode: filemode.Regular}}
	entry := func(name string, mode filemode.FileMode) *index.Entry {
		return &index.Entry{Name: name, Hash: hash, Mode: mode}
	}
	conflict := entry("a.md", filemode.Regular)
	conflict.Stage = index.OurMode
	intent := entry("a.md", filemode.Regular)
	intent.IntentToAdd = true
	cases := map[string]struct {
		head map[string]gitPathState
		idx  *index.Index
	}{
		"unmerged stage":    {head, &index.Index{Entries: []*index.Entry{conflict}}},
		"intent to add":     {head, &index.Index{Entries: []*index.Entry{intent}}},
		"submodule entry":   {head, &index.Index{Entries: []*index.Entry{entry("a.md", filemode.Regular), entry("vendor/lib", filemode.Submodule)}}},
		"submodule in HEAD": {map[string]gitPathState{"vendor/lib": {exists: true, hash: hash, mode: filemode.Submodule}}, &index.Index{}},
		"duplicate entry":   {head, &index.Index{Entries: []*index.Entry{entry("a.md", filemode.Regular), entry("a.md", filemode.Regular)}}},
	}
	for name, test := range cases {
		if !compareArchiveIndexWithHead("Drafts", test.head, test.idx).needsFullStatus {
			t.Errorf("%s: index compared without the full-status fallback", name)
		}
	}

	// A mode change alone is a staged change, as it is for go-git's status.
	executable := compareArchiveIndexWithHead("Drafts", head, &index.Index{Entries: []*index.Entry{entry("a.md", filemode.Executable)}})
	if !reflect.DeepEqual(executable.stagedOutside, []string{"a.md"}) || executable.stagedInside {
		t.Fatalf("mode-only change = %#v, want a.md staged outside", executable)
	}
}

func TestArchiveStagesRemovedChildrenAndRestoresTheIndexWhenRefused(t *testing.T) {
	dir := t.TempDir()
	service, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "Drafts", "deep"), 0755); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"Drafts/keep.md", "Drafts/gone.md", "Drafts/deep/gone-too.md", "other.md"} {
		writeHistoryFixture(t, filepath.Join(dir, filepath.FromSlash(path)), "v1 "+path+"\n")
		if err := service.CommitFile(path); err != nil {
			t.Fatalf("CommitFile(%s): %v", path, err)
		}
	}
	// Two tracked children disappear and one changes before the folder is deleted.
	for _, path := range []string{"Drafts/gone.md", "Drafts/deep/gone-too.md"} {
		if err := os.Remove(filepath.Join(dir, filepath.FromSlash(path))); err != nil {
			t.Fatal(err)
		}
	}
	writeHistoryFixture(t, filepath.Join(dir, "Drafts", "keep.md"), "v2 keep\n")
	writeHistoryFixture(t, filepath.Join(dir, "Drafts", "added.md"), "new\n")

	hash, err := service.ArchivePathSnapshotWithVaultLocked("Drafts")
	if err != nil || hash == "" {
		t.Fatalf("ArchivePathSnapshotWithVaultLocked = %q, %v", hash, err)
	}
	files, err := service.GetPathSnapshotWithVaultLocked("Drafts", hash)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, file := range files {
		got[file.Path] = string(file.Data)
	}
	want := map[string]string{"Drafts/keep.md": "v2 keep\n", "Drafts/added.md": "new\n"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("archived snapshot = %#v, want %#v", got, want)
	}
	// Nothing is left staged and the unrelated note is untouched.
	if outside, inside := archiveStatusOracle(t, service, "Drafts"); len(outside) != 0 || inside {
		t.Fatalf("index after archive: staged outside %v, inside %v", outside, inside)
	}
	// Archiving the same state again finds nothing to record.
	again, err := service.ArchivePathSnapshotWithVaultLocked("Drafts")
	if err != nil || again != hash {
		t.Fatalf("second archive = %q, %v; want the same revision %q", again, err, hash)
	}
}
