package desktop

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestOpenDroppedMarkdownFilesSortsVaultNotesExternalFilesAndUnsupportedPaths(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	vaultPath := filepath.Join(root, "vault")
	outside := filepath.Join(root, "outside")
	for _, dir := range []string{filepath.Join(vaultPath, "Notes"), outside} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	write := func(path, content string) string {
		t.Helper()
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
		return path
	}
	inside := write(filepath.Join(vaultPath, "Notes", "Inside.md"), "# Inside\n")
	readme := write(filepath.Join(outside, "README.md"), "# Readme\n")
	longName := write(filepath.Join(outside, "Guide.MARKDOWN"), "# Guide\n")
	text := write(filepath.Join(outside, "notes.txt"), "plain\n")
	link := filepath.Join(outside, "Link.md")
	if err := os.Symlink(readme, link); err != nil {
		t.Skipf("symbolic links unavailable: %v", err)
	}

	app := NewApp(vaultPath)
	result, err := app.OpenDroppedMarkdownFiles([]string{
		inside, inside, readme, longName, text, link, "relative.md", outside,
	})
	if err != nil {
		t.Fatal(err)
	}

	if !reflect.DeepEqual(result.VaultPaths, []string{"Notes/Inside.md"}) {
		t.Fatalf("vault paths = %#v, want the vault note once by its relative path", result.VaultPaths)
	}
	var externalPaths []string
	for _, file := range result.External {
		externalPaths = append(externalPaths, file.Path)
	}
	if !reflect.DeepEqual(externalPaths, []string{readme, longName}) {
		t.Fatalf("external = %#v, want both outside Markdown files", externalPaths)
	}
	if !reflect.DeepEqual(result.Skipped, []string{text, link, "relative.md", outside}) {
		t.Fatalf("skipped = %#v, want the text file, symlink, relative path and folder", result.Skipped)
	}

	// A dropped file behaves like one the operating system opened: edits save
	// to the original file and never touch the vault.
	file := result.External[0]
	read, err := app.ReadLaunchExternalFile(file.ID)
	if err != nil {
		t.Fatal(err)
	}
	saved, err := app.SaveLaunchExternalFile(file.ID, "# Edited\n", read.Mtime)
	if err != nil || !saved.Success {
		t.Fatalf("save = %#v, %v; want success", saved, err)
	}
	if content, _ := os.ReadFile(readme); string(content) != "# Edited\n" {
		t.Fatalf("original content = %q, want the edit", content)
	}
	if _, err := os.Stat(filepath.Join(vaultPath, "README.md")); !os.IsNotExist(err) {
		t.Fatalf("a dropped external file was copied into the vault: %v", err)
	}

	again, err := app.OpenDroppedMarkdownFiles([]string{readme})
	if err != nil {
		t.Fatal(err)
	}
	if len(again.External) != 1 || again.External[0].ID != file.ID {
		t.Fatalf("second drop = %#v, want the existing capability %q", again.External, file.ID)
	}
}
