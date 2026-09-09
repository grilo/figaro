package core

import (
	"errors"
)

// Checkpoint bounds cooperative work independently of the app's admission queue.
// Each File belongs to one scan; concurrent rules only read its Context.
func (f *File) Checkpoint() {
	if f.Context != nil {
		if err := f.Context.Err(); err != nil {
			panic(err)
		}
	}
}

var ErrWorkLimit = errors.New("writing analysis exceeds work limit")

const MaxAlerts = 32768
