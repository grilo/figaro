package main

import (
	"os"
	"path/filepath"
	"strings"
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

func TestCopyPathCopiesFilesAndFoldersWithoutChangingSources(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "notes/report.md", "source note")
	writeTestFile(t, vaultPath, "Assets/nested/image.txt", "asset")
	if _, err := app.CreateDirectory("Archive"); err != nil {
		t.Fatal(err)
	}

	fileResult, err := app.CopyPath("notes/report.md", "Archive")
	if err != nil || !fileResult.Success || fileResult.Path != "Archive/report.md" {
		t.Fatalf("unexpected file copy: result=%+v err=%v", fileResult, err)
	}
	folderResult, err := app.CopyPath("Assets", "Archive")
	if err != nil || !folderResult.Success || folderResult.Path != "Archive/Assets" {
		t.Fatalf("unexpected folder copy: result=%+v err=%v", folderResult, err)
	}

	for path, want := range map[string]string{
		"notes/report.md":                 "source note",
		"Archive/report.md":               "source note",
		"Assets/nested/image.txt":         "asset",
		"Archive/Assets/nested/image.txt": "asset",
	} {
		if got := readTestFile(t, vaultPath, path); got != want {
			t.Fatalf("unexpected content for %s: %q", path, got)
		}
	}
}

func TestCopyPathUsesUniqueSiblingNamesAtTheOriginalLocation(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "Projects/inside.md", "folder copy")
	writeTestFile(t, vaultPath, "report.md", "file copy")
	writeTestFile(t, vaultPath, "diagram.drawio.svg", "diagram copy")

	for _, expected := range []string{"Projects copy", "Projects copy 2"} {
		result, err := app.CopyPath("Projects", ".")
		if err != nil || !result.Success || result.Path != expected {
			t.Fatalf("expected folder copy %q, got result=%+v err=%v", expected, result, err)
		}
		if got := readTestFile(t, vaultPath, filepath.Join(expected, "inside.md")); got != "folder copy" {
			t.Fatalf("unexpected copied folder content: %q", got)
		}
	}
	for _, expected := range []string{"report copy.md", "report copy 2.md"} {
		result, err := app.CopyPath("report.md", ".")
		if err != nil || !result.Success || result.Path != expected {
			t.Fatalf("expected file copy %q, got result=%+v err=%v", expected, result, err)
		}
	}
	diagramResult, err := app.CopyPath("diagram.drawio.svg", ".")
	if err != nil || !diagramResult.Success || diagramResult.Path != "diagram copy.drawio.svg" {
		t.Fatalf("Draw.io suffix was not preserved: result=%+v err=%v", diagramResult, err)
	}
}

func TestCopyPathRewritesLinksOnlyInsideTheCopiedMarkdownTree(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "docs/guide.md", "# Guide\n")
	sourceContent := "[Nearby](./guide.md)\n" +
		"[Outside](../outside.md#section)\n" +
		"[Vault internal](docs/guide.md)\n" +
		"[[docs/guide|Guide]]\n"
	writeTestFile(t, vaultPath, "docs/readme.md", sourceContent)
	writeTestFile(t, vaultPath, "outside.md", "[Original](docs/readme.md)\n[[docs/readme]]\n")
	if _, err := app.CreateDirectory("archive"); err != nil {
		t.Fatal(err)
	}

	result, err := app.CopyPath("docs", "archive")
	if err != nil || !result.Success || result.Path != "archive/docs" {
		t.Fatalf("unexpected linked folder copy: result=%+v err=%v", result, err)
	}
	if len(result.UpdatedLinks) != 1 || result.UpdatedLinks[0] != "archive/docs/readme.md" {
		t.Fatalf("unexpected rewritten copied paths: %+v", result.UpdatedLinks)
	}
	wantCopy := "[Nearby](./guide.md)\n" +
		"[Outside](../../outside.md#section)\n" +
		"[Vault internal](archive/docs/guide.md)\n" +
		"[[archive/docs/guide|Guide]]\n"
	if got := readTestFile(t, vaultPath, "archive/docs/readme.md"); got != wantCopy {
		t.Fatalf("copied Markdown links were not preserved:\n%s", got)
	}
	if got := readTestFile(t, vaultPath, "docs/readme.md"); got != sourceContent {
		t.Fatalf("copy changed source Markdown: %q", got)
	}
	if got := readTestFile(t, vaultPath, "outside.md"); got != "[Original](docs/readme.md)\n[[docs/readme]]\n" {
		t.Fatalf("copy rewrote an incoming source link: %q", got)
	}
}

func TestCopyPathRejectsFolderIntoItselfOrDescendant(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "notes/archive/kept.md", "kept")

	for _, destination := range []string{"notes", "notes/archive"} {
		result, err := app.CopyPath("notes", destination)
		if err != nil {
			t.Fatalf("CopyPath(%q) returned unexpected error: %v", destination, err)
		}
		if result.Success || result.Error != recursiveCopyError {
			t.Fatalf("expected recursive copy refusal for %q, got %+v", destination, result)
		}
	}
	if got := readTestFile(t, vaultPath, "notes/archive/kept.md"); got != "kept" {
		t.Fatalf("recursive refusal changed source content: %q", got)
	}
	if _, err := os.Stat(filepath.Join(vaultPath, "notes", "notes")); !os.IsNotExist(err) {
		t.Fatalf("recursive refusal created a partial destination: %v", err)
	}
}

func TestCopyPathRejectsNestedSymlinksAndRemovesPartialCopy(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "Assets/real.txt", "real")
	if _, err := app.CreateDirectory("Imported"); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("real.txt", filepath.Join(vaultPath, "Assets", "linked.txt")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}

	result, err := app.CopyPath("Assets", "Imported")
	if err != nil {
		t.Fatalf("CopyPath returned unexpected error: %v", err)
	}
	if result.Success || !strings.Contains(strings.ToLower(result.Error), "symbolic link") {
		t.Fatalf("expected nested symlink refusal, got %+v", result)
	}
	if _, err := os.Stat(filepath.Join(vaultPath, "Imported", "Assets")); !os.IsNotExist(err) {
		t.Fatalf("failed copy left a partial folder: %v", err)
	}
}

func TestCopyPathHelperDoesNotRemoveADestinationItDidNotCreate(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "source.md", "source")
	writeTestFile(t, vaultPath, "destination.md", "created elsewhere")
	root, err := app.openVaultRoot()
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()

	created, copyErr := copyVaultTree(root, "source.md", "destination.md")
	if copyErr == nil || created {
		t.Fatalf("expected an exclusive-create collision, got created=%v err=%v", created, copyErr)
	}
	if got := readTestFile(t, vaultPath, "destination.md"); got != "created elsewhere" {
		t.Fatalf("copy collision changed another writer's destination: %q", got)
	}
}

func TestCopyExternalPathsCopiesFilesAndFoldersWithoutRemovingSources(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	if _, err := app.CreateDirectory("Imported"); err != nil {
		t.Fatal(err)
	}
	sourceRoot := t.TempDir()
	fileSource := filepath.Join(sourceRoot, "outside.md")
	if err := os.WriteFile(fileSource, []byte("outside note"), 0644); err != nil {
		t.Fatal(err)
	}
	folderSource := filepath.Join(sourceRoot, "Assets")
	if err := os.MkdirAll(filepath.Join(folderSource, "nested"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folderSource, "nested", "image.txt"), []byte("asset"), 0644); err != nil {
		t.Fatal(err)
	}

	result, err := app.CopyExternalPaths([]string{fileSource, folderSource}, "Imported", false)
	if err != nil {
		t.Fatalf("CopyExternalPaths: %v", err)
	}
	if !result.Success || len(result.Paths) != 2 {
		t.Fatalf("unexpected copy result: %+v", result)
	}
	if got := readTestFile(t, vaultPath, "Imported/outside.md"); got != "outside note" {
		t.Fatalf("unexpected copied file: %q", got)
	}
	if got := readTestFile(t, vaultPath, "Imported/Assets/nested/image.txt"); got != "asset" {
		t.Fatalf("unexpected copied folder content: %q", got)
	}
	if got, err := os.ReadFile(fileSource); err != nil || string(got) != "outside note" {
		t.Fatalf("source file was changed or removed: content=%q err=%v", got, err)
	}
	if got, err := os.ReadFile(filepath.Join(folderSource, "nested", "image.txt")); err != nil || string(got) != "asset" {
		t.Fatalf("source folder was changed or removed: content=%q err=%v", got, err)
	}
}

func TestCopyExternalPathsPreflightsConflictsBeforeWritingAnything(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "Imported/existing.md", "vault version")
	sourceRoot := t.TempDir()
	newSource := filepath.Join(sourceRoot, "new.md")
	existingSource := filepath.Join(sourceRoot, "existing.md")
	if err := os.WriteFile(newSource, []byte("new"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(existingSource, []byte("outside version"), 0644); err != nil {
		t.Fatal(err)
	}

	result, err := app.CopyExternalPaths([]string{newSource, existingSource}, "Imported", false)
	if err != nil {
		t.Fatalf("CopyExternalPaths: %v", err)
	}
	if result.Success || len(result.Conflicts) != 1 || result.Conflicts[0] != "Imported/existing.md" {
		t.Fatalf("expected a collision failure, got %+v", result)
	}
	if _, err := os.Stat(filepath.Join(vaultPath, "Imported", "new.md")); !os.IsNotExist(err) {
		t.Fatalf("preflight failure left a partial copy: %v", err)
	}
	if got := readTestFile(t, vaultPath, "Imported/existing.md"); got != "vault version" {
		t.Fatalf("existing vault file was overwritten: %q", got)
	}
}

func TestCopyExternalPathsReplacesOnlyAfterConfirmation(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "Imported/report.md", "original vault version")
	sourceRoot := t.TempDir()
	source := filepath.Join(sourceRoot, "report.md")
	if err := os.WriteFile(source, []byte("new outside version"), 0644); err != nil {
		t.Fatal(err)
	}

	preflight, err := app.CopyExternalPaths([]string{source}, "Imported", false)
	if err != nil {
		t.Fatalf("CopyExternalPaths preflight: %v", err)
	}
	if preflight.Success || len(preflight.Conflicts) != 1 {
		t.Fatalf("expected replacement confirmation requirement, got %+v", preflight)
	}
	if got := readTestFile(t, vaultPath, "Imported/report.md"); got != "original vault version" {
		t.Fatalf("preflight changed the destination: %q", got)
	}

	replaced, err := app.CopyExternalPaths([]string{source}, "Imported", true)
	if err != nil {
		t.Fatalf("CopyExternalPaths replacement: %v", err)
	}
	if !replaced.Success || len(replaced.Paths) != 1 || replaced.Paths[0] != "Imported/report.md" {
		t.Fatalf("unexpected replacement result: %+v", replaced)
	}
	if got := readTestFile(t, vaultPath, "Imported/report.md"); got != "new outside version" {
		t.Fatalf("destination was not replaced: %q", got)
	}
	if got, err := os.ReadFile(source); err != nil || string(got) != "new outside version" {
		t.Fatalf("replacement changed the external source: content=%q err=%v", got, err)
	}
	entries, err := os.ReadDir(filepath.Join(vaultPath, ".config"))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".file-drop-backup-") {
			t.Fatalf("successful replacement left backup directory %q", entry.Name())
		}
	}
}

func TestCopyExternalPathsReplacesAConflictingFolderAsOneItem(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "Imported/Assets/old.txt", "old")
	sourceRoot := t.TempDir()
	source := filepath.Join(sourceRoot, "Assets")
	if err := os.MkdirAll(source, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "new.txt"), []byte("new"), 0644); err != nil {
		t.Fatal(err)
	}

	preflight, err := app.CopyExternalPaths([]string{source}, "Imported", false)
	if err != nil || preflight.Success || len(preflight.Conflicts) != 1 {
		t.Fatalf("unexpected folder preflight: result=%+v err=%v", preflight, err)
	}
	replaced, err := app.CopyExternalPaths([]string{source}, "Imported", true)
	if err != nil || !replaced.Success {
		t.Fatalf("folder replacement failed: result=%+v err=%v", replaced, err)
	}
	if got := readTestFile(t, vaultPath, "Imported/Assets/new.txt"); got != "new" {
		t.Fatalf("unexpected replacement content: %q", got)
	}
	if _, err := os.Stat(filepath.Join(vaultPath, "Imported", "Assets", "old.txt")); !os.IsNotExist(err) {
		t.Fatalf("folder replacement merged instead of replacing: %v", err)
	}
}

func TestCopyExternalPathsRejectsSymlinks(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	sourceRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(sourceRoot, "real.md"), []byte("real"), 0644); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(sourceRoot, "linked.md")
	if err := os.Symlink(filepath.Join(sourceRoot, "real.md"), link); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}

	result, err := app.CopyExternalPaths([]string{link}, ".", false)
	if err != nil {
		t.Fatalf("CopyExternalPaths: %v", err)
	}
	if result.Success || !strings.Contains(strings.ToLower(result.Error), "symbolic link") {
		t.Fatalf("expected symlink rejection, got %+v", result)
	}
}
