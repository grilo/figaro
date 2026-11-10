package desktop

import (
	"errors"
	"log"
	"os"
	"path/filepath"

	"figaro/internal/activity"
	"figaro/internal/history"
	"figaro/internal/writing"
)

// The existing vault-move transaction protects writing preferences and activity
// identity together. The adapter owns rooted reads and atomic rollback.
func (a *App) planDocumentPathMove(root *os.Root, from, to string) ([]writing.MetadataChange, error) {
	changes, err := planWritingPathMove(root, from, to)
	if err != nil {
		return nil, err
	}
	if a.history == nil {
		return changes, nil
	}
	revision, err := a.history.ActivityHead()
	if err != nil {
		return nil, err
	}
	if revision == "" {
		return changes, nil
	}
	before, err := history.ReadActivityPaths(root)
	if os.IsNotExist(err) {
		before = nil
	} else if err != nil {
		return nil, err
	}
	after, err := activity.PlanPathMove(before, filepath.ToSlash(from), filepath.ToSlash(to), revision)
	if errors.Is(err, activity.ErrPathNotRecordable) || errors.Is(err, activity.ErrPathHistoryFull) {
		// Activity continuity is a convenience; it never decides whether a note
		// may be renamed. The move goes ahead and the history file is left as
		// it is, so this note's earlier edits are not attributed across it.
		log.Printf("[activity] Move from %q to %q is not recorded: %v", filepath.ToSlash(from), filepath.ToSlash(to), err)
		return changes, nil
	}
	if err != nil {
		return nil, err
	}
	return append(changes, writing.MetadataChange{Path: activity.PathsFile, Before: before, After: after}), nil
}
