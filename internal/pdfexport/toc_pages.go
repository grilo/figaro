package pdfexport

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

var tocPagePlaceholderRE = regexp.MustCompile(`(<span class="figaro-print-toc-page" data-figaro-toc-index=")([0-9]+)(" aria-hidden="true">)(?:[^<]*)(</span>)`)

// InjectTOCPageNumbers fills the deliberately reserved contents cells without
// interpreting or reserialising the rest of the printable HTML.
func InjectTOCPageNumbers(document string, pages []int) (string, error) {
	if len(pages) == 0 {
		return document, nil
	}
	seen := make([]bool, len(pages))
	result := tocPagePlaceholderRE.ReplaceAllStringFunc(document, func(match string) string {
		parts := tocPagePlaceholderRE.FindStringSubmatch(match)
		index, err := strconv.Atoi(parts[2])
		if err != nil || index < 0 || index >= len(pages) || pages[index] < 1 || seen[index] {
			return match
		}
		seen[index] = true
		return parts[1] + parts[2] + parts[3] + strconv.Itoa(pages[index]) + parts[4]
	})
	for index, present := range seen {
		if !present {
			return "", fmt.Errorf("printable table of contents is missing page-number placeholder %d", index+1)
		}
	}
	return result, nil
}

type internalPDFLink struct {
	sourcePage int
	targetPage int
	top        float64
	left       float64
}

// ResolveTOCPageNumbers reads the internal link annotations emitted for the
// generated contents entries. Cover and contents precede authored Markdown,
// so the first expected internal links in physical reading order are exactly
// the generated TOC entries.
func ResolveTOCPageNumbers(pdfPath string, expected int) ([]int, error) {
	if expected <= 0 {
		return nil, nil
	}
	ctx, err := api.ReadContextFile(pdfPath)
	if err != nil {
		return nil, fmt.Errorf("read provisional PDF destinations: %w", err)
	}

	links := make([]internalPDFLink, 0, expected)
	for pageNr := 1; pageNr <= ctx.PageCount; pageNr++ {
		pageLinks, err := internalLinksForPage(ctx, pageNr)
		if err != nil {
			return nil, err
		}
		links = append(links, pageLinks...)
	}
	sort.SliceStable(links, func(i, j int) bool {
		if links[i].sourcePage != links[j].sourcePage {
			return links[i].sourcePage < links[j].sourcePage
		}
		if links[i].top != links[j].top {
			return links[i].top > links[j].top
		}
		return links[i].left < links[j].left
	})
	if len(links) < expected {
		return nil, fmt.Errorf("provisional PDF exposed %d of %d table-of-contents destinations", len(links), expected)
	}
	pages := make([]int, expected)
	for index := range pages {
		pages[index] = links[index].targetPage
		if pages[index] < 1 {
			return nil, fmt.Errorf("table-of-contents destination %d has no physical page", index+1)
		}
	}
	return pages, nil
}

func internalLinksForPage(ctx *model.Context, pageNr int) ([]internalPDFLink, error) {
	page, _, _, err := ctx.PageDict(pageNr, false)
	if err != nil {
		return nil, fmt.Errorf("read provisional PDF page %d: %w", pageNr, err)
	}
	object, found := page.Find("Annots")
	if !found || object == nil {
		return nil, nil
	}
	annotations, err := ctx.DereferenceArray(object)
	if err != nil {
		return nil, fmt.Errorf("read provisional PDF annotations on page %d: %w", pageNr, err)
	}

	links := make([]internalPDFLink, 0, len(annotations))
	for _, object := range annotations {
		dictionary, err := ctx.DereferenceDict(object)
		if err != nil {
			return nil, fmt.Errorf("read provisional PDF link on page %d: %w", pageNr, err)
		}
		if dictionary == nil {
			continue
		}
		subtype := dictionary.NameEntry("Subtype")
		if subtype == nil || *subtype != "Link" {
			continue
		}
		destination, ok, err := linkDestination(ctx, dictionary)
		if err != nil {
			return nil, fmt.Errorf("read provisional PDF destination on page %d: %w", pageNr, err)
		}
		if !ok {
			continue
		}
		targetPage, err := pdfcpu.PageNrFromDestination(ctx, destination)
		if err != nil {
			return nil, fmt.Errorf("resolve provisional PDF destination on page %d: %w", pageNr, err)
		}
		if targetPage < 1 {
			return nil, fmt.Errorf("resolve provisional PDF destination on page %d: destination has no physical page", pageNr)
		}
		link := internalPDFLink{sourcePage: pageNr, targetPage: targetPage}
		if rectObject, found := dictionary.Find("Rect"); found {
			if rectArray, rectErr := ctx.DereferenceArray(rectObject); rectErr == nil {
				if rect := types.RectForArray(rectArray); rect != nil {
					link.top = rect.UR.Y
					link.left = rect.LL.X
				}
			}
		}
		links = append(links, link)
	}
	return links, nil
}

func linkDestination(ctx *model.Context, dictionary types.Dict) (types.Object, bool, error) {
	if destination, found := dictionary.Find("Dest"); found && destination != nil {
		return destination, true, nil
	}
	actionObject, found := dictionary.Find("A")
	if !found || actionObject == nil {
		return nil, false, nil
	}
	action, err := ctx.DereferenceDict(actionObject)
	if err != nil || action == nil {
		return nil, false, err
	}
	kind := action.NameEntry("S")
	if kind == nil || *kind != "GoTo" {
		return nil, false, nil
	}
	destination, found := action.Find("D")
	return destination, found && destination != nil, nil
}
