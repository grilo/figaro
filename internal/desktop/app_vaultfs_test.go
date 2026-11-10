package desktop

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"figaro/internal/mutations"
)

const tinyPNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

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

func TestSaveClipboardImageCreatesRelativeMarkdownAndNeverOverwrites(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "notes/capture.md", "Before screenshot\n")

	first, err := app.SaveClipboardImage("notes/capture.md", "image/png", tinyPNGBase64)
	if err != nil {
		t.Fatalf("SaveClipboardImage first paste: %v", err)
	}
	if !first.Success || first.Path != "notes/image1.png" || first.Markdown != "![Image1](image1.png)" {
		t.Fatalf("unexpected first clipboard image result: %+v", first)
	}
	wantBytes, err := base64.StdEncoding.DecodeString(tinyPNGBase64)
	if err != nil {
		t.Fatal(err)
	}
	if got, err := os.ReadFile(filepath.Join(vaultPath, "notes", "image1.png")); err != nil || string(got) != string(wantBytes) {
		t.Fatalf("pasted image bytes were not preserved: bytes=%d err=%v", len(got), err)
	}

	second, err := app.SaveClipboardImage("notes/capture.md", "image/png", tinyPNGBase64)
	if err != nil {
		t.Fatalf("SaveClipboardImage collision paste: %v", err)
	}
	if !second.Success || second.Path != "notes/image2.png" || second.Markdown != "![Image2](image2.png)" {
		t.Fatalf("clipboard collision was not allocated safely: %+v", second)
	}
	if got := readTestFile(t, vaultPath, "notes/capture.md"); got != "Before screenshot\n" {
		t.Fatalf("saving the clipboard asset unexpectedly changed the note: %q", got)
	}
}

func TestSaveClipboardImageSniffsLinuxClipboardBytesWhenMIMEIsMissing(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "capture.md", "")

	result, err := app.SaveClipboardImage("capture.md", "", tinyPNGBase64)
	if err != nil {
		t.Fatalf("SaveClipboardImage missing MIME: %v", err)
	}
	if !result.Success || result.Path != "image1.png" || result.Markdown != "![Image1](image1.png)" {
		t.Fatalf("missing Linux MIME metadata was not recovered by byte sniffing: %+v", result)
	}
}

func TestSaveClipboardImageRejectsInvalidPayloadWithoutCreatingAFile(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "notes/capture.md", "unchanged\n")

	for _, test := range []struct {
		name string
		mime string
		data string
	}{
		{name: "invalid base64", mime: "image/png", data: "not-base64"},
		{name: "non-image bytes", mime: "image/png", data: base64.StdEncoding.EncodeToString([]byte("plain text"))},
		{name: "non-image MIME", mime: "text/plain", data: tinyPNGBase64},
	} {
		t.Run(test.name, func(t *testing.T) {
			result, err := app.SaveClipboardImage("notes/capture.md", test.mime, test.data)
			if err != nil {
				t.Fatalf("SaveClipboardImage: %v", err)
			}
			if result.Success || result.Error == "" {
				t.Fatalf("expected a visible refusal, got %+v", result)
			}
		})
	}
	if _, err := os.Stat(filepath.Join(vaultPath, "notes", "image1.png")); !os.IsNotExist(err) {
		t.Fatalf("invalid clipboard input created an image: %v", err)
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

func TestMovePathOffersAndPerformsNonDestructiveDirectoryMerge(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "Drafts/report.md", "moved report")
	writeTestFile(t, vaultPath, "Drafts/report (copy).md", "existing source copy")
	writeTestFile(t, vaultPath, "Drafts/new.md", "[Report](./report.md)\n")
	writeTestFile(t, vaultPath, "Drafts/shared/from-source.md", "source nested")
	writeTestFile(t, vaultPath, "Archive/Drafts/report.md", "kept destination report")
	writeTestFile(t, vaultPath, "Archive/Drafts/shared/from-destination.md", "destination nested")
	writeTestFile(t, vaultPath, "index.md", "[Draft](Drafts/report.md)\n")

	preflight, err := app.MovePath("Drafts", "Archive")
	if err != nil {
		t.Fatalf("MovePath preflight: %v", err)
	}
	if preflight.Success || !preflight.MergeAvailable || preflight.Error != "Destination directory already exists" {
		t.Fatalf("expected mergeable directory conflict, got %+v", preflight)
	}
	if _, err := os.Stat(filepath.Join(vaultPath, "Drafts", "report.md")); err != nil {
		t.Fatalf("preflight changed the source directory: %v", err)
	}

	result, err := app.MergeDirectory("Drafts", "Archive")
	if err != nil {
		t.Fatalf("MergeDirectory: %v", err)
	}
	if !result.Success || result.OldPath != "Drafts" || result.Path != "Archive/Drafts" {
		t.Fatalf("unexpected merge result: %+v", result)
	}
	if got := result.MovedPaths["Drafts/report.md"]; got != "Archive/Drafts/report (copy 2).md" {
		t.Fatalf("collision path was not reported: %+v", result.MovedPaths)
	}
	for _, stalePath := range result.UpdatedLinks {
		if strings.HasPrefix(stalePath, "Drafts/") {
			t.Fatalf("merge reported a stale source link path: %+v", result.UpdatedLinks)
		}
	}
	if !slices.Contains(result.UpdatedLinks, "Archive/Drafts/new.md") || !slices.Contains(result.UpdatedLinks, "index.md") {
		t.Fatalf("merge did not report current rewritten note paths: %+v", result.UpdatedLinks)
	}
	if _, err := os.Stat(filepath.Join(vaultPath, "Drafts")); !os.IsNotExist(err) {
		t.Fatalf("successful merge did not remove the source: %v", err)
	}
	for path, want := range map[string]string{
		"Archive/Drafts/report.md":                  "kept destination report",
		"Archive/Drafts/report (copy).md":           "existing source copy",
		"Archive/Drafts/report (copy 2).md":         "moved report",
		"Archive/Drafts/shared/from-source.md":      "source nested",
		"Archive/Drafts/shared/from-destination.md": "destination nested",
	} {
		if got := readTestFile(t, vaultPath, path); got != want {
			t.Fatalf("unexpected merged content for %q: %q", path, got)
		}
	}
	if got := readTestFile(t, vaultPath, "Archive/Drafts/new.md"); got != "[Report](./report%20%28copy%202%29.md)\n" {
		t.Fatalf("relative link did not follow its collision copy: %q", got)
	}
	if got := readTestFile(t, vaultPath, "index.md"); got != "[Draft](Archive/Drafts/report%20%28copy%202%29.md)\n" {
		t.Fatalf("incoming link did not follow its collision copy: %q", got)
	}
}

func TestParenthesizedCopyCollisionNamePreservesExtensions(t *testing.T) {
	for _, test := range []struct {
		name        string
		isDirectory bool
		index       int
		want        string
	}{
		{name: "report.md", index: 1, want: "report (copy).md"},
		{name: "report.md", index: 2, want: "report (copy 2).md"},
		{name: "diagram.drawio.svg", index: 1, want: "diagram (copy).drawio.svg"},
		{name: "Assets", isDirectory: true, index: 1, want: "Assets (copy)"},
	} {
		if got := parenthesizedCopyCollisionName(test.name, test.isDirectory, test.index); got != test.want {
			t.Errorf("parenthesizedCopyCollisionName(%q, %v, %d) = %q, want %q", test.name, test.isDirectory, test.index, got, test.want)
		}
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

	dropFilesForTest(app, fileSource, folderSource)
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

func TestExternalCopyModesRejectDuplicateBatchNamesBeforeWriting(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	if _, err := app.CreateDirectory("Imported"); err != nil {
		t.Fatal(err)
	}
	firstRoot := t.TempDir()
	secondRoot := t.TempDir()
	first := filepath.Join(firstRoot, "report.md")
	second := filepath.Join(secondRoot, "report.md")
	if err := os.WriteFile(first, []byte("first"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(second, []byte("second"), 0644); err != nil {
		t.Fatal(err)
	}

	dropFilesForTest(app, first, second)
	modes := map[string]func() (*CopyExternalResult, error){
		"copy": func() (*CopyExternalResult, error) {
			return app.CopyExternalPaths([]string{first, second}, "Imported", false)
		},
		"merge": func() (*CopyExternalResult, error) {
			return app.MergeExternalPaths([]string{first, second}, "Imported")
		},
	}
	for name, run := range modes {
		t.Run(name, func(t *testing.T) {
			result, err := run()
			if err != nil {
				t.Fatalf("external %s: %v", name, err)
			}
			if result.Success || !strings.Contains(result.Error, "More than one dropped item") {
				t.Fatalf("expected duplicate-name refusal, got %+v", result)
			}
			entries, err := os.ReadDir(filepath.Join(vaultPath, "Imported"))
			if err != nil {
				t.Fatal(err)
			}
			if len(entries) != 0 {
				t.Fatalf("duplicate-name preflight wrote %d vault entries", len(entries))
			}
		})
	}
}

func TestMergeExternalPathsMergesDirectoriesAndKeepsCollisionCopies(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "Imported/Assets/report.md", "kept destination")
	writeTestFile(t, vaultPath, "Imported/Assets/report (copy).md", "kept first copy")
	writeTestFile(t, vaultPath, "Imported/Assets/shared/destination.txt", "destination nested")

	sourceRoot := t.TempDir()
	source := filepath.Join(sourceRoot, "Assets")
	if err := os.MkdirAll(filepath.Join(source, "shared"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "report.md"), []byte("dropped report"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "shared", "source.txt"), []byte("source nested"), 0644); err != nil {
		t.Fatal(err)
	}

	dropFilesForTest(app, source)
	preflight, err := app.CopyExternalPaths([]string{source}, "Imported", false)
	if err != nil {
		t.Fatalf("CopyExternalPaths preflight: %v", err)
	}
	if preflight.Success || len(preflight.DirectoryConflicts) != 1 || preflight.DirectoryConflicts[0] != "Imported/Assets" {
		t.Fatalf("expected an existing-directory merge warning, got %+v", preflight)
	}

	result, err := app.MergeExternalPaths([]string{source}, "Imported")
	if err != nil {
		t.Fatalf("MergeExternalPaths: %v", err)
	}
	if !result.Success || len(result.Paths) != 1 || result.Paths[0] != "Imported/Assets" {
		t.Fatalf("unexpected external merge result: %+v", result)
	}
	for path, want := range map[string]string{
		"Imported/Assets/report.md":              "kept destination",
		"Imported/Assets/report (copy).md":       "kept first copy",
		"Imported/Assets/report (copy 2).md":     "dropped report",
		"Imported/Assets/shared/destination.txt": "destination nested",
		"Imported/Assets/shared/source.txt":      "source nested",
	} {
		if got := readTestFile(t, vaultPath, path); got != want {
			t.Fatalf("unexpected merged import content for %q: %q", path, got)
		}
	}
	if got, err := os.ReadFile(filepath.Join(source, "report.md")); err != nil || string(got) != "dropped report" {
		t.Fatalf("external merge changed its source: %q, %v", got, err)
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

	dropFilesForTest(app, newSource, existingSource)
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

	dropFilesForTest(app, source)
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

	dropFilesForTest(app, source)
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

	dropFilesForTest(app, link)
	result, err := app.CopyExternalPaths([]string{link}, ".", false)
	if err != nil {
		t.Fatalf("CopyExternalPaths: %v", err)
	}
	if result.Success || !strings.Contains(strings.ToLower(result.Error), "symbolic link") {
		t.Fatalf("expected symlink rejection, got %+v", result)
	}
}

// vaultFoldsLetterCase reports whether the test vault sits on a volume where
// "note.md" and "NOTE.md" are one entry, as on default macOS and Windows.
func vaultFoldsLetterCase(t *testing.T, vaultPath string) bool {
	t.Helper()
	probe := filepath.Join(vaultPath, "case-probe.tmp")
	if err := os.WriteFile(probe, nil, 0600); err != nil {
		t.Fatalf("write case probe: %v", err)
	}
	defer os.Remove(probe)
	_, err := os.Stat(filepath.Join(vaultPath, "CASE-PROBE.TMP"))
	return err == nil
}

func directoryNames(t *testing.T, directory string) []string {
	t.Helper()
	entries, err := os.ReadDir(directory)
	if err != nil {
		t.Fatalf("list %q: %v", directory, err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), ".") {
			names = append(names, entry.Name())
		}
	}
	return names
}

func TestRenamePathChangesOnlyLetterCaseOnCaseInsensitiveVolume(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	if !vaultFoldsLetterCase(t, vaultPath) {
		t.Skip("the temporary filesystem is case-sensitive, so a case variant is simply a free name")
	}
	writeTestFile(t, vaultPath, "todo.md", "- [ ] Task #todo\n")
	writeTestFile(t, vaultPath, "index.md", "[Tasks](todo.md)\n")
	writeTestFile(t, vaultPath, "Notes/inner.md", "# Inner\n")
	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("GetKanbanBoard: %v", err)
	}

	result, err := app.RenamePath("todo.md", "Todo.md")
	if err != nil || !result.Success {
		t.Fatalf("case-only rename of a note: result=%+v err=%v", result, err)
	}
	if names := directoryNames(t, vaultPath); !slices.Contains(names, "Todo.md") || slices.Contains(names, "todo.md") {
		t.Fatalf("vault entries after the rename = %v, want Todo.md in place of todo.md", names)
	}
	if got := readTestFile(t, vaultPath, "index.md"); got != "[Tasks](Todo.md)\n" {
		t.Fatalf("link to the renamed note = %q", got)
	}
	board, err := app.GetKanbanBoard()
	if err != nil || len(board["todo"]) != 1 || board["todo"][0].File != "Todo.md" {
		t.Fatalf("board after the rename = %#v, err=%v", board, err)
	}

	result, err = app.RenamePath("Notes", "notes")
	if err != nil || !result.Success {
		t.Fatalf("case-only rename of a folder: result=%+v err=%v", result, err)
	}
	if names := directoryNames(t, vaultPath); !slices.Contains(names, "notes") || slices.Contains(names, "Notes") {
		t.Fatalf("vault entries after the folder rename = %v, want notes in place of Notes", names)
	}

	// The same name again is still an occupied destination.
	if result, err := app.RenamePath("Todo.md", "Todo.md"); err != nil || result.Success || result.Error != "Destination exists" {
		t.Fatalf("rename onto the identical name: result=%+v err=%v", result, err)
	}
}

func TestRenamePathRefusesCaseVariantThatIsASeparateEntry(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	if vaultFoldsLetterCase(t, vaultPath) {
		t.Skip("a case-insensitive filesystem cannot hold two entries that differ only by case")
	}
	refuse := func(t *testing.T, oldRel, newRel string) {
		t.Helper()
		result, err := app.RenamePath(oldRel, newRel)
		if err != nil || result.Success || result.Error != "Destination exists" {
			t.Fatalf("RenamePath(%q, %q): result=%+v err=%v; want Destination exists", oldRel, newRel, result, err)
		}
	}

	t.Run("another note", func(t *testing.T) {
		writeTestFile(t, vaultPath, "plain/todo.md", "source")
		writeTestFile(t, vaultPath, "plain/Todo.md", "other note")
		refuse(t, "plain/todo.md", "plain/Todo.md")
		if readTestFile(t, vaultPath, "plain/todo.md") != "source" || readTestFile(t, vaultPath, "plain/Todo.md") != "other note" {
			t.Fatal("a refused case-variant rename changed a note")
		}
	})
	t.Run("hard link to the same file", func(t *testing.T) {
		writeTestFile(t, vaultPath, "linked/todo.md", "shared")
		if err := os.Link(filepath.Join(vaultPath, "linked", "todo.md"), filepath.Join(vaultPath, "linked", "Todo.md")); err != nil {
			t.Skipf("hard links unavailable: %v", err)
		}
		refuse(t, "linked/todo.md", "linked/Todo.md")
		if names := directoryNames(t, filepath.Join(vaultPath, "linked")); len(names) != 2 {
			t.Fatalf("entries after the refused rename = %v, want both names kept", names)
		}
	})
	t.Run("symbolic link to the case variant", func(t *testing.T) {
		writeTestFile(t, vaultPath, "symbolic/Todo.md", "the real note")
		if err := os.Symlink("Todo.md", filepath.Join(vaultPath, "symbolic", "todo.md")); err != nil {
			t.Skipf("symbolic links unavailable: %v", err)
		}
		refuse(t, "symbolic/todo.md", "symbolic/Todo.md")
		info, err := os.Lstat(filepath.Join(vaultPath, "symbolic", "Todo.md"))
		if err != nil || !info.Mode().IsRegular() || readTestFile(t, vaultPath, "symbolic/Todo.md") != "the real note" {
			t.Fatalf("the real note was replaced by the link that pointed at it: info=%v err=%v", info, err)
		}
	})
}

func TestEnsureWelcomeNoteGreetsOnlyAVaultWithoutAnyNote(t *testing.T) {
	welcomeCreated := func(t *testing.T, prepare func(vaultPath string)) bool {
		t.Helper()
		app, vaultPath := newTestApp(t)
		t.Cleanup(func() { _ = os.RemoveAll(vaultPath) })
		prepare(vaultPath)
		app.ensureWelcomeNote()
		_, err := os.Stat(filepath.Join(vaultPath, "Welcome.md"))
		if err != nil && !os.IsNotExist(err) {
			t.Fatalf("inspect Welcome.md: %v", err)
		}
		return err == nil
	}

	if !welcomeCreated(t, func(string) {}) {
		t.Fatal("an empty vault did not receive Welcome.md")
	}
	if !welcomeCreated(t, func(vaultPath string) {
		writeTestFile(t, vaultPath, "assets/photo.png", "png")
		writeTestFile(t, vaultPath, ".trash/old.md", "# Deleted\n")
		outside := filepath.Join(t.TempDir(), "outside.md")
		if err := os.WriteFile(outside, []byte("# Outside\n"), 0644); err != nil {
			t.Fatal(err)
		}
		_ = os.Symlink(outside, filepath.Join(vaultPath, "linked.md"))
	}) {
		t.Fatal("a vault whose only Markdown is hidden or linked from outside did not receive Welcome.md")
	}
	for name, note := range map[string]string{
		"note in a folder":            "Projects/2025/plan.md",
		"upper-case extension":        "Journal/Today.MD",
		"note at the top level":       "Inbox.md",
		"mixed-case nested extension": "Areas/Health/Log.Md",
	} {
		if welcomeCreated(t, func(vaultPath string) { writeTestFile(t, vaultPath, note, "# Mine\n") }) {
			t.Errorf("%s: Welcome.md was created in a vault that already holds %s", name, note)
		}
	}
}

// vaultUserFiles reads every file outside the vault's dot-folders, keyed by
// slash-separated path, so a test can prove an operation lost nothing.
func vaultUserFiles(t *testing.T, vaultPath string) map[string]string {
	t.Helper()
	files := make(map[string]string)
	err := filepath.WalkDir(vaultPath, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if path != vaultPath && strings.HasPrefix(entry.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}
		relative, err := filepath.Rel(vaultPath, path)
		if err != nil {
			return err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		files[filepath.ToSlash(relative)] = string(data)
		return nil
	})
	if err != nil {
		t.Fatalf("read vault files: %v", err)
	}
	return files
}

// A folder dropped on its own parent finds itself at the destination. Merging
// it "into" that folder copied it onto itself and then removed it.
func TestMergeDirectoryRefusesToMergeAFolderWithItself(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "Projects/Drafts/report.md", "report")
	writeTestFile(t, vaultPath, "Projects/Drafts/nested/plan.md", "plan")
	writeTestFile(t, vaultPath, "Projects/index.md", "[Report](Drafts/report.md)\n")
	before := vaultUserFiles(t, vaultPath)

	for _, move := range [][2]string{{"Projects/Drafts", "Projects"}, {"Projects", ""}} {
		preflight, err := app.MovePath(move[0], move[1])
		if err != nil {
			t.Fatalf("MovePath(%q, %q): %v", move[0], move[1], err)
		}
		if preflight.Success || preflight.MergeAvailable || preflight.Error != mutations.SameFolderError {
			t.Fatalf("MovePath(%q, %q) = %+v, want the folder reported as already there with no merge offer", move[0], move[1], preflight)
		}
		merged, err := app.MergeDirectory(move[0], move[1])
		if err != nil {
			t.Fatalf("MergeDirectory(%q, %q): %v", move[0], move[1], err)
		}
		if merged.Success || merged.Error != mutations.SameFolderError {
			t.Fatalf("MergeDirectory(%q, %q) = %+v, want it refused", move[0], move[1], merged)
		}
		if after := vaultUserFiles(t, vaultPath); !reflect.DeepEqual(after, before) {
			t.Fatalf("refused merge of %q changed the vault:\n got %v\nwant %v", move[0], after, before)
		}
	}
}

// Merging "X/X" into the vault root has the destination "X", the folder that
// holds the source. The inner "X/X/X" then maps onto "X/X" itself: its notes
// were copied into the folder being merged and deleted with it.
func TestMergeDirectoryIntoItsOwnAncestorNeverLosesAnInnerNamesakeFolder(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "X/keep.md", "outer")
	writeTestFile(t, vaultPath, "X/X/a.md", "middle")
	writeTestFile(t, vaultPath, "X/X/X/deep.md", "inner")
	writeTestFile(t, vaultPath, "X/X/X/more/deeper.md", "innermost")
	writeTestFile(t, vaultPath, "index.md", "[Deep](X/X/X/deep.md)\n")
	before := vaultUserFiles(t, vaultPath)

	preflight, err := app.MovePath("X/X", "")
	if err != nil {
		t.Fatalf("MovePath: %v", err)
	}
	if preflight.Success || preflight.MergeAvailable || !strings.Contains(preflight.Error, `the "X" folder inside it`) {
		t.Fatalf("MovePath offered a merge that overwrites its own source: %+v", preflight)
	}
	merged, err := app.MergeDirectory("X/X", "")
	if err != nil {
		t.Fatalf("MergeDirectory: %v", err)
	}
	if merged.Success || merged.Error != preflight.Error {
		t.Fatalf("MergeDirectory = %+v, want it refused with %q", merged, preflight.Error)
	}
	if after := vaultUserFiles(t, vaultPath); !reflect.DeepEqual(after, before) {
		t.Fatalf("refused merge changed the vault:\n got %v\nwant %v", after, before)
	}

	// The same layout one level down: "Area/X/sub/X" merged into "Area".
	writeTestFile(t, vaultPath, "Area/X/sub/X/note.md", "source")
	writeTestFile(t, vaultPath, "Area/X/sub/X/sub/X/lost.md", "would be lost")
	before = vaultUserFiles(t, vaultPath)
	merged, err = app.MergeDirectory("Area/X/sub/X", "Area")
	if err != nil {
		t.Fatalf("MergeDirectory nested: %v", err)
	}
	if merged.Success || !strings.Contains(merged.Error, `the "sub/X" folder inside it`) {
		t.Fatalf("nested MergeDirectory = %+v, want it refused", merged)
	}
	if after := vaultUserFiles(t, vaultPath); !reflect.DeepEqual(after, before) {
		t.Fatalf("refused nested merge changed the vault:\n got %v\nwant %v", after, before)
	}
}

// Flattening a doubled folder is a real merge and stays available: only an
// inner namesake folder makes it unsafe. An inner namesake file collides with
// the folder being merged and is kept under a copy name.
func TestMergeDirectoryFlattensAFolderIntoItsOwnAncestor(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "X/keep.md", "outer keep")
	writeTestFile(t, vaultPath, "X/sub/outer.md", "outer nested")
	writeTestFile(t, vaultPath, "X/X/keep.md", "inner keep")
	writeTestFile(t, vaultPath, "X/X/a.md", "inner note")
	writeTestFile(t, vaultPath, "X/X/sub/inner.md", "inner nested")
	writeTestFile(t, vaultPath, "X/X/X", "a file named like the folder")
	writeTestFile(t, vaultPath, "index.md", "[A](X/X/a.md)\n")

	preflight, err := app.MovePath("X/X", "")
	if err != nil || preflight.Success || !preflight.MergeAvailable {
		t.Fatalf("MovePath = %+v, %v; want the merge offered", preflight, err)
	}
	merged, err := app.MergeDirectory("X/X", "")
	if err != nil || !merged.Success {
		t.Fatalf("MergeDirectory = %+v, %v", merged, err)
	}
	want := map[string]string{
		"X/keep.md":        "outer keep",
		"X/keep (copy).md": "inner keep",
		"X/a.md":           "inner note",
		"X/sub/outer.md":   "outer nested",
		"X/sub/inner.md":   "inner nested",
		"X/X (copy)":       "a file named like the folder",
		"index.md":         "[A](X/a.md)\n",
	}
	if got := vaultUserFiles(t, vaultPath); !reflect.DeepEqual(got, want) {
		t.Fatalf("flattened vault:\n got %v\nwant %v", got, want)
	}
}

// On a volume that folds letter case, a case variant of the source's own path
// reaches the source or its parent. Names alone do not show that.
func TestMergeDirectoryRecognizesItsOwnFoldersByIdentityOnCaseFoldingVolumes(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	if !vaultFoldsLetterCase(t, vaultPath) {
		t.Skip("the temporary filesystem is case-sensitive, so a case variant is a separate folder")
	}
	writeTestFile(t, vaultPath, "notes/keep.md", "outer")
	writeTestFile(t, vaultPath, "notes/Notes/a.md", "middle")
	writeTestFile(t, vaultPath, "notes/Notes/Notes/deep.md", "inner")
	before := vaultUserFiles(t, vaultPath)

	// "Notes" in the vault root is the folder "notes" that holds the source.
	merged, err := app.MergeDirectory("notes/Notes", "")
	if err != nil {
		t.Fatalf("MergeDirectory: %v", err)
	}
	if merged.Success || !strings.Contains(merged.Error, "folder inside it") {
		t.Fatalf("MergeDirectory = %+v, want the self-overwriting merge refused", merged)
	}
	// "NOTES/Notes" is the source itself.
	preflight, err := app.MovePath("notes/Notes", "NOTES")
	if err != nil {
		t.Fatalf("MovePath: %v", err)
	}
	if preflight.Success || preflight.MergeAvailable || preflight.Error != mutations.SameFolderError {
		t.Fatalf("MovePath = %+v, want the folder reported as already there", preflight)
	}
	if merged, err := app.MergeDirectory("notes/Notes", "NOTES"); err != nil || merged.Success || merged.Error != mutations.SameFolderError {
		t.Fatalf("MergeDirectory onto a case variant of itself = %+v, %v", merged, err)
	}
	if after := vaultUserFiles(t, vaultPath); !reflect.DeepEqual(after, before) {
		t.Fatalf("refused merges changed the vault:\n got %v\nwant %v", after, before)
	}
}
