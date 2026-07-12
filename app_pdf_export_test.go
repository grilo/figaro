package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPrepareInteractivePDFDocumentLinksSiblingStylesheetAndLocalAssets(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "notes with space/report.md", "# Report")
	writeTestFile(t, vaultPath, "notes with space/_print.css", `body { color: teal; }</style><img id="stylesheet-breakout" src="x">`)

	document, sourceDir, err := app.prepareInteractivePDFDocument(
		"Report",
		`<!doctype html><html><head><style>.default-print-style { color: blue; }</style></head><body><img src="diagram.svg"><h1>Report</h1></body></html>`,
		"notes with space/report.md",
		"",
	)
	if err != nil {
		t.Fatalf("prepareInteractivePDFDocument error: %v", err)
	}
	if sourceDir != filepath.Join(vaultPath, "notes with space") {
		t.Fatalf("unexpected source directory: %q", sourceDir)
	}
	if !strings.Contains(document, `<base href="`+localFileURL(sourceDir, true)+`">`) {
		t.Fatalf("expected local base URL in %q", document)
	}
	stylesheetURL := localFileURL(filepath.Join(sourceDir, "_print.css"), false)
	if !strings.Contains(document, `<link rel="stylesheet" href="`+stylesheetURL+`">`) {
		t.Fatalf("expected stylesheet link %q in %q", stylesheetURL, document)
	}
	if strings.Contains(document, "stylesheet-breakout") || strings.Contains(document, "body { color: teal; }") {
		t.Fatal("custom CSS must remain a linked stylesheet, not raw HTML")
	}
	if !strings.Contains(document, "Content-Security-Policy") {
		t.Fatal("expected restrictive printable-document CSP")
	}
	if !strings.Contains(document, `<img src="diagram.svg">`) {
		t.Fatal("expected relative local assets to remain in the document")
	}
}

func TestPrepareInteractivePDFDocumentPrefersFrontmatterStylesheet(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "notes/daily/report.md", "# Report")
	writeTestFile(t, vaultPath, "notes/daily/_print.css", ".sibling { color: orange; }")
	writeTestFile(t, vaultPath, "notes/styles/report.css", ".frontmatter { color: teal; }")

	document, _, err := app.prepareInteractivePDFDocument("Report", "<h1>Report</h1>", "notes/daily/report.md", "../styles/report.css")
	if err != nil {
		t.Fatalf("prepareInteractivePDFDocument error: %v", err)
	}
	frontmatterURL := localFileURL(filepath.Join(vaultPath, "notes/styles/report.css"), false)
	if !strings.Contains(document, `href="`+frontmatterURL+`"`) {
		t.Fatalf("expected selected stylesheet URL in %q", document)
	}
	if strings.Contains(document, "_print.css") || strings.Contains(document, ".frontmatter {") {
		t.Fatal("the browser should receive only a safe stylesheet URL, never raw CSS")
	}
}

func TestPrepareInteractivePDFDocumentAllowsMissingSiblingStylesheet(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "notes/report.md", "# Report")

	document, _, err := app.prepareInteractivePDFDocument("Report", "<html><head></head><body><h1>Report</h1></body></html>", "notes/report.md", "")
	if err != nil {
		t.Fatalf("missing optional sibling stylesheet should not fail: %v", err)
	}
	if strings.Contains(document, `_print.css`) {
		t.Fatal("missing sibling stylesheet must not result in a broken link")
	}
}

func TestPrepareInteractivePDFDocumentRejectsInvalidRequestsAndStylesheets(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "notes/report.md", "# Report")
	writeTestFile(t, vaultPath, "notes/report.txt", "Report")
	if err := os.MkdirAll(filepath.Join(vaultPath, "notes", "folder.md"), 0755); err != nil {
		t.Fatal(err)
	}

	for _, testCase := range []struct {
		name, sourcePath, html, stylesheet, want string
	}{
		{"non-markdown", "notes/report.txt", "<h1>Report</h1>", "", "only available for Markdown"},
		{"missing-note", "notes/missing.md", "<h1>Report</h1>", "", "was not found"},
		{"directory", "notes/folder.md", "<h1>Report</h1>", "", "was not found"},
		{"blank-html", "notes/report.md", " \n\t", "", "no document content"},
		{"external-css", "notes/report.md", "<h1>Report</h1>", "https://example.com/print.css", "vault-local"},
		{"traversal-css", "notes/report.md", "<h1>Report</h1>", "../../outside.css", "path escapes vault"},
		{"non-css", "notes/report.md", "<h1>Report</h1>", "print.less", ".css"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			_, _, err := app.prepareInteractivePDFDocument("Report", testCase.html, testCase.sourcePath, testCase.stylesheet)
			if err == nil || !strings.Contains(err.Error(), testCase.want) {
				t.Fatalf("expected error containing %q, got %v", testCase.want, err)
			}
		})
	}
}

func TestPrepareInteractivePDFDocumentRejectsMissingOrBinarySelectedStylesheet(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "notes/report.md", "# Report")
	writeTestFile(t, vaultPath, "notes/binary.css", string([]byte{0x00, 0x01, 0x02}))

	for _, testCase := range []struct {
		stylesheet string
		want       string
	}{
		{"missing.css", "was not found"},
		{"binary.css", "must be a UTF-8 CSS file"},
	} {
		t.Run(testCase.stylesheet, func(t *testing.T) {
			_, _, err := app.prepareInteractivePDFDocument("Report", "<h1>Report</h1>", "notes/report.md", testCase.stylesheet)
			if err == nil || !strings.Contains(err.Error(), testCase.want) {
				t.Fatalf("expected %q, got %v", testCase.want, err)
			}
		})
	}
}

func TestCreateStarterPrintStylesheetCopiesBundledCSSWithoutOverwriting(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "notes/report.md", "# Report")

	created, err := app.CreateStarterPrintStylesheet("notes/report.md", "pdf.css")
	if err != nil {
		t.Fatalf("CreateStarterPrintStylesheet error: %v", err)
	}
	if !created.Success || !created.Created || created.Path != "notes/pdf.css" {
		t.Fatalf("unexpected create result: %#v", created)
	}
	stylesheetPath := filepath.Join(vaultPath, "notes", "pdf.css")
	stylesheet, err := os.ReadFile(stylesheetPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, hook := range []string{
		".figaro-print-document",
		".figaro-print-cover-title",
		".figaro-print-cover-author",
		".figaro-print-cover-date",
		".figaro-print-toc-title",
		".figaro-toc-level-6",
		".figaro-print-diagram",
		".footnote-backref",
	} {
		if !strings.Contains(string(stylesheet), hook) {
			t.Errorf("starter stylesheet is missing documented hook %q", hook)
		}
	}

	const userCSS = "/* user-owned stylesheet */\nbody { color: rebeccapurple; }\n"
	if err := os.WriteFile(stylesheetPath, []byte(userCSS), 0644); err != nil {
		t.Fatal(err)
	}
	existing, err := app.CreateStarterPrintStylesheet("notes/report.md", "pdf.css")
	if err != nil {
		t.Fatalf("CreateStarterPrintStylesheet existing error: %v", err)
	}
	if !existing.Success || existing.Created || existing.Path != "notes/pdf.css" {
		t.Fatalf("existing stylesheet should be offered unchanged, got %#v", existing)
	}
	data, err := os.ReadFile(stylesheetPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != userCSS {
		t.Fatalf("starter creation overwrote user CSS: %q", data)
	}
}

func TestCreateStarterPrintStylesheetRejectsUnsafeReferences(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "notes/report.md", "# Report")

	for _, ref := range []string{"../../outside.css", "https://example.com/print.css", "print.less"} {
		result, err := app.CreateStarterPrintStylesheet("notes/report.md", ref)
		if err != nil {
			t.Fatalf("CreateStarterPrintStylesheet(%q) returned unexpected error: %v", ref, err)
		}
		if result.Success || result.Error == "" {
			t.Errorf("unsafe stylesheet ref %q unexpectedly succeeded: %#v", ref, result)
		}
	}
}

func TestWriteInteractivePDFWorkspaceIncludesKaTeXStylesheetAndFonts(t *testing.T) {
	requireGeneratedKaTeXRuntime(t)
	workspace := t.TempDir()
	inputPath, err := writeInteractivePDFWorkspace(workspace, "<!doctype html><html><head></head><body><span class=\"katex\">x</span></body></html>")
	if err != nil {
		t.Fatalf("writeInteractivePDFWorkspace error: %v", err)
	}
	document, err := os.ReadFile(inputPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(document), "katex.css") {
		t.Fatal("expected the standalone KaTeX stylesheet link")
	}
	if _, err := os.Stat(filepath.Join(workspace, "katex.css")); err != nil {
		t.Fatalf("expected KaTeX stylesheet: %v", err)
	}
	if _, err := os.Stat(filepath.Join(workspace, "katex-fonts", "KaTeX_Main-Regular.woff2")); err != nil {
		t.Fatalf("expected KaTeX font: %v", err)
	}
}

func requireGeneratedKaTeXRuntime(t *testing.T) {
	t.Helper()
	if _, err := assets.ReadFile("frontend/vendored/katex/dist/katex.min.css"); err != nil {
		t.Skip("generated KaTeX runtime is absent; run npm run vendor before PDF verification")
	}
}

func TestPublishPDFAndOutputPathHelpers(t *testing.T) {
	temporary := t.TempDir()
	source := filepath.Join(temporary, "source.pdf")
	destination := filepath.Join(temporary, "destination.pdf")
	if err := os.WriteFile(source, []byte("%PDF-test"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(destination, []byte("old"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := publishPDF(source, destination); err != nil {
		t.Fatalf("publishPDF error: %v", err)
	}
	data, err := os.ReadFile(destination)
	if err != nil || string(data) != "%PDF-test" {
		t.Fatalf("unexpected published PDF: %q, %v", data, err)
	}
	notesDirectory := filepath.Join(temporary, "Notes")
	if got, err := pdfOutputPath(notesDirectory, "Notes/Quarterly review.MD"); err != nil || got != filepath.Join(notesDirectory, "Quarterly review.pdf") {
		t.Fatalf("unexpected sibling PDF output: %q, %v", got, err)
	}
	if _, err := pdfOutputPath(notesDirectory, "Notes/.md"); err == nil {
		t.Fatal("expected a missing Markdown stem to be rejected")
	}
	if _, err := pdfOutputPath(notesDirectory, "Notes/report.txt"); err == nil {
		t.Fatal("expected a non-Markdown source to be rejected")
	}
}
