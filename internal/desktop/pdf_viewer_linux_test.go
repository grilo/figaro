//go:build linux

package desktop

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"figaro/internal/pdfexport"
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

// Opt-in, like the browser tests in internal/pdfexport: it needs a local
// Chromium. It lives in this Linux-only file because only the Linux build can
// keep the exported PDF from opening in the user's viewer. It proves the whole
// export, as the page calls it, leaves out files outside the vault while the
// vault's own image and the bundled KaTeX assets still load.
func TestExportPDFLeavesOutFilesOutsideTheVaultAgainstOptInBrowser(t *testing.T) {
	executable := strings.TrimSpace(os.Getenv("FIGARO_BROWSER_PDF_EXECUTABLE"))
	if executable == "" {
		t.Skip("set FIGARO_BROWSER_PDF_EXECUTABLE to run against a local Chromium-family browser")
	}
	browser, err := pdfexport.BrowserForExecutable(context.Background(), executable)
	if err != nil {
		t.Skipf("requested browser is unavailable: %v", err)
	}
	// A confined (Snap) browser reads only its own folders, so the vault of
	// this test is created where the browser can see it.
	base, err := pdfexport.CreateBrowserWorkspace(browser, "figaro-export-confinement-*")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(base) })
	base, err = filepath.EvalSymlinks(base)
	if err != nil {
		t.Fatal(err)
	}
	vaultPath := filepath.Join(base, "vault")
	outside := filepath.Join(base, "outside")
	for _, directory := range []string{filepath.Join(vaultPath, "Notes"), filepath.Join(vaultPath, "assets"), outside} {
		if err := os.MkdirAll(directory, 0755); err != nil {
			t.Fatal(err)
		}
	}
	writePNG := func(path string, width int, height int) {
		t.Helper()
		picture := image.NewRGBA(image.Rect(0, 0, width, height))
		for offset := 0; offset < len(picture.Pix); offset += 4 {
			picture.Pix[offset], picture.Pix[offset+1], picture.Pix[offset+2], picture.Pix[offset+3] = 30, 90, 200, 255
		}
		var encoded bytes.Buffer
		if err := png.Encode(&encoded, picture); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, encoded.Bytes(), 0644); err != nil {
			t.Fatal(err)
		}
	}
	writePNG(filepath.Join(vaultPath, "assets", "inside.png"), 31, 17)
	secret := filepath.Join(outside, "secret.png")
	writePNG(secret, 43, 29)
	if err := os.Symlink(secret, filepath.Join(vaultPath, "assets", "escape.png")); err != nil {
		t.Skipf("symbolic links unavailable: %v", err)
	}
	writeTestFile(t, vaultPath, "Notes/note.md", "# Note\n")

	original := startPDFViewer
	defer func() { startPDFViewer = original }()
	viewed := ""
	startPDFViewer = func(command *exec.Cmd) error {
		viewed = command.Args[len(command.Args)-1]
		return nil
	}

	app := OpenApp(vaultPath, testAssets)
	app.configureMachineSettings(machineSettingsPath(t.TempDir()))
	if err := app.storePDFBrowserPath(executable); err != nil {
		t.Fatal(err)
	}
	document := `<!doctype html><html><head><meta charset="utf-8"><title>Note</title></head><body>
<p>inside <img src="../assets/inside.png"></p>
<p>absolute <img src="` + localFileURL(secret, false) + `"></p>
<p>climbing <img src="../../outside/secret.png"></p>
<p>linked <img src="../assets/escape.png"></p>
</body></html>`
	result, err := app.ExportPDF("Note", document, "Notes/note.md", "")
	if err != nil || !result.Success {
		t.Fatalf("ExportPDF = %+v, %v", result, err)
	}
	exported := filepath.Join(vaultPath, "Notes", "note.pdf")
	if result.Path != exported || viewed != exported {
		t.Fatalf("exported to %q and opened %q, want %q", result.Path, viewed, exported)
	}
	for _, want := range []string{"without 2 files", "“secret.png”", "“escape.png”", "outside the vault"} {
		if !strings.Contains(result.Warning, want) {
			t.Fatalf("warning = %q, want it to contain %q", result.Warning, want)
		}
	}
	if strings.Contains(strings.ToLower(result.Warning), "katex") || strings.Contains(result.Warning, "inside.png") {
		t.Fatalf("warning reports a file the export is built from: %q", result.Warning)
	}
	pdf, err := os.ReadFile(exported)
	if err != nil {
		t.Fatal(err)
	}
	embeds := func(width int, height int) bool {
		return regexp.MustCompile(fmt.Sprintf(`/Width\s*%d\b`, width)).Match(pdf) &&
			regexp.MustCompile(fmt.Sprintf(`/Height\s*%d\b`, height)).Match(pdf)
	}
	if !embeds(31, 17) {
		t.Error("the exported PDF lost the vault's own image")
	}
	if embeds(43, 29) {
		t.Error("the exported PDF embeds the image from outside the vault")
	}
}
