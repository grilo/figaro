package repositorycheck

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
)

func TestDesktopApplicationStaysBehindThinRootLauncher(t *testing.T) {
	rootSources, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatalf("list root Go sources: %v", err)
	}
	sort.Strings(rootSources)
	if want := []string{"main.go", "main_test.go"}; !reflect.DeepEqual(rootSources, want) {
		t.Fatalf("root Go sources = %v, want only the launcher and its embed contract %v", rootSources, want)
	}

	launcher, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("read root launcher: %v", err)
	}
	launcherSource := string(launcher)
	for _, required := range []string{
		`"figaro/internal/desktop"`,
		"//go:embed all:frontend",
		"desktop.Run(assets, wailsConfiguration, os.Args[1:])",
	} {
		if !strings.Contains(launcherSource, required) {
			t.Errorf("root launcher is missing %q", required)
		}
	}

	for _, source := range []string{
		"internal/desktop/run.go",
		"internal/desktop/app.go",
		"internal/desktop/app_documents.go",
		"internal/desktop/app_vault_mutations.go",
		"internal/desktop/app_external_import.go",
		"internal/desktop/app_search.go",
		"internal/desktop/app_kanban.go",
		"internal/desktop/app_calendar.go",
		"internal/desktop/app_session.go",
		"internal/desktop/app_settings.go",
		"internal/desktop/app_window.go",
	} {
		if _, err := os.Stat(source); err != nil {
			t.Errorf("desktop capability source %s is unavailable: %v", source, err)
		}
	}
}

func TestNativeBackendUsesDesktopBindingNamespace(t *testing.T) {
	source, err := os.ReadFile("frontend/js/backend.js")
	if err != nil {
		t.Fatalf("read native backend adapter: %v", err)
	}
	content := string(source)
	if !strings.Contains(content, "window.go?.desktop?.App") {
		t.Fatal("native backend adapter does not use the internal desktop package binding")
	}
	if strings.Contains(content, "window.go?.main?.App") {
		t.Fatal("native backend adapter still references the former root package binding")
	}
}
