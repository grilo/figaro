package desktop

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"

	"figaro/internal/settings"
	"figaro/internal/writing"
)

// Caller holds writingStateMu throughout planning, application, and the path
// operation. Ordinary writes cannot recreate an old entry during relocation.
func planWritingPathMove(root *os.Root, oldPath, newPath string) ([]writing.MetadataChange, error) {
	var changes []writing.MetadataChange
	for _, name := range []string{writingLensesPath, writingDecisionsPath} {
		before, err := root.ReadFile(name)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("read writing data: %w", err)
		}
		after, err := settings.PlanWritingPathMove(before, filepath.ToSlash(oldPath), filepath.ToSlash(newPath), name == writingDecisionsPath)
		if err != nil {
			return nil, fmt.Errorf("preserve writing data: %w", err)
		}
		if !bytes.Equal(before, after) {
			changes = append(changes, writing.MetadataChange{Path: name, Before: before, After: after})
		}
	}
	return changes, nil
}

func applyWritingPathMove(root *os.Root, changes []writing.MetadataChange) (func() error, error) {
	return writing.ApplyMetadataMove(changes, func(path string, data []byte) error {
		if data == nil {
			err := root.Remove(path)
			if os.IsNotExist(err) {
				return nil
			}
			return err
		}
		return writeRootFileAtomic(root, path, data, 0600)
	})
}
