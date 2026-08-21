//go:build darwin

package desktop

import "os/exec"

func openFileInDefaultApplication(path string) error {
	// `open` dispatches the file to the application registered for its UTType.
	return startAndReap(exec.Command("open", path)) // #nosec G204 -- fixed executable with a root-validated local path; no shell is used.
}

func openPDFInDefaultViewer(path string) error {
	// `open` dispatches a local file to the macOS application registered for
	// its extension/UTType, normally Preview or the user's chosen PDF app.
	return startAndReap(exec.Command("open", path)) // #nosec G204 -- fixed executable with a locally generated PDF path; no shell is used.
}
