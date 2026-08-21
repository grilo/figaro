//go:build linux

package desktop

import "os/exec"

// startPDFViewer is injectable so the command choice can be tested without
// opening a graphical application during automated tests.
var startPDFViewer = startAndReap
var startDefaultApplication = startAndReap

func openFileInDefaultApplication(path string) error {
	// xdg-open resolves the desktop's MIME association for any local file.
	return startDefaultApplication(exec.Command("xdg-open", path)) // #nosec G204 -- fixed executable with a root-validated local path; no shell is used.
}

func openPDFInDefaultViewer(path string) error {
	// xdg-open resolves the MIME association for application/pdf, which is the
	// desktop's configured PDF viewer rather than its configured web browser.
	return startPDFViewer(exec.Command("xdg-open", path)) // #nosec G204 -- fixed executable with a locally generated PDF path; no shell is used.
}
