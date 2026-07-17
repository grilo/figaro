package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNativeDomReadyStartsAppAndNormalizesWebKitLocale(t *testing.T) {
	data, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("read native entry point: %v", err)
	}
	source := string(data)
	for _, required := range []string{
		"import('/js/app.js')",
		"module.initApp()",
		"Object.defineProperty(Intl, 'Segmenter'",
		"new Intl.Collator(navigator.language)",
		"Object.defineProperty(navigator, 'language'",
	} {
		if !strings.Contains(source, required) {
			t.Errorf("native DOM-ready startup is missing %q", required)
		}
	}
}

func TestConfigureWebKitInspectorRequiresExplicitOptIn(t *testing.T) {
	originalInspector := os.Getenv("WEBKIT_INSPECTOR_SERVER")
	t.Cleanup(func() {
		_ = os.Setenv("WEBKIT_INSPECTOR_SERVER", originalInspector)
	})

	t.Setenv("WEBKIT_INSPECTOR_SERVER", "127.0.0.1:9999")
	t.Setenv("FIGARO_WEBKIT_INSPECTOR", "")
	if got := configureWebKitInspector(); got != "" {
		t.Fatalf("inspector must be disabled by default, got %q", got)
	}
	if got := os.Getenv("WEBKIT_INSPECTOR_SERVER"); got != "" {
		t.Fatalf("default startup retained inspector address %q", got)
	}

	t.Setenv("FIGARO_WEBKIT_INSPECTOR", "true")
	if got := configureWebKitInspector(); got != "127.0.0.1:29222" {
		t.Fatalf("unexpected inspector address %q", got)
	}
	if got := os.Getenv("WEBKIT_INSPECTOR_SERVER"); got != "127.0.0.1:29222" {
		t.Fatalf("expected loopback inspector address, got %q", got)
	}
}

func TestVaultFileHandlerKeepsRequestsInsideVault(t *testing.T) {
	vault := t.TempDir()
	if err := os.WriteFile(filepath.Join(vault, "inside.txt"), []byte("inside"), 0644); err != nil {
		t.Fatalf("write vault fixture: %v", err)
	}

	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret.txt"), []byte("outside"), 0644); err != nil {
		t.Fatalf("write outside fixture: %v", err)
	}
	if err := os.Symlink(outside, filepath.Join(vault, "escape")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}

	handler := vaultFileHandler(vault)
	if closer, ok := handler.(interface{ Close() error }); ok {
		t.Cleanup(func() {
			if err := closer.Close(); err != nil {
				t.Errorf("close vault HTTP handler: %v", err)
			}
		})
	}

	inside := httptest.NewRecorder()
	handler.ServeHTTP(inside, httptest.NewRequest(http.MethodGet, "/vault/inside.txt", nil))
	if inside.Code != http.StatusOK || inside.Body.String() != "inside" {
		t.Fatalf("expected regular vault file to be served, code=%d body=%q", inside.Code, inside.Body.String())
	}

	escaped := httptest.NewRecorder()
	handler.ServeHTTP(escaped, httptest.NewRequest(http.MethodGet, "/vault/escape/secret.txt", nil))
	if escaped.Code == http.StatusOK || escaped.Body.String() == "outside" {
		t.Fatalf("vault handler served content through escaping symlink: code=%d body=%q", escaped.Code, escaped.Body.String())
	}
}
