package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRootScopedFileOperationsRejectEscapingSymlinks(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret.md"), []byte("outside secret"), 0644); err != nil {
		t.Fatalf("write outside fixture: %v", err)
	}
	if err := os.Symlink(outside, filepath.Join(vaultPath, "escape")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}

	if result, err := app.ReadFile("escape/secret.md"); err == nil || result != nil {
		t.Fatalf("ReadFile followed an escaping symlink: result=%+v err=%v", result, err)
	}
	if _, err := app.SaveFile("escape/new.md", "must stay in vault", 0); err == nil {
		t.Fatal("SaveFile followed an escaping symlink")
	}
	if _, err := app.CreateFile("escape/new.md", "must stay in vault"); err == nil {
		t.Fatal("CreateFile followed an escaping symlink")
	}
	if _, err := os.Stat(filepath.Join(outside, "new.md")); !os.IsNotExist(err) {
		t.Fatalf("vault operation wrote outside the root: %v", err)
	}
}

func TestRootScopedWalkSkipsEscapingSymlinks(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "inside.md", "inside marker")

	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "outside.md"), []byte("outside marker"), 0644); err != nil {
		t.Fatalf("write outside fixture: %v", err)
	}
	if err := os.Symlink(outside, filepath.Join(vaultPath, "escape")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}

	results, err := app.SearchFiles("marker", false)
	if err != nil {
		t.Fatalf("SearchFiles: %v", err)
	}
	if len(results) != 1 || results[0].Path != "inside.md" {
		t.Fatalf("search included escaped content: %+v", results)
	}

	tree, err := app.GetFileTree()
	if err != nil {
		t.Fatalf("GetFileTree: %v", err)
	}
	for _, item := range tree {
		if item.Path == "escape" {
			t.Fatal("file tree exposed an escaped symlink")
		}
	}
}

func TestMovePathRejectsDirectoryIntoOwnDescendant(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	if _, err := app.CreateDirectory("notes/archive"); err != nil {
		t.Fatalf("CreateDirectory: %v", err)
	}

	result, err := app.MovePath("notes", "notes/archive")
	if err != nil {
		t.Fatalf("MovePath returned unexpected error: %v", err)
	}
	if result.Success || result.Error == "" {
		t.Fatalf("expected self-descendant move to fail, got %+v", result)
	}
}
