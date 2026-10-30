package desktop

import (
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// nativeBridgePathPrefix covers every Wails v3 endpoint that reaches Go:
// bound-method calls, event payloads, and streams.
const nativeBridgePathPrefix = "/wails/"

// trustedApplicationOrigins are the origins Wails v3 serves Figaro's own
// documents from: wails://localhost on macOS and Linux, and
// http://wails.localhost on Windows.
var trustedApplicationOrigins = []string{"wails://localhost", "http://wails.localhost"}

// runtimeCallPath is the endpoint that dispatches bound Go methods, and
// runtimeClientHeader is the header the Wails runtime adds to every call.
const (
	runtimeCallPath     = "/wails/runtime"
	runtimeClientHeader = "X-Wails-Client-Id"
)

// nativeBridgeRequest is the part of a webview request the bridge guard reads.
type nativeBridgeRequest struct {
	Method   string
	Path     string
	Origin   string
	Referer  string
	ClientID string
}

func nativeBridgeRequestFrom(r *http.Request) nativeBridgeRequest {
	return nativeBridgeRequest{
		Method:   r.Method,
		Path:     r.URL.Path,
		Origin:   r.Header.Get("Origin"),
		Referer:  r.Header.Get("Referer"),
		ClientID: r.Header.Get(runtimeClientHeader),
	}
}

// allowNativeBridgeRequest decides whether a request may reach Wails' bridge
// to bound Go methods. Wails documents that embedded frames can call bound
// methods over HTTP, and Figaro embeds the cross-origin Draw.io editor and a
// sandboxed PDF preview. WebKitGTK omits Origin on same-origin wails://
// requests but sends it, including "null" for sandboxed frames, on
// cross-origin ones, and it does not preflight custom-scheme requests. So an
// Origin or Referer, when present, must name Figaro's own document, and method
// calls must come from the Wails runtime, which adds its client header.
func allowNativeBridgeRequest(request nativeBridgeRequest, trusted []string) bool {
	if !strings.HasPrefix(request.Path, nativeBridgePathPrefix) {
		return true
	}
	if request.Path == runtimeCallPath && strings.TrimSpace(request.ClientID) == "" {
		return false
	}
	return trustedSource(request.Origin, trusted) && trustedSource(request.Referer, trusted)
}

// trustedSource reports whether an Origin or Referer value is absent or names
// a trusted application origin. An opaque "null" origin is never trusted.
func trustedSource(source string, trusted []string) bool {
	source = strings.TrimSpace(source)
	if source == "" {
		return true
	}
	parsed, err := url.Parse(source)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return false
	}
	candidate := strings.ToLower(parsed.Scheme + "://" + parsed.Hostname())
	for _, allowed := range trusted {
		if candidate == strings.ToLower(allowed) {
			return true
		}
	}
	return false
}

// developmentServerOrigin trusts the frontend dev server that `wails3 dev`
// announces, so live development keeps its bound-method calls.
func developmentServerOrigin() []string {
	server := strings.TrimSpace(os.Getenv("FRONTEND_DEVSERVER_URL"))
	if server == "" {
		return nil
	}
	parsed, err := url.Parse(server)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil
	}
	return []string{parsed.Scheme + "://" + parsed.Hostname()}
}

// nativeBridgeOriginGuard rejects bridge requests from foreign frames before
// Wails dispatches them to bound Go methods.
func nativeBridgeOriginGuard(next http.Handler) http.Handler {
	trusted := append(append([]string{}, trustedApplicationOrigins...), developmentServerOrigin()...)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !allowNativeBridgeRequest(nativeBridgeRequestFrom(r), trusted) {
			log.Printf("[security] Refused native bridge %s %s from origin %q referer %q", r.Method, r.URL.Path, r.Header.Get("Origin"), r.Header.Get("Referer"))
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// vaultRouteMiddleware serves vault files under /vault/ ahead of the bundled
// application assets. The handler is resolved per request because the vault
// root is opened after Wails is created.
func vaultRouteMiddleware(vault func() http.Handler) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/vault/") {
				vault().ServeHTTP(w, r)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
