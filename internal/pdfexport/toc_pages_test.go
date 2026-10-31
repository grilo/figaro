package pdfexport

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInjectTOCPageNumbersFillsEveryReservedCell(t *testing.T) {
	document := `<nav><span class="figaro-print-toc-page" data-figaro-toc-index="0" aria-hidden="true">&nbsp;</span><span class="figaro-print-toc-page" data-figaro-toc-index="1" aria-hidden="true">&nbsp;</span></nav>`
	filled, err := InjectTOCPageNumbers(document, []int{3, 17})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(filled, `aria-hidden="true">3</span>`) || !strings.Contains(filled, `aria-hidden="true">17</span>`) {
		t.Fatalf("unexpected numbered contents: %s", filled)
	}
	if !strings.Contains(filled, `data-figaro-toc-index="0"`) || !strings.Contains(filled, `data-figaro-toc-index="1"`) {
		t.Fatal("number injection changed stable TOC hooks")
	}
}

func TestInjectTOCPageNumbersRejectsMissingOrDuplicateCells(t *testing.T) {
	for _, document := range []string{
		`<span class="figaro-print-toc-page" data-figaro-toc-index="0" aria-hidden="true">&nbsp;</span>`,
		`<span class="figaro-print-toc-page" data-figaro-toc-index="0" aria-hidden="true">&nbsp;</span><span class="figaro-print-toc-page" data-figaro-toc-index="0" aria-hidden="true">&nbsp;</span>`,
	} {
		if _, err := InjectTOCPageNumbers(document, []int{2, 4}); err == nil {
			t.Fatalf("expected incomplete placeholder set to fail: %s", document)
		}
	}
}

func TestChromiumMajorVersion(t *testing.T) {
	for product, want := range map[string]int{
		"Chrome/131.0.6778.85":         131,
		"HeadlessChrome/140.0.7339.80": 140,
	} {
		got, err := chromiumMajorVersion(product)
		if err != nil || got != want {
			t.Fatalf("chromiumMajorVersion(%q) = %d, %v; want %d", product, got, err, want)
		}
	}
	if _, err := chromiumMajorVersion("Chromium unknown"); err == nil {
		t.Fatal("expected an unrecognised product to fail")
	}
}

func TestResolveTOCPageNumbersLeavesUserConfigurationAlone(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("HOME", configHome)
	t.Setenv("XDG_CONFIG_HOME", configHome)
	t.Setenv("AppData", configHome)
	pdfPath := filepath.Join(t.TempDir(), "provisional.pdf")
	if err := os.WriteFile(pdfPath, linkedTwoPagePDF(), 0o600); err != nil {
		t.Fatal(err)
	}

	pages, err := ResolveTOCPageNumbers(context.Background(), pdfPath, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(pages) != 1 || pages[0] != 2 {
		t.Fatalf("pages = %v, want [2]", pages)
	}
	entries, err := os.ReadDir(configHome)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("reading a PDF wrote %q into the user configuration directory", entries[0].Name())
	}
}

// linkedTwoPagePDF is a minimal PDF whose first page links to the second, the
// shape Chromium emits for a generated contents entry.
func linkedTwoPagePDF() []byte {
	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [5 0 R] >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
		"<< /Type /Annot /Subtype /Link /Rect [72 700 300 720] /Border [0 0 0] /Dest [4 0 R /XYZ 0 792 0] >>",
	}
	var pdf strings.Builder
	pdf.WriteString("%PDF-1.7\n")
	offsets := make([]int, len(objects))
	for index, object := range objects {
		offsets[index] = pdf.Len()
		fmt.Fprintf(&pdf, "%d 0 obj\n%s\nendobj\n", index+1, object)
	}
	xref := pdf.Len()
	fmt.Fprintf(&pdf, "xref\n0 %d\n0000000000 65535 f \n", len(objects)+1)
	for _, offset := range offsets {
		fmt.Fprintf(&pdf, "%010d 00000 n \n", offset)
	}
	fmt.Fprintf(&pdf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objects)+1, xref)
	return []byte(pdf.String())
}
