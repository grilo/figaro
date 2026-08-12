package pdfexport

import (
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
