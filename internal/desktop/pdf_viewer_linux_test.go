//go:build linux

package desktop

import (
	"os/exec"
	"testing"
)

func TestOpenPDFInDefaultViewerUsesXDGOpen(t *testing.T) {
	original := startPDFViewer
	defer func() { startPDFViewer = original }()

	var launched *exec.Cmd
	startPDFViewer = func(command *exec.Cmd) error {
		launched = command
		return nil
	}
	if err := openPDFInDefaultViewer("/tmp/Quarterly review.pdf"); err != nil {
		t.Fatal(err)
	}
	if launched == nil {
		t.Fatal("expected a PDF-viewer command")
	}
	if len(launched.Args) != 2 || launched.Args[0] != "xdg-open" || launched.Args[1] != "/tmp/Quarterly review.pdf" {
		t.Fatalf("expected xdg-open with the local PDF, got %q", launched.Args)
	}
}

func TestOpenFileInDefaultApplicationUsesXDGOpen(t *testing.T) {
	original := startDefaultApplication
	defer func() { startDefaultApplication = original }()

	var launched *exec.Cmd
	startDefaultApplication = func(command *exec.Cmd) error {
		launched = command
		return nil
	}
	if err := openFileInDefaultApplication("/tmp/diagram final.png"); err != nil {
		t.Fatal(err)
	}
	if launched == nil {
		t.Fatal("expected a default-application command")
	}
	if len(launched.Args) != 2 || launched.Args[0] != "xdg-open" || launched.Args[1] != "/tmp/diagram final.png" {
		t.Fatalf("expected xdg-open with the exact local file, got %q", launched.Args)
	}
}
