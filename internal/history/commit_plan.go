package history

import (
	"fmt"
	"sort"

	"github.com/go-git/go-git/v5/plumbing/filemode"
	"github.com/go-git/go-git/v5/plumbing/format/index"
)

type fileCommitPlan struct {
	stage  bool
	commit bool
	target gitPathState
}

// planFileCommit compares immutable Git metadata and a captured file. It never
// scans the worktree, reads Git objects, or stages another path. A staged
// deletion is detected from HEAD even when it has no remaining index entry.
func planFileCommit(path string, head map[string]gitPathState, idx *index.Index, target gitPathState, ignored bool) (fileCommitPlan, error) {
	indexed := make(map[string]gitPathState, len(idx.Entries))
	for _, entry := range idx.Entries {
		if _, duplicate := indexed[entry.Name]; duplicate || entry.Stage != 0 || entry.IntentToAdd {
			return fileCommitPlan{}, fmt.Errorf("cannot commit %s while %s has unresolved index entries", path, entry.Name)
		}
		if entry.Name == path && (entry.SkipWorktree || entry.Mode == filemode.Submodule) {
			return fileCommitPlan{}, fmt.Errorf("cannot record sparse or submodule path %s as a single file", path)
		}
		indexed[entry.Name] = gitPathState{exists: true, hash: entry.Hash, mode: entry.Mode}
	}
	if ignored && !indexed[path].exists {
		target = gitPathState{}
	}
	plan := fileCommitPlan{
		stage:  gitPathStatesDiffer(indexed[path], target),
		commit: gitPathStatesDiffer(head[path], target),
		target: target,
	}
	if !plan.stage && !plan.commit {
		return plan, nil
	}
	conflicts := make(map[string]bool)
	for name, value := range indexed {
		if name != path && gitPathStatesDiffer(value, head[name]) {
			conflicts[name] = true
		}
	}
	for name, value := range head {
		if name != path && gitPathStatesDiffer(value, indexed[name]) {
			conflicts[name] = true
		}
	}
	if len(conflicts) != 0 {
		names := make([]string, 0, len(conflicts))
		for name := range conflicts {
			names = append(names, name)
		}
		sort.Strings(names)
		return fileCommitPlan{}, fmt.Errorf("cannot commit %s while %s has staged changes", path, names[0])
	}
	return plan, nil
}

// stagedFileIndex replaces exactly one index entry without modifying the
// caller's rollback snapshot. Invalidated cached-tree extensions are omitted.
func stagedFileIndex(original *index.Index, path string, entry *index.Entry) *index.Index {
	next := *original
	next.Cache = nil
	next.EndOfIndexEntry = nil
	next.Entries = make([]*index.Entry, 0, len(original.Entries)+1)
	for _, existing := range original.Entries {
		if existing.Name != path {
			copy := *existing
			next.Entries = append(next.Entries, &copy)
		}
	}
	if entry != nil {
		copy := *entry
		next.Entries = append(next.Entries, &copy)
	}
	return &next
}
