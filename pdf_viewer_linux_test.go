//go:build linux

package main

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
