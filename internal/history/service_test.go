package history

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writeHistoryFixture(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("write fixture %s: %v", path, err)
	}
}

func TestNewPreservesGitignoreAndExcludesConfig(t *testing.T) {
	dir := t.TempDir()
	writeHistoryFixture(t, filepath.Join(dir, ".gitignore"), "node_modules/\n")

	if _, err := New(dir); err != nil {
		t.Fatalf("New: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dir, ".gitignore"))
	if err != nil {
		t.Fatalf("read gitignore: %v", err)
	}
	if got := string(data); !strings.Contains(got, "node_modules/\n") || !strings.Contains(got, ".config/\n") {
		t.Fatalf("gitignore was not preserved and extended: %q", got)
	}
}

func TestServiceDoesNotCommitWithoutChanges(t *testing.T) {
	dir := t.TempDir()
	service, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	path := filepath.Join(dir, "test.md")
	writeHistoryFixture(t, path, "# test\n")
	if err := service.CommitFile("test.md"); err != nil {
		t.Fatalf("first CommitFile: %v", err)
	}
	before, err := service.GetFileHistory("test.md")
	if err != nil {
		t.Fatalf("GetFileHistory: %v", err)
	}
	if err := service.CommitFile("test.md"); err != nil {
		t.Fatalf("second CommitFile: %v", err)
	}
	after, err := service.GetFileHistory("test.md")
	if err != nil {
		t.Fatalf("GetFileHistory after second commit: %v", err)
	}
	if len(after) != len(before) {
		t.Fatalf("CommitFile without changes created a commit: %d -> %d", len(before), len(after))
	}
}

func TestAutoCommitInterval(t *testing.T) {
	dir := t.TempDir()
	service, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	path := filepath.Join(dir, "test.md")
	writeHistoryFixture(t, path, "# initial\n")
	if err := service.CommitFile("test.md"); err != nil {
		t.Fatalf("initial CommitFile: %v", err)
	}
	before, err := service.GetFileHistory("test.md")
	if err != nil {
		t.Fatalf("history before timer: %v", err)
	}

	service.StartAutoCommit(1)
	t.Cleanup(func() { service.StartAutoCommit(0) })
	writeHistoryFixture(t, path, "# modified\n")

	time.Sleep(250 * time.Millisecond)
	early, err := service.GetFileHistory("test.md")
	if err != nil {
		t.Fatalf("early history: %v", err)
	}
	if len(early) != len(before) {
		t.Fatalf("auto-commit ran before its one-second interval: %d -> %d", len(before), len(early))
	}

	time.Sleep(1000 * time.Millisecond)
	after, err := service.GetFileHistory("test.md")
	if err != nil {
		t.Fatalf("history after timer: %v", err)
	}
	if len(after) < len(before)+1 {
		t.Fatalf("timer did not commit a modified file: %d -> %d", len(before), len(after))
	}
}
