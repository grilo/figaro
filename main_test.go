package main

import (
	"testing"

	"figaro/internal/appinfo"
)

func TestEmbeddedDesktopInputsAreAvailable(t *testing.T) {
	version, err := appinfo.ProductVersion(wailsConfiguration)
	if err != nil {
		t.Fatalf("embedded Wails metadata has no usable application version: %v", err)
	}
	if version == "" {
		t.Fatal("embedded Wails metadata returned an empty application version")
	}
	if _, err := assets.ReadFile("frontend/index.html"); err != nil {
		t.Fatalf("embedded frontend has no entry point: %v", err)
	}
}
