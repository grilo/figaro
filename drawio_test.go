package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadDiagramReadsCanonicalDrawioSVG(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	const svg = `<svg xmlns="http://www.w3.org/2000/svg"><content>diagram</content></svg>`
	writeTestFile(t, vaultPath, "Diagrams/flow.drawio.svg", svg)

	result, err := app.ReadDiagram("Diagrams/flow.drawio.svg")
	if err != nil {
		t.Fatalf("ReadDiagram returned an error: %v", err)
	}
	if result == nil || result.Content != svg {
		t.Fatalf("unexpected diagram result: %#v", result)
	}
	if result.Mtime == 0 {
		t.Fatal("expected diagram modification time")
	}
}

func TestReadDiagramRejectsPlainSVG(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	if err := os.WriteFile(filepath.Join(vaultPath, "image.svg"), []byte("<svg/>"), 0644); err != nil {
		t.Fatal(err)
	}

	if _, err := app.ReadDiagram("image.svg"); err == nil {
		t.Fatal("expected non-draw.io SVG to be rejected")
	}
}

func TestIsDrawioDiagramPath(t *testing.T) {
	if !isDrawioDiagramPath("Diagrams/FLOW.DRAWIO.SVG") {
		t.Fatal("expected canonical draw.io SVG path to be recognized")
	}
	if isDrawioDiagramPath("Diagrams/flow.svg") {
		t.Fatal("plain SVG must remain a normal image asset")
	}
}
