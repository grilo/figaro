//go:build darwin && !cgo

package main

import (
	"context"
	"errors"
)

func renderSafariPDF(_ context.Context, _ string, _ string, _ string) error {
	return errors.New("Safari PDF export requires the standard macOS WebKit build support")
}
