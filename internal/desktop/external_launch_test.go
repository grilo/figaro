package desktop

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLaunchExternalFileReadsAndSavesItsOriginalPath(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	externalPath := filepath.Join(root, "outside.md")
	if err := os.WriteFile(externalPath, []byte("# Outside\n"), 0644); err != nil {
		t.Fatal(err)
	}

	app := NewApp(filepath.Join(root, "vault"))
	app.setLaunchExternalFiles([]string{externalPath})
	files, err := app.GetLaunchExternalFiles()
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 || files[0].Path != externalPath {
		t.Fatalf("launch files = %#v, want original path %q", files, externalPath)
	}

	read, err := app.ReadLaunchExternalFile(files[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if read.Content != "# Outside\n" || read.Binary {
		t.Fatalf("read = %#v, want editable external Markdown", read)
	}

	saved, err := app.SaveLaunchExternalFile(files[0].ID, "# Saved outside\n", read.Mtime)
	if err != nil {
		t.Fatal(err)
	}
	if !saved.Success {
		t.Fatalf("save failed: %#v", saved)
	}
	content, err := os.ReadFile(externalPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "# Saved outside\n" {
		t.Fatalf("external content = %q, want original file updated", content)
	}
}

func TestLaunchExternalFileRejectsUnknownCapability(t *testing.T) {
	t.Parallel()
	app := NewApp(t.TempDir())
	if _, err := app.ReadLaunchExternalFile("not-a-launch-file"); err == nil {
		t.Fatal("ReadLaunchExternalFile accepted an unknown launch capability")
	}
}

func TestOpenLaunchExternalFileUsesOnlyRegisteredCapabilityPath(t *testing.T) {
	root := t.TempDir()
	externalPath := filepath.Join(root, "outside.md")
	if err := os.WriteFile(externalPath, []byte("# Outside\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	app := NewApp(filepath.Join(root, "vault"))
	app.setLaunchExternalFiles([]string{externalPath})
	files, err := app.GetLaunchExternalFiles()
	if err != nil || len(files) != 1 {
		t.Fatalf("launch files = %+v, %v", files, err)
	}

	originalLaunch := launchFileWithDefaultApplication
	defer func() { launchFileWithDefaultApplication = originalLaunch }()
	var launched string
	launchFileWithDefaultApplication = func(path string) error {
		launched = path
		return nil
	}

	result, err := app.OpenLaunchExternalFile(files[0].ID)
	if err != nil || result == nil || !result.Success || launched != externalPath {
		t.Fatalf("external launch = %+v, path=%q, err=%v", result, launched, err)
	}
	if _, err := app.OpenLaunchExternalFile("unknown"); err == nil {
		t.Fatal("OpenLaunchExternalFile accepted an unknown capability")
	}
}
