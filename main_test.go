package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
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

func TestProductionBuildRejectsMissingStartupBundleAndWorkers(t *testing.T) {
	guard, err := os.ReadFile("assets_production.go")
	if err != nil {
		t.Fatal(err)
	}
	fixture := t.TempDir()
	write := func(name, content string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(fixture, name), []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write("go.mod", "module figaro-asset-guard-test\n\ngo 1.26.0\n")
	write("main.go", "package main\nfunc main() {}\n")
	write("assets_production.go", string(guard))
	if err := os.Mkdir(filepath.Join(fixture, "frontend"), 0700); err != nil {
		t.Fatal(err)
	}
	list := func(production bool) (string, error) {
		args := []string{"list"}
		if production {
			args = append(args, "-tags=production")
		}
		cmd := exec.Command("go", append(args, ".")...)
		cmd.Dir = fixture
		cmd.Env = append(os.Environ(), "GOWORK=off", "GOFLAGS=")
		output, err := cmd.CombinedOutput()
		return string(output), err
	}
	if output, err := list(false); err != nil {
		t.Fatalf("source-only backend builds must not require generated assets: %v\n%s", err, output)
	}
	files := []string{"app.bundle.js", "writing.worker.js", "spelling.worker.js", "decisions.worker.js", "activity.worker.js"}
	for _, name := range files {
		write("frontend/"+name, "// generated fixture\n")
	}
	if output, err := list(true); err != nil {
		t.Fatalf("prepared production build rejected: %v\n%s", err, output)
	}
	for _, name := range files {
		t.Run(name, func(t *testing.T) {
			if err := os.Remove(filepath.Join(fixture, "frontend", name)); err != nil {
				t.Fatal(err)
			}
			defer write("frontend/"+name, "// generated fixture\n")
			output, err := list(true)
			if err == nil || !strings.Contains(output, name) || !strings.Contains(output, "no matching files found") {
				t.Fatalf("production build must reject missing %s: err=%v\n%s", name, err, output)
			}
		})
	}
}
