package taskschedule

import "fmt"

// ChangeWriter is the effect boundary for a note change with planned metadata.
// The root-scoped adapter owns atomic replacement and the original snapshot.
type ChangeWriter interface {
	WriteDates() error
	WriteNote() error
	RestoreDates() error
}

func CommitChange(writer ChangeWriter) error {
	if err := writer.WriteDates(); err != nil {
		return err
	}
	if err := writer.WriteNote(); err != nil {
		if rollback := writer.RestoreDates(); rollback != nil {
			return fmt.Errorf("note was not changed: %v; restoring task dates failed: %w", err, rollback)
		}
		return err
	}
	return nil
}
