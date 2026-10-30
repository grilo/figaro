package desktop

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNativeBridgeRefusesForeignFrames(t *testing.T) {
	call := func(origin, referer string) nativeBridgeRequest {
		return nativeBridgeRequest{Method: http.MethodPost, Path: "/wails/runtime", Origin: origin, Referer: referer, ClientID: "client"}
	}
	cases := []struct {
		name    string
		request nativeBridgeRequest
		want    bool
	}{
		{"Linux and macOS application document", call("wails://localhost", ""), true},
		{"Windows application document", call("http://wails.localhost", ""), true},
		{"Windows application document with port", call("http://wails.localhost:8080", ""), true},
		// WebKitGTK sends this shape: no Origin, a same-document Referer.
		{"WebKitGTK call with only a Referer", call("", "wails://localhost/"), true},
		{"call without Origin or Referer", call("", ""), true},
		{"hosted Draw.io editor frame", call("https://embed.diagrams.net", ""), false},
		{"Draw.io frame identified by Referer", call("", "https://embed.diagrams.net/?embed=1"), false},
		// Observed from a sandboxed srcdoc frame under WebKitGTK 6.0, which
		// forwards the runtime header without a CORS preflight.
		{"sandboxed PDF preview frame", call("null", "about:srcdoc"), false},
		{"look-alike host", call("wails://localhost.example", ""), false},
		{"malformed origin", call("not an origin", ""), false},
		{"call without the runtime client header", nativeBridgeRequest{Method: http.MethodPost, Path: "/wails/runtime"}, false},
		{"event payload read by the application", nativeBridgeRequest{Method: http.MethodGet, Path: "/wails/eventpayload/1", Referer: "wails://localhost/"}, true},
		{"event payload read by a foreign frame", nativeBridgeRequest{Method: http.MethodGet, Path: "/wails/eventpayload/1", Origin: "https://embed.diagrams.net"}, false},
		{"ordinary asset from a foreign frame", nativeBridgeRequest{Method: http.MethodGet, Path: "/styles.css", Origin: "https://embed.diagrams.net"}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := allowNativeBridgeRequest(tc.request, trustedApplicationOrigins); got != tc.want {
				t.Fatalf("allowNativeBridgeRequest(%+v) = %v, want %v", tc.request, got, tc.want)
			}
		})
	}
}

func TestNativeBridgeOriginGuardStopsRefusedRequestsBeforeWails(t *testing.T) {
	reached := false
	handler := nativeBridgeOriginGuard(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { reached = true }))

	request := httptest.NewRequest(http.MethodPost, "/wails/runtime", nil)
	request.Header.Set("Origin", "https://embed.diagrams.net")
	request.Header.Set(runtimeClientHeader, "client")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if reached || response.Code != http.StatusForbidden {
		t.Fatalf("foreign bridge call reached Wails=%v status=%d", reached, response.Code)
	}

	request = httptest.NewRequest(http.MethodPost, "/wails/runtime", nil)
	request.Header.Set("Referer", "wails://localhost/")
	request.Header.Set(runtimeClientHeader, "client")
	handler.ServeHTTP(httptest.NewRecorder(), request)
	if !reached {
		t.Fatal("application bridge call did not reach Wails")
	}
}

func TestVaultRouteServesVaultFilesAheadOfBundledAssets(t *testing.T) {
	var served string
	vault := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { served = "vault" })
	assets := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { served = "assets" })
	handler := vaultRouteMiddleware(func() http.Handler { return vault })(assets)

	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/vault/notes/image.png", nil))
	if served != "vault" {
		t.Fatalf("vault path served by %q", served)
	}
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/app.bundle.js", nil))
	if served != "assets" {
		t.Fatalf("application asset served by %q", served)
	}
}
