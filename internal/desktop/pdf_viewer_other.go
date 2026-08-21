//go:build !linux && !darwin && !windows

package desktop

import (
	"fmt"
	"runtime"
)

func openFileInDefaultApplication(_ string) error {
	return fmt.Errorf("opening files is not supported on %s", runtime.GOOS)
}

func openPDFInDefaultViewer(_ string) error {
	return fmt.Errorf("opening PDFs is not supported on %s", runtime.GOOS)
}
