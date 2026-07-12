//go:build !linux && !darwin && !windows

package main

import (
	"fmt"
	"runtime"
)

func openPDFInDefaultViewer(_ string) error {
	return fmt.Errorf("opening PDFs is not supported on %s", runtime.GOOS)
}
