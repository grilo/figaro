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
	"strings"
	"time"
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
	Probe    func(context.Context, Browser) error
	// Trace receives each discovery decision, including paths that were not
	// present and executables rejected by the headless capability probe.
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
		Probe:    ProbeChromiumHeadless,
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
	if options.Probe == nil {
		options.Probe = ProbeChromiumHeadless
	}
	trace := func(format string, args ...interface{}) {
		if options.Trace != nil {
			options.Trace(fmt.Sprintf(format, args...))
		}
	}

	trace("starting automatic discovery for %s", options.GOOS)
	seen := make(map[string]struct{})
	for _, candidate := range browserCandidates(options.GOOS, options.Getenv) {
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
			Arguments:  append([]string(nil), candidate.args...),
		}

		if candidate.engine == EngineSafari {
			trace("selected %s executable %q", browser.Engine, browser.Executable)
			return browser, nil
		}
		trace("probing %s executable %q with launcher arguments %q", browser.Engine, browser.Executable, browser.Arguments)
		if err := options.Probe(ctx, browser); err == nil {
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

// BrowserForExecutable validates a browser selected explicitly by the user.
// The executable name is used only for the result label; capability is decided
// by the same headless probe used during automatic discovery.
func BrowserForExecutable(ctx context.Context, executable string) (Browser, error) {
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
	browser := Browser{Engine: engineForExecutable(resolved), Executable: resolved}
	if err := ProbeChromiumHeadless(ctx, browser); err != nil {
		trace("user-selected executable %q failed the headless probe: %v", resolved, err)
		return Browser{}, fmt.Errorf("selected browser cannot create PDFs: %w", err)
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

func browserCandidates(goos string, getenv func(string) string) []candidate {
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
			"/snap/bin/chromium",
			"/var/lib/flatpak/exports/bin/com.google.Chrome",
			"/var/lib/flatpak/exports/bin/org.chromium.Chromium",
			"/var/lib/flatpak/exports/bin/io.github.ungoogled_software.ungoogled_chromium",
			filepath.Join(getenv("HOME"), ".local", "share", "flatpak", "exports", "bin", "org.chromium.Chromium"),
			filepath.Join(getenv("HOME"), ".local", "share", "flatpak", "exports", "bin", "io.github.ungoogled_software.ungoogled_chromium"),
		)
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
		appendCandidates(EngineBrave,
			"brave-browser",
			"brave",
			"/usr/bin/brave-browser",
		)
	}

	return candidates
}

// ProbeChromiumHeadless verifies that the executable accepts Chromium's
// headless switch before Figaro begins an export. A browser merely found on PATH
// is not sufficient: users should get a useful install message rather than a
// partially exported document.
func ProbeChromiumHeadless(ctx context.Context, browser Browser) error {
	probeTimeout := 3 * time.Second
	if isFlatpakBrowser(browser) {
		// Flatpak must start its sandbox before invoking the browser. It is
		// consistently slower than a direct executable, especially after a
		// reboot, so do not mistake a healthy installed browser for missing.
		probeTimeout = 12 * time.Second
	}
	probeCtx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()

	arguments := append([]string(nil), browser.Arguments...)
	arguments = append(arguments, "--headless", "--version")
	command := exec.CommandContext(probeCtx, browser.Executable, arguments...) // #nosec G204 -- executable and launcher arguments are selected from fixed local browser discovery heuristics.
	if output, err := command.CombinedOutput(); err != nil {
		if errors.Is(probeCtx.Err(), context.DeadlineExceeded) {
			return fmt.Errorf("browser headless probe timed out")
		}
		return fmt.Errorf("browser does not support headless mode: %s", strings.TrimSpace(string(output)))
	}
	return nil
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
