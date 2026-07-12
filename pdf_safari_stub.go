//go:build !darwin

package main

import (
	"context"
	"errors"
)

// Safari is only a discovery candidate on macOS. This guard keeps non-macOS
// builds explicit if a caller ever attempts to route it there.
func renderSafariPDF(_ context.Context, _ string, _ string, _ string) error {
	return errors.New("Safari PDF export is only available on macOS")
}
