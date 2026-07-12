//go:build linux

package main

import "os/exec"

// startPDFViewer is injectable so the command choice can be tested without
// opening a graphical application during automated tests.
var startPDFViewer = startAndReap

func openPDFInDefaultViewer(path string) error {
	// xdg-open resolves the MIME association for application/pdf, which is the
	// desktop's configured PDF viewer rather than its configured web browser.
	return startPDFViewer(exec.Command("xdg-open", path)) // #nosec G204 -- fixed executable with a locally generated PDF path; no shell is used.
}
