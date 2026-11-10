package desktop

import (
	"fmt"
	"net/url"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
)

// pdfResourceGuard confines what an exported document loads to the folders it
// is built from: the vault and the export workspace. Images, stylesheets and
// fonts are vault-local by specification (docs/PROMPT.md, Image Serving and
// PDF export); the printable HTML nevertheless carries authored paths, and a
// "file:" URL or enough "../" reaches any file the user can read. The guard is
// the pdfexport.ResourcePolicy for an export, so it judges the URL the browser
// is about to open rather than the markup that named it.
type pdfResourceGuard struct {
	roots   []string
	resolve func(string) (string, error)

	mu      sync.Mutex
	blocked []string
}

// newPDFResourceGuard resolves each permitted folder once, so later checks
// compare real locations: a symbolic link inside the vault that points
// outside it does not make its target part of the vault.
func newPDFResourceGuard(directories ...string) (*pdfResourceGuard, error) {
	guard := &pdfResourceGuard{resolve: filepath.EvalSymlinks}
	for _, directory := range directories {
		resolved, err := filepath.EvalSymlinks(directory)
		if err != nil {
			return nil, fmt.Errorf("resolve PDF resource folder: %w", err)
		}
		absolute, err := filepath.Abs(resolved)
		if err != nil {
			return nil, fmt.Errorf("resolve PDF resource folder: %w", err)
		}
		guard.roots = append(guard.roots, absolute)
	}
	return guard, nil
}

// allow is the export's resource policy. A refused URL is remembered so the
// export can say what it left out.
func (guard *pdfResourceGuard) allow(requestURL string) bool {
	decision := pdfResourceDecision(goruntime.GOOS, requestURL, guard.roots, guard.resolve)
	if decision == pdfResourceOutside {
		guard.mu.Lock()
		guard.blocked = append(guard.blocked, requestURL)
		guard.mu.Unlock()
	}
	return decision == pdfResourcePermitted
}

// blockedResources returns the distinct URLs refused so far, in first-seen
// order. A two-pass export asks about each resource twice.
func (guard *pdfResourceGuard) blockedResources() []string {
	guard.mu.Lock()
	defer guard.mu.Unlock()
	seen := make(map[string]struct{}, len(guard.blocked))
	distinct := make([]string, 0, len(guard.blocked))
	for _, blocked := range guard.blocked {
		if _, repeated := seen[blocked]; repeated {
			continue
		}
		seen[blocked] = struct{}{}
		distinct = append(distinct, blocked)
	}
	return distinct
}

type pdfResourceVerdict int

const (
	// pdfResourceRefused is a request the export never serves: a network
	// URL, a malformed one, or a local file that cannot be found.
	pdfResourceRefused pdfResourceVerdict = iota
	// pdfResourcePermitted is inline data, or a file inside a permitted folder.
	pdfResourcePermitted
	// pdfResourceOutside is an existing local file outside every permitted
	// folder: the case the user is told about.
	pdfResourceOutside
)

// pdfResourceDecision judges one request. Inline data and the blank page the
// browser starts from carry no file access. A local file is permitted only
// when its real location, after every symbolic link is followed, lies in one
// of roots. Everything else, including network URLs and files on another
// host, is refused. resolve is filepath.EvalSymlinks outside tests.
func pdfResourceDecision(goos string, requestURL string, roots []string, resolve func(string) (string, error)) pdfResourceVerdict {
	parsed, err := url.Parse(requestURL)
	if err != nil {
		return pdfResourceRefused
	}
	switch strings.ToLower(parsed.Scheme) {
	case "data":
		return pdfResourcePermitted
	case "about":
		if strings.EqualFold(requestURL, "about:blank") {
			return pdfResourcePermitted
		}
		return pdfResourceRefused
	case "file":
	default:
		return pdfResourceRefused
	}
	path, local := localPathOfFileURL(goos, parsed)
	if !local {
		return pdfResourceOutside
	}
	resolved, err := resolve(filepath.FromSlash(path))
	if err != nil {
		// A file that cannot be found cannot be loaded either way.
		return pdfResourceRefused
	}
	for _, root := range roots {
		if pathIsWithin(root, resolved) {
			return pdfResourcePermitted
		}
	}
	return pdfResourceOutside
}

// localPathOfFileURL returns the slash-separated path a "file:" URL names on
// this computer. A URL with a host other than localhost names a network
// share, never a vault file. On Windows the path's leading slash precedes the
// drive letter ("/C:/Users/…") and is dropped.
func localPathOfFileURL(goos string, parsed *url.URL) (string, bool) {
	if parsed.Opaque != "" || (parsed.Host != "" && !strings.EqualFold(parsed.Host, "localhost")) {
		return "", false
	}
	path := parsed.Path
	if !strings.HasPrefix(path, "/") || strings.ContainsRune(path, '\x00') {
		return "", false
	}
	if goos == "windows" {
		if len(path) < 3 || path[2] != ':' || !isASCIILetter(path[1]) {
			return "", false
		}
		path = path[1:]
	}
	return path, true
}

func isASCIILetter(character byte) bool {
	return (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z')
}

// pdfBlockedResourceWarning tells the user what an export left out, naming
// the first few files by name only.
func pdfBlockedResourceWarning(blocked []string) string {
	if len(blocked) == 0 {
		return ""
	}
	names := make([]string, 0, 3)
	for _, requestURL := range blocked {
		if len(names) == cap(names) {
			break
		}
		name := requestURL
		if parsed, err := url.Parse(requestURL); err == nil && parsed.Path != "" {
			name = parsed.Path
		}
		if separator := strings.LastIndex(strings.TrimRight(name, "/"), "/"); separator >= 0 {
			name = strings.TrimRight(name, "/")[separator+1:]
		}
		names = append(names, "“"+name+"”")
	}
	listed := strings.Join(names, ", ")
	if more := len(blocked) - len(names); more > 0 {
		listed += fmt.Sprintf(" and %d more", more)
	}
	noun := "a file"
	if len(blocked) > 1 {
		noun = fmt.Sprintf("%d files", len(blocked))
	}
	return fmt.Sprintf("The PDF was exported without %s that the note references outside the vault (%s). Copy them into the vault to include them.", noun, listed)
}
