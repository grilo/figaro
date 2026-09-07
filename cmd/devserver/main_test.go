package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDevServerAddress(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
		bad   bool
	}{
		{name: "default", want: ":34115"},
		{name: "configured", input: "34116", want: ":34116"},
		{name: "whitespace", input: " 34117 ", want: ":34117"},
		{name: "non-numeric", input: "editor", bad: true},
		{name: "out of range", input: "65536", bad: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := devServerAddress(test.input)
			if test.bad {
				if err == nil {
					t.Fatalf("devServerAddress(%q) = %q, nil; want an error", test.input, got)
				}
				return
			}
			if err != nil || got != test.want {
				t.Fatalf("devServerAddress(%q) = %q, %v; want %q, nil", test.input, got, err, test.want)
			}
		})
	}
}

func TestDevServerDisablesAssetCaching(t *testing.T) {
	handler := withDisabledAssetCache(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodGet, "/styles.css", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if got := response.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q; want %q", got, "no-store")
	}
}

func TestDevelopmentEntryUsesSourceModulesWhileProductionUsesBundle(t *testing.T) {
	root := t.TempDir()
	index := `<script type="module" src="/app.bundle.js"></script>`
	if err := os.WriteFile(filepath.Join(root, "index.html"), []byte(index), 0600); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	response := httptest.NewRecorder()
	developmentAssetHandler(root).ServeHTTP(response, request)

	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `/js/bootstrap.js`) {
		t.Fatalf("development index = %d %q, want source bootstrap", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), `/app.bundle.js`) {
		t.Fatal("development index retained the production bundle")
	}

	productionRequest := httptest.NewRequest(http.MethodGet, "/?figaro-entry=production", nil)
	productionResponse := httptest.NewRecorder()
	developmentAssetHandler(root).ServeHTTP(productionResponse, productionRequest)
	if productionResponse.Code != http.StatusOK || !strings.Contains(productionResponse.Body.String(), `/app.bundle.js`) {
		t.Fatalf("production index = %d %q, want eager bundle", productionResponse.Code, productionResponse.Body.String())
	}
	if strings.Contains(productionResponse.Body.String(), `/js/bootstrap.js`) {
		t.Fatal("production index was rewritten to the source bootstrap")
	}
}
