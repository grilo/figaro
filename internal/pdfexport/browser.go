// Package pdfexport discovers locally installed PDF-capable browser engines
// and runs Chromium-family browsers in their supported headless PDF mode.
package pdfexport

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

// Engine identifies the local rendering engine selected for an export.
type Engine string

const (
	EngineChrome   Engine = "chrome"
	EngineChromium Engine = "chromium"
	EngineEdge     Engine = "edge"
	EngineBrave    Engine = "brave"
	EngineSafari   Engine = "safari"
)

// Browser is a discovered local browser engine. Safari is deliberately a
// distinct engine because it uses macOS' native WKWebView PDF API rather than
// Chromium command-line flags.
type Browser struct {
	Engine     Engine
	Executable string
	// SnapName identifies the owning Linux Snap when Executable is exported
	// through /snap/bin. Snap browsers need temporary profiles and documents
	// below their user-common directory so confinement can access them.
	SnapName string
	// Arguments are fixed launcher arguments placed before Chromium flags.
	// Flatpak installations use this for `flatpak run <application-id>`; direct
	// browser executables leave it empty.
	Arguments []string
}

// NoBrowserError is returned when no usable local renderer can be found.
// It intentionally gives the user an actionable recovery rather than silently
// falling back to a PDF engine that drops link annotations.
type NoBrowserError struct{}

func (NoBrowserError) Error() string {
	return "No browser engine was found for interactive PDF export. Install or expose Chrome, Chromium (including Ungoogled Chromium), or Edge, or choose its executable in Settings, then try again."
}

// IsNoBrowserError reports whether err is the actionable discovery failure.
func IsNoBrowserError(err error) bool {
	var target NoBrowserError
	return errors.As(err, &target)
}

type candidate struct {
	engine Engine
	path   string
	args   []string
}

// FinderOptions makes discovery deterministic and testable without depending
// on the current workstation's installed browsers.
type FinderOptions struct {
	GOOS     string
	Getenv   func(string) string
	LookPath func(string) (string, error)
	Stat     func(string) (os.FileInfo, error)
	ReadDir  func(string) ([]os.DirEntry, error)
	Validate func(context.Context, Browser) error
	// Trace receives each discovery decision, including paths that were not
	// present and executables rejected by the real headless startup validation.
	Trace func(string)
}

// FindBrowser selects the first viable local browser. The order is deliberate:
// Chrome and Chromium win on every OS, Edge is next, and Safari is the macOS
// fallback handled through WKWebView.
func FindBrowser(ctx context.Context) (Browser, error) {
	return FindBrowserWith(ctx, FinderOptions{
		GOOS:     runtime.GOOS,
		Getenv:   os.Getenv,
		LookPath: exec.LookPath,
		Stat:     os.Stat,
		ReadDir:  os.ReadDir,
		Validate: ValidateChromiumHeadless,
		Trace: func(message string) {
			log.Printf("[pdf-browser] %s", message)
		},
	})
}

// FindBrowserWith is FindBrowser with injectable filesystem and process
// operations for tests.
func FindBrowserWith(ctx context.Context, options FinderOptions) (Browser, error) {
	if options.GOOS == "" {
		options.GOOS = runtime.GOOS
	}
	if options.Getenv == nil {
		options.Getenv = os.Getenv
	}
	if options.LookPath == nil {
		options.LookPath = exec.LookPath
	}
	if options.Stat == nil {
		options.Stat = os.Stat
	}
	if options.ReadDir == nil {
		options.ReadDir = os.ReadDir
	}
	if options.Validate == nil {
		options.Validate = ValidateChromiumHeadless
	}
	trace := func(format string, args ...interface{}) {
		if options.Trace != nil {
			options.Trace(fmt.Sprintf(format, args...))
		}
	}

	trace("starting automatic discovery for %s", options.GOOS)
	var snapCandidates []candidate
	if options.GOOS == "linux" {
		entries, err := options.ReadDir("/snap/bin")
		if err != nil {
			trace("Snap browser directory unavailable: %v", err)
		} else {
			names := make([]string, 0, len(entries))
			for _, entry := range entries {
				if !entry.IsDir() {
					names = append(names, entry.Name())
				}
			}
			snapCandidates = snapBrowserCandidates(names)
			trace("found %d supported browser candidate(s) under /snap/bin", len(snapCandidates))
		}
	}
	seen := make(map[string]struct{})
	for _, candidate := range browserCandidates(options.GOOS, options.Getenv, snapCandidates) {
		trace("checking %s candidate %q", candidate.engine, candidate.path)
		executable, err := resolveExecutable(candidate.path, options.LookPath, options.Stat)
		if err != nil {
			trace("candidate unavailable: %v", err)
			continue
		}
		key := strings.ToLower(filepath.Clean(executable)) + "\x00" + strings.Join(candidate.args, "\x00")
		if _, duplicate := seen[key]; duplicate {
			trace("skipping duplicate executable %q", executable)
			continue
		}
		seen[key] = struct{}{}
		browser := Browser{
			Engine:     candidate.engine,
			Executable: executable,
			SnapName:   snapNameForExecutable(executable),
			Arguments:  append([]string(nil), candidate.args...),
		}

		if candidate.engine == EngineSafari {
			trace("selected %s executable %q", browser.Engine, browser.Executable)
			return browser, nil
		}
		trace("validating %s executable %q with launcher arguments %q", browser.Engine, browser.Executable, browser.Arguments)
		if err := options.Validate(ctx, browser); err == nil {
			trace("selected %s executable %q", browser.Engine, browser.Executable)
			return browser, nil
		} else {
			trace("rejected %s executable %q: %v", browser.Engine, browser.Executable, err)
		}
	}

	trace("automatic discovery exhausted every candidate without finding a usable browser")
	return Browser{}, NoBrowserError{}
}

func resolveExecutable(path string, lookPath func(string) (string, error), stat func(string) (os.FileInfo, error)) (string, error) {
	if path == "" {
		return "", errors.New("empty executable path")
	}
	if filepath.IsAbs(path) {
		info, err := stat(path)
		if err != nil {
			return "", fmt.Errorf("stat %q: %w", path, err)
		}
		if info.IsDir() {
			return "", fmt.Errorf("%q is a directory", path)
		}
		return path, nil
	}
	resolved, err := lookPath(path)
	if err != nil {
		return "", fmt.Errorf("look up %q on PATH: %w", path, err)
	}
	info, err := stat(resolved)
	if err != nil {
		return "", fmt.Errorf("stat resolved executable %q: %w", resolved, err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("resolved executable %q is a directory", resolved)
	}
	return resolved, nil
}

// BrowserForExecutable resolves a browser selected explicitly by the user.
// Capability is validated separately through ValidateChromiumHeadless so file
// selection and an actual isolated CDP startup remain distinct failure stages.
func BrowserForExecutable(_ context.Context, executable string) (Browser, error) {
	trace := func(format string, args ...interface{}) {
		log.Printf("[pdf-browser] "+format, args...)
	}
	trimmed := strings.TrimSpace(executable)
	trace("checking user-selected executable %q", trimmed)
	if trimmed == "" {
		return Browser{}, errors.New("no browser executable was selected")
	}
	if !filepath.IsAbs(trimmed) {
		return Browser{}, fmt.Errorf("browser executable must be an absolute path: %q", trimmed)
	}
	resolved, err := resolveExecutable(trimmed, exec.LookPath, os.Stat)
	if err != nil {
		trace("user-selected executable is unavailable: %v", err)
		return Browser{}, err
	}
	browser := Browser{
		Engine:     engineForExecutable(resolved),
		Executable: resolved,
		SnapName:   snapNameForExecutable(resolved),
	}
	trace("selected configured %s executable %q", browser.Engine, browser.Executable)
	return browser, nil
}

func engineForExecutable(executable string) Engine {
	// Accept either separator so diagnostics and persisted Windows paths remain
	// classifiable in cross-platform tests and support tooling.
	name := strings.ToLower(filepath.Base(strings.ReplaceAll(executable, "\\", "/")))
	switch {
	case strings.Contains(name, "edge"):
		return EngineEdge
	case strings.Contains(name, "brave"):
		return EngineBrave
	case strings.Contains(name, "chromium"):
		return EngineChromium
	default:
		return EngineChrome
	}
}

func browserCandidates(goos string, getenv func(string) string, snapCandidates []candidate) []candidate {
	var candidates []candidate
	appendCandidates := func(engine Engine, paths ...string) {
		for _, path := range paths {
			if strings.TrimSpace(path) != "" {
				candidates = append(candidates, candidate{engine: engine, path: path})
			}
		}
	}
	appendFlatpakCandidates := func(engine Engine, appIDs ...string) {
		for _, appID := range appIDs {
			if strings.TrimSpace(appID) == "" {
				continue
			}
			candidates = append(candidates, candidate{
				engine: engine,
				path:   "flatpak",
				args:   []string{"run", appID},
			})
		}
	}
	appendSnapCandidates := func(engine Engine) {
		for _, candidate := range snapCandidates {
			if candidate.engine == engine {
				candidates = append(candidates, candidate)
			}
		}
	}

	// Prefer Chrome and Chromium regardless of platform. The PATH candidates
	// cover package-manager installs; the absolute candidates cover common
	// desktop installers that do not amend PATH.
	switch goos {
	case "windows":
		programFiles := getenv("ProgramFiles")
		programFilesX86 := getenv("ProgramFiles(x86)")
		localAppData := getenv("LOCALAPPDATA")
		appendCandidates(EngineChrome,
			"chrome.exe",
			filepath.Join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
		)
		appendCandidates(EngineChromium,
			"chromium.exe",
			filepath.Join(programFiles, "Chromium", "Application", "chromium.exe"),
			filepath.Join(localAppData, "Chromium", "Application", "chromium.exe"),
		)
		appendCandidates(EngineEdge,
			"msedge.exe",
			filepath.Join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
		)
		appendCandidates(EngineBrave,
			"brave.exe",
			filepath.Join(programFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
			filepath.Join(localAppData, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
		)
	case "darwin":
		home := getenv("HOME")
		appendCandidates(EngineChrome,
			"google-chrome",
			"Google Chrome",
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			filepath.Join(home, "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
			"/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
			"/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
		)
		appendCandidates(EngineChromium,
			"chromium",
			"Chromium",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
			filepath.Join(home, "Applications", "Chromium.app", "Contents", "MacOS", "Chromium"),
		)
		appendCandidates(EngineEdge,
			"microsoft-edge",
			"Microsoft Edge",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		)
		appendCandidates(EngineBrave,
			"brave-browser",
			"Brave Browser",
			"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
		)
		// Safari has no supported headless command-line PDF mode. Figaro uses
		// WKWebView's native createPDF API when this final fallback is present.
		appendCandidates(EngineSafari,
			"/Applications/Safari.app/Contents/MacOS/Safari",
			filepath.Join(home, "Applications", "Safari.app", "Contents", "MacOS", "Safari"),
		)
	default:
		appendCandidates(EngineChrome,
			"google-chrome",
			"google-chrome-stable",
			"google-chrome-beta",
			"google-chrome-unstable",
			"chrome",
			"/usr/bin/google-chrome",
			"/opt/google/chrome/google-chrome",
		)
		appendSnapCandidates(EngineChrome)
		appendFlatpakCandidates(EngineChrome, "com.google.Chrome")
		appendCandidates(EngineChromium,
			"chromium",
			"chromium-browser",
			"ungoogled-chromium",
			"ungoogled-chromium-browser",
			"/usr/bin/chromium",
			"/usr/bin/chromium-browser",
			"/usr/bin/ungoogled-chromium",
			"/usr/local/bin/ungoogled-chromium",
			"/opt/ungoogled-chromium/ungoogled-chromium",
			"/var/lib/flatpak/exports/bin/com.google.Chrome",
			"/var/lib/flatpak/exports/bin/org.chromium.Chromium",
			"/var/lib/flatpak/exports/bin/io.github.ungoogled_software.ungoogled_chromium",
			filepath.Join(getenv("HOME"), ".local", "share", "flatpak", "exports", "bin", "org.chromium.Chromium"),
			filepath.Join(getenv("HOME"), ".local", "share", "flatpak", "exports", "bin", "io.github.ungoogled_software.ungoogled_chromium"),
		)
		appendSnapCandidates(EngineChromium)
		appendFlatpakCandidates(EngineChromium,
			"org.chromium.Chromium",
			"io.github.ungoogled_software.ungoogled_chromium",
			"com.github.Eloston.UngoogledChromium",
		)
		appendCandidates(EngineEdge,
			"microsoft-edge",
			"microsoft-edge-stable",
			"microsoft-edge-beta",
			"microsoft-edge-dev",
			"/usr/bin/microsoft-edge",
			"/usr/bin/microsoft-edge-stable",
		)
		appendSnapCandidates(EngineEdge)
		appendCandidates(EngineBrave,
			"brave-browser",
			"brave",
			"/usr/bin/brave-browser",
		)
		appendSnapCandidates(EngineBrave)
	}

	return candidates
}

// snapBrowserCandidates turns the names exported by snapd into deterministic,
// supported browser candidates. Broad directory discovery is deliberately
// paired with conservative name classification and the same CDP capability
// validation used for every other Chromium-family executable.
func snapBrowserCandidates(names []string) []candidate {
	ordered := append([]string(nil), names...)
	sort.Strings(ordered)
	byEngine := map[Engine][]candidate{}
	for _, name := range ordered {
		engine, ok := snapBrowserEngine(name)
		if !ok {
			continue
		}
		byEngine[engine] = append(byEngine[engine], candidate{
			engine: engine,
			path:   filepath.Join("/snap/bin", name),
		})
	}

	var candidates []candidate
	for _, engine := range []Engine{EngineChrome, EngineChromium, EngineEdge, EngineBrave} {
		candidates = append(candidates, byEngine[engine]...)
	}
	return candidates
}

func snapBrowserEngine(name string) (Engine, bool) {
	normalized := strings.ToLower(strings.TrimSpace(name))
	if normalized == "" || strings.Contains(normalized, "driver") || strings.Contains(normalized, "sandbox") {
		return "", false
	}
	switch {
	case normalized == "chrome", strings.HasPrefix(normalized, "chrome."),
		normalized == "google-chrome", strings.HasPrefix(normalized, "google-chrome-") || strings.HasPrefix(normalized, "google-chrome."):
		return EngineChrome, true
	case normalized == "chromium", normalized == "chromium-browser",
		strings.HasPrefix(normalized, "chromium."), strings.HasPrefix(normalized, "chromium-"),
		strings.HasPrefix(normalized, "ungoogled-chromium"):
		return EngineChromium, true
	case normalized == "microsoft-edge", strings.HasPrefix(normalized, "microsoft-edge-") || strings.HasPrefix(normalized, "microsoft-edge."),
		normalized == "msedge", strings.HasPrefix(normalized, "msedge."):
		return EngineEdge, true
	case normalized == "brave", normalized == "brave-browser",
		strings.HasPrefix(normalized, "brave."), strings.HasPrefix(normalized, "brave-browser-") || strings.HasPrefix(normalized, "brave-browser."):
		return EngineBrave, true
	default:
		return "", false
	}
}

func snapNameForExecutable(executable string) string {
	cleaned := filepath.Clean(strings.TrimSpace(executable))
	if filepath.Clean(filepath.Dir(cleaned)) != filepath.Clean("/snap/bin") {
		return ""
	}
	name := strings.SplitN(filepath.Base(cleaned), ".", 2)[0]
	if name == "" {
		return ""
	}
	for _, character := range name {
		if (character < 'a' || character > 'z') && (character < '0' || character > '9') && character != '-' {
			return ""
		}
	}
	return name
}

func isFlatpakBrowser(browser Browser) bool {
	return len(browser.Arguments) >= 2 && browser.Arguments[0] == "run" && strings.EqualFold(filepath.Base(browser.Executable), "flatpak")
}

func fileURL(path string) string {
	urlPath := filepath.ToSlash(path)
	// Windows absolute paths have no leading slash after ToSlash. URL.Path
	// needs one to create file:///C:/... instead of treating C: as a host.
	if !strings.HasPrefix(urlPath, "/") {
		urlPath = "/" + urlPath
	}
	return (&url.URL{Scheme: "file", Path: urlPath}).String()
}
