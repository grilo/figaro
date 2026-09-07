package writing

import (
	"errors"
	"fmt"
)

// MetadataChange is a prevalidated relocation, retaining bytes for rollback.
type MetadataChange struct {
	Path          string
	Before, After []byte
}

// MetadataWriter is supplied by the rooted vault adapter. A failed write may
// have taken effect, so rollback includes the attempted file as well.
type MetadataWriter func(path string, data []byte) error

func ApplyMetadataMove(changes []MetadataChange, write MetadataWriter) (func() error, error) {
	attempted := []MetadataChange{}
	rollback := func() error {
		var failures []error
		for i := len(attempted) - 1; i >= 0; i-- {
			change := attempted[i]
			if err := write(change.Path, change.Before); err != nil {
				failures = append(failures, fmt.Errorf("restore writing data %s: %w", change.Path, err))
			}
		}
		return errors.Join(failures...)
	}
	for _, change := range changes {
		attempted = append(attempted, change)
		if err := write(change.Path, change.After); err != nil {
			return nil, errors.Join(fmt.Errorf("move writing data %s: %w", change.Path, err), rollback())
		}
	}
	return rollback, nil
}
