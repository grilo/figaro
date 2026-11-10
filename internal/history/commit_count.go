package history

import (
	"fmt"
	"io"
	"path/filepath"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/plumbing/storer"
)

// commitCountChainLimit is how many new single-parent revisions the retained
// counts are advanced through before a full walk is cheaper to reason about.
const commitCountChainLimit = 256

// commitCountRef is one reference as the all-references log reads it. Their
// order is part of the answer, so it is part of the comparison.
type commitCountRef struct {
	name   plumbing.ReferenceName
	kind   plumbing.ReferenceType
	target plumbing.ReferenceName
	hash   plumbing.Hash
}

// commitCountRefs is the state of the repository's references: everything a
// path's revision count depends on besides immutable objects.
type commitCountRefs struct {
	head plumbing.Hash
	refs []commitCountRef
}

func (state commitCountRefs) equal(other commitCountRefs) bool {
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

// commitCountIndex holds, for one state of the references, the number of
// revisions GetFileHistory lists for every path. It is what one history walk
// computes anyway: the walk diffs each revision against the next and
// GetFileHistory keeps the revisions whose diff names its path, so recording
// every name of every diff answers all paths at the cost of answering one.
type commitCountIndex struct {
	state commitCountRefs
	// front is the first revision of the walk and commits is every revision
	// in it. A new revision is counted against front, and may be appended
	// only when the walk has never seen it.
	front   plumbing.Hash
	commits map[plumbing.Hash]struct{}
	counts  map[string]int
}

// CommitCount returns the number of revisions GetFileHistory lists for a file,
// without walking the repository again when it can be avoided. The first call
// walks the log once and keeps the count of every path. Later calls answer
// from memory while the references are unchanged, and when the current branch
// has only gained new revisions (every autosave), they diff just those.
// Anything else, such as a branch, tag, merge or rewrite made with Git, drops
// the retained counts and walks again.
func (h *Service) CommitCount(relPath string) (int, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.repo == nil {
		return 0, fmt.Errorf("history service not initialized")
	}
	index, err := h.commitCountIndexLocked()
	if err != nil {
		return 0, err
	}
	return index.counts[filepath.ToSlash(relPath)], nil
}

func (h *Service) commitCountIndexLocked() (*commitCountIndex, error) {
	state, err := h.readCommitCountRefs()
	if err != nil {
		return nil, fmt.Errorf("read references: %w", err)
	}
	if cached := h.commitCounts; cached != nil {
		if cached.state.equal(state) {
			return cached, nil
		}
		if advanced, ok := h.advanceCommitCounts(cached, state); ok {
			h.commitCounts = advanced
			h.commitCountAdvances++
			return advanced, nil
		}
	}
	h.commitCounts = nil
	built, err := h.buildCommitCounts(state)
	if err != nil {
		return nil, err
	}
	h.commitCountBuilds++
	// Git may have moved a reference while the walk read them. Counts that
	// cannot be tied to one known state answer this call and are not kept.
	if after, err := h.readCommitCountRefs(); err == nil && after.equal(state) {
		h.commitCounts = built
	}
	return built, nil
}

func (h *Service) readCommitCountRefs() (commitCountRefs, error) {
	state := commitCountRefs{}
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
		state.refs = append(state.refs, commitCountRef{
			name:   reference.Name(),
			kind:   reference.Type(),
			target: reference.Target(),
			hash:   reference.Hash(),
		})
	}
}

// buildCommitCounts walks the same log GetFileHistory walks and applies its
// rule to every path at once: a revision counts for a path when the diff
// against the next revision of the walk names that path, and that next
// revision is one of its parents (or the walk has ended).
func (h *Service) buildCommitCounts(state commitCountRefs) (*commitCountIndex, error) {
	commits, err := h.repo.Log(&git.LogOptions{Order: git.LogOrderCommitterTime, All: true})
	if err != nil {
		return nil, fmt.Errorf("get log: %w", err)
	}
	defer commits.Close()

	index := &commitCountIndex{
		state:   state,
		commits: make(map[plumbing.Hash]struct{}),
		counts:  make(map[string]int),
	}
	current, err := commits.Next()
	if err == io.EOF {
		return index, nil
	}
	if err != nil {
		return nil, fmt.Errorf("iterate commits: %w", err)
	}
	index.front = current.Hash
	var currentTree *object.Tree
	for current != nil {
		index.commits[current.Hash] = struct{}{}
		next, err := commits.Next()
		if err == io.EOF {
			next = nil
		} else if err != nil {
			return nil, fmt.Errorf("iterate commits: %w", err)
		}
		if currentTree == nil {
			if currentTree, err = current.Tree(); err != nil {
				return nil, fmt.Errorf("iterate commits: %w", err)
			}
		}
		var nextTree *object.Tree
		if next != nil {
			if nextTree, err = next.Tree(); err != nil {
				return nil, fmt.Errorf("iterate commits: %w", err)
			}
		}
		if next == nil || commitHasParent(current, next.Hash) {
			if err := addChangedPaths(index.counts, currentTree, nextTree); err != nil {
				return nil, fmt.Errorf("iterate commits: %w", err)
			}
		}
		current, currentTree = next, nextTree
	}
	return index, nil
}

// advanceCommitCounts extends retained counts over revisions added to the
// current branch since they were computed. It applies only when the outcome is
// certain to equal a fresh walk:
//
//   - every reference is unchanged, or moved from the old HEAD revision to the
//     new one (HEAD and its branch);
//   - the new HEAD reaches the old one through revisions with exactly one
//     parent each;
//   - the walk has never seen any of those revisions.
//
// The walk starts at HEAD and follows parents, so it then yields exactly the
// new revisions, newest first, followed by the walk it yielded before. Each
// new revision is diffed against its parent; the oldest of them is followed
// in the walk by the previous front, which counts only if that is its parent.
func (h *Service) advanceCommitCounts(cached *commitCountIndex, state commitCountRefs) (*commitCountIndex, bool) {
	oldHead, newHead := cached.state.head, state.head
	if oldHead == plumbing.ZeroHash || newHead == plumbing.ZeroHash || oldHead == newHead {
		return nil, false
	}
	if len(cached.state.refs) != len(state.refs) {
		return nil, false
	}
	for index, before := range cached.state.refs {
		after := state.refs[index]
		if before == after {
			continue
		}
		moved := before
		moved.hash = after.hash
		if moved != after || before.hash != oldHead || after.hash != newHead {
			return nil, false
		}
	}

	var chain []*object.Commit
	for hash := newHead; hash != oldHead; {
		if _, seen := cached.commits[hash]; seen || len(chain) >= commitCountChainLimit {
			return nil, false
		}
		commit, err := h.repo.CommitObject(hash)
		if err != nil || len(commit.ParentHashes) != 1 {
			return nil, false
		}
		chain = append(chain, commit)
		hash = commit.ParentHashes[0]
	}

	added := make(map[string]int)
	for index, commit := range chain {
		var parentHash plumbing.Hash
		if index+1 < len(chain) {
			parentHash = chain[index+1].Hash
		} else if cached.front == oldHead {
			parentHash = oldHead
		} else {
			// Another reference's revisions sit in front of the old HEAD in
			// the walk. The revision that follows this one is not its parent,
			// so the log does not attribute its changes to it.
			continue
		}
		parent, err := h.repo.CommitObject(parentHash)
		if err != nil {
			return nil, false
		}
		tree, err := commit.Tree()
		if err != nil {
			return nil, false
		}
		parentTree, err := parent.Tree()
		if err != nil {
			return nil, false
		}
		if err := addChangedPaths(added, tree, parentTree); err != nil {
			return nil, false
		}
	}

	for path, count := range added {
		cached.counts[path] += count
	}
	for _, commit := range chain {
		cached.commits[commit.Hash] = struct{}{}
	}
	cached.front = newHead
	cached.state = state
	return cached, true
}

// addChangedPaths counts one revision for every path its diff names. A path is
// named the way the log's own file filter names it: by the old side of a
// change when there is one, otherwise by the new side.
func addChangedPaths(counts map[string]int, tree *object.Tree, next *object.Tree) error {
	changes, err := object.DiffTree(tree, next)
	if err != nil {
		return err
	}
	named := make(map[string]struct{}, len(changes))
	for _, change := range changes {
		name := change.To.Name
		if change.From != (object.ChangeEntry{}) {
			name = change.From.Name
		}
		if _, counted := named[name]; counted {
			continue
		}
		named[name] = struct{}{}
		counts[name]++
	}
	return nil
}

func commitHasParent(commit *object.Commit, parent plumbing.Hash) bool {
	for _, hash := range commit.ParentHashes {
		if hash == parent {
			return true
		}
	}
	return false
}
