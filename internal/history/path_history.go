package history

import (
	"bytes"
	"container/heap"
	"fmt"
	"io"
	"path/filepath"

	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/plumbing/storer"
)

// pathHistoryChainLimit is how many new single-parent revisions the retained
// index is advanced through before a full walk is cheaper to reason about.
const pathHistoryChainLimit = 256

// historyRef is one reference as the repository lists it.
type historyRef struct {
	name   plumbing.ReferenceName
	kind   plumbing.ReferenceType
	target plumbing.ReferenceName
	hash   plumbing.Hash
}

// historyRefs is the state of the repository's references: everything the
// history of a path depends on besides immutable objects.
type historyRefs struct {
	head plumbing.Hash
	refs []historyRef
}

func (state historyRefs) equal(other historyRefs) bool {
	if state.head != other.head || len(state.refs) != len(other.refs) {
		return false
	}
	for index, ref := range state.refs {
		if ref != other.refs[index] {
			return false
		}
	}
	return true
}

// tips lists the revisions the walk starts from: HEAD and every reference
// naming an object directly. Symbolic references name another reference.
func (state historyRefs) tips() []plumbing.Hash {
	tips := make([]plumbing.Hash, 0, len(state.refs)+1)
	if state.head != plumbing.ZeroHash {
		tips = append(tips, state.head)
	}
	for _, ref := range state.refs {
		if ref.kind == plumbing.HashReference && ref.hash != plumbing.ZeroHash {
			tips = append(tips, ref.hash)
		}
	}
	return tips
}

// onlyHeadAdvanced reports whether after differs from before only by
// references that pointed at the old HEAD revision and now point at the new
// one (HEAD and its branch). Anything else may change which revisions are
// reachable or where they sit in the walk.
func onlyHeadAdvanced(before, after historyRefs) bool {
	oldHead, newHead := before.head, after.head
	if oldHead == plumbing.ZeroHash || newHead == plumbing.ZeroHash || oldHead == newHead {
		return false
	}
	if len(before.refs) != len(after.refs) {
		return false
	}
	for index, was := range before.refs {
		now := after.refs[index]
		if was == now {
			continue
		}
		moved := was
		moved.hash = now.hash
		if moved != now || was.hash != oldHead || now.hash != newHead {
			return false
		}
	}
	return true
}

// walkKey orders the walk: later committer time first, and the larger hash
// first between equal times, so the order never depends on map iteration.
type walkKey struct {
	when int64
	hash plumbing.Hash
}

func keyOf(commit *object.Commit) walkKey {
	return walkKey{when: commit.Committer.When.UnixNano(), hash: commit.Hash}
}

func (key walkKey) before(other walkKey) bool {
	if key.when != other.when {
		return key.when > other.when
	}
	return bytes.Compare(key.hash[:], other.hash[:]) > 0
}

// revisionSummary is what GetFileHistory reports about one revision.
type revisionSummary struct {
	authored int64
	message  string
}

// pathHistoryIndex holds, for one state of the references, the history of
// every path: the revisions in which that path differs from the parent. Each
// revision's summary is stored once and paths hold only hashes.
type pathHistoryIndex struct {
	state historyRefs
	// tips holds the walk key of the revision each starting point names.
	tips      map[plumbing.Hash]walkKey
	revisions map[plumbing.Hash]revisionSummary
	// paths lists each path's revisions in reverse walk order (the last
	// walked first), so new revisions, which lead the walk, are appended.
	paths map[string][]plumbing.Hash
}

func (index *pathHistoryIndex) record(commit *object.Commit, paths []string) {
	index.revisions[commit.Hash] = revisionSummary{
		authored: commit.Author.When.UnixNano(),
		message:  commit.Message,
	}
	for _, path := range paths {
		index.paths[path] = append(index.paths[path], commit.Hash)
	}
}

// entries returns a path's history newest first.
func (index *pathHistoryIndex) entries(path string) []Entry {
	hashes := index.paths[path]
	if len(hashes) == 0 {
		return nil
	}
	entries := make([]Entry, 0, len(hashes))
	for position := len(hashes) - 1; position >= 0; position-- {
		hash := hashes[position]
		summary := index.revisions[hash]
		entries = append(entries, Entry{
			Hash:      hash.String(),
			Timestamp: float64(summary.authored) / 1e9,
			Message:   summary.message,
		})
	}
	return entries
}

// CommitCount returns the number of revisions GetFileHistory lists for a file.
// Both answer from the same retained index.
func (h *Service) CommitCount(relPath string) (int, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.repo == nil {
		return 0, fmt.Errorf("history service not initialized")
	}
	index, err := h.pathHistoryLocked()
	if err != nil {
		return 0, err
	}
	return len(index.paths[filepath.ToSlash(relPath)]), nil
}

// pathHistoryLocked returns the history index for the current references
// without walking the repository again when it can be avoided. The first call
// walks every revision once and records every path. Later calls answer from
// memory while the references are unchanged, and when the current branch has
// only gained new revisions (every autosave), they diff just those. Anything
// else, such as a branch, tag, merge or rewrite made with Git, drops the index
// and walks again. The caller holds h.mu.
func (h *Service) pathHistoryLocked() (*pathHistoryIndex, error) {
	state, err := h.readHistoryRefs()
	if err != nil {
		return nil, fmt.Errorf("read references: %w", err)
	}
	if cached := h.pathHistory; cached != nil {
		if cached.state.equal(state) {
			return cached, nil
		}
		if h.advancePathHistory(cached, state) {
			h.pathHistoryAdvances++
			return cached, nil
		}
	}
	h.pathHistory = nil
	built, err := h.buildPathHistory(state)
	if err != nil {
		return nil, err
	}
	h.pathHistoryBuilds++
	// Git may have moved a reference while the walk read them. An index that
	// cannot be tied to one known state answers this call and is not kept.
	if after, err := h.readHistoryRefs(); err == nil && after.equal(state) {
		h.pathHistory = built
	}
	return built, nil
}

func (h *Service) readHistoryRefs() (historyRefs, error) {
	state := historyRefs{}
	head, err := storer.ResolveReference(h.repo.Storer, plumbing.HEAD)
	if err == nil {
		state.head = head.Hash()
	} else if err != plumbing.ErrReferenceNotFound {
		return state, err
	}
	references, err := h.repo.Storer.IterReferences()
	if err != nil {
		return state, err
	}
	defer references.Close()
	for {
		reference, err := references.Next()
		if err == io.EOF {
			return state, nil
		}
		if err == plumbing.ErrReferenceNotFound {
			continue
		}
		if err != nil {
			return state, err
		}
		state.refs = append(state.refs, historyRef{
			name:   reference.Name(),
			kind:   reference.Type(),
			target: reference.Target(),
			hash:   reference.Hash(),
		})
	}
}

// tipCommit returns the revision a reference names, peeling an annotated tag,
// or nil when it names no revision.
func (h *Service) tipCommit(hash plumbing.Hash) (*object.Commit, error) {
	target, err := object.GetObject(h.repo.Storer, hash)
	if err == plumbing.ErrObjectNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	switch target := target.(type) {
	case *object.Commit:
		return target, nil
	case *object.Tag:
		if commit, err := target.Commit(); err == nil {
			return commit, nil
		}
	}
	return nil, nil
}

// revisionQueue yields the revisions of the walk by walkKey.
type revisionQueue []*object.Commit

func (queue revisionQueue) Len() int           { return len(queue) }
func (queue revisionQueue) Less(i, j int) bool { return keyOf(queue[i]).before(keyOf(queue[j])) }
func (queue revisionQueue) Swap(i, j int)      { queue[i], queue[j] = queue[j], queue[i] }
func (queue *revisionQueue) Push(value any)    { *queue = append(*queue, value.(*object.Commit)) }
func (queue *revisionQueue) Pop() any {
	old := *queue
	last := old[len(old)-1]
	*queue = old[:len(old)-1]
	return last
}

// buildPathHistory walks every revision reachable from HEAD and the other
// references once, newest committer time first, as `git log --all` does, and
// records each revision under every path it changed.
func (h *Service) buildPathHistory(state historyRefs) (*pathHistoryIndex, error) {
	index := &pathHistoryIndex{
		state:     state,
		tips:      make(map[plumbing.Hash]walkKey),
		revisions: make(map[plumbing.Hash]revisionSummary),
		paths:     make(map[string][]plumbing.Hash),
	}
	queue := &revisionQueue{}
	enqueue := func(commit *object.Commit) {
		if _, queued := index.revisions[commit.Hash]; !queued {
			index.revisions[commit.Hash] = revisionSummary{}
			heap.Push(queue, commit)
		}
	}
	for _, hash := range state.tips() {
		commit, err := h.tipCommit(hash)
		if err != nil {
			return nil, fmt.Errorf("read reference %s: %w", hash, err)
		}
		if commit != nil {
			index.tips[hash] = keyOf(commit)
			enqueue(commit)
		}
	}
	for queue.Len() > 0 {
		commit := heap.Pop(queue).(*object.Commit)
		parents, err := h.parentCommits(commit)
		if err != nil {
			return nil, err
		}
		for _, parent := range parents {
			enqueue(parent)
		}
		paths, err := revisionPaths(commit, parents)
		if err != nil {
			return nil, fmt.Errorf("diff revision %s: %w", commit.Hash, err)
		}
		index.record(commit, paths)
	}
	for _, hashes := range index.paths {
		for left, right := 0, len(hashes)-1; left < right; left, right = left+1, right-1 {
			hashes[left], hashes[right] = hashes[right], hashes[left]
		}
	}
	return index, nil
}

func (h *Service) parentCommits(commit *object.Commit) ([]*object.Commit, error) {
	parents := make([]*object.Commit, 0, len(commit.ParentHashes))
	for _, hash := range commit.ParentHashes {
		parent, err := h.repo.CommitObject(hash)
		if err != nil {
			return nil, fmt.Errorf("read parent %s of %s: %w", hash, commit.Hash, err)
		}
		parents = append(parents, parent)
	}
	return parents, nil
}

// advancePathHistory extends a retained index over revisions added to the
// current branch since it was built. It applies only when the outcome is
// certain to equal a fresh walk:
//
//   - only HEAD and the references that followed it moved (onlyHeadAdvanced);
//   - the new HEAD reaches the old one through at most pathHistoryChainLimit
//     revisions with exactly one parent each, none of which the walk has seen;
//   - each of those revisions comes before every other starting point of the
//     walk (always so on a single branch; an autosave is the newest revision).
//
// The walk then yields exactly the new revisions, newest first, followed by
// the walk it yielded before, so each is diffed against its parent and
// appended. On false the index is unchanged.
func (h *Service) advancePathHistory(index *pathHistoryIndex, state historyRefs) bool {
	if !onlyHeadAdvanced(index.state, state) {
		return false
	}
	// The other starting points are all old ones, so their keys are known.
	tips := make(map[plumbing.Hash]walkKey)
	var others []walkKey
	for _, hash := range state.tips() {
		if key, known := index.tips[hash]; known && hash != state.head {
			tips[hash] = key
			others = append(others, key)
		}
	}

	var chain []*object.Commit
	for hash := state.head; hash != index.state.head; {
		if _, seen := index.revisions[hash]; seen || len(chain) >= pathHistoryChainLimit {
			return false
		}
		commit, err := h.repo.CommitObject(hash)
		if err != nil || len(commit.ParentHashes) != 1 || !leadsWalk(keyOf(commit), others) {
			return false
		}
		chain = append(chain, commit)
		hash = commit.ParentHashes[0]
	}

	changed := make([][]string, len(chain))
	for position, commit := range chain {
		parents, err := h.parentCommits(commit)
		if err != nil {
			return false
		}
		if changed[position], err = revisionPaths(commit, parents); err != nil {
			return false
		}
	}
	for position := len(chain) - 1; position >= 0; position-- {
		index.record(chain[position], changed[position])
	}
	tips[state.head] = keyOf(chain[0])
	index.tips = tips
	index.state = state
	return true
}

// leadsWalk reports whether a revision comes before every one of others.
func leadsWalk(key walkKey, others []walkKey) bool {
	for _, other := range others {
		if !key.before(other) {
			return false
		}
	}
	return true
}

// revisionPaths names the paths a revision belongs to the history of: those
// that differ from its parent, from the empty tree for a root revision, and
// for a merge those that differ from every parent (a merge that keeps one
// parent's version of a path is not a change to it).
func revisionPaths(commit *object.Commit, parents []*object.Commit) ([]string, error) {
	tree, err := commit.Tree()
	if err != nil {
		return nil, err
	}
	if len(parents) == 0 {
		changes, err := object.DiffTree(nil, tree)
		if err != nil {
			return nil, err
		}
		return pathsDifferingFromEveryParent([][]string{changeNames(changes)}), nil
	}
	perParent := make([][]string, 0, len(parents))
	for _, parent := range parents {
		parentTree, err := parent.Tree()
		if err != nil {
			return nil, err
		}
		changes, err := object.DiffTree(parentTree, tree)
		if err != nil {
			return nil, err
		}
		perParent = append(perParent, changeNames(changes))
	}
	return pathsDifferingFromEveryParent(perParent), nil
}

// changeNames lists every path a tree diff names. DiffTree does not detect
// renames, so each change names one path, or the same path on both sides; a
// change that did name two would belong to both histories.
func changeNames(changes object.Changes) []string {
	names := make([]string, 0, len(changes))
	for _, change := range changes {
		if change.From.Name != "" {
			names = append(names, change.From.Name)
		}
		if change.To.Name != "" && change.To.Name != change.From.Name {
			names = append(names, change.To.Name)
		}
	}
	return names
}

// pathsDifferingFromEveryParent keeps, once each, the paths every parent's
// list of changed paths names.
func pathsDifferingFromEveryParent(perParent [][]string) []string {
	if len(perParent) == 0 {
		return nil
	}
	named := make(map[string]int)
	for parent, names := range perParent {
		for _, name := range names {
			if named[name] == parent {
				named[name] = parent + 1
			}
		}
	}
	var paths []string
	for _, name := range perParent[0] {
		if named[name] == len(perParent) {
			paths = append(paths, name)
			named[name] = -1
		}
	}
	return paths
}
