//go:build darwin

package main

import "os/exec"

func openPDFInDefaultViewer(path string) error {
	// `open` dispatches a local file to the macOS application registered for
	// its extension/UTType, normally Preview or the user's chosen PDF app.
	return startAndReap(exec.Command("open", path)) // #nosec G204 -- fixed executable with a locally generated PDF path; no shell is used.
}
