package desktop

import (
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
	if err != nil {
		return nil, err
	}
	return append(changes, writing.MetadataChange{Path: activity.PathsFile, Before: before, After: after}), nil
}
