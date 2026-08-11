package pdfexport

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

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
		GOOS:     "linux",
		Getenv:   func(string) string { return "" },
		LookPath: func(string) (string, error) { return "", os.ErrNotExist },
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

func TestSnapBrowserCandidatesIgnoreHelpersAndPreserveEnginePriority(t *testing.T) {
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
	if parent != "/home/tester/snap/chromium/common/figaro" {
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
	if err := renderPDFViaCDP(context.Background(), client, "file:///tmp/Document%20with%20links.html", output); err != nil {
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
	output := filepath.Join(temporary, "interactive document.pdf")
	profile := filepath.Join(temporary, "profile")
	paragraphs := strings.Repeat("<p>Long body text keeps the document flowing across physical PDF pages.</p>", 120)
	document := `<!doctype html><html><head><style>@page { size: A4; margin: 18mm; }</style></head><body>
<h1 id="start">Interactive PDF</h1><p><a href="#destination">Internal destination</a> and <a href="https://example.com/guide">external guide</a>.</p>` +
		paragraphs + `<h2 id="destination">Destination</h2><p><a href="#start">Return</a></p></body></html>`
	if err := os.WriteFile(input, []byte(document), 0600); err != nil {
		t.Fatal(err)
	}
	if err := RenderChromiumPDF(context.Background(), browser, input, output, profile); err != nil {
		t.Fatalf("RenderChromiumPDF failed: %v", err)
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
}

func containsAll(value string, values ...string) bool {
	for _, expected := range values {
		if !strings.Contains(value, expected) {
			return false
		}
	}
	return true
}
