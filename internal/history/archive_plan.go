package history

import (
	"sort"

	"github.com/go-git/go-git/v5/plumbing/filemode"
	"github.com/go-git/go-git/v5/plumbing/format/index"
)

// archiveIndexState is what the Git index and HEAD say about one archive
// request. It answers the two questions the archive asks of a repository-wide
// status ("is anything else staged?" and "did anything inside get staged?")
// from metadata already in memory, without enumerating or hashing the
// worktree: a status of the whole vault took over a second per call on a
// ten-thousand-note vault, and deleting one note asked for two of them while
// holding the vault's write locks.
type archiveIndexState struct {
	// stagedOutside lists, in path order, every path outside the archive whose
	// index entry differs from HEAD: staged additions, edits and removals.
	stagedOutside []string
	// stagedInside reports that some path inside the archive differs from HEAD.
	stagedInside bool
	// indexedInside lists, in path order, the index entries inside the archive.
	indexedInside []string
	// needsFullStatus is set for index shapes this comparison does not model
	// (unmerged stages, intent-to-add entries, submodules). The caller then
	// falls back to go-git's complete status.
	needsFullStatus bool
}

// compareArchiveIndexWithHead classifies every difference between the index
// and HEAD as inside or outside the archived path. A path is staged exactly
// when go-git's status would report it so: present on one side only, or with a
// different blob hash or file mode.
func compareArchiveIndexWithHead(relPath string, head map[string]gitPathState, idx *index.Index) archiveIndexState {
	state := archiveIndexState{}
	for _, entry := range head {
		if entry.mode == filemode.Submodule {
			state.needsFullStatus = true
			return state
		}
	}
	indexed := make(map[string]struct{}, len(idx.Entries))
	for _, entry := range idx.Entries {
		if entry.Stage != 0 || entry.IntentToAdd || entry.Mode == filemode.Submodule {
			state.needsFullStatus = true
			return state
		}
		if _, duplicate := indexed[entry.Name]; duplicate {
			state.needsFullStatus = true
			return state
		}
		indexed[entry.Name] = struct{}{}
		inside := archiveContainsPath(relPath, entry.Name)
		if inside {
			state.indexedInside = append(state.indexedInside, entry.Name)
		}
		if gitPathStatesDiffer(gitPathState{exists: true, hash: entry.Hash, mode: entry.Mode}, head[entry.Name]) {
			state.recordStaged(entry.Name, inside)
		}
	}
	for name := range head {
		if _, found := indexed[name]; !found {
			state.recordStaged(name, archiveContainsPath(relPath, name))
		}
	}
	sort.Strings(state.stagedOutside)
	sort.Strings(state.indexedInside)
	return state
}

func (state *archiveIndexState) recordStaged(name string, inside bool) {
	if inside {
		state.stagedInside = true
		return
	}
	state.stagedOutside = append(state.stagedOutside, name)
}
