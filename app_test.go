package main

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"
)

// ============================================================================
// Test Helpers
// ============================================================================

// newTestApp creates an App backed by a temporary vault directory.
func newTestApp(t *testing.T) (*App, string) {
	t.Helper()
	tmpDir, err := os.MkdirTemp("", "figaro-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	app := NewApp(tmpDir)
	return app, tmpDir
}

// writeTestFile writes content to a file inside the test vault.
func writeTestFile(t *testing.T, vaultPath, relPath, content string) {
	t.Helper()
	abs := filepath.Join(vaultPath, relPath)
	os.MkdirAll(filepath.Dir(abs), 0755)
	if err := os.WriteFile(abs, []byte(content), 0644); err != nil {
		t.Fatalf("writeTestFile: %v", err)
	}
}

// readTestFile reads content from a file inside the test vault.
func readTestFile(t *testing.T, vaultPath, relPath string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(vaultPath, relPath))
	if err != nil {
		t.Fatalf("readTestFile: %v", err)
	}
	return string(data)
}

// ============================================================================
// 1. Path Safety Tests
// ============================================================================

func TestSafePath_Normal(t *testing.T) {
	app, _ := newTestApp(t)
	abs, err := app.safePath("notes/hello.md")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.HasSuffix(abs, filepath.Join("notes", "hello.md")) {
		t.Errorf("unexpected path: %s", abs)
	}
}

func TestSafePath_TraversalBlocked(t *testing.T) {
	app, _ := newTestApp(t)

	// Leading / is treated as vault-relative — stripped
	abs, err := app.safePath("/notes/file.md")
	if err != nil {
		t.Fatalf("unexpected error for /notes/file.md: %v", err)
	}
	if !strings.HasSuffix(abs, "notes/file.md") {
		t.Errorf("expected path ending in notes/file.md, got: %s", abs)
	}

	// Traversal must never leave the vault.
	if _, err = app.safePath("../sibling/file.md"); err == nil {
		t.Fatal("expected error for ../ path")
	}

	// Windows drive letters are blocked
	_, err = app.safePath("C:/windows/system.ini")
	if err == nil {
		t.Fatal("expected error for Windows absolute path")
	}
}

func TestSafePath_BackslashNormalized(t *testing.T) {
	app, _ := newTestApp(t)
	abs, err := app.safePath("notes\\hello.md")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(abs, filepath.Join("notes", "hello.md")) {
		t.Errorf("backslashes not normalized: %s", abs)
	}
}

// ============================================================================
// 2. File Operations Tests
// ============================================================================

func TestCreateFile(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	result, err := app.CreateFile("test.md", "# Hello\n\nWorld")
	if err != nil {
		t.Fatalf("CreateFile error: %v", err)
	}
	if !result.Success {
		t.Fatal("CreateFile returned failure")
	}

	content := readTestFile(t, vaultPath, "test.md")
	if content != "# Hello\n\nWorld" {
		t.Errorf("unexpected content: %q", content)
	}
}

func TestCreateFile_AlreadyExists(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "test.md", "existing")
	result, err := app.CreateFile("test.md", "# New")
	if err != nil {
		t.Fatalf("CreateFile error: %v", err)
	}
	if result.Success {
		t.Fatal("expected failure for existing file")
	}
}

func TestReadFile(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "test.md", "# Hello World")
	result, err := app.ReadFile("test.md")
	if err != nil {
		t.Fatalf("ReadFile error: %v", err)
	}
	if result.Content != "# Hello World" {
		t.Errorf("unexpected content: %q", result.Content)
	}
	if result.Mtime == 0 {
		t.Error("mtime should not be zero")
	}
}

func TestReadFile_NotFound(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	result, err := app.ReadFile("nonexistent.md")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != nil {
		t.Fatal("expected nil result for missing file")
	}
}

func TestReadFile_ExistingFile(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	// Create a test file
	relPath := "notes/test-file.md"
	absPath := filepath.Join(vaultPath, relPath)
	os.MkdirAll(filepath.Dir(absPath), 0755)
	os.WriteFile(absPath, []byte("# Hello World"), 0644)

	result, err := app.ReadFile(relPath)
	if err != nil {
		t.Fatalf("ReadFile error for existing file: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil result for existing file")
	}
	if result.Content != "# Hello World" {
		t.Fatalf("expected content '# Hello World', got %q", result.Content)
	}
	if result.Path != relPath {
		t.Fatalf("expected path %q, got %q", relPath, result.Path)
	}
}

func TestReadFile_PathWithSpaces(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	// Path with spaces — simulates a link like [text](my notes/file.md)
	relPath := "my notes/some file.md"
	absPath := filepath.Join(vaultPath, relPath)
	os.MkdirAll(filepath.Dir(absPath), 0755)
	os.WriteFile(absPath, []byte("# Spaced content"), 0644)

	result, err := app.ReadFile(relPath)
	if err != nil {
		t.Fatalf("ReadFile error for path with spaces: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil result for path with spaces")
	}
	if result.Content != "# Spaced content" {
		t.Fatalf("unexpected content: %q", result.Content)
	}
}

func TestReadFile_PathWithSpaces_NotFound(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	// Non-existent path with spaces
	result, err := app.ReadFile("my notes/missing.md")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != nil {
		t.Fatal("expected nil result for missing spaced path")
	}
}

func TestReadFile_Subdirectory(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	// Deep subdirectory — simulates [text](a/b/c/file.md)
	relPath := "a/b/c/deep.md"
	absPath := filepath.Join(vaultPath, relPath)
	os.MkdirAll(filepath.Dir(absPath), 0755)
	os.WriteFile(absPath, []byte("# Deep"), 0644)

	result, err := app.ReadFile(relPath)
	if err != nil {
		t.Fatalf("ReadFile error for deep path: %v", err)
	}
	if result == nil {
		t.Fatal("expected result for deep path")
	}
	if result.Content != "# Deep" {
		t.Fatalf("unexpected content: %q", result.Content)
	}
}

func TestReadFile_PathTraversal_Blocked(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	// Leading / is treated as vault-relative — just a normal vault path
	absPath := filepath.Join(vaultPath, "notes", "slash-test.md")
	os.MkdirAll(filepath.Dir(absPath), 0755)
	os.WriteFile(absPath, []byte("# Slash"), 0644)

	result, err := app.ReadFile("/notes/slash-test.md")
	if err != nil {
		t.Fatalf("unexpected error for /notes/slash-test.md: %v", err)
	}
	if result == nil || result.Content != "# Slash" {
		t.Fatal("expected content for leading-slash path")
	}

	// Traversal must not expose a sibling directory.
	siblingDir := filepath.Join(filepath.Dir(vaultPath), "sibling")
	os.MkdirAll(siblingDir, 0755)
	os.WriteFile(filepath.Join(siblingDir, "note.md"), []byte("# Sibling"), 0644)

	result, err = app.ReadFile("../sibling/note.md")
	if err == nil {
		t.Fatal("expected ../ read to be rejected")
	}
	if result != nil {
		t.Fatal("expected no result for a rejected traversal")
	}
}

func TestSafePath_SymlinkEscapeBlocked(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	outside := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(vaultPath, "escape")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}

	if _, err := app.safePath("escape/note.md"); err == nil {
		t.Fatal("expected symlink escape to be rejected")
	}
}

func TestReadFile_WikiLinkStyle(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	// Wiki links append .md: [[my-target]] → my-target.md
	relPath := "my-target.md"
	absPath := filepath.Join(vaultPath, relPath)
	os.WriteFile(absPath, []byte("# Wiki Target"), 0644)

	result, err := app.ReadFile(relPath)
	if err != nil {
		t.Fatalf("ReadFile error for wiki-style path: %v", err)
	}
	if result == nil || result.Content != "# Wiki Target" {
		t.Fatal("expected content for wiki-style path")
	}

	// Missing wiki target should return nil, not error
	result, err = app.ReadFile("no-such-wiki.md")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != nil {
		t.Fatal("expected nil for missing wiki target")
	}
}

func TestReadFile_CodeFile(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "themes/_print.css", ".note { color: rebeccapurple; }")
	result, err := app.ReadFile("themes/_print.css")
	if err != nil {
		t.Fatalf("ReadFile error: %v", err)
	}
	if result.Binary {
		t.Error("expected text CSS to be editable")
	}
	if result.Content != ".note { color: rebeccapurple; }" {
		t.Errorf("unexpected CSS content: %q", result.Content)
	}
}

func TestReadFile_BinaryFile(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	if err := os.WriteFile(filepath.Join(vaultPath, "image.png"), []byte{0x89, 'P', 'N', 'G', 0x00, 0x01}, 0644); err != nil {
		t.Fatalf("write binary file: %v", err)
	}
	result, err := app.ReadFile("image.png")
	if err != nil {
		t.Fatalf("ReadFile error: %v", err)
	}
	if !result.Binary {
		t.Error("expected binary=true for NUL-containing file")
	}
	if result.Content != "" {
		t.Error("expected empty content for binary file")
	}
}

func TestSaveFile(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "test.md", "original")
	result, err := app.SaveFile("test.md", "updated", 0)
	if err != nil {
		t.Fatalf("SaveFile error: %v", err)
	}
	if !result.Success {
		t.Fatal("SaveFile returned failure")
	}

	content := readTestFile(t, vaultPath, "test.md")
	if content != "updated" {
		t.Errorf("unexpected content: %q", content)
	}
}

func TestSaveFile_ConflictDetection(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "test.md", "original")
	// Pass a wrong expected_mtime to trigger conflict
	result, err := app.SaveFile("test.md", "updated", 0.001)
	if err != nil {
		t.Fatalf("SaveFile error: %v", err)
	}
	if result.Success {
		t.Fatal("expected conflict detection failure")
	}
	if result.Error != "File modified externally" {
		t.Errorf("unexpected error: %q", result.Error)
	}
	// Content should be unchanged
	content := readTestFile(t, vaultPath, "test.md")
	if content != "original" {
		t.Errorf("content should not have changed: %q", content)
	}
}

func TestDeletePath_File(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "test.md", "content")
	result, err := app.DeletePath("test.md")
	if err != nil {
		t.Fatalf("DeletePath error: %v", err)
	}
	if !result.Success {
		t.Fatal("DeletePath returned failure")
	}
	if _, err := os.Stat(filepath.Join(vaultPath, "test.md")); !os.IsNotExist(err) {
		t.Error("file should be deleted")
	}
}

func TestDeletePath_Directory(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "subdir/test.md", "content")
	result, err := app.DeletePath("subdir")
	if err != nil {
		t.Fatalf("DeletePath error: %v", err)
	}
	if !result.Success {
		t.Fatal("DeletePath returned failure")
	}
	if _, err := os.Stat(filepath.Join(vaultPath, "subdir")); !os.IsNotExist(err) {
		t.Error("directory should be deleted")
	}
}

func TestRenamePath(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "old.md", "content")
	result, err := app.RenamePath("old.md", "new.md")
	if err != nil {
		t.Fatalf("RenamePath error: %v", err)
	}
	if !result.Success {
		t.Fatal("RenamePath returned failure")
	}
	if _, err := os.Stat(filepath.Join(vaultPath, "old.md")); !os.IsNotExist(err) {
		t.Error("old file should be gone")
	}
	if _, err := os.Stat(filepath.Join(vaultPath, "new.md")); os.IsNotExist(err) {
		t.Error("new file should exist")
	}
}

func TestMovePath(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	os.MkdirAll(filepath.Join(vaultPath, "target"), 0755)
	writeTestFile(t, vaultPath, "source.md", "content")
	result, err := app.MovePath("source.md", "target")
	if err != nil {
		t.Fatalf("MovePath error: %v", err)
	}
	if !result.Success {
		t.Fatal("MovePath returned failure")
	}
	if _, err := os.Stat(filepath.Join(vaultPath, "target", "source.md")); os.IsNotExist(err) {
		t.Error("file should be in target directory")
	}
}

func TestCreateDirectory(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	result, err := app.CreateDirectory("newdir")
	if err != nil {
		t.Fatalf("CreateDirectory error: %v", err)
	}
	if !result.Success {
		t.Fatal("CreateDirectory returned failure")
	}
	info, err := os.Stat(filepath.Join(vaultPath, "newdir"))
	if err != nil || !info.IsDir() {
		t.Error("directory should exist")
	}
}

// ============================================================================
// 3. File Tree Tests
// ============================================================================

func TestGetFileTree(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "README.md", "# README")
	writeTestFile(t, vaultPath, "notes/hello.md", "# Hello")
	writeTestFile(t, vaultPath, ".config/hidden.txt", "hidden")
	writeTestFile(t, vaultPath, "zzz.md", "last")

	tree, err := app.GetFileTree()
	if err != nil {
		t.Fatalf("GetFileTree error: %v", err)
	}

	// Directories first, then files, both sorted alphabetically
	// Expected: notes/ (dir), README.md, zzz.md
	if len(tree) < 3 {
		t.Fatalf("expected at least 3 items, got %d", len(tree))
	}
	if tree[0].Name != "notes" || tree[0].Type != "directory" {
		t.Errorf("first item should be notes/ dir, got %s/%s", tree[0].Name, tree[0].Type)
	}
	// .config should be hidden
	for _, item := range tree {
		if strings.HasPrefix(item.Name, ".") {
			t.Errorf("hidden file %s should not appear in tree", item.Name)
		}
	}
}

// ============================================================================
// 4. Search Tests
// ============================================================================

func TestSearchFiles(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "a.md", "Hello World\nThis is a test")
	writeTestFile(t, vaultPath, "b.md", "Another file\nwithout the keyword")
	writeTestFile(t, vaultPath, "c.md", "hello world again") // lowercase

	results, err := app.SearchFiles("hello", false)
	if err != nil {
		t.Fatalf("SearchFiles error: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
}

func TestSearchFiles_CaseSensitive(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "a.md", "Hello World")
	writeTestFile(t, vaultPath, "b.md", "hello world")

	results, err := app.SearchFiles("Hello", true)
	if err != nil {
		t.Fatalf("SearchFiles error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
}

func TestSearchBacklinks(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "target.md", "# Target Note")
	writeTestFile(t, vaultPath, "source.md", "[Target](target.md)\nSome other text")
	writeTestFile(t, vaultPath, "other.md", "[Target](target.md)")

	results, err := app.SearchBacklinks("target.md")
	if err != nil {
		t.Fatalf("SearchBacklinks error: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 backlinks, got %d", len(results))
	}
}

// ============================================================================
// 5. Hashtag / Kanban Tests
// ============================================================================

func TestExtractHashtags(t *testing.T) {
	app, _ := newTestApp(t)

	tags := app.extractHashtags("This is a #todo item and #urgent too")
	if len(tags) != 2 {
		t.Fatalf("expected 2 tags, got %d: %v", len(tags), tags)
	}
}

func TestExtractHashtags_Deduplication(t *testing.T) {
	app, _ := newTestApp(t)

	tags := app.extractHashtags("#todo #todo again")
	if len(tags) != 1 {
		t.Fatalf("expected 1 unique tag, got %d: %v", len(tags), tags)
	}
}

func TestExtractHashtags_CaseInsensitive(t *testing.T) {
	app, _ := newTestApp(t)

	tags := app.extractHashtags("#Todo #TODO #todo")
	if len(tags) != 1 {
		t.Fatalf("expected 1 unique tag (case-insensitive), got %d: %v", len(tags), tags)
	}
	if tags[0] != "todo" {
		t.Errorf("expected tag 'todo', got %q", tags[0])
	}
}

func TestExtractHashtags_RequiresWhitespaceBoundaries(t *testing.T) {
	app, _ := newTestApp(t)

	content := "#start\nPlan #todo next\n[Guide](#link) #done \nPunctuation (#ignored) #kept\n#end"
	got := app.extractHashtags(content)
	want := []string{"start", "todo", "done", "kept", "end"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("extractHashtags() = %v, want %v", got, want)
	}
}

func TestHashtagEditsIgnoreMarkdownAnchors(t *testing.T) {
	content := "See [Guide](#todo) and task #todo "

	if got, want := replaceHashtag(content, "todo", "done"), "See [Guide](#todo) and task #done "; got != want {
		t.Errorf("replaceHashtag() = %q, want %q", got, want)
	}
	if got, want := removeHashtag(content, "todo"), "See [Guide](#todo) and task "; got != want {
		t.Errorf("removeHashtag() = %q, want %q", got, want)
	}
}

func TestGetKanbanColumns(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "notes.md", "#todo something\n#custom-tag value #wip")
	app.syncKanbanColumns()

	result, err := app.GetKanbanColumns()
	if err != nil {
		t.Fatalf("GetKanbanColumns error: %v", err)
	}

	columns, ok := result["columns"].([]string)
	if !ok {
		t.Fatal("columns field missing or wrong type")
	}

	// Should have: custom-tag, todo, wip, done (custom sorted alpha, then system cols in order)
	if len(columns) < 4 {
		t.Fatalf("expected at least 4 columns, got %d: %v", len(columns), columns)
	}

	// System columns last
	last := columns[len(columns)-3:]
	expectedLast := []string{"todo", "wip", "done"}
	for i, exp := range expectedLast {
		if last[i] != exp {
			t.Errorf("system column order: expected %v at position %d, got %q", expectedLast, i, last[i])
		}
	}
}

func TestGetKanbanBoard(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "tasks.md", "- [ ] Fix login bug #todo\n- [x] Deploy #done #wip\nJust a note #custom")
	app.syncKanbanColumns()

	board, err := app.GetKanbanBoard()
	if err != nil {
		t.Fatalf("GetKanbanBoard error: %v", err)
	}

	if len(board["todo"]) != 1 {
		t.Errorf("expected 1 todo card, got %d", len(board["todo"]))
	}
	if len(board["done"]) != 1 {
		t.Errorf("expected 1 done card, got %d", len(board["done"]))
	}
	// The "Just a note #custom" line should appear in custom column
	if len(board["custom"]) != 1 {
		t.Errorf("expected 1 custom card, got %d", len(board["custom"]))
	}
}

func TestGetKanbanBoard_IgnoresMarkdownAnchors(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "tasks.md", "- [ ] Read [guide](#todo) [section](#reference)\n- [ ] Actual task #todo\n")
	app.syncKanbanColumns()

	board, err := app.GetKanbanBoard()
	if err != nil {
		t.Fatalf("GetKanbanBoard error: %v", err)
	}
	if got := len(board["todo"]); got != 1 {
		t.Errorf("expected only the standalone #todo task, got %d cards: %v", got, board["todo"])
	}

	columns, err := app.GetKanbanColumns()
	if err != nil {
		t.Fatalf("GetKanbanColumns error: %v", err)
	}
	for _, column := range columns["columns"].([]string) {
		if column == "reference" {
			t.Error("markdown anchor #reference should not create a Kanban column")
		}
	}
}

func TestUpdateTaskTag(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "tasks.md", "- [ ] Fix bug #todo\n")

	result, err := app.UpdateTaskTag("tasks.md", 1, "todo", "done")
	if err != nil {
		t.Fatalf("UpdateTaskTag error: %v", err)
	}
	if !result.Success {
		t.Fatal("UpdateTaskTag returned failure")
	}

	content := readTestFile(t, vaultPath, "tasks.md")
	if !strings.Contains(content, "#done") {
		t.Errorf("expected #done, got: %q", content)
	}
	if strings.Contains(content, "#todo") {
		t.Error("old #todo tag should be gone")
	}
}

func TestRemoveTagFromTask(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "tasks.md", "- [ ] Fix bug #todo\n")

	result, err := app.RemoveTagFromTask("tasks.md", 1, "todo")
	if err != nil {
		t.Fatalf("RemoveTagFromTask error: %v", err)
	}
	if !result.Success {
		t.Fatal("RemoveTagFromTask returned failure")
	}

	content := readTestFile(t, vaultPath, "tasks.md")
	if strings.Contains(content, "#todo") {
		t.Errorf("tag should be removed: %q", content)
	}
}

func TestRenameKanbanColumn(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "notes.md", "#oldtag some note\nAnother #oldtag line")
	app.syncKanbanColumns()

	result, err := app.RenameKanbanColumn("oldtag", "newtag")
	if err != nil {
		t.Fatalf("RenameKanbanColumn error: %v", err)
	}
	success, _ := result["success"].(bool)
	if !success {
		t.Fatalf("RenameKanbanColumn failed: %v", result["error"])
	}

	content := readTestFile(t, vaultPath, "notes.md")
	if strings.Contains(content, "#oldtag") {
		t.Error("old tag should be renamed")
	}
	if !strings.Contains(content, "#newtag") {
		t.Error("new tag should exist")
	}
}

func TestDeleteKanbanColumn(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "notes.md", "#deleteme some note\nAnother #deleteme")
	app.syncKanbanColumns()

	result, err := app.DeleteKanbanColumn("deleteme")
	if err != nil {
		t.Fatalf("DeleteKanbanColumn error: %v", err)
	}
	success, _ := result["success"].(bool)
	if !success {
		t.Fatalf("DeleteKanbanColumn failed: %v", result["error"])
	}

	content := readTestFile(t, vaultPath, "notes.md")
	if strings.Contains(content, "#deleteme") {
		t.Error("tag should be deleted from all files")
	}
}

func TestDeleteKanbanColumn_SystemProtected(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	result, err := app.DeleteKanbanColumn("todo")
	if err != nil {
		t.Fatalf("DeleteKanbanColumn error: %v", err)
	}
	success, _ := result["success"].(bool)
	if success {
		t.Fatal("system column todo should not be deletable")
	}
}

func TestSetColumnColor(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "notes.md", "#mytag content")
	app.syncKanbanColumns()

	// Set color
	result, err := app.SetColumnColor("mytag", "#ff0000")
	if err != nil {
		t.Fatalf("SetColumnColor error: %v", err)
	}
	success, _ := result["success"].(bool)
	if !success {
		t.Fatal("SetColumnColor failed")
	}

	// Verify persisted
	colorsPath := filepath.Join(vaultPath, ".config", "kanban-colors.json")
	data, _ := os.ReadFile(colorsPath)
	var colors map[string]string
	json.Unmarshal(data, &colors)
	if colors["mytag"] != "#ff0000" {
		t.Errorf("color not persisted, got: %v", colors)
	}

	// Clear color
	result, err = app.SetColumnColor("mytag", "")
	if err != nil {
		t.Fatalf("SetColumnColor clear error: %v", err)
	}
	data, _ = os.ReadFile(colorsPath)
	colors = make(map[string]string)
	json.Unmarshal(data, &colors)
	if _, exists := colors["mytag"]; exists {
		t.Error("color should be cleared")
	}
}

// ============================================================================
// 6. Calendar Tests
// ============================================================================

func TestGetTodayLink(t *testing.T) {
	app, _ := newTestApp(t)
	result := app.GetTodayLink()
	if matched, _ := regexpMatch(`^\d{4}-\d{2}-\d{2}$`, result); !matched {
		t.Errorf("unexpected date format: %s", result)
	}
}

func TestNormalizeOSUsername(t *testing.T) {
	tests := map[string]struct {
		input string
		want  string
	}{
		"unix username":   {input: "ada", want: "ada"},
		"windows domain":  {input: "ACME\\ada", want: "ada"},
		"path-like value": {input: "users/alice", want: "alice"},
		"whitespace":      {input: "  grilo  ", want: "grilo"},
	}
	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			if got := normalizeOSUsername(test.input); got != test.want {
				t.Errorf("normalizeOSUsername(%q) = %q, want %q", test.input, got, test.want)
			}
		})
	}
}

func TestGetTomorrowLink(t *testing.T) {
	app, _ := newTestApp(t)
	result := app.GetTomorrowLink()
	if matched, _ := regexpMatch(`^\d{4}-\d{2}-\d{2}$`, result); !matched {
		t.Errorf("unexpected date format: %s", result)
	}
}

func TestGetYesterdayLink(t *testing.T) {
	app, _ := newTestApp(t)
	result := app.GetYesterdayLink()
	if matched, _ := regexpMatch(`^\d{4}-\d{2}-\d{2}$`, result); !matched {
		t.Errorf("unexpected date format: %s", result)
	}
}

func TestGetCalendarMonthData(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	// Create a daily note
	writeTestFile(t, vaultPath, "2025-01-15.md", "# January 15")
	// Create a note linking to a daily note
	writeTestFile(t, vaultPath, "ref.md", "[Link](2025-01-20.md)")

	data, err := app.GetCalendarMonthData(2025, 1)
	if err != nil {
		t.Fatalf("GetCalendarMonthData error: %v", err)
	}
	if data.Year != 2025 || data.Month != 1 {
		t.Errorf("wrong year/month: %d/%d", data.Year, data.Month)
	}
	if len(data.DaysWithNotes) < 1 || data.DaysWithNotes[0] != 15 {
		t.Errorf("expected day 15 in days_with_notes: %v", data.DaysWithNotes)
	}
	if len(data.DaysWithLinks) < 1 || data.DaysWithLinks[0] != 20 {
		t.Errorf("expected day 20 in days_with_links: %v", data.DaysWithLinks)
	}
	if len(data.Calendar) == 0 {
		t.Error("calendar grid should not be empty")
	}
}

func TestGetLinkedNotesForDate(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "source.md", "[Jan 15](2025-01-15.md)\nMore text")
	writeTestFile(t, vaultPath, "source2.md", "[Also](2025-01-15.md)")

	results, err := app.GetLinkedNotesForDate("2025-01-15")
	if err != nil {
		t.Fatalf("GetLinkedNotesForDate error: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 linked notes, got %d", len(results))
	}
}

// ============================================================================
// 7. Session Persistence Tests
// ============================================================================

func TestSaveAndLoadSession(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "hello.md", "# Hello")

	sessionData := map[string]interface{}{
		"openTabs": []map[string]interface{}{
			{"id": "hello.md", "type": "file", "path": "hello.md"},
		},
		"activeTabId": "hello.md",
	}

	_, err := app.SaveSession(sessionData)
	if err != nil {
		t.Fatalf("SaveSession error: %v", err)
	}

	loaded, err := app.LoadSession()
	if err != nil {
		t.Fatalf("LoadSession error: %v", err)
	}

	activeTab, _ := loaded["activeTabId"].(string)
	if activeTab != "hello.md" {
		t.Errorf("unexpected activeTab: %q", activeTab)
	}
}

func TestLoadSession_Empty(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	result, err := app.LoadSession()
	if err != nil {
		t.Fatalf("LoadSession error: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected empty map, got %v", result)
	}
	data, err := os.ReadFile(filepath.Join(vaultPath, ".config", "session.json"))
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "{}" {
		t.Fatalf("expected a default session record, got %q", data)
	}
}

func TestLoadSession_BlankFileResetsToDefaultWorkspace(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	path := filepath.Join(vaultPath, ".config", "session.json")
	if err := os.WriteFile(path, []byte(" \n\t"), 0600); err != nil {
		t.Fatal(err)
	}

	result, err := app.LoadSession()
	if err != nil {
		t.Fatalf("LoadSession should recover from a blank session: %v", err)
	}
	if len(result) != 0 {
		t.Fatalf("expected reset workspace, got %v", result)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "{}" {
		t.Fatalf("expected blank session to be replaced with {}, got %q", data)
	}
}

func TestLoadSession_InvalidJSONResetsToDefaultWorkspace(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	path := filepath.Join(vaultPath, ".config", "session.json")
	if err := os.WriteFile(path, []byte("{invalid"), 0644); err != nil {
		t.Fatalf("write invalid session: %v", err)
	}

	result, err := app.LoadSession()
	if err != nil {
		t.Fatalf("LoadSession should recover from invalid JSON: %v", err)
	}
	if len(result) != 0 {
		t.Fatalf("expected reset workspace, got %v", result)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "{}" {
		t.Fatalf("expected invalid session to be replaced with {}, got %q", data)
	}
}

func TestLoadSessionPrunesMissingTabsAndWorkspaceReferences(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "notes/real.md", "# Real")
	if err := os.MkdirAll(filepath.Join(vaultPath, "notes", "open"), 0755); err != nil {
		t.Fatal(err)
	}

	_, err := app.SaveSession(map[string]interface{}{
		"openTabs": []map[string]interface{}{
			{"id": "real.md", "type": "file", "path": "notes/real.md", "title": "Real"},
			{"id": "gone.md", "type": "file", "path": "notes/gone.md", "title": "Gone"},
			{"id": "home", "type": "home", "title": "Welcome"},
		},
		"activeTabId":      "gone.md",
		"selectedFilePath": "notes/gone.md",
		"selectedTreePath": "notes/open",
		"expandedDirs":     []string{"notes/open", "notes/gone"},
		"pinnedTabs":       []string{"real.md", "gone.md", "home"},
		"cursorStates": map[string]interface{}{
			"real.md": map[string]interface{}{"anchor": 3},
			"gone.md": map[string]interface{}{"anchor": 8},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	loaded, err := app.LoadSession()
	if err != nil {
		t.Fatal(err)
	}
	tabs, ok := loaded["openTabs"].([]interface{})
	if !ok || len(tabs) != 2 {
		t.Fatalf("expected only real and Welcome tabs, got %#v", loaded["openTabs"])
	}
	if _, exists := loaded["activeTabId"]; exists {
		t.Fatalf("missing active tab should have been removed: %#v", loaded)
	}
	if _, exists := loaded["selectedFilePath"]; exists {
		t.Fatalf("missing selected file should have been removed: %#v", loaded)
	}
	if got := loaded["selectedTreePath"]; got != "notes/open" {
		t.Fatalf("selected directory should persist as tree focus, got %#v", got)
	}
	if got := loaded["pinnedTabs"]; !reflect.DeepEqual(got, []interface{}{"real.md", "home"}) {
		t.Fatalf("unexpected cleaned pins: %#v", got)
	}
	if got := loaded["expandedDirs"]; !reflect.DeepEqual(got, []interface{}{"notes/open"}) {
		t.Fatalf("unexpected cleaned directories: %#v", got)
	}
	cursors, ok := loaded["cursorStates"].(map[string]interface{})
	if !ok || len(cursors) != 1 || cursors["real.md"] == nil {
		t.Fatalf("unexpected cleaned cursors: %#v", loaded["cursorStates"])
	}
}

func TestEnsureSettingsDefaultsCreatesAndCleansSettings(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	settingsPath := filepath.Join(vaultPath, ".config", "settings.json")
	if err := os.WriteFile(settingsPath, []byte(`{"theme":"","openTabs":[{"id":"gone.md"}],"font":42,"auto_save_minutes":5}`), 0600); err != nil {
		t.Fatal(err)
	}

	app.ensureSettingsDefaults()
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatal(err)
	}
	var settings map[string]interface{}
	if err := json.Unmarshal(data, &settings); err != nil {
		t.Fatal(err)
	}
	if settings["theme"] != "default" || settings["font"] != "inter" || settings["code_font"] != "theme-mono" || settings["link_style"] != "markdown" || settings["vim"] != false || settings["auto_save_seconds"] != float64(300) || settings["auto_commit_seconds"] != float64(0) {
		t.Fatalf("unexpected normalized settings: %#v", settings)
	}
	if _, exists := settings["openTabs"]; exists {
		t.Fatalf("legacy workspace state should not remain in settings: %#v", settings)
	}
	if _, exists := settings["auto_save_minutes"]; exists {
		t.Fatalf("legacy autosave key should not remain in settings: %#v", settings)
	}
}

func TestEnsureSettingsDefaultsCreatesDefaultsForMissingAndEmptyFiles(t *testing.T) {
	for _, empty := range []bool{false, true} {
		t.Run(map[bool]string{false: "missing", true: "empty"}[empty], func(t *testing.T) {
			app, vaultPath := newTestApp(t)
			defer os.RemoveAll(vaultPath)
			settingsPath := filepath.Join(vaultPath, ".config", "settings.json")
			if empty {
				if err := os.WriteFile(settingsPath, nil, 0600); err != nil {
					t.Fatal(err)
				}
			}

			app.ensureSettingsDefaults()
			data, err := os.ReadFile(settingsPath)
			if err != nil {
				t.Fatal(err)
			}
			var settings map[string]interface{}
			if err := json.Unmarshal(data, &settings); err != nil {
				t.Fatal(err)
			}
			if settings["theme"] != "default" || settings["auto_save_seconds"] != float64(300) || settings["auto_commit_seconds"] != float64(0) {
				t.Fatalf("unexpected defaults: %#v", settings)
			}
		})
	}
}

func TestEnsureSettingsDefaultsMigratesLegacyFigaroDarkTheme(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	settingsPath := filepath.Join(vaultPath, ".config", "settings.json")
	if err := os.WriteFile(settingsPath, []byte(`{"theme":"figaro-dark"}`), 0600); err != nil {
		t.Fatal(err)
	}

	app.ensureSettingsDefaults()
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatal(err)
	}
	var settings map[string]interface{}
	if err := json.Unmarshal(data, &settings); err != nil {
		t.Fatal(err)
	}
	if settings["theme"] != "default" {
		t.Fatalf("expected legacy Figaro Dark theme ID to migrate to default, got %#v", settings["theme"])
	}
}

func TestEnsureSettingsDefaultsRepairsInvalidLinkStyle(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	settingsPath := filepath.Join(vaultPath, ".config", "settings.json")
	if err := os.WriteFile(settingsPath, []byte(`{"link_style":"custom"}`), 0600); err != nil {
		t.Fatal(err)
	}

	app.ensureSettingsDefaults()
	loaded, err := app.LinkStyleLoad()
	if err != nil || loaded["style"] != "markdown" {
		t.Fatalf("LinkStyleLoad() = %#v, %v; want Markdown default", loaded, err)
	}
}

func TestChangeLinkStyleRewritesOnlyExistingVaultNoteLinksAndPersistsPreference(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "Welcome.md", "# Welcome")
	writeTestFile(t, vaultPath, "docs/Guide Note.md", "# Guide")
	writeTestFile(t, vaultPath, "index.md", "[Welcome](Welcome.md) [Guide](docs/Guide%20Note.md#start) [Missing](missing.md) [Web](https://example.com) `[[Welcome.md]]`")
	if err := os.Chmod(filepath.Join(vaultPath, "index.md"), 0600); err != nil {
		t.Fatal(err)
	}

	result, err := app.ChangeLinkStyle("wikilink", true)
	if err != nil || !result.Success {
		t.Fatalf("ChangeLinkStyle(wikilink) = %#v, %v", result, err)
	}
	if result.Rewritten != 2 || !reflect.DeepEqual(result.UpdatedLinks, []string{"index.md"}) {
		t.Fatalf("unexpected rewrite result: %#v", result)
	}
	wantWiki := "[[Welcome.md|Welcome]] [[docs/Guide Note.md#start|Guide]] [Missing](missing.md) [Web](https://example.com) `[[Welcome.md]]`"
	if got := readTestFile(t, vaultPath, "index.md"); got != wantWiki {
		t.Fatalf("rewritten note = %q, want %q", got, wantWiki)
	}
	if info, statErr := os.Stat(filepath.Join(vaultPath, "index.md")); statErr != nil || info.Mode().Perm() != 0600 {
		t.Fatalf("rewrite changed note permissions: %v, %v", info, statErr)
	}
	loaded, _ := app.LinkStyleLoad()
	if loaded["style"] != "wikilink" {
		t.Fatalf("saved style = %#v, want wikilink", loaded)
	}

	result, err = app.ChangeLinkStyle("markdown", true)
	if err != nil || !result.Success || result.Rewritten != 2 {
		t.Fatalf("ChangeLinkStyle(markdown) = %#v, %v", result, err)
	}
	wantMarkdown := "[Welcome](Welcome.md) [Guide](docs/Guide%20Note.md#start) [Missing](missing.md) [Web](https://example.com) `[[Welcome.md]]`"
	if got := readTestFile(t, vaultPath, "index.md"); got != wantMarkdown {
		t.Fatalf("round-trip note = %q, want %q", got, wantMarkdown)
	}
}

func TestChangeLinkStyleCanKeepExistingLinksAndRejectsInvalidStyles(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "Welcome.md", "# Welcome")
	writeTestFile(t, vaultPath, "index.md", "[Welcome](Welcome.md)")

	kept, err := app.ChangeLinkStyle("wikilink", false)
	if err != nil || !kept.Success || kept.Rewritten != 0 || len(kept.UpdatedLinks) != 0 {
		t.Fatalf("keep-existing result = %#v, %v", kept, err)
	}
	if got := readTestFile(t, vaultPath, "index.md"); got != "[Welcome](Welcome.md)" {
		t.Fatalf("keep-existing changed note to %q", got)
	}

	rejected, err := app.ChangeLinkStyle("custom", true)
	if err != nil || rejected.Success {
		t.Fatalf("invalid style result = %#v, %v", rejected, err)
	}
	if got := readTestFile(t, vaultPath, "index.md"); got != "[Welcome](Welcome.md)" {
		t.Fatalf("invalid style changed note to %q", got)
	}
}

func TestChangeLinkStyleRollsBackNotesWhenSettingsCannotBeRead(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "Welcome.md", "# Welcome")
	writeTestFile(t, vaultPath, "index.md", "[Welcome](Welcome.md)")
	settingsPath := filepath.Join(vaultPath, ".config", "settings.json")
	if err := os.Mkdir(settingsPath, 0700); err != nil {
		t.Fatal(err)
	}

	result, err := app.ChangeLinkStyle("wikilink", true)
	if err != nil || result.Success {
		t.Fatalf("expected recoverable settings failure, got %#v, %v", result, err)
	}
	if got := readTestFile(t, vaultPath, "index.md"); got != "[Welcome](Welcome.md)" {
		t.Fatalf("failed preference save left a partial rewrite: %q", got)
	}
}

func TestAutoCommitSaveReconfiguresScheduler(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	if app.history == nil {
		t.Skip("history service unavailable")
	}

	if err := app.AutoCommitSave(60); err != nil {
		t.Fatalf("enable auto-commit: %v", err)
	}
	if !app.history.SchedulerActive() {
		t.Fatal("expected AutoCommitSave to start the scheduler")
	}

	if err := app.AutoCommitSave(0); err != nil {
		t.Fatalf("disable auto-commit: %v", err)
	}
	if app.history.SchedulerActive() {
		t.Fatal("expected AutoCommitSave to stop the scheduler")
	}
}

// ============================================================================
// 8. Merge Notes Tests
// ============================================================================

func TestMergeNotes(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "master.md", "# Master\nContent")
	writeTestFile(t, vaultPath, "source1.md", "# Source 1\nMore")
	writeTestFile(t, vaultPath, "source2.md", "# Source 2\nExtra")

	result, err := app.MergeNotes([]string{"master.md", "source1.md", "source2.md"})
	if err != nil {
		t.Fatalf("MergeNotes error: %v", err)
	}
	if !result.Success {
		t.Fatalf("MergeNotes failed: %s", result.Error)
	}

	// Source files should be deleted
	if _, err := os.Stat(filepath.Join(vaultPath, "source1.md")); !os.IsNotExist(err) {
		t.Error("source1.md should be deleted")
	}
	if _, err := os.Stat(filepath.Join(vaultPath, "source2.md")); !os.IsNotExist(err) {
		t.Error("source2.md should be deleted")
	}

	// Master should contain combined content with --- separators
	content := readTestFile(t, vaultPath, "master.md")
	if !strings.Contains(content, "# Master") {
		t.Error("master content missing")
	}
	if !strings.Contains(content, "---") {
		t.Error("separator missing")
	}
	if !strings.Contains(content, "# Source 1") {
		t.Error("source 1 content missing")
	}
}

func TestMergeNotes_TooFew(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "single.md", "only one")
	result, err := app.MergeNotes([]string{"single.md"})
	if err != nil {
		t.Fatalf("MergeNotes error: %v", err)
	}
	if result.Success {
		t.Fatal("expected failure with single file")
	}
}

// ============================================================================
// 9. Theme / Settings Tests
// ============================================================================

func TestThemeSaveAndLoad(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	result, err := app.ThemeSave("zenburn")
	if err != nil {
		t.Fatalf("ThemeSave error: %v", err)
	}
	if !result.Success {
		t.Fatal("ThemeSave failed")
	}

	theme, err := app.ThemeLoad()
	if err != nil {
		t.Fatalf("ThemeLoad error: %v", err)
	}
	if theme["theme"] != "zenburn" {
		t.Errorf("expected theme 'zenburn', got %q", theme["theme"])
	}
}

func TestThemeAndFontSavePreserveAllTypographyPreferences(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	if result, err := app.ThemeSave("zenburn"); err != nil || !result.Success {
		t.Fatalf("ThemeSave failed: result=%+v err=%v", result, err)
	}
	if result, err := app.FontSave("figtree"); err != nil || !result.Success {
		t.Fatalf("FontSave failed: result=%+v err=%v", result, err)
	}
	if result, err := app.CodeFontSave("jetbrains-mono"); err != nil || !result.Success {
		t.Fatalf("CodeFontSave failed: result=%+v err=%v", result, err)
	}

	settings, err := app.ThemeLoad()
	if err != nil {
		t.Fatalf("ThemeLoad error: %v", err)
	}
	if settings["theme"] != "zenburn" {
		t.Errorf("expected theme 'zenburn', got %q", settings["theme"])
	}
	if settings["font"] != "figtree" {
		t.Errorf("expected font 'figtree', got %q", settings["font"])
	}
	if settings["codeFont"] != "jetbrains-mono" {
		t.Errorf("expected code font 'jetbrains-mono', got %q", settings["codeFont"])
	}
}

func TestPDFBrowserPreferenceLoadsAndClears(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	machinePath := machineSettingsPath(t.TempDir())
	app.configureMachineSettings(machinePath)
	path := filepath.Join(vaultPath, "browser", "chrome")
	if err := app.storePDFBrowserPath(path); err != nil {
		t.Fatalf("storePDFBrowserPath: %v", err)
	}

	loaded, err := app.PDFBrowserLoad()
	if err != nil {
		t.Fatalf("PDFBrowserLoad: %v", err)
	}
	if !loaded.Success || loaded.Path != path {
		t.Fatalf("unexpected browser preference: %+v", loaded)
	}
	cleared, err := app.PDFBrowserClear()
	if err != nil || !cleared.Success {
		t.Fatalf("PDFBrowserClear: result=%+v err=%v", cleared, err)
	}
	loaded, err = app.PDFBrowserLoad()
	if err != nil || !loaded.Success || loaded.Path != "" {
		t.Fatalf("expected automatic discovery after clear: result=%+v err=%v", loaded, err)
	}
	if !strings.HasSuffix(machinePath, filepath.Join("figaro", "machine-settings.json")) || strings.HasPrefix(machinePath, vaultPath) {
		t.Fatalf("browser preference is not machine-local: %q", machinePath)
	}
}

func TestThemeLoad_Default(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	theme, err := app.ThemeLoad()
	if err != nil {
		t.Fatalf("ThemeLoad error: %v", err)
	}
	if theme["theme"] != "default" {
		t.Errorf("expected default theme, got %q", theme["theme"])
	}
	if theme["codeFont"] != "theme-mono" {
		t.Errorf("expected default code font, got %q", theme["codeFont"])
	}
}

func TestVimSaveAndLoad(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	result, err := app.VimSave(true)
	if err != nil {
		t.Fatalf("VimSave error: %v", err)
	}
	if !result.Success {
		t.Fatal("VimSave failed")
	}

	vim, err := app.VimLoad()
	if err != nil {
		t.Fatalf("VimLoad error: %v", err)
	}
	if !vim["enabled"] {
		t.Error("vim should be enabled")
	}

	// A fresh application instance must read the same on-disk preference,
	// matching a real process restart.
	restarted := NewApp(vaultPath)
	vim, err = restarted.VimLoad()
	if err != nil {
		t.Fatalf("VimLoad after restart error: %v", err)
	}
	if !vim["enabled"] {
		t.Error("vim should remain enabled after restart")
	}

	// Toggle back to false
	result, err = restarted.VimSave(false)
	if err != nil {
		t.Fatalf("VimSave error: %v", err)
	}
	vim, err = app.VimLoad()
	if err != nil {
		t.Fatalf("VimLoad error: %v", err)
	}
	if vim["enabled"] {
		t.Error("vim should be disabled")
	}

	restartedAgain := NewApp(vaultPath)
	vim, err = restartedAgain.VimLoad()
	if err != nil {
		t.Fatalf("VimLoad after second restart error: %v", err)
	}
	if vim["enabled"] {
		t.Error("vim should remain disabled after restart")
	}
}

func TestVimLoad_Default(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	vim, err := app.VimLoad()
	if err != nil {
		t.Fatalf("VimLoad error: %v", err)
	}
	if vim["enabled"] {
		t.Error("vim should default to false")
	}
}

func TestGetThemes(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	result, err := app.GetThemes()
	if err != nil {
		t.Fatalf("GetThemes error: %v", err)
	}
	if result == nil {
		t.Fatal("GetThemes returned nil")
	}
	themes, ok := result["themes"]
	if !ok {
		t.Fatal("themes key missing")
	}
	// Should have at least the default theme
	themeList, ok := themes.([]ThemeInfo)
	if !ok {
		t.Fatal("themes is not a []ThemeInfo")
	}
	if len(themeList) == 0 {
		t.Error("expected at least 1 theme")
	}
	foundGitHubLight := false
	foundGitHubDark := false
	foundFigaroLight := false
	foundFigaroDark := false
	for _, theme := range themeList {
		if theme.ID == "github" && theme.Name == "GitHub Light" {
			foundGitHubLight = true
		}
		if theme.ID == "github-dark" && theme.Name == "GitHub Dark" {
			foundGitHubDark = true
		}
		if theme.ID == "figaro-light" && theme.Name == "Figaro Light" {
			foundFigaroLight = true
		}
		if theme.ID == "default" && theme.Name == "Figaro Dark" {
			foundFigaroDark = true
		}
	}
	if !foundGitHubLight {
		t.Error("expected GitHub Light in the available themes")
	}
	if !foundGitHubDark {
		t.Error("expected GitHub Dark in the available themes")
	}
	if !foundFigaroLight {
		t.Error("expected Figaro Light in the available themes")
	}
	if !foundFigaroDark {
		t.Error("expected Figaro Dark in the available themes")
	}
}

func TestEmbeddedThemeAssetPath(t *testing.T) {
	for _, name := range []string{"manifest.json", "default.css", "github-dark.css"} {
		got := embeddedThemeAssetPath(name)
		want := "frontend/themes/" + name
		if got != want {
			t.Errorf("embeddedThemeAssetPath(%q) = %q, want %q", name, got, want)
		}
		if _, err := assets.ReadFile(got); err != nil {
			t.Errorf("embedded theme asset %q is unavailable: %v", got, err)
		}
	}
}

func TestGetThemeCSS(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	result, err := app.GetThemeCSS("default")
	if err != nil {
		t.Fatalf("GetThemeCSS error: %v", err)
	}
	// Even if file doesn't exist, should return empty css without error
	if _, ok := result["css"]; !ok {
		t.Error("css key missing")
	}
}

func TestGetThemeCSS_GitHub(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	result, err := app.GetThemeCSS("github")
	if err != nil {
		t.Fatalf("GetThemeCSS(github) error: %v", err)
	}
	if !strings.Contains(result["css"], "--bg-color: #ffffff") {
		t.Error("expected GitHub theme CSS to be available")
	}
}

func TestGetThemeCSS_GitHubDark(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	result, err := app.GetThemeCSS("github-dark")
	if err != nil {
		t.Fatalf("GetThemeCSS(github-dark) error: %v", err)
	}
	if !strings.Contains(result["css"], "--bg-color: #0d1117") {
		t.Error("expected GitHub Dark theme CSS to be available")
	}
}

func TestGetThemeCSS_FigaroThemes(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	for themeID, expected := range map[string]string{
		"figaro-light": "--accent-color: #c12b20",
		"default":      "--accent-color: #e84d3d",
	} {
		result, err := app.GetThemeCSS(themeID)
		if err != nil {
			t.Fatalf("GetThemeCSS(%s) error: %v", themeID, err)
		}
		if !strings.Contains(result["css"], expected) {
			t.Errorf("expected %s CSS to contain %q", themeID, expected)
		}
	}

	legacyResult, err := app.GetThemeCSS("figaro-dark")
	if err != nil {
		t.Fatalf("GetThemeCSS(figaro-dark) error: %v", err)
	}
	if !strings.Contains(legacyResult["css"], "--accent-color: #e84d3d") {
		t.Error("expected legacy figaro-dark ID to resolve to Figaro Dark")
	}
}

func TestGetThemeCSSRejectsUnsafeThemeID(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	for _, themeID := range []string{"../app", "github/../../app", "github.css", ""} {
		if _, err := app.GetThemeCSS(themeID); err == nil {
			t.Fatalf("GetThemeCSS accepted unsafe theme ID %q", themeID)
		}
	}
}

// ============================================================================
// 10. Wails Context Mocking (tests without visual window shell)
// ============================================================================

// TestAppMethodsWithBackgroundContext demonstrates that all App methods
// work with context.Background() — no visual window shell needed.
// The App struct's vault-path-based methods don't use the Wails context for
// filesystem operations, so they are fully testable without a GUI.
func TestAppMethodsWithBackgroundContext(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	// Set a background context (simulating Wails startup)
	app.ctx = context.Background()

	// All these operations must work with ctx.Background()
	writeTestFile(t, vaultPath, "note.md", "# Test Note\nSome content #todo")
	app.syncKanbanColumns()

	// Read
	result, err := app.ReadFile("note.md")
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if result.Content == "" {
		t.Error("content should not be empty")
	}

	// Save
	saveResult, err := app.SaveFile("note.md", "# Updated", 0)
	if err != nil {
		t.Fatalf("SaveFile: %v", err)
	}
	if !saveResult.Success {
		t.Error("SaveFile failed")
	}

	// Tree
	tree, err := app.GetFileTree()
	if err != nil {
		t.Fatalf("GetFileTree: %v", err)
	}
	if len(tree) == 0 {
		t.Error("tree should not be empty")
	}

	// Kanban
	columnsResult, err := app.GetKanbanColumns()
	if err != nil {
		t.Fatalf("GetKanbanColumns: %v", err)
	}
	if columnsResult == nil {
		t.Error("GetKanbanColumns returned nil")
	}

	// Search
	searchResults, err := app.SearchFiles("Updated", false)
	if err != nil {
		t.Fatalf("SearchFiles: %v", err)
	}
	if len(searchResults) == 0 {
		t.Error("search should find results")
	}

	// Window operations (Minimize, Maximize, StartResize, Close) require
	// the Wails lifecycle context (provided by OnStartup), not context.Background().
	// They use log.Fatal internally and are tested via integration tests.
}

// ============================================================================
// 11. RevealInExplorer Test
// ============================================================================

func TestRevealInExplorer(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	originalStart := startFileManager
	defer func() { startFileManager = originalStart }()
	var launched *exec.Cmd
	startFileManager = func(command *exec.Cmd) error {
		launched = command
		return nil
	}

	writeTestFile(t, vaultPath, "note.md", "# Note")
	result, err := app.RevealInExplorer("note.md")
	if err != nil {
		t.Fatalf("RevealInExplorer error: %v", err)
	}
	if !result.Success {
		t.Error("RevealInExplorer should succeed")
	}
	if launched == nil {
		t.Fatal("RevealInExplorer did not start a file-manager command")
	}
	if len(launched.Args) != 2 || launched.Args[1] != vaultPath {
		t.Fatalf("expected the note's parent directory, got %q", launched.Args)
	}
}

// ============================================================================
// 12. Embed Filesystem Verification (ensures frontend loads at runtime)
// ============================================================================

func TestEmbedFS_HasIndexHTML(t *testing.T) {
	// Verify the embedded filesystem includes index.html —
	// the entry point for the frontend.
	_, err := assets.ReadFile("frontend/index.html")
	if err != nil {
		t.Fatalf("embedded assets missing index.html: %v", err)
	}
}

func TestEmbedFS_HasBridgeScript(t *testing.T) {
	// The wails-compat-bridge.js must be embedded so the frontend can
	// translate pywebview.api calls to Wails Go bindings.
	_, err := assets.ReadFile("frontend/wails-compat-bridge.js")
	if err != nil {
		t.Fatalf("embedded assets missing wails-compat-bridge.js: %v", err)
	}
}

func TestEmbedFS_HasVendoredCodeMirror(t *testing.T) {
	requireGeneratedFrontendAssets(t)
	// Verify core generated dependencies are reachable — the editor and its
	// in-document find panel won't boot without them.
	for _, path := range []string{
		"frontend/vendored/codemirror/state/index.js",
		"frontend/vendored/codemirror/search/index.js",
	} {
		if _, err := assets.ReadFile(path); err != nil {
			t.Fatalf("embedded assets missing %s: %v", path, err)
		}
	}
}

func TestEmbedFS_HasCodeLanguageRegistry(t *testing.T) {
	requireGeneratedFrontendAssets(t)
	// Code files load their parser modules lazily, so keep representative modern
	// and legacy modules in the embedded app bundle.
	for _, path := range []string{
		"frontend/vendored/codemirror/language-data/index.js",
		"frontend/vendored/codemirror/lang-go/index.js",
		"frontend/vendored/codemirror/legacy-modes/mode/shell.js",
		"frontend/vendored/lezer/go/index.js",
	} {
		if _, err := assets.ReadFile(path); err != nil {
			t.Errorf("embedded code-language asset missing %s: %v", path, err)
		}
	}
}

func requireGeneratedFrontendAssets(t *testing.T) {
	t.Helper()
	if _, err := assets.ReadFile("frontend/vendored/codemirror/state/index.js"); err != nil {
		t.Skip("generated frontend assets are absent; run make bootstrap before desktop or browser verification")
	}
}

func TestEmbedFS_HasStylesCSS(t *testing.T) {
	_, err := assets.ReadFile("frontend/styles.css")
	if err != nil {
		t.Fatalf("embedded assets missing styles.css: %v", err)
	}
}

func TestEmbedFS_HasStarterPrintStylesheet(t *testing.T) {
	data, err := assets.ReadFile(starterPrintStylesheetAsset)
	if err != nil {
		t.Fatalf("embedded assets missing starter print stylesheet: %v", err)
	}
	if !strings.Contains(string(data), ".figaro-print-cover-title") ||
		!strings.Contains(string(data), ".figaro-print-document") ||
		!strings.Contains(string(data), "--figaro-page-background") {
		t.Fatal("starter print stylesheet is missing its stable PDF hooks")
	}
}

func TestEmbedFS_HasPDFPreviewBridge(t *testing.T) {
	data, err := assets.ReadFile("frontend/pdf/preview-frame.html")
	if err != nil {
		t.Fatalf("embedded assets missing PDF preview bridge: %v", err)
	}
	content := string(data)
	if !strings.Contains(content, "figaro-pdf-preview-v1") ||
		!strings.Contains(content, "postMessage") ||
		!strings.Contains(content, "bootstrapToken") {
		t.Fatal("PDF preview bridge is missing its protocol or frame-authentication contract")
	}
}

func TestEmbedFS_HasFontFiles(t *testing.T) {
	files := []string{
		"frontend/fonts/fonts.css",
		"frontend/vendored/fonts/inter.css",
		"frontend/vendored/fonts/inter-latin.woff2",
	}
	for _, f := range files {
		_, err := assets.ReadFile(f)
		if err != nil {
			t.Errorf("embedded assets missing %s: %v", f, err)
		}
	}
}

func TestEmbedFS_HasFigtreeFont(t *testing.T) {
	// Verify at least one downloadable font was included
	_, err := assets.ReadFile("frontend/fonts/figtree-400.woff2")
	if err != nil {
		t.Errorf("Figtree font not embedded: %v", err)
	}
}

func TestEmbedFS_FontCSS_UsesCorrectPath(t *testing.T) {
	data, err := assets.ReadFile("frontend/vendored/fonts/inter.css")
	if err != nil {
		t.Fatal(err)
	}
	content := string(data)
	if strings.Contains(content, "/vendor/fonts/") {
		t.Error("inter.css still references /vendor/fonts/ — should be /vendored/fonts/")
	}
	if !strings.Contains(content, "/vendored/fonts/") {
		t.Error("inter.css missing /vendored/fonts/ path")
	}
}

func TestEmbedFS_DotFilesNotEmbedded(t *testing.T) {
	// Hidden files at root (like .gitignore, .aider*) should NOT be embedded.
	_, err := assets.ReadFile(".gitignore")
	if err == nil {
		t.Error(".gitignore should not be in embedded assets (security)")
	}
}

// ============================================================================
// 14. Wails Configuration Verification
// ============================================================================

func TestWailsJSON_IsFrameless(t *testing.T) {
	// Verify wails.json specifies frameless:true for custom window chrome.
	data, err := os.ReadFile("wails.json")
	if err != nil {
		t.Fatalf("cannot read wails.json: %v", err)
	}
	if !strings.Contains(string(data), `"frameless"`) {
		t.Error("wails.json missing 'frameless' key")
	}
	if !strings.Contains(string(data), `"frameless": true`) {
		t.Error("wails.json should set frameless: true")
	}
}

func TestWailsJSON_HasCorrectDimensions(t *testing.T) {
	data, err := os.ReadFile("wails.json")
	if err != nil {
		t.Fatalf("cannot read wails.json: %v", err)
	}
	content := string(data)
	if !strings.Contains(content, `"width": 1280`) {
		t.Error("wails.json should specify width: 1280")
	}
	if !strings.Contains(content, `"height": 800`) {
		t.Error("wails.json should specify height: 800")
	}
}

// ============================================================================
// 15. Bridge / Window Control Presence in index.html
// ============================================================================

func TestIndexHTML_LoadsBridgeScript(t *testing.T) {
	data, err := os.ReadFile("frontend/index.html")
	if err != nil {
		t.Fatalf("cannot read index.html: %v", err)
	}
	content := string(data)
	if !strings.Contains(content, "wails-compat-bridge.js") {
		t.Error("index.html must load wails-compat-bridge.js for backend connectivity")
	}
	// The Wails runtime injects window.go directly; no generated frontend binding
	// files need to be served by this application.
}

func TestIndexHTML_HasWindowControls(t *testing.T) {
	// Frameless mode requires custom min/max/close buttons in the HTML.
	data, err := os.ReadFile("frontend/index.html")
	if err != nil {
		t.Fatalf("cannot read index.html: %v", err)
	}
	content := string(data)
	for _, id := range []string{"win-minimize", "win-maximize", "win-close"} {
		if !strings.Contains(content, `id="`+id+`"`) {
			t.Errorf("index.html missing window control button: %s (required for frameless mode)", id)
		}
	}
}

func TestIndexHTML_BridgeLoadedBeforeApp(t *testing.T) {
	// The bridge script must appear BEFORE the external browser bootstrap that
	// calls initApp(). Native Wails startup is asserted separately from domReady.
	data, err := os.ReadFile("frontend/index.html")
	if err != nil {
		t.Fatalf("cannot read index.html: %v", err)
	}
	content := string(data)
	bridgeIdx := strings.Index(content, "wails-compat-bridge.js")
	bootstrapIdx := strings.Index(content, `/js/bootstrap.js`)
	if bridgeIdx < 0 || bootstrapIdx < 0 {
		t.Fatal("cannot find bridge or external bootstrap module in index.html")
	}
	if bridgeIdx > bootstrapIdx {
		t.Error("wails-compat-bridge.js must load BEFORE bootstrap.js — swap the script order in index.html")
	}
}

// ============================================================================
// 16. Window Drag — Native via --wails-draggable CSS
// ============================================================================

func TestDrag_UsesWailsDraggable(t *testing.T) {
	// The bridge must inject --wails-draggable: drag CSS for native OS-level
	// window drag. No JS event handlers needed — the Wails C++ bridge reads it.
	data, err := os.ReadFile("frontend/wails-compat-bridge.js")
	if err != nil {
		t.Fatalf("cannot read wails-compat-bridge.js: %v", err)
	}
	content := string(data)
	if !strings.Contains(content, "--wails-draggable: drag") {
		t.Error("wails-compat-bridge.js must set --wails-draggable: drag on .top-bar for native window drag")
	}
	if !strings.Contains(content, "--wails-draggable: no-drag") {
		t.Error("wails-compat-bridge.js must set --wails-draggable: no-drag on buttons/inputs to allow clicks")
	}
}

func TestDrag_NoWebkitAppRegion(t *testing.T) {
	// -webkit-app-region CSS must NOT be used — it blocks mousedown events
	// on Linux GTK and conflicts with --wails-draggable.
	for _, file := range []string{"main.go", "wails-compat-bridge.js"} {
		data, err := os.ReadFile(file)
		if err != nil {
			continue
		}
		for i, line := range strings.Split(string(data), "\n") {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "//") || strings.HasPrefix(trimmed, "*") {
				continue
			}
			if strings.Contains(line, "-webkit-app-region") {
				t.Errorf("%s:%d should NOT use -webkit-app-region — use --wails-draggable instead", file, i+1)
			}
		}
	}
}

func TestDrag_TitleBarDoubleClickTogglesMaximize(t *testing.T) {
	data, err := os.ReadFile("frontend/wails-compat-bridge.js")
	if err != nil {
		t.Fatalf("cannot read wails-compat-bridge.js: %v", err)
	}
	content := string(data)
	if !strings.Contains(content, "installTitleBarDoubleClick") || !strings.Contains(content, "dblclick") {
		t.Error("the custom title bar must handle double-click maximize/restore")
	}
	if !strings.Contains(content, "goApp.WindowMaximize()") {
		t.Error("title-bar double click must use the existing native maximize toggle")
	}
}

func TestBridge_CreatesPywebview(t *testing.T) {
	// The bridge MUST create window.pywebview (it does not pre-exist in Wails).
	data, err := os.ReadFile("frontend/wails-compat-bridge.js")
	if err != nil {
		t.Fatalf("cannot read wails-compat-bridge.js: %v", err)
	}
	content := string(data)
	if !strings.Contains(content, "window.pywebview = {}") {
		t.Error("wails-compat-bridge.js must CREATE window.pywebview — it does not pre-exist in Wails")
	}
	// Must NOT have the early-return guard that skips creation
	if strings.Contains(content, "if (!window.pywebview || !window.pywebview.api) {") &&
		strings.Contains(content, "bridge skipped") {
		t.Error("wails-compat-bridge.js must NOT have the early-exit guard — window.pywebview does not pre-exist")
	}
}

// ============================================================================
// 17. Window Resize Method Coverage
// ============================================================================

func TestWindowStartResize_AllDirections(t *testing.T) {
	// Verify WindowStartResize handles all 8 compass directions.
	// We test with nil context — it should return without panicking or calling runtime.
	app, _ := newTestApp(t)

	directions := []string{"N", "S", "E", "W", "NE", "NW", "SE", "SW", "n", "s", "e", "w"}
	for _, d := range directions {
		// Should not panic even with nil context
		func() {
			defer func() {
				if r := recover(); r != nil {
					t.Errorf("WindowStartResize(%q) panicked with nil context: %v", d, r)
				}
			}()
			app.WindowStartResize(d)
		}()
	}
}

func TestWindowMinimizeMaximizeClose_NoPanic(t *testing.T) {
	app, _ := newTestApp(t)

	funcs := []struct {
		name string
		fn   func()
	}{
		{"WindowMinimize", app.WindowMinimize},
		{"WindowMaximize", app.WindowMaximize},
		{"WindowClose", app.WindowClose},
	}

	for _, f := range funcs {
		func() {
			defer func() {
				if r := recover(); r != nil {
					t.Errorf("%s panicked: %v", f.name, r)
				}
			}()
			f.fn()
		}()
	}
}

func TestWindowSetPosition_NoPanic(t *testing.T) {
	app, _ := newTestApp(t)
	// Should not panic with nil context (just returns early)
	func() {
		defer func() {
			if r := recover(); r != nil {
				t.Errorf("WindowSetPosition panicked: %v", r)
			}
		}()
		app.WindowSetPosition(100, 200)
	}()
}

func TestWindowGetPosition_ReturnsZeroOnNilCtx(t *testing.T) {
	app, _ := newTestApp(t)
	pos := app.WindowGetPosition()
	if pos["x"] != 0 || pos["y"] != 0 {
		t.Errorf("WindowGetPosition with nil ctx should return {0,0}, got %v", pos)
	}
}

// ============================================================================
// Helpers
// ============================================================================

func regexpMatch(pattern, s string) (bool, error) {
	re, err := regexp.Compile(pattern)
	if err != nil {
		return false, err
	}
	return re.MatchString(s), nil
}

func TestAssetServer_URLPaths(t *testing.T) {
	// Wails asset server maps /font.css → embed FS path font.css (no frontend/ prefix)
	// So URLs in CSS must match the embed FS path format
	// Verify: can we read files both with and without frontend/ prefix?
	paths := []string{
		"index.html",               // root-level request
		"frontend/index.html",      // embed FS path
		"fonts/fonts.css",          // w/o prefix
		"frontend/fonts/fonts.css", // embed FS path
	}
	for _, p := range paths {
		_, err := assets.ReadFile(p)
		if err == nil {
			t.Logf("  ✓ %s accessible", p)
		} else {
			t.Logf("  ✗ %s NOT accessible", p)
		}
	}
}
