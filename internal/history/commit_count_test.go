package history

import (
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/filemode"
	"github.com/go-git/go-git/v5/plumbing/format/index"
	"github.com/go-git/go-git/v5/plumbing/object"
)

// countRepository drives one temporary repository two ways: through the
// service, as Figaro's own autosave and archive revisions, and through Git
// objects and references written directly, as the user's own Git commands
// would leave them. The second way uses no worktree porcelain, so a history
// may freely turn a file into a folder and back.
type countRepository struct {
	t        *testing.T
	dir      string
	service  *Service
	external *git.Repository
	clock    time.Time
	serial   int
	paths    map[string]struct{}
	commits  []plumbing.Hash
	branches []string
}

func newCountRepository(t *testing.T) *countRepository {
	t.Helper()
	dir := t.TempDir()
	service, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	external, err := git.PlainOpen(dir)
	if err != nil {
		t.Fatalf("open repository: %v", err)
	}
	return &countRepository{
		t: t, dir: dir, service: service, external: external,
		clock: time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC),
		paths: map[string]struct{}{},
	}
}

func (r *countRepository) head() plumbing.Hash {
	r.t.Helper()
	head, err := r.external.Head()
	if err != nil {
		r.t.Fatalf("resolve HEAD: %v", err)
	}
	return head.Hash()
}

// state reads the files of one revision.
func (r *countRepository) state(hash plumbing.Hash) map[string]string {
	r.t.Helper()
	commit, err := r.external.CommitObject(hash)
	if err != nil {
		r.t.Fatalf("read revision %s: %v", hash, err)
	}
	files, err := commit.Files()
	if err != nil {
		r.t.Fatal(err)
	}
	state := make(map[string]string)
	if err := files.ForEach(func(file *object.File) error {
		content, err := file.Contents()
		state[file.Name] = content
		return err
	}); err != nil {
		r.t.Fatal(err)
	}
	return state
}

// conflicts reports whether path cannot join state without replacing a folder
// by a file or a file by a folder.
func conflicts(state map[string]string, path string) bool {
	for existing := range state {
		if strings.HasPrefix(existing, path+"/") || strings.HasPrefix(path, existing+"/") {
			return true
		}
	}
	return false
}

func (r *countRepository) nextContent(path string) string {
	r.serial++
	r.paths[path] = struct{}{}
	return fmt.Sprintf("%s revision %d\n", path, r.serial)
}

// figaro records new content of one path the way an autosave does. It reports
// false, changing nothing, when the path would replace a folder or a file.
func (r *countRepository) figaro(path string) bool {
	r.t.Helper()
	if len(r.commits) > 0 && conflicts(r.state(r.head()), path) {
		return false
	}
	absolute := filepath.Join(r.dir, filepath.FromSlash(path))
	if info, err := os.Lstat(absolute); err == nil && info.IsDir() {
		// A folder Figaro emptied earlier is still on disk; Git never saw it.
		if err := os.Remove(absolute); err != nil {
			r.t.Fatal(err)
		}
	}
	if err := os.MkdirAll(filepath.Dir(absolute), 0755); err != nil {
		r.t.Fatal(err)
	}
	if err := os.WriteFile(absolute, []byte(r.nextContent(path)), 0644); err != nil {
		r.t.Fatal(err)
	}
	if err := r.service.CommitFile(path); err != nil {
		r.t.Fatalf("CommitFile(%s): %v", path, err)
	}
	r.commits = append(r.commits, r.head())
	return true
}

func (r *countRepository) figaroDelete(path string) bool {
	r.t.Helper()
	if _, tracked := r.state(r.head())[path]; !tracked {
		return false
	}
	if err := os.Remove(filepath.Join(r.dir, filepath.FromSlash(path))); err != nil {
		r.t.Fatal(err)
	}
	if err := r.service.CommitFile(path); err != nil {
		r.t.Fatalf("CommitFile(%s) after removal: %v", path, err)
	}
	r.commits = append(r.commits, r.head())
	return true
}

func (r *countRepository) store(encode func(plumbing.EncodedObject) error) plumbing.Hash {
	r.t.Helper()
	encoded := r.external.Storer.NewEncodedObject()
	if err := encode(encoded); err != nil {
		r.t.Fatal(err)
	}
	hash, err := r.external.Storer.SetEncodedObject(encoded)
	if err != nil {
		r.t.Fatal(err)
	}
	return hash
}

func (r *countRepository) storeBlob(content string) plumbing.Hash {
	return r.store(func(encoded plumbing.EncodedObject) error {
		encoded.SetType(plumbing.BlobObject)
		writer, err := encoded.Writer()
		if err != nil {
			return err
		}
		if _, err := writer.Write([]byte(content)); err != nil {
			return err
		}
		return writer.Close()
	})
}

// storeTree writes the tree objects of one folder of state and returns the
// folder's tree.
func (r *countRepository) storeTree(state map[string]string, prefix string) plumbing.Hash {
	r.t.Helper()
	entries := map[string]object.TreeEntry{}
	for path, content := range state {
		if !strings.HasPrefix(path, prefix) {
			continue
		}
		name, _, nested := strings.Cut(path[len(prefix):], "/")
		if _, done := entries[name]; done {
			continue
		}
		if nested {
			entries[name] = object.TreeEntry{Name: name, Mode: filemode.Dir, Hash: r.storeTree(state, prefix+name+"/")}
		} else {
			entries[name] = object.TreeEntry{Name: name, Mode: filemode.Regular, Hash: r.storeBlob(content)}
		}
	}
	tree := &object.Tree{}
	for _, entry := range entries {
		tree.Entries = append(tree.Entries, entry)
	}
	sort.Sort(object.TreeEntrySorter(tree.Entries))
	return r.store(tree.Encode)
}

// moveHead points the current branch, or a detached HEAD, at hash.
func (r *countRepository) moveHead(hash plumbing.Hash) {
	r.t.Helper()
	name := plumbing.HEAD
	if head, err := r.external.Storer.Reference(plumbing.HEAD); err == nil && head.Type() == plumbing.SymbolicReference {
		name = head.Target()
	}
	if err := r.external.Storer.SetReference(plumbing.NewHashReference(name, hash)); err != nil {
		r.t.Fatal(err)
	}
}

// syncWorktree makes the working files and the index describe exactly the
// HEAD revision, as a checkout does, so Figaro's next revision starts clean.
func (r *countRepository) syncWorktree() {
	r.t.Helper()
	entries, err := os.ReadDir(r.dir)
	if err != nil {
		r.t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() == ".git" {
			continue
		}
		if err := os.RemoveAll(filepath.Join(r.dir, entry.Name())); err != nil {
			r.t.Fatal(err)
		}
	}
	state := r.state(r.head())
	paths := make([]string, 0, len(state))
	for path := range state {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	staged := &index.Index{Version: 2}
	for _, path := range paths {
		absolute := filepath.Join(r.dir, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(absolute), 0755); err != nil {
			r.t.Fatal(err)
		}
		if err := os.WriteFile(absolute, []byte(state[path]), 0644); err != nil {
			r.t.Fatal(err)
		}
		info, err := os.Stat(absolute)
		if err != nil {
			r.t.Fatal(err)
		}
		staged.Entries = append(staged.Entries, &index.Entry{
			Name:       path,
			Hash:       plumbing.ComputeHash(plumbing.BlobObject, []byte(state[path])),
			Mode:       filemode.Regular,
			Size:       uint32(len(state[path])),
			ModifiedAt: info.ModTime(),
		})
	}
	if err := r.external.Storer.SetIndex(staged); err != nil {
		r.t.Fatal(err)
	}
}

// commit records a user's own commit on top of HEAD. A changed path receives
// new content, replacing whatever file or folder stood in its way; a removed
// one is deleted. advance moves the commit clock and may be zero or negative.
func (r *countRepository) commit(changed []string, removed []string, advance time.Duration, extraParents ...plumbing.Hash) plumbing.Hash {
	r.t.Helper()
	parent := r.head()
	state := r.state(parent)
	for _, path := range removed {
		delete(state, path)
	}
	for _, path := range changed {
		for existing := range state {
			if strings.HasPrefix(existing, path+"/") || strings.HasPrefix(path, existing+"/") {
				delete(state, existing)
			}
		}
		state[path] = r.nextContent(path)
	}
	r.clock = r.clock.Add(advance)
	signature := object.Signature{Name: "writer", Email: "writer@example.com", When: r.clock}
	commit := &object.Commit{
		Author:       signature,
		Committer:    signature,
		Message:      fmt.Sprintf("user commit %d", r.serial),
		TreeHash:     r.storeTree(state, ""),
		ParentHashes: append([]plumbing.Hash{parent}, extraParents...),
	}
	hash := r.store(commit.Encode)
	r.moveHead(hash)
	r.syncWorktree()
	r.commits = append(r.commits, hash)
	return hash
}

func (r *countRepository) checkoutBranch(name string) {
	r.t.Helper()
	reference := plumbing.NewSymbolicReference(plumbing.HEAD, plumbing.NewBranchReferenceName(name))
	if err := r.external.Storer.SetReference(reference); err != nil {
		r.t.Fatal(err)
	}
	r.syncWorktree()
}

func (r *countRepository) detach(hash plumbing.Hash) {
	r.t.Helper()
	if err := r.external.Storer.SetReference(plumbing.NewHashReference(plumbing.HEAD, hash)); err != nil {
		r.t.Fatal(err)
	}
	r.syncWorktree()
}

func (r *countRepository) branchAt(name string, hash plumbing.Hash) {
	r.t.Helper()
	reference := plumbing.NewHashReference(plumbing.NewBranchReferenceName(name), hash)
	if err := r.external.Storer.SetReference(reference); err != nil {
		r.t.Fatal(err)
	}
	r.branches = append(r.branches, name)
	r.checkoutBranch(name)
}

func (r *countRepository) tag(name string, hash plumbing.Hash) {
	r.t.Helper()
	reference := plumbing.NewHashReference(plumbing.NewTagReferenceName(name), hash)
	if err := r.external.Storer.SetReference(reference); err != nil {
		r.t.Fatalf("git tag: %v", err)
	}
}

// assertCountsMatchLog is the differential check: for every path the test has
// touched, and some it never did, CommitCount must equal the number of
// revisions the unchanged GetFileHistory lists.
func (r *countRepository) assertCountsMatchLog(step string) {
	r.t.Helper()
	paths := []string{"never-written.md", "notes", "notes/never.md", "", ".", "./a.md"}
	for path := range r.paths {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	for _, path := range paths {
		entries, historyErr := r.service.GetFileHistory(path)
		count, countErr := r.service.CommitCount(path)
		if (historyErr != nil) != (countErr != nil) {
			r.t.Fatalf("%s: %q history error %v, count error %v", step, path, historyErr, countErr)
		}
		if count != len(entries) {
			r.t.Fatalf("%s: CommitCount(%q) = %d, but the log lists %d revision(s)", step, path, count, len(entries))
		}
	}
}

func TestCommitCountMatchesTheFileLogThroughBranchesMergesAndRewrites(t *testing.T) {
	r := newCountRepository(t)
	r.assertCountsMatchLog("empty repository")

	r.figaro("a.md")
	r.assertCountsMatchLog("first revision")
	r.figaro("notes/b.md")
	r.figaro("a.md")
	r.figaro("a.md")
	r.assertCountsMatchLog("autosaves of two notes")
	r.figaroDelete("notes/b.md")
	r.assertCountsMatchLog("a note removed by Figaro")
	r.figaro("notes/b.md")
	r.assertCountsMatchLog("the removed note written again")

	base := r.commit([]string{"a.md", "notes/b.md", "c.md"}, nil, time.Hour)
	r.assertCountsMatchLog("a user commit touching three files")
	r.commit([]string{"c.md"}, []string{"a.md"}, time.Hour)
	r.assertCountsMatchLog("a user commit removing a note")
	// A file gives way to a folder of the same name, and back.
	r.commit([]string{"swap"}, nil, time.Hour)
	r.assertCountsMatchLog("a file named swap")
	r.commit([]string{"swap/inner.md"}, nil, time.Hour)
	r.assertCountsMatchLog("swap became a folder")
	r.commit([]string{"swap"}, nil, time.Hour)
	r.assertCountsMatchLog("swap became a file again")
	// Commit times that tie or run backwards still follow parent order.
	r.commit([]string{"c.md"}, nil, 0)
	r.commit([]string{"a.md"}, nil, -3*time.Hour)
	r.assertCountsMatchLog("commit times out of order")
	main := r.head()

	r.tag("v1", base)
	r.assertCountsMatchLog("a tag on an older revision")

	// A side branch from an older revision, left behind when HEAD returns.
	r.branchAt("side", base)
	r.commit([]string{"side.md", "a.md"}, nil, time.Hour)
	side := r.commit([]string{"side.md"}, nil, time.Hour)
	r.assertCountsMatchLog("on a side branch")
	r.checkoutBranch("master")
	r.assertCountsMatchLog("back on the main branch")
	r.figaro("a.md")
	r.figaro("c.md")
	r.assertCountsMatchLog("autosaves beside a side branch")

	// A branch ahead of HEAD puts its revisions before HEAD's in the walk.
	r.branchAt("ahead", r.head())
	r.commit([]string{"ahead.md", "c.md"}, nil, time.Hour)
	r.checkoutBranch("master")
	r.assertCountsMatchLog("a branch ahead of HEAD")
	r.figaro("c.md")
	r.assertCountsMatchLog("an autosave behind another branch's revisions")
	r.figaro("a.md")
	r.figaro("notes/b.md")
	r.assertCountsMatchLog("more autosaves behind another branch")

	r.commit([]string{"merged.md"}, nil, time.Hour, side)
	r.assertCountsMatchLog("a merge of the side branch")
	r.figaro("merged.md")
	r.assertCountsMatchLog("an autosave after the merge")

	r.detach(main)
	r.assertCountsMatchLog("a detached HEAD on an older revision")
	r.commit([]string{"detached.md", "a.md"}, nil, time.Hour)
	r.assertCountsMatchLog("a commit on the detached HEAD")
	r.figaro("detached.md")
	r.assertCountsMatchLog("an autosave on the detached HEAD")
	r.checkoutBranch("master")
	r.assertCountsMatchLog("the detached revisions left unreferenced")

	if err := r.external.Storer.RemoveReference(plumbing.NewBranchReferenceName("ahead")); err != nil {
		t.Fatal(err)
	}
	r.assertCountsMatchLog("a branch deleted")

	// Figaro's archive-before-delete revision of a whole folder: one revision
	// naming an edited note and a note never recorded before.
	r.figaro("Trash/one.md")
	r.figaro("Trash/two.md")
	for _, path := range []string{"Trash/one.md", "Trash/three.md"} {
		if err := os.WriteFile(filepath.Join(r.dir, filepath.FromSlash(path)), []byte(r.nextContent(path)), 0644); err != nil {
			t.Fatal(err)
		}
	}
	before := r.head()
	if err := r.service.ArchivePathWithVaultLocked("Trash"); err != nil {
		t.Fatalf("ArchivePathWithVaultLocked: %v", err)
	}
	if r.head() == before {
		t.Fatal("the archive recorded no revision")
	}
	r.assertCountsMatchLog("a folder archived before deletion")
}

// Random histories reach orderings no scripted scenario lists. Each step is
// followed by the full differential check, so a wrong shortcut shows up at
// the step that took it.
func TestCommitCountMatchesTheFileLogOnRandomHistories(t *testing.T) {
	files := []string{"a.md", "b.md", "notes/c.md", "notes/deep/d.md", "swap", "swap/inner.md"}
	for seed := int64(1); seed <= 3; seed++ {
		t.Run(fmt.Sprintf("seed %d", seed), func(t *testing.T) {
			random := rand.New(rand.NewSource(seed))
			r := newCountRepository(t)
			r.figaro("a.md")
			r.branches = []string{"master"}
			for step := 0; step < 45; step++ {
				label := ""
				switch choice := random.Intn(20); {
				case choice < 8:
					path := files[random.Intn(len(files))]
					if !r.figaro(path) {
						continue
					}
					label = "autosave of " + path
				case choice < 9:
					path := files[random.Intn(len(files))]
					if !r.figaroDelete(path) {
						continue
					}
					label = "removal of " + path
				case choice < 13:
					var changed, removed []string
					for _, path := range files {
						switch random.Intn(5) {
						case 0:
							changed = append(changed, path)
						case 1:
							removed = append(removed, path)
						}
					}
					advance := time.Duration(random.Intn(5)-1) * time.Hour
					r.commit(changed, removed, advance)
					label = fmt.Sprintf("user commit changing %v and removing %v", changed, removed)
				case choice < 15:
					name := fmt.Sprintf("branch-%d", step)
					r.branchAt(name, r.commits[random.Intn(len(r.commits))])
					label = "new branch " + name
				case choice < 17:
					name := r.branches[random.Intn(len(r.branches))]
					r.checkoutBranch(name)
					label = "checkout of " + name
				case choice < 18:
					r.tag(fmt.Sprintf("tag-%d", step), r.commits[random.Intn(len(r.commits))])
					label = "new tag"
				case choice < 19:
					other := r.commits[random.Intn(len(r.commits))]
					if other == r.head() {
						continue
					}
					r.commit([]string{files[random.Intn(len(files))]}, nil, time.Hour, other)
					label = "merge commit"
				default:
					r.detach(r.commits[random.Intn(len(r.commits))])
					label = "detached HEAD"
				}
				r.assertCountsMatchLog(fmt.Sprintf("step %d (%s)", step, label))
			}
			if r.service.commitCountAdvances == 0 || r.service.commitCountBuilds == 0 {
				t.Fatalf("the history exercised %d full walk(s) and %d advance(s); both paths must be covered",
					r.service.commitCountBuilds, r.service.commitCountAdvances)
			}
		})
	}
}

// The point of the retained counts: the status bar asks after every save, and
// a save adds one revision. Only the first question walks the repository.
func TestCommitCountWalksTheLogOnceAndThenFollowsNewRevisions(t *testing.T) {
	r := newCountRepository(t)
	for index := 0; index < 6; index++ {
		r.figaro("a.md")
		r.figaro("b.md")
	}
	walks := func() [2]int { return [2]int{r.service.commitCountBuilds, r.service.commitCountAdvances} }

	if count, err := r.service.CommitCount("a.md"); err != nil || count != 6 {
		t.Fatalf("CommitCount(a.md) = %d, %v; want 6", count, err)
	}
	if got := walks(); got != [2]int{1, 0} {
		t.Fatalf("first question: %v full walks and advances, want one walk", got)
	}
	// Every other path, and the same path again, is answered from memory.
	for _, path := range []string{"b.md", "a.md", "missing.md", "b.md"} {
		if _, err := r.service.CommitCount(path); err != nil {
			t.Fatal(err)
		}
	}
	if got := walks(); got != [2]int{1, 0} {
		t.Fatalf("repeated questions: %v full walks and advances, want none added", got)
	}

	// A save, then the question, three times over.
	for index := 0; index < 3; index++ {
		r.figaro("a.md")
		if count, err := r.service.CommitCount("a.md"); err != nil || count != 7+index {
			t.Fatalf("CommitCount(a.md) after save %d = %d, %v", index+1, count, err)
		}
	}
	if got := walks(); got != [2]int{1, 3} {
		t.Fatalf("three saves: %v full walks and advances, want three advances and no new walk", got)
	}
	// Several revisions between two questions are followed in one step.
	for index := 0; index < 5; index++ {
		r.figaro("b.md")
	}
	if count, err := r.service.CommitCount("b.md"); err != nil || count != 11 {
		t.Fatalf("CommitCount(b.md) = %d, %v; want 11", count, err)
	}
	if got := walks(); got != [2]int{1, 4} {
		t.Fatalf("five saves before one question: %v full walks and advances, want one more advance", got)
	}

	// Anything but new revisions on the current branch is walked afresh.
	r.tag("checkpoint", r.commits[2])
	if count, err := r.service.CommitCount("a.md"); err != nil || count != 9 {
		t.Fatalf("CommitCount(a.md) after a tag = %d, %v; want 9", count, err)
	}
	if got := walks(); got != [2]int{2, 4} {
		t.Fatalf("after a tag: %v full walks and advances, want a second walk", got)
	}
	r.assertCountsMatchLog("after the scripted saves")
}

func TestCommitCountAdvanceGivesWayToAFullWalkBeyondItsLimit(t *testing.T) {
	r := newCountRepository(t)
	r.figaro("a.md")
	if _, err := r.service.CommitCount("a.md"); err != nil {
		t.Fatal(err)
	}
	for index := 0; index <= commitCountChainLimit; index++ {
		r.commit([]string{"a.md"}, nil, time.Minute)
	}
	if count, err := r.service.CommitCount("a.md"); err != nil || count != commitCountChainLimit+2 {
		t.Fatalf("CommitCount(a.md) = %d, %v; want %d", count, err, commitCountChainLimit+2)
	}
	if r.service.commitCountBuilds != 2 || r.service.commitCountAdvances != 0 {
		t.Fatalf("%d full walks and %d advances; want the long chain walked afresh", r.service.commitCountBuilds, r.service.commitCountAdvances)
	}
}
