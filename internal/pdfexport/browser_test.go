package pdfexport

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestFindBrowserPrefersChromeBeforeOtherEngines(t *testing.T) {
	temporary := t.TempDir()
	chromePath := filepath.Join(temporary, "chrome")
	chromiumPath := filepath.Join(temporary, "chromium")
	if err := os.WriteFile(chromePath, []byte("chrome"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(chromiumPath, []byte("chromium"), 0700); err != nil {
		t.Fatal(err)
	}

	browser, err := FindBrowserWith(context.Background(), FinderOptions{
		GOOS:    "linux",
		Getenv:  func(string) string { return "" },
		ReadDir: func(string) ([]os.DirEntry, error) { return nil, os.ErrNotExist },
		LookPath: func(name string) (string, error) {
			switch name {
			case "google-chrome":
				return chromePath, nil
			case "chromium":
				return chromiumPath, nil
			default:
				return "", errors.New("not installed")
			}
		},
		Stat: os.Stat,
		Validate: func(_ context.Context, browser Browser) error {
			if browser.Executable != chromePath {
				t.Fatalf("unexpected validation before Chrome selection: %+v", browser)
			}
			return nil
		},
	})
	if err != nil {
		t.Fatalf("FindBrowserWith failed: %v", err)
	}
	if browser.Engine != EngineChrome || browser.Executable != chromePath {
		t.Fatalf("unexpected browser: %+v", browser)
	}
}

func TestFindBrowserSkipsAChromeBinaryThatFailsRealStartupValidation(t *testing.T) {
	temporary := t.TempDir()
	chromePath := filepath.Join(temporary, "chrome")
	chromiumPath := filepath.Join(temporary, "chromium")
	for _, path := range []string{chromePath, chromiumPath} {
		if err := os.WriteFile(path, []byte("browser"), 0700); err != nil {
			t.Fatal(err)
		}
	}

	browser, err := FindBrowserWith(context.Background(), FinderOptions{
		GOOS:    "linux",
		Getenv:  func(string) string { return "" },
		ReadDir: func(string) ([]os.DirEntry, error) { return nil, os.ErrNotExist },
		LookPath: func(name string) (string, error) {
			switch name {
			case "google-chrome":
				return chromePath, nil
			case "chromium":
				return chromiumPath, nil
			default:
				return "", errors.New("not installed")
			}
		},
		Stat: func(path string) (os.FileInfo, error) {
			if path != chromePath && path != chromiumPath {
				return nil, os.ErrNotExist
			}
			return os.Stat(path)
		},
		Validate: func(_ context.Context, browser Browser) error {
			if browser.Executable == chromePath {
				return errors.New("unsupported")
			}
			if browser.Engine != EngineChromium || browser.Executable != chromiumPath {
				t.Fatalf("unexpected fallback validation: %+v", browser)
			}
			return nil
		},
	})
	if err != nil {
		t.Fatalf("FindBrowserWith failed: %v", err)
	}
	if browser.Engine != EngineChromium || browser.Executable != chromiumPath {
		t.Fatalf("expected Chromium fallback, got %+v", browser)
	}
}

func TestFindBrowserScansSnapBinForSupportedLinuxBrowsers(t *testing.T) {
	temporary := t.TempDir()
	for _, name := range []string{
		"brave",
		"chromium.chromedriver",
		"chromium.custom",
		"google-chrome-beta",
		"notes",
	} {
		if err := os.WriteFile(filepath.Join(temporary, name), []byte(name), 0700); err != nil {
			t.Fatal(err)
		}
	}

	browser, err := FindBrowserWith(context.Background(), FinderOptions{
		GOOS:   "linux",
		Getenv: func(string) string { return "" },
		LookPath: func(name string) (string, error) {
			// Model Linux resolution even on Windows, where /snap is not an absolute native path.
			if strings.HasPrefix(name, "/snap/bin/") {
				return name, nil
			}
			return "", os.ErrNotExist
		},
		ReadDir: func(path string) ([]os.DirEntry, error) {
			if path != "/snap/bin" {
				t.Fatalf("unexpected Snap directory: %q", path)
			}
			return os.ReadDir(temporary)
		},
		Stat: func(path string) (os.FileInfo, error) {
			name := filepath.Base(path)
			if _, ok := map[string]bool{
				"brave":              true,
				"chromium.custom":    true,
				"google-chrome-beta": true,
			}[name]; !ok {
				return nil, os.ErrNotExist
			}
			return os.Stat(filepath.Join(temporary, name))
		},
		Validate: func(_ context.Context, candidate Browser) error {
			if candidate.Engine != EngineChrome || candidate.Executable != "/snap/bin/google-chrome-beta" || candidate.SnapName != "google-chrome-beta" {
				t.Fatalf("Snap candidates lost browser priority: %+v", candidate)
			}
			return nil
		},
	})
	if err != nil {
		t.Fatalf("FindBrowserWith failed: %v", err)
	}
	if browser.Engine != EngineChrome || browser.Executable != "/snap/bin/google-chrome-beta" {
		t.Fatalf("expected Chrome from /snap/bin, got %+v", browser)
	}
}

func TestSnapBrowserCandidatesKeepLinuxPathsIgnoreHelpersAndPreserveEnginePriority(t *testing.T) {
	candidates := snapBrowserCandidates([]string{
		"brave",
		"chromium.chromedriver",
		"chromium.custom",
		"google-chrome-beta",
		"notes",
	})
	want := []candidate{
		{engine: EngineChrome, path: "/snap/bin/google-chrome-beta"},
		{engine: EngineChromium, path: "/snap/bin/chromium.custom"},
		{engine: EngineBrave, path: "/snap/bin/brave"},
	}
	if len(candidates) != len(want) {
		t.Fatalf("unexpected Snap candidates: %#v", candidates)
	}
	for index := range want {
		if candidates[index].engine != want[index].engine || candidates[index].path != want[index].path {
			t.Fatalf("Snap candidate %d = %#v, want %#v", index, candidates[index], want[index])
		}
	}
}

func TestFindBrowserFindsEdgeOnWindowsAfterChromeAndChromium(t *testing.T) {
	temporary := t.TempDir()
	edgePath := filepath.Join(temporary, "msedge.exe")
	bravePath := filepath.Join(temporary, "brave.exe")
	if err := os.WriteFile(edgePath, []byte("edge"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(bravePath, []byte("brave"), 0700); err != nil {
		t.Fatal(err)
	}

	browser, err := FindBrowserWith(context.Background(), FinderOptions{
		GOOS:   "windows",
		Getenv: func(string) string { return "" },
		LookPath: func(name string) (string, error) {
			switch name {
			case "msedge.exe":
				return edgePath, nil
			case "brave.exe":
				return bravePath, nil
			}
			return "", errors.New("not installed")
		},
		Stat: os.Stat,
		Validate: func(_ context.Context, browser Browser) error {
			if browser.Executable != edgePath {
				t.Fatalf("expected Edge validation, got %+v", browser)
			}
			return nil
		},
	})
	if err != nil {
		t.Fatalf("FindBrowserWith failed: %v", err)
	}
	if browser.Engine != EngineEdge || browser.Executable != edgePath {
		t.Fatalf("expected Edge fallback, got %+v", browser)
	}
}

func TestFindBrowserUsesSafariAsTheLastMacOSFallback(t *testing.T) {
	temporary := t.TempDir()
	safariPath := filepath.Join(temporary, "Safari")
	if err := os.WriteFile(safariPath, []byte("safari"), 0700); err != nil {
		t.Fatal(err)
	}

	browser, err := FindBrowserWith(context.Background(), FinderOptions{
		GOOS: "darwin",
		Getenv: func(key string) string {
			if key == "HOME" {
				return temporary
			}
			return ""
		},
		LookPath: func(string) (string, error) { return "", errors.New("not installed") },
		Stat: func(path string) (os.FileInfo, error) {
			if path == filepath.Join(temporary, "Applications", "Safari.app", "Contents", "MacOS", "Safari") {
				return os.Stat(safariPath)
			}
			return nil, os.ErrNotExist
		},
		Validate: func(_ context.Context, browser Browser) error {
			t.Fatalf("Safari must not be validated with Chromium flags: %+v", browser)
			return nil
		},
	})
	if err != nil {
		t.Fatalf("FindBrowserWith failed: %v", err)
	}
	if browser.Engine != EngineSafari {
		t.Fatalf("expected Safari fallback, got %+v", browser)
	}
}

func TestFindBrowserReturnsActionableNoBrowserError(t *testing.T) {
	_, err := FindBrowserWith(context.Background(), FinderOptions{
		GOOS:     "linux",
		Getenv:   func(string) string { return "" },
		LookPath: func(string) (string, error) { return "", os.ErrNotExist },
		Stat:     func(string) (os.FileInfo, error) { return nil, os.ErrNotExist },
		ReadDir:  func(string) ([]os.DirEntry, error) { return nil, os.ErrNotExist },
		Validate: func(context.Context, Browser) error { return nil },
	})
	if !IsNoBrowserError(err) {
		t.Fatalf("expected NoBrowserError, got %v", err)
	}
	if got := err.Error(); got == "" || !containsAll(got, "Chrome", "Chromium") {
		t.Fatalf("expected install guidance, got %q", got)
	}
}

func TestFindBrowserTraceExplainsMissingAndRejectedCandidates(t *testing.T) {
	temporary := t.TempDir()
	chromePath := filepath.Join(temporary, "chrome")
	if err := os.WriteFile(chromePath, []byte("browser"), 0700); err != nil {
		t.Fatal(err)
	}

	var trace []string
	_, err := FindBrowserWith(context.Background(), FinderOptions{
		GOOS:   "windows",
		Getenv: func(string) string { return "" },
		LookPath: func(name string) (string, error) {
			if name == "chrome.exe" {
				return chromePath, nil
			}
			return "", os.ErrNotExist
		},
		Stat: func(path string) (os.FileInfo, error) {
			if path == chromePath {
				return os.Stat(path)
			}
			return nil, os.ErrNotExist
		},
		Validate: func(context.Context, Browser) error { return errors.New("headless disabled") },
		Trace:    func(message string) { trace = append(trace, message) },
	})
	if !IsNoBrowserError(err) {
		t.Fatalf("expected NoBrowserError, got %v", err)
	}
	joined := strings.Join(trace, "\n")
	if !containsAll(joined,
		`starting automatic discovery for windows`,
		`checking chrome candidate "chrome.exe"`,
		`rejected chrome executable`,
		`headless disabled`,
		`checking edge candidate "msedge.exe"`,
		`candidate unavailable`,
		`discovery exhausted every candidate`,
	) {
		t.Fatalf("discovery trace omitted an actionable decision:\n%s", joined)
	}
}

func TestEngineForUserSelectedExecutable(t *testing.T) {
	for name, expected := range map[string]Engine{
		`C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe`: EngineEdge,
		"/opt/google/chrome/chrome":                                   EngineChrome,
		"/usr/bin/chromium":                                           EngineChromium,
		"/opt/brave.com/brave/brave-browser":                          EngineBrave,
	} {
		if got := engineForExecutable(name); got != expected {
			t.Errorf("engineForExecutable(%q) = %q, want %q", name, got, expected)
		}
	}
}

func TestSnapBrowserIdentityAndWorkspaceStayInsideUserCommon(t *testing.T) {
	for path, expected := range map[string]string{
		"/snap/bin/chromium":                "chromium",
		"/snap/bin/chromium.custom":         "chromium",
		"/snap/bin/google-chrome-beta":      "google-chrome-beta",
		"/usr/bin/chromium":                 "",
		"/snap/bin/Chromium":                "",
		"/snap/bin/../../tmp/chromium":      "",
		"/snap/bin/chromium_unsafe.command": "",
	} {
		if got := snapNameForExecutable(path); got != expected {
			t.Errorf("snapNameForExecutable(%q) = %q, want %q", path, got, expected)
		}
	}

	parent, err := browserWorkspaceParent(Browser{SnapName: "chromium"}, "/home/tester")
	if err != nil {
		t.Fatal(err)
	}
	if parent != filepath.Join("/home/tester", "snap", "chromium", "common", "figaro") {
		t.Fatalf("unexpected Snap workspace parent: %q", parent)
	}
	if _, err := browserWorkspaceParent(Browser{SnapName: "../escape"}, "/home/tester"); err == nil {
		t.Fatal("expected an unsafe Snap name to be rejected")
	}
}

func TestBrowserForExecutableDoesNotRunASeparateVersionProbe(t *testing.T) {
	path := filepath.Join(t.TempDir(), "chrome.exe")
	// A plain test file cannot be executed. Resolution succeeding therefore
	// proves manual selection does not invoke `--headless --version`.
	if err := os.WriteFile(path, []byte("not an executable"), 0600); err != nil {
		t.Fatal(err)
	}
	browser, err := BrowserForExecutable(context.Background(), path)
	if err != nil {
		t.Fatalf("resolve selected browser: %v", err)
	}
	if browser.Executable != path || browser.Engine != EngineChrome {
		t.Fatalf("unexpected selected browser: %+v", browser)
	}
}

func TestFindBrowserSupportsUngoogledChromiumFlatpak(t *testing.T) {
	temporary := t.TempDir()
	flatpakPath := filepath.Join(temporary, "flatpak")
	if err := os.WriteFile(flatpakPath, []byte("flatpak"), 0700); err != nil {
		t.Fatal(err)
	}

	browser, err := FindBrowserWith(context.Background(), FinderOptions{
		GOOS:    "linux",
		Getenv:  func(string) string { return "" },
		ReadDir: func(string) ([]os.DirEntry, error) { return nil, os.ErrNotExist },
		LookPath: func(name string) (string, error) {
			if name == "flatpak" {
				return flatpakPath, nil
			}
			return "", os.ErrNotExist
		},
		Stat: os.Stat,
		Validate: func(_ context.Context, candidate Browser) error {
			if candidate.Executable != flatpakPath {
				return errors.New("not a Flatpak launcher")
			}
			if strings.Join(candidate.Arguments, " ") != "run io.github.ungoogled_software.ungoogled_chromium" {
				return errors.New("different Flatpak browser")
			}
			return nil
		},
	})
	if err != nil {
		t.Fatalf("FindBrowserWith failed: %v", err)
	}
	if browser.Engine != EngineChromium || browser.Executable != flatpakPath {
		t.Fatalf("expected Ungoogled Chromium Flatpak, got %+v", browser)
	}
	if got := strings.Join(browser.Arguments, " "); got != "run io.github.ungoogled_software.ungoogled_chromium" {
		t.Fatalf("unexpected Flatpak arguments: %q", got)
	}
}

// This opt-in check makes it easy to verify real workstation discovery after
// adding a new browser packaging format. It is intentionally skipped in CI,
// where a browser may not be installed.
func TestFindBrowserAgainstOptInSystem(t *testing.T) {
	if os.Getenv("FIGARO_BROWSER_PDF_DISCOVERY_INTEGRATION") != "1" {
		t.Skip("set FIGARO_BROWSER_PDF_DISCOVERY_INTEGRATION=1 to probe local browser discovery")
	}
	browser, err := FindBrowser(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("discovered %s via %s %s", browser.Engine, browser.Executable, strings.Join(browser.Arguments, " "))
	if os.Getenv("FIGARO_EXPECT_UNGOOGLED_FLATPAK") == "1" {
		isExportedLauncher := filepath.Base(browser.Executable) == "io.github.ungoogled_software.ungoogled_chromium"
		isFlatpakRun := isFlatpakBrowser(browser) && strings.Join(browser.Arguments, " ") == "run io.github.ungoogled_software.ungoogled_chromium"
		if browser.Engine != EngineChromium || (!isExportedLauncher && !isFlatpakRun) {
			t.Fatalf("expected Ungoogled Chromium Flatpak, got %+v", browser)
		}
	}
}

func TestFileURLProducesCorrectEscapedFileURLs(t *testing.T) {
	if got := fileURL("/tmp/PDF Feature #1.html"); got != "file:///tmp/PDF%20Feature%20%231.html" {
		t.Fatalf("unexpected Unix URL: %q", got)
	}
	if got := fileURL("C:/Users/Figaro/PDF File.html"); got != "file:///C:/Users/Figaro/PDF%20File.html" {
		t.Fatalf("unexpected Windows URL: %q", got)
	}
}

func TestChromiumLaunchArgumentsUseLoopbackDevToolsAndEphemeralProfile(t *testing.T) {
	profile := filepath.Join(t.TempDir(), "profile")
	arguments := strings.Join(chromiumLaunchArguments(profile), "\n")
	for _, expected := range []string{
		"--headless",
		"--remote-debugging-address=127.0.0.1",
		"--remote-debugging-port=0",
		"--user-data-dir=" + profile,
		"about:blank",
	} {
		if !strings.Contains(arguments, expected) {
			t.Fatalf("expected argument %q in %q", expected, arguments)
		}
	}
	if strings.Contains(arguments, "--print-to-pdf") {
		t.Fatalf("direct CLI printing must not be used: %q", arguments)
	}
	if strings.Contains(arguments, "--version") {
		t.Fatalf("version probes must not stand in for real CDP startup: %q", arguments)
	}
	if strings.Contains(arguments, "--disable-extensions") {
		t.Fatalf("managed Chrome policies may reject forced extension disabling: %q", arguments)
	}
}

func TestBrowserLaunchArgumentsPrefixFlatpakBeforeChromiumFlags(t *testing.T) {
	profile := filepath.Join(t.TempDir(), "profile")
	arguments := browserLaunchArguments(Browser{
		Engine:     EngineChromium,
		Executable: "flatpak",
		Arguments:  []string{"run", "io.github.ungoogled_software.ungoogled_chromium"},
	}, profile)
	if got := strings.Join(arguments[:2], " "); got != "run io.github.ungoogled_software.ungoogled_chromium" {
		t.Fatalf("unexpected Flatpak command prefix: %q", got)
	}
	if !containsAll(strings.Join(arguments, "\n"), "--headless", "--remote-debugging-port=0", "--user-data-dir="+profile) {
		t.Fatalf("missing Chromium flags in %q", arguments)
	}
}

func TestRenderPDFViaCDPPrintsAnnotatedBrowserPDF(t *testing.T) {
	var (
		methods     []string
		printParams map[string]any
		mu          sync.Mutex
	)
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/devtools/browser/fake" {
			http.NotFound(writer, request)
			return
		}
		connection, err := upgrader.Upgrade(writer, request, nil)
		if err != nil {
			return
		}
		defer connection.Close()
		for {
			var command cdpMessage
			if err := connection.ReadJSON(&command); err != nil {
				return
			}
			mu.Lock()
			methods = append(methods, command.Method)
			mu.Unlock()

			respond := func(result any) bool {
				return connection.WriteJSON(cdpMessage{ID: command.ID, Result: marshalCDPParams(result)}) == nil
			}
			switch command.Method {
			case "Target.createTarget":
				if !respond(map[string]any{"targetId": "target-1"}) {
					return
				}
			case "Target.attachToTarget":
				if !respond(map[string]any{"sessionId": "session-1"}) {
					return
				}
			case "Page.navigate":
				// Send the event first to exercise the client's event queue: a
				// real browser may finish a small local document before callers
				// consume the navigation response.
				if err := connection.WriteJSON(cdpMessage{Method: "Page.loadEventFired", SessionID: "session-1"}); err != nil {
					return
				}
				if !respond(map[string]any{"frameId": "frame-1"}) {
					return
				}
			case "Page.printToPDF":
				var params map[string]any
				if err := json.Unmarshal(command.Params, &params); err != nil {
					return
				}
				mu.Lock()
				printParams = params
				mu.Unlock()
				if !respond(map[string]any{"data": base64.StdEncoding.EncodeToString([]byte("%PDF-1.7\nannotated links"))}) {
					return
				}
			case "Browser.close":
				return
			default:
				if !respond(map[string]any{}) {
					return
				}
			}
		}
	}))
	defer server.Close()

	endpoint := "ws" + strings.TrimPrefix(server.URL, "http") + "/devtools/browser/fake"
	client, err := dialDevTools(context.Background(), endpoint)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	output := filepath.Join(t.TempDir(), "document.pdf")
	if err := renderPDFViaCDP(context.Background(), client, "file:///tmp/Document%20with%20links.html", output, nil); err != nil {
		t.Fatalf("renderPDFViaCDP failed: %v", err)
	}
	if err := client.notify(context.Background(), "Browser.close", nil, ""); err != nil {
		t.Fatal(err)
	}

	pdf, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	if string(pdf) != "%PDF-1.7\nannotated links" {
		t.Fatalf("unexpected PDF bytes: %q", pdf)
	}
	mu.Lock()
	defer mu.Unlock()
	if printParams["printBackground"] != true {
		t.Fatalf("expected PDF rendering to include CSS backgrounds, got %#v", printParams["printBackground"])
	}
	for _, expected := range []string{
		"Target.createTarget",
		"Target.attachToTarget",
		"Page.enable",
		"Emulation.setEmulatedMedia",
		"Page.navigate",
		"Runtime.evaluate",
		"Page.printToPDF",
	} {
		if !containsAll(strings.Join(methods, "\n"), expected) {
			t.Fatalf("expected command %q in %v", expected, methods)
		}
	}
}

func TestDevToolsEndpointOnlyAcceptsLoopbackBrowserEndpoint(t *testing.T) {
	profile := t.TempDir()
	portFile := filepath.Join(profile, "DevToolsActivePort")
	if err := os.WriteFile(portFile, []byte("43210\n/devtools/browser/token\n"), 0600); err != nil {
		t.Fatal(err)
	}
	endpoint, err := devToolsEndpoint(profile)
	if err != nil {
		t.Fatal(err)
	}
	if endpoint != "ws://127.0.0.1:43210/devtools/browser/token" {
		t.Fatalf("unexpected endpoint: %q", endpoint)
	}
	if err := os.WriteFile(portFile, []byte("43210\n/devtools/page/not-a-browser\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := devToolsEndpoint(profile); err == nil {
		t.Fatal("expected an invalid DevTools endpoint error")
	}
}

// This is opt-in because CI and end-user development machines do not
// necessarily have a browser installed. It exercises the exact process + CDP
// path against a real Chromium-family binary when one is provided, including
// the annotation contract that makes HTML links useful in the final PDF.
func TestRenderChromiumPDFAgainstOptInBrowser(t *testing.T) {
	executable := strings.TrimSpace(os.Getenv("FIGARO_BROWSER_PDF_EXECUTABLE"))
	if executable == "" {
		t.Skip("set FIGARO_BROWSER_PDF_EXECUTABLE to run against a local Chromium-family browser")
	}
	if _, err := os.Stat(executable); err != nil {
		t.Skipf("requested browser is unavailable: %v", err)
	}

	browser := Browser{
		Engine:     EngineChromium,
		Executable: executable,
		SnapName:   snapNameForExecutable(executable),
		Arguments:  strings.Fields(os.Getenv("FIGARO_BROWSER_PDF_ARGUMENTS")),
	}
	temporary, err := CreateBrowserWorkspace(browser, "figaro-browser-integration-*")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(temporary) })
	input := filepath.Join(temporary, "interactive document.html")
	provisional := filepath.Join(temporary, "provisional document.pdf")
	output := filepath.Join(temporary, "interactive document.pdf")
	profile := filepath.Join(temporary, "profile")
	paragraphs := strings.Repeat("<p>Long body text keeps the document flowing across physical PDF pages.</p>", 120)
	document := `<!doctype html><html><head><style>
@page { size: A4; margin: 18mm; @bottom-center { content: counter(page); } }
.figaro-print-cover { page: figaro-cover; min-height: 220mm; break-after: page; display: grid; place-items: center; }
@page figaro-cover { @bottom-center { content: none; } }
nav a { display: grid; grid-template-columns: 1fr 5ch; }
</style></head><body>
<section class="figaro-print-cover"><h1>Unnumbered cover</h1></section>
<nav>
<a href="#start"><span>Start page</span><span class="figaro-print-toc-page" data-figaro-toc-index="0" aria-hidden="true">&nbsp;</span></a>
<a href="#destination"><span>Destination page</span><span class="figaro-print-toc-page" data-figaro-toc-index="1" aria-hidden="true">&nbsp;</span></a>
</nav>
<h1 id="start">Interactive PDF</h1><p><a href="#destination">Internal destination</a> and <a href="https://example.com/guide">external guide</a>.</p>` +
		paragraphs + `<h2 id="destination">Destination</h2><p><a href="#start">Return</a></p></body></html>`
	if err := os.WriteFile(input, []byte(document), 0600); err != nil {
		t.Fatal(err)
	}
	var provisionalPages []int
	if err := WithChromiumPDFSession(context.Background(), browser, profile, func(session *ChromiumPDFSession) error {
		if err := session.RequirePageMarginBoxes(); err != nil {
			return err
		}
		if err := session.Render(input, provisional); err != nil {
			return err
		}
		var err error
		provisionalPages, err = ResolveTOCPageNumbers(context.Background(), provisional, 2)
		if err != nil {
			return err
		}
		finalDocument, err := InjectTOCPageNumbers(document, provisionalPages)
		if err != nil {
			return err
		}
		if err := os.WriteFile(input, []byte(finalDocument), 0600); err != nil {
			return err
		}
		return session.Render(input, output)
	}); err != nil {
		t.Fatalf("RenderChromiumPDF failed: %v", err)
	}
	pages, err := ResolveTOCPageNumbers(context.Background(), output, 2)
	if err != nil {
		t.Fatalf("resolve generated contents destinations: %v", err)
	}
	if pages[0] != 2 || pages[1] <= pages[0] {
		t.Fatalf("unexpected physical destination pages: %v", pages)
	}
	if !slices.Equal(provisionalPages, pages) {
		t.Fatalf("TOC injection changed final pagination: provisional %v, final %v", provisionalPages, pages)
	}
	pdf, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	pdfText := string(pdf)
	if !strings.Contains(pdfText, "/URI (https://example.com/guide)") {
		t.Fatal("browser PDF omitted the external link annotation")
	}
	if !strings.Contains(pdfText, "/Dest /destination") || !strings.Contains(pdfText, "/Dest /start") {
		t.Fatal("browser PDF omitted internal link destinations")
	}
	if pageCount := strings.Count(pdfText, "/Type /Page"); pageCount < 2 {
		t.Fatalf("expected a multi-page PDF, got %d pages", pageCount)
	}
	if retained := strings.TrimSpace(os.Getenv("FIGARO_PDF_TEST_OUTPUT")); retained != "" {
		if err := os.MkdirAll(filepath.Dir(retained), 0755); err != nil {
			t.Fatalf("create retained PDF directory: %v", err)
		}
		if err := os.WriteFile(retained, pdf, 0600); err != nil {
			t.Fatalf("retain browser PDF fixture: %v", err)
		}
	}
}

func containsAll(value string, values ...string) bool {
	for _, expected := range values {
		if !strings.Contains(value, expected) {
			return false
		}
	}
	return true
}

// fakeCDPPage is a DevTools endpoint that plays one page load and lets a test
// say which requests the page makes at each step of the render. A paused
// request holds the step until the client has answered it, as a browser does.
type fakeCDPPage struct {
	t          *testing.T
	pausedAt   map[string][][2]string // command → requests as {requestId, url}
	failEnable bool

	mu       sync.Mutex
	commands []string
	answers  []string
	enabled  json.RawMessage
}

func (page *fakeCDPPage) serve(connection *websocket.Conn) {
	defer connection.Close()
	for {
		var command cdpMessage
		if err := connection.ReadJSON(&command); err != nil {
			return
		}
		page.mu.Lock()
		page.commands = append(page.commands, command.Method)
		page.mu.Unlock()
		respond := func(result any) bool {
			return connection.WriteJSON(cdpMessage{ID: command.ID, Result: marshalCDPParams(result)}) == nil
		}
		// The page asks for its resources while the command is still pending.
		for _, request := range page.pausedAt[command.Method] {
			event := cdpMessage{Method: "Fetch.requestPaused", SessionID: "session-1", Params: marshalCDPParams(map[string]any{
				"requestId": request[0],
				"request":   map[string]any{"url": request[1]},
			})}
			if err := connection.WriteJSON(event); err != nil {
				return
			}
			var answer cdpMessage
			if err := connection.ReadJSON(&answer); err != nil {
				return
			}
			var params struct {
				RequestID   string `json:"requestId"`
				ErrorReason string `json:"errorReason"`
			}
			_ = json.Unmarshal(answer.Params, &params)
			page.mu.Lock()
			page.answers = append(page.answers, strings.TrimSpace(answer.Method+" "+params.RequestID+" "+params.ErrorReason))
			page.mu.Unlock()
			if err := connection.WriteJSON(cdpMessage{ID: answer.ID, Result: marshalCDPParams(map[string]any{})}); err != nil {
				return
			}
		}
		switch command.Method {
		case "Target.createTarget":
			respond(map[string]any{"targetId": "target-1"})
		case "Target.attachToTarget":
			respond(map[string]any{"sessionId": "session-1"})
		case "Fetch.enable":
			page.mu.Lock()
			page.enabled = command.Params
			page.mu.Unlock()
			if page.failEnable {
				_ = connection.WriteJSON(cdpMessage{ID: command.ID, Error: &cdpError{Code: -32601, Message: "'Fetch.enable' wasn't found"}})
				continue
			}
			respond(map[string]any{})
		case "Page.navigate":
			if err := connection.WriteJSON(cdpMessage{Method: "Page.loadEventFired", SessionID: "session-1"}); err != nil {
				return
			}
			respond(map[string]any{"frameId": "frame-1"})
		case "Page.printToPDF":
			respond(map[string]any{"data": base64.StdEncoding.EncodeToString([]byte("%PDF-1.7\nconfined"))})
		default:
			respond(map[string]any{})
		}
	}
}

func (page *fakeCDPPage) dial(t *testing.T) *cdpClient {
	t.Helper()
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		connection, err := upgrader.Upgrade(writer, request, nil)
		if err != nil {
			return
		}
		page.serve(connection)
	}))
	t.Cleanup(server.Close)
	client, err := dialDevTools(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+"/devtools/browser/fake")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Close() })
	return client
}

// Every request the page makes is held until the policy has answered it, at
// whichever step of the render the page makes it: the load, the wait for
// fonts, or the print itself.
func TestRenderPDFViaCDPAnswersEveryPausedRequestFromThePolicy(t *testing.T) {
	const document = "file:///workspace/document.html"
	page := &fakeCDPPage{t: t, pausedAt: map[string][][2]string{
		"Page.navigate": {
			{"doc", document},
			{"image-outside", "file:///home/writer/.ssh/id_ed25519"},
			{"image-inside", "file:///vault/Notes/diagram.png"},
		},
		"Runtime.evaluate": {{"font", "file:///vault/fonts/Body.woff2"}},
		"Page.printToPDF":  {{"late", "file:///etc/passwd"}},
	}}
	client := page.dial(t)

	var asked []string
	policy := func(requestURL string) bool {
		asked = append(asked, requestURL)
		return requestURL == document || strings.HasPrefix(requestURL, "file:///vault/")
	}
	output := filepath.Join(t.TempDir(), "document.pdf")
	renderCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := renderPDFViaCDP(renderCtx, client, document, output, policy); err != nil {
		t.Fatalf("renderPDFViaCDP: %v", err)
	}
	if pdf, err := os.ReadFile(output); err != nil || string(pdf) != "%PDF-1.7\nconfined" {
		t.Fatalf("PDF = %q, %v", pdf, err)
	}

	page.mu.Lock()
	defer page.mu.Unlock()
	wantAsked := []string{
		document,
		"file:///home/writer/.ssh/id_ed25519",
		"file:///vault/Notes/diagram.png",
		"file:///vault/fonts/Body.woff2",
		"file:///etc/passwd",
	}
	if !slices.Equal(asked, wantAsked) {
		t.Fatalf("policy was asked about %v, want %v", asked, wantAsked)
	}
	wantAnswers := []string{
		"Fetch.continueRequest doc",
		"Fetch.failRequest image-outside AccessDenied",
		"Fetch.continueRequest image-inside",
		"Fetch.continueRequest font",
		"Fetch.failRequest late AccessDenied",
	}
	if !slices.Equal(page.answers, wantAnswers) {
		t.Fatalf("answers = %v, want %v", page.answers, wantAnswers)
	}
	enable, navigate := slices.Index(page.commands, "Fetch.enable"), slices.Index(page.commands, "Page.navigate")
	if enable < 0 || navigate < 0 || enable > navigate {
		t.Fatalf("commands = %v; interception must be on before the document loads", page.commands)
	}
	var enabled struct {
		Patterns []struct {
			URLPattern string `json:"urlPattern"`
		} `json:"patterns"`
	}
	if err := json.Unmarshal(page.enabled, &enabled); err != nil || len(enabled.Patterns) != 1 || enabled.Patterns[0].URLPattern != "*" {
		t.Fatalf("Fetch.enable params = %s; every URL must be intercepted", page.enabled)
	}
	if client.intercept != nil {
		t.Fatal("the request interceptor outlived the render it belonged to")
	}
}

func TestRenderPDFViaCDPDoesNotInterceptRequestsWithoutAPolicy(t *testing.T) {
	page := &fakeCDPPage{t: t}
	client := page.dial(t)
	output := filepath.Join(t.TempDir(), "document.pdf")
	if err := renderPDFViaCDP(context.Background(), client, "file:///workspace/document.html", output, nil); err != nil {
		t.Fatalf("renderPDFViaCDP: %v", err)
	}
	page.mu.Lock()
	defer page.mu.Unlock()
	if slices.Contains(page.commands, "Fetch.enable") {
		t.Fatalf("commands = %v; no policy means no interception", page.commands)
	}
}

// A browser that cannot pause requests cannot be confined. The render fails
// before the document is opened instead of printing whatever it references.
func TestRenderPDFViaCDPRefusesToPrintWhenRequestsCannotBeIntercepted(t *testing.T) {
	page := &fakeCDPPage{t: t, failEnable: true}
	client := page.dial(t)
	output := filepath.Join(t.TempDir(), "document.pdf")
	err := renderPDFViaCDP(context.Background(), client, "file:///workspace/document.html", output, func(string) bool { return true })
	if err == nil || !strings.Contains(err.Error(), "cannot confine what a PDF loads") {
		t.Fatalf("render without interception = %v; want it refused", err)
	}
	if _, statErr := os.Stat(output); !os.IsNotExist(statErr) {
		t.Fatalf("an unconfined PDF was written (stat error %v)", statErr)
	}
	page.mu.Lock()
	defer page.mu.Unlock()
	if slices.Contains(page.commands, "Page.navigate") || slices.Contains(page.commands, "Page.printToPDF") {
		t.Fatalf("commands = %v; the document must not be opened", page.commands)
	}
}

func TestChromiumPDFSessionCarriesItsResourcePolicyIntoEveryRender(t *testing.T) {
	page := &fakeCDPPage{t: t, pausedAt: map[string][][2]string{
		"Page.navigate": {{"doc", "file:///workspace/document.html"}},
	}}
	session := &ChromiumPDFSession{ctx: context.Background(), client: page.dial(t)}
	asked := 0
	session.RestrictResources(func(string) bool { asked++; return true })
	directory := t.TempDir()
	for pass := 1; pass <= 2; pass++ {
		if err := session.Render(filepath.Join(directory, "document.html"), filepath.Join(directory, fmt.Sprintf("pass-%d.pdf", pass))); err != nil {
			t.Fatalf("pass %d: %v", pass, err)
		}
	}
	if asked != 2 {
		t.Fatalf("policy asked %d time(s) over two passes, want once per pass", asked)
	}
	var missing *ChromiumPDFSession
	missing.RestrictResources(func(string) bool { return true }) // must not panic
}

// This is opt-in for the same reason as the test above. It proves the one
// thing the fake DevTools endpoint cannot: that a real Chromium pauses "file:"
// requests for images and stylesheets, including one reached through a
// symbolic link, and that a refused request stays out of the PDF.
func TestChromiumPDFSessionConfinesFileRequestsAgainstOptInBrowser(t *testing.T) {
	executable := strings.TrimSpace(os.Getenv("FIGARO_BROWSER_PDF_EXECUTABLE"))
	if executable == "" {
		t.Skip("set FIGARO_BROWSER_PDF_EXECUTABLE to run against a local Chromium-family browser")
	}
	if _, err := os.Stat(executable); err != nil {
		t.Skipf("requested browser is unavailable: %v", err)
	}
	browser := Browser{
		Engine:     EngineChromium,
		Executable: executable,
		SnapName:   snapNameForExecutable(executable),
		Arguments:  strings.Fields(os.Getenv("FIGARO_BROWSER_PDF_ARGUMENTS")),
	}
	temporary, err := CreateBrowserWorkspace(browser, "figaro-browser-confinement-*")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(temporary) })
	temporary, err = filepath.EvalSymlinks(temporary)
	if err != nil {
		t.Fatal(err)
	}
	vault := filepath.Join(temporary, "vault")
	outside := filepath.Join(temporary, "outside")
	for _, directory := range []string{vault, outside} {
		if err := os.MkdirAll(directory, 0755); err != nil {
			t.Fatal(err)
		}
	}
	writePNG := func(path string, width int, height int) {
		t.Helper()
		picture := image.NewRGBA(image.Rect(0, 0, width, height))
		for offset := 0; offset < len(picture.Pix); offset += 4 {
			picture.Pix[offset], picture.Pix[offset+1], picture.Pix[offset+2], picture.Pix[offset+3] = 200, 30, 30, 255
		}
		var encoded bytes.Buffer
		if err := png.Encode(&encoded, picture); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, encoded.Bytes(), 0644); err != nil {
			t.Fatal(err)
		}
	}
	writePNG(filepath.Join(vault, "inside.png"), 31, 17)
	writePNG(filepath.Join(outside, "secret.png"), 43, 29)
	if err := os.Symlink(filepath.Join(outside, "secret.png"), filepath.Join(vault, "escape.png")); err != nil {
		t.Skipf("symbolic links unavailable: %v", err)
	}
	// Applied, this stylesheet puts every paragraph on its own page.
	if err := os.WriteFile(filepath.Join(outside, "pages.css"), []byte("p { break-before: page; }\n"), 0644); err != nil {
		t.Fatal(err)
	}
	input := filepath.Join(vault, "document.html")
	document := `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: file:; style-src 'unsafe-inline' file:; font-src data: file:">
<link rel="stylesheet" href="../outside/pages.css"></head><body>
<p>one <img src="inside.png"></p>
<p>two <img src="../outside/secret.png"></p>
<p>three <img src="escape.png"></p>
</body></html>`
	if err := os.WriteFile(input, []byte(document), 0600); err != nil {
		t.Fatal(err)
	}

	// An embedded picture keeps its pixel size, which tells the two fixtures
	// apart from each other and from the browser's broken-image placeholder.
	embeds := func(pdf []byte, width int, height int) bool {
		return regexp.MustCompile(fmt.Sprintf(`/Width\s*%d\b`, width)).Match(pdf) &&
			regexp.MustCompile(fmt.Sprintf(`/Height\s*%d\b`, height)).Match(pdf)
	}
	pagePattern := regexp.MustCompile(`/Type\s*/Page\b`)
	render := func(name string, policy ResourcePolicy) (pdf []byte, pages int) {
		t.Helper()
		output := filepath.Join(temporary, name+".pdf")
		profile := filepath.Join(temporary, name+"-profile")
		if err := WithChromiumPDFSession(context.Background(), browser, profile, func(session *ChromiumPDFSession) error {
			session.RestrictResources(policy)
			return session.Render(input, output)
		}); err != nil {
			t.Fatalf("%s render: %v", name, err)
		}
		pdf, err := os.ReadFile(output)
		if err != nil {
			t.Fatal(err)
		}
		return pdf, len(pagePattern.FindAll(pdf, -1))
	}

	// Without a policy the document loads everything: this is what is fixed.
	openPDF, openPages := render("open", nil)
	if !embeds(openPDF, 31, 17) || !embeds(openPDF, 43, 29) || openPages < 3 {
		t.Fatalf("unconfined render: inside image %v, outside image %v, %d page(s); the fixture must load its outside files to prove anything",
			embeds(openPDF, 31, 17), embeds(openPDF, 43, 29), openPages)
	}

	var mu sync.Mutex
	decisions := map[string]bool{}
	confinedPDF, confinedPages := render("confined", func(requestURL string) bool {
		allowed := false
		if parsed, err := url.Parse(requestURL); err == nil && parsed.Scheme == "file" {
			if resolved, err := filepath.EvalSymlinks(filepath.FromSlash(parsed.Path)); err == nil {
				relative, err := filepath.Rel(vault, resolved)
				allowed = err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
			}
		}
		mu.Lock()
		decisions[requestURL] = allowed
		mu.Unlock()
		return allowed
	})
	want := map[string]bool{
		fileURL(input): true,
		fileURL(filepath.Join(vault, "inside.png")):   true,
		fileURL(filepath.Join(outside, "secret.png")): false,
		fileURL(filepath.Join(vault, "escape.png")):   false,
		fileURL(filepath.Join(outside, "pages.css")):  false,
	}
	mu.Lock()
	defer mu.Unlock()
	for requestURL, allowed := range want {
		decided, asked := decisions[requestURL]
		if !asked {
			t.Errorf("the browser never asked about %s; requests seen: %v", requestURL, decisions)
		} else if decided != allowed {
			t.Errorf("decision for %s = %v, want %v", requestURL, decided, allowed)
		}
	}
	if !embeds(confinedPDF, 31, 17) {
		t.Error("confined PDF lost the vault's own image")
	}
	if embeds(confinedPDF, 43, 29) {
		t.Error("confined PDF embeds the image from outside the vault")
	}
	if confinedPages != 1 {
		t.Errorf("confined PDF has %d page(s); the outside stylesheet was applied", confinedPages)
	}
}
