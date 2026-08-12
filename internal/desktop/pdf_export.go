package desktop

import (
	"context"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net/url"
	"os"
	pathpkg "path"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"figaro/internal/pdfexport"
)

// PDFExportResult is returned to the frontend after an interactive PDF export
// has either completed beside its Markdown source or failed before any user
// document is replaced.
type PDFExportResult struct {
	Success     bool   `json:"success"`
	Path        string `json:"path,omitempty"`
	Engine      string `json:"engine,omitempty"`
	ViewerError string `json:"viewerError,omitempty"`
	Error       string `json:"error,omitempty"`
}

const starterPrintStylesheetAsset = "frontend/pdf/starter-pdf.css"

// StarterPrintStylesheetResult describes the deliberate, one-time copy of
// Figaro's editable print stylesheet into a vault. Created is false when the
// selected CSS file already existed and can be used without being overwritten.
type StarterPrintStylesheetResult struct {
	Success bool   `json:"success"`
	Path    string `json:"path,omitempty"`
	Created bool   `json:"created"`
	Error   string `json:"error,omitempty"`
}

// CreateStarterPrintStylesheet copies the bundled, documented starter CSS to
// a vault-local path relative to a Markdown note. It is intentionally invoked
// only by an explicit Properties action: app startup and PDF export never add
// or modify a user's CSS files.
func (a *App) CreateStarterPrintStylesheet(sourcePath string, stylesheetRef string) (*StarterPrintStylesheetResult, error) {
	if !strings.HasSuffix(strings.ToLower(strings.TrimSpace(sourcePath)), ".md") {
		return &StarterPrintStylesheetResult{Success: false, Error: "PDF stylesheets can only be created for a Markdown note"}, nil
	}

	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	sourceRel, err := vaultRelativePath(sourcePath)
	if err != nil {
		return &StarterPrintStylesheetResult{Success: false, Error: err.Error()}, nil
	}
	if strings.TrimSpace(stylesheetRef) == "" {
		stylesheetRef = "pdf.css"
	}
	cssRel, err := a.resolvePrintStylesheet(filepath.Dir(sourceRel), stylesheetRef)
	if err != nil {
		return &StarterPrintStylesheetResult{Success: false, Error: err.Error()}, nil
	}

	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()

	result := &StarterPrintStylesheetResult{Success: true, Path: filepath.ToSlash(cssRel)}
	if info, statErr := root.Stat(cssRel); statErr == nil {
		if info.IsDir() {
			return &StarterPrintStylesheetResult{Success: false, Error: fmt.Sprintf("print stylesheet %q is a directory", strings.TrimSpace(stylesheetRef))}, nil
		}
		if _, readErr := readPrintCSS(root, cssRel, fmt.Sprintf("print stylesheet %q", strings.TrimSpace(stylesheetRef)), true); readErr != nil {
			return &StarterPrintStylesheetResult{Success: false, Error: readErr.Error()}, nil
		}
		return result, nil
	} else if !os.IsNotExist(statErr) {
		return nil, fmt.Errorf("inspect print stylesheet: %w", statErr)
	}

	css, err := loadStarterPrintStylesheet()
	if err != nil {
		return nil, err
	}
	if err := createRootFile(root, cssRel, css, 0644); err != nil {
		// A competing local operation may have created the file between Stat and
		// CreateFile. Preserve that file and offer it instead of replacing it.
		if os.IsExist(err) {
			if _, readErr := readPrintCSS(root, cssRel, fmt.Sprintf("print stylesheet %q", strings.TrimSpace(stylesheetRef)), true); readErr != nil {
				return &StarterPrintStylesheetResult{Success: false, Error: readErr.Error()}, nil
			}
			return result, nil
		}
		return nil, fmt.Errorf("create starter print stylesheet: %w", err)
	}
	if info, statErr := root.Lstat(cssRel); statErr == nil {
		a.updateFileTreeCacheFileLocked(cssRel, info)
	} else {
		a.invalidateFileTreeCacheLocked()
	}
	result.Created = true
	return result, nil
}

// CreateUpgradedPrintStylesheet creates a separate current starter and appends
// every rule from an existing vault stylesheet as a final override section.
// The source and any existing target remain byte-for-byte untouched.
func (a *App) CreateUpgradedPrintStylesheet(sourcePath string, currentRef string, targetRef string) (*StarterPrintStylesheetResult, error) {
	if !strings.HasSuffix(strings.ToLower(strings.TrimSpace(sourcePath)), ".md") {
		return &StarterPrintStylesheetResult{Success: false, Error: "PDF stylesheets can only be upgraded for a Markdown note"}, nil
	}

	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	sourceRel, err := vaultRelativePath(sourcePath)
	if err != nil {
		return &StarterPrintStylesheetResult{Success: false, Error: err.Error()}, nil
	}
	sourceDir := filepath.Dir(sourceRel)
	currentRel, err := a.resolvePrintStylesheet(sourceDir, currentRef)
	if err != nil {
		return &StarterPrintStylesheetResult{Success: false, Error: err.Error()}, nil
	}
	targetRel, err := a.resolvePrintStylesheet(sourceDir, targetRef)
	if err != nil {
		return &StarterPrintStylesheetResult{Success: false, Error: err.Error()}, nil
	}
	if currentRel == targetRel {
		return &StarterPrintStylesheetResult{Success: false, Error: "Choose a different path so the selected stylesheet is not overwritten"}, nil
	}

	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()

	result := &StarterPrintStylesheetResult{Success: true, Path: filepath.ToSlash(targetRel)}
	if info, statErr := root.Stat(targetRel); statErr == nil {
		if info.IsDir() {
			return &StarterPrintStylesheetResult{Success: false, Error: fmt.Sprintf("print stylesheet %q is a directory", strings.TrimSpace(targetRef))}, nil
		}
		if _, readErr := readPrintCSS(root, targetRel, fmt.Sprintf("print stylesheet %q", strings.TrimSpace(targetRef)), true); readErr != nil {
			return &StarterPrintStylesheetResult{Success: false, Error: readErr.Error()}, nil
		}
		return result, nil
	} else if !os.IsNotExist(statErr) {
		return nil, fmt.Errorf("inspect upgraded print stylesheet: %w", statErr)
	}

	currentCSS, err := readPrintCSS(root, currentRel, fmt.Sprintf("print stylesheet %q", strings.TrimSpace(currentRef)), true)
	if err != nil {
		return &StarterPrintStylesheetResult{Success: false, Error: err.Error()}, nil
	}
	starterCSS, err := loadStarterPrintStylesheet()
	if err != nil {
		return nil, err
	}
	safeRef := strings.ReplaceAll(strings.TrimSpace(currentRef), "*/", "* /")
	upgraded := string(starterCSS) + fmt.Sprintf("\n\n/* Migrated overrides from %s.\n * These original rules intentionally remain last in the cascade.\n */\n", safeRef) + currentCSS
	if !strings.HasSuffix(upgraded, "\n") {
		upgraded += "\n"
	}
	if err := createRootFile(root, targetRel, []byte(upgraded), 0644); err != nil {
		if os.IsExist(err) {
			if _, readErr := readPrintCSS(root, targetRel, fmt.Sprintf("print stylesheet %q", strings.TrimSpace(targetRef)), true); readErr != nil {
				return &StarterPrintStylesheetResult{Success: false, Error: readErr.Error()}, nil
			}
			return result, nil
		}
		return nil, fmt.Errorf("create upgraded print stylesheet: %w", err)
	}
	if info, statErr := root.Lstat(targetRel); statErr == nil {
		a.updateFileTreeCacheFileLocked(targetRel, info)
	} else {
		a.invalidateFileTreeCacheLocked()
	}
	result.Created = true
	return result, nil
}

func loadStarterPrintStylesheet() ([]byte, error) {
	css, err := assets.ReadFile(starterPrintStylesheetAsset)
	if err == nil {
		return css, nil
	}
	css, fallbackErr := readProjectAsset(starterPrintStylesheetAsset)
	if fallbackErr != nil {
		return nil, fmt.Errorf("load bundled starter print stylesheet: embedded asset: %v; source fallback: %w", err, fallbackErr)
	}
	return css, nil
}

// ExportPDF creates an interactive PDF with a locally installed browser engine.
// Native WebKitGTK printing is deliberately not a fallback: it paints links but
// currently omits their PDF annotations, making references and navigation lose
// their meaning in the exported document.
func (a *App) ExportPDF(title string, htmlContent string, sourcePath string, printStylesheet string) (*PDFExportResult, error) {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}

	var browser pdfexport.Browser
	var err error
	if configuredPath := a.configuredPDFBrowserPath(); configuredPath != "" {
		browser, err = pdfexport.BrowserForExecutable(ctx, configuredPath)
		if err == nil {
			err = pdfexport.ValidateChromiumHeadless(ctx, browser)
		}
		if err != nil {
			// A browser may have been uninstalled or moved since it was chosen.
			// Keep automatic discovery available, but retain the exact rejection
			// in the application log so Windows installation layouts are visible.
			log.Printf("[pdf-browser] Configured executable %q is unusable; falling back to automatic discovery: %v", configuredPath, err)
		}
	}
	if browser.Executable == "" {
		browser, err = pdfexport.FindBrowser(ctx)
	}
	if err != nil {
		return &PDFExportResult{Success: false, Error: err.Error()}, nil
	}

	document, sourceDir, err := a.prepareInteractivePDFDocument(title, htmlContent, sourcePath, printStylesheet)
	if err != nil {
		return &PDFExportResult{Success: false, Error: err.Error()}, nil
	}
	pageNumbers, tocCount, err := printablePaginationPlan(document)
	if err != nil {
		return &PDFExportResult{Success: false, Error: err.Error()}, nil
	}
	if pageNumbers && browser.Engine == pdfexport.EngineSafari {
		return &PDFExportResult{Success: false, Error: "PDF page numbers require Chromium 131 or newer; Safari export cannot render CSS page-margin numbers yet"}, nil
	}

	outputPath, err := pdfOutputPath(sourceDir, sourcePath)
	if err != nil {
		return &PDFExportResult{Success: false, Error: err.Error()}, nil
	}

	workspaceParent := ""
	if browser.Engine == pdfexport.EngineSafari {
		// WKWebView requires the temporary HTML input to sit below its allowed
		// read-access URL. Keep the workspace in the vault, then grant WebKit
		// the vault root so note-local and shared vault print assets both load
		// without exposing arbitrary files elsewhere on the machine.
		workspaceParent = sourceDir
	}
	var workspace string
	if browser.Engine == pdfexport.EngineSafari {
		workspace, err = os.MkdirTemp(workspaceParent, ".figaro-pdf-")
	} else {
		workspace, err = pdfexport.CreateBrowserWorkspace(browser, ".figaro-pdf-")
	}
	if err != nil {
		return &PDFExportResult{Success: false, Error: fmt.Sprintf("create PDF workspace: %v", err)}, nil
	}
	defer os.RemoveAll(workspace)

	inputHTML, err := writeInteractivePDFWorkspace(workspace, document)
	if err != nil {
		return &PDFExportResult{Success: false, Error: err.Error()}, nil
	}
	temporaryPDF := filepath.Join(workspace, "export.pdf")

	if browser.Engine == pdfexport.EngineSafari {
		err = renderSafariPDF(ctx, inputHTML, temporaryPDF, a.vaultPath)
	} else {
		profileDir := filepath.Join(workspace, "browser-profile")
		if err = os.MkdirAll(profileDir, 0700); err == nil {
			err = pdfexport.WithChromiumPDFSession(ctx, browser, profileDir, func(session *pdfexport.ChromiumPDFSession) error {
				if pageNumbers {
					if capabilityErr := session.RequirePageMarginBoxes(); capabilityErr != nil {
						return capabilityErr
					}
				}
				return renderChromiumPDFPasses(
					session,
					document,
					inputHTML,
					temporaryPDF,
					workspace,
					pageNumbers,
					tocCount,
					defaultPDFPaginationPorts(),
				)
			})
		}
	}
	if err != nil {
		return &PDFExportResult{Success: false, Error: err.Error()}, nil
	}

	if err := publishPDF(temporaryPDF, outputPath); err != nil {
		return &PDFExportResult{Success: false, Error: fmt.Sprintf("save PDF: %v", err)}, nil
	}
	if outputRel, relativeErr := filepath.Rel(a.vaultPath, outputPath); relativeErr == nil {
		a.refreshFileTreeCachePath(outputRel)
	}

	result := &PDFExportResult{
		Success: true,
		Path:    outputPath,
		Engine:  string(browser.Engine),
	}
	// Wails' BrowserOpenURL deliberately routes URLs to the default web
	// browser. A PDF is a file, not a web URL: use the platform file handler so
	// xdg-open/open/ShellExecute select the user's default PDF application.
	if err := openPDFInDefaultViewer(outputPath); err != nil {
		result.ViewerError = fmt.Sprintf("PDF was exported, but its default viewer could not be started: %v", err)
	}
	return result, nil
}

type pdfPassRenderer interface {
	Render(inputHTMLPath string, outputPDFPath string) error
}

type pdfPaginationPorts struct {
	resolvePages func(pdfPath string, expected int) ([]int, error)
	injectPages  func(document string, pages []int) (string, error)
	writeHTML    func(workspace string, document string) (string, error)
}

func defaultPDFPaginationPorts() pdfPaginationPorts {
	return pdfPaginationPorts{
		resolvePages: pdfexport.ResolveTOCPageNumbers,
		injectPages:  pdfexport.InjectTOCPageNumbers,
		writeHTML:    writeInteractivePDFWorkspace,
	}
}

func renderChromiumPDFPasses(
	renderer pdfPassRenderer,
	document string,
	inputHTML string,
	outputPDF string,
	workspace string,
	pageNumbers bool,
	tocCount int,
	ports pdfPaginationPorts,
) error {
	if !pageNumbers || tocCount == 0 {
		return renderer.Render(inputHTML, outputPDF)
	}
	provisionalPDF := filepath.Join(workspace, "provisional.pdf")
	if err := renderer.Render(inputHTML, provisionalPDF); err != nil {
		return fmt.Errorf("paginate table of contents: %w", err)
	}
	pages, err := ports.resolvePages(provisionalPDF, tocCount)
	if err != nil {
		return err
	}
	finalDocument, err := ports.injectPages(document, pages)
	if err != nil {
		return err
	}
	finalInput, err := ports.writeHTML(workspace, finalDocument)
	if err != nil {
		return err
	}
	if err := renderer.Render(finalInput, outputPDF); err != nil {
		return fmt.Errorf("render numbered table of contents: %w", err)
	}
	finalPages, err := ports.resolvePages(outputPDF, tocCount)
	if err != nil {
		return err
	}
	if !slices.Equal(pages, finalPages) {
		return errors.New("table-of-contents page numbers changed during final layout; reduce custom TOC spacing and export again")
	}
	return nil
}

var printableTOCCountRE = regexp.MustCompile(`\bdata-figaro-toc-count="([0-9]+)"`)

func printablePaginationPlan(document string) (bool, int, error) {
	lowerDocument := strings.ToLower(document)
	openingStart := strings.Index(lowerDocument, "<html")
	if openingStart < 0 {
		return false, 0, nil
	}
	openingLength := strings.Index(document[openingStart:], ">")
	if openingLength < 0 {
		return false, 0, nil
	}
	opening := document[openingStart : openingStart+openingLength+1]
	if !strings.Contains(opening, `data-figaro-page-numbers="true"`) {
		return false, 0, nil
	}
	match := printableTOCCountRE.FindStringSubmatch(opening)
	if match == nil {
		return false, 0, errors.New("page-numbered PDF document is missing its table-of-contents count")
	}
	count, err := strconv.Atoi(match[1])
	if err != nil || count < 0 {
		return false, 0, errors.New("page-numbered PDF document has an invalid table-of-contents count")
	}
	return true, count, nil
}

func (a *App) prepareInteractivePDFDocument(title string, htmlContent string, sourcePath string, printStylesheet string) (string, string, error) {
	if !strings.HasSuffix(strings.ToLower(sourcePath), ".md") {
		return "", "", errors.New("PDF export is only available for Markdown files")
	}
	if strings.TrimSpace(htmlContent) == "" {
		return "", "", errors.New("there is no document content to export")
	}

	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	sourceRel, err := vaultRelativePath(sourcePath)
	if err != nil {
		return "", "", err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return "", "", err
	}
	defer root.Close()
	if info, statErr := root.Stat(sourceRel); statErr != nil || info.IsDir() {
		return "", "", errors.New("Markdown file was not found")
	}

	sourceDirRel := filepath.Dir(sourceRel)
	stylesheetURL, err := a.interactivePrintStylesheetURL(root, sourceDirRel, printStylesheet)
	if err != nil {
		return "", "", err
	}
	sourceDir := a.vaultAbsolutePath(sourceDirRel)
	htmlContent = rewritePrintableVaultLinks(htmlContent, a.vaultPath)
	return enrichInteractivePDFHTML(title, htmlContent, localFileURL(sourceDir, true), stylesheetURL), sourceDir, nil
}

var printableVaultLinkRe = regexp.MustCompile(`href="/vault/([^"?#]*)([?#][^"]*)?"`)

// Printable wikilinks use /vault/ URLs so the isolated live preview can open
// them. PDF generation replaces only that explicit namespace with a local file
// URL rooted inside the selected vault.
func rewritePrintableVaultLinks(document string, vaultPath string) string {
	return printableVaultLinkRe.ReplaceAllStringFunc(document, func(match string) string {
		parts := printableVaultLinkRe.FindStringSubmatch(match)
		decoded, err := url.PathUnescape(parts[1])
		if err != nil {
			return match
		}
		rel, err := vaultRelativePath(decoded)
		if err != nil || !strings.HasSuffix(strings.ToLower(rel), ".md") {
			return match
		}
		return `href="` + html.EscapeString(localFileURL(filepath.Join(vaultPath, rel), false)+parts[2]) + `"`
	})
}

func (a *App) interactivePrintStylesheetURL(root *os.Root, sourceDir string, printStylesheet string) (string, error) {
	stylesheetRef := strings.TrimSpace(printStylesheet)
	if stylesheetRef != "" {
		cssRel, err := a.resolvePrintStylesheet(sourceDir, stylesheetRef)
		if err != nil {
			return "", err
		}
		if _, err := readPrintCSS(root, cssRel, fmt.Sprintf("print stylesheet %q", stylesheetRef), true); err != nil {
			return "", err
		}
		return localFileURL(a.vaultAbsolutePath(cssRel), false), nil
	}

	cssRel, err := vaultRelativePath(filepath.ToSlash(filepath.Join(sourceDir, "_print.css")))
	if err != nil {
		return "", err
	}
	if _, err := readPrintCSS(root, cssRel, "_print.css", false); err != nil {
		return "", err
	}
	if _, err := root.Stat(cssRel); os.IsNotExist(err) {
		return "", nil
	} else if err != nil {
		return "", fmt.Errorf("inspect _print.css: %w", err)
	}
	return localFileURL(a.vaultAbsolutePath(cssRel), false), nil
}

func enrichInteractivePDFHTML(title string, htmlContent string, baseURL string, stylesheetURL string) string {
	// A user stylesheet remains a linked local CSS resource. This avoids raw CSS
	// inside a <style> element, where a malicious `</style>` could escape into
	// the document, while preserving relative URLs inside that stylesheet.
	injection := `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: file:; style-src 'unsafe-inline' file:; font-src data: file:">` +
		`<base href="` + html.EscapeString(baseURL) + `">`
	if stylesheetURL != "" {
		injection += `<link rel="stylesheet" href="` + html.EscapeString(stylesheetURL) + `">`
	}
	if headEnd := strings.LastIndex(strings.ToLower(htmlContent), "</head>"); headEnd >= 0 {
		return htmlContent[:headEnd] + injection + htmlContent[headEnd:]
	}
	return "<!doctype html><html><head><meta charset=\"utf-8\"><title>" + html.EscapeString(title) + "</title>" + injection + "</head><body>" + htmlContent + "</body></html>"
}

func writeInteractivePDFWorkspace(workspace string, document string) (string, error) {
	katexURL, err := writeKaTeXAssets(workspace)
	if err != nil {
		return "", err
	}
	if headEnd := strings.LastIndex(strings.ToLower(document), "</head>"); headEnd >= 0 {
		document = document[:headEnd] + `<link rel="stylesheet" href="` + html.EscapeString(katexURL) + `">` + document[headEnd:]
	}
	inputHTML := filepath.Join(workspace, "document.html")
	if err := os.WriteFile(inputHTML, []byte(document), 0600); err != nil {
		return "", fmt.Errorf("write PDF document: %w", err)
	}
	return inputHTML, nil
}

func writeKaTeXAssets(workspace string) (string, error) {
	const cssAsset = "frontend/vendored/katex/dist/katex.min.css"
	css, err := assets.ReadFile(cssAsset)
	if err != nil {
		css, err = readProjectAsset(cssAsset)
		if err != nil {
			return "", fmt.Errorf("load KaTeX print stylesheet: %w", err)
		}
	}

	fontDirectory := filepath.Join(workspace, "katex-fonts")
	if err := os.MkdirAll(fontDirectory, 0700); err != nil {
		return "", fmt.Errorf("create KaTeX font directory: %w", err)
	}
	entries, err := assets.ReadDir("frontend/vendored/katex/dist/fonts")
	if err != nil {
		return "", fmt.Errorf("list KaTeX fonts: %w", err)
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".woff2") {
			continue
		}
		assetPath := "frontend/vendored/katex/dist/fonts/" + entry.Name()
		font, readErr := assets.ReadFile(assetPath)
		if readErr != nil {
			return "", fmt.Errorf("load KaTeX font %q: %w", entry.Name(), readErr)
		}
		if writeErr := os.WriteFile(filepath.Join(fontDirectory, entry.Name()), font, 0600); writeErr != nil {
			return "", fmt.Errorf("write KaTeX font %q: %w", entry.Name(), writeErr)
		}
	}

	// CSS is loaded from the workspace, so its relative font URLs need to
	// point to the copied local font directory rather than the app bundle.
	workspaceCSS := strings.ReplaceAll(string(css), "url(fonts/", "url(katex-fonts/")
	cssPath := filepath.Join(workspace, "katex.css")
	if err := os.WriteFile(cssPath, []byte(workspaceCSS), 0600); err != nil {
		return "", fmt.Errorf("write KaTeX print stylesheet: %w", err)
	}
	return localFileURL(cssPath, false), nil
}

func publishPDF(source string, destination string) error {
	sourceFile, err := os.Open(source)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destinationDir := filepath.Dir(destination)
	staging, err := os.CreateTemp(destinationDir, ".figaro-export-*.pdf")
	if err != nil {
		return err
	}
	stagingPath := staging.Name()
	defer func() { _ = os.Remove(stagingPath) }()
	if _, err := io.Copy(staging, sourceFile); err != nil {
		_ = staging.Close()
		return err
	}
	if err := staging.Close(); err != nil {
		return err
	}

	if err := os.Rename(stagingPath, destination); err == nil {
		return nil
	} else if _, statErr := os.Stat(destination); statErr != nil {
		// The destination did not exist, so the original rename failure is not
		// an overwrite case and must not trigger any destructive recovery.
		return err
	}

	// Windows does not replace an existing file with Rename. Preserve any
	// existing user PDF until the new one has been moved into place; if the
	// second rename fails, put the original file back.
	backup, err := os.CreateTemp(destinationDir, ".figaro-export-backup-*.pdf")
	if err != nil {
		return err
	}
	backupPath := backup.Name()
	if closeErr := backup.Close(); closeErr != nil {
		_ = os.Remove(backupPath)
		return closeErr
	}
	if err := os.Remove(backupPath); err != nil {
		return err
	}
	if err := os.Rename(destination, backupPath); err != nil {
		return err
	}
	if err := os.Rename(stagingPath, destination); err != nil {
		_ = os.Rename(backupPath, destination)
		return err
	}
	_ = os.Remove(backupPath)
	return nil
}

// pdfOutputPath keeps exports predictable: a Markdown note such as
// notes/Quarterly review.md always writes notes/Quarterly review.pdf.
func pdfOutputPath(sourceDir string, sourcePath string) (string, error) {
	name := pathpkg.Base(strings.ReplaceAll(sourcePath, "\\", "/"))
	extension := pathpkg.Ext(name)
	if !strings.EqualFold(extension, ".md") {
		return "", errors.New("PDF export is only available for Markdown files")
	}
	stem := strings.TrimSuffix(name, extension)
	if strings.TrimSpace(stem) == "" || stem == "." || stem == ".." {
		return "", errors.New("Markdown file needs a name before it can be exported")
	}
	return filepath.Join(sourceDir, stem+".pdf"), nil
}

func localFileURL(path string, directory bool) string {
	urlPath := filepath.ToSlash(path)
	if !strings.HasPrefix(urlPath, "/") {
		urlPath = "/" + urlPath
	}
	if directory && !strings.HasSuffix(urlPath, "/") {
		urlPath += "/"
	}
	return (&url.URL{Scheme: "file", Path: urlPath}).String()
}
