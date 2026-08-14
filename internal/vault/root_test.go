package vault

import (
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestRelativePathNormalizesAndRejectsTraversal(t *testing.T) {
	for _, test := range []struct {
		input string
		want  string
		valid bool
	}{
		{input: "notes\\daily.md", want: filepath.Join("notes", "daily.md"), valid: true},
		{input: "/notes/daily.md", want: filepath.Join("notes", "daily.md"), valid: true},
		{input: "../outside.md", valid: false},
		{input: "C:/windows/system.ini", valid: false},
	} {
		got, err := RelativePath(test.input)
		if test.valid && (err != nil || got != test.want) {
			t.Errorf("RelativePath(%q) = %q, %v; want %q, nil", test.input, got, err, test.want)
		}
		if !test.valid && err == nil {
			t.Errorf("RelativePath(%q) unexpectedly succeeded with %q", test.input, got)
		}
	}
}

func TestRootWritesDoNotFollowEscapingSymlink(t *testing.T) {
	rootDir := t.TempDir()
	root, err := os.OpenRoot(rootDir)
	if err != nil {
		t.Fatalf("open root: %v", err)
	}
	t.Cleanup(func() { _ = root.Close() })

	outside := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(rootDir, "escape")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if err := WriteFileAtomic(root, "escape/note.md", []byte("must remain inside"), 0644); err == nil {
		t.Fatal("WriteFileAtomic followed an escaping symlink")
	}
	if _, err := os.Stat(filepath.Join(outside, "note.md")); !os.IsNotExist(err) {
		t.Fatalf("write escaped root: %v", err)
	}
}

func TestWalkMarkdownWithProgressReportsDiscoveredAndVisitedFiles(t *testing.T) {
	rootDir := t.TempDir()
	for path, content := range map[string]string{
		"alpha.md":           "alpha",
		"nested/bravo.MD":    "bravo",
		"nested/ignored.txt": "ignored",
		".hidden/secret.md":  "secret",
	} {
		absolute := filepath.Join(rootDir, path)
		if err := os.MkdirAll(filepath.Dir(absolute), 0755); err != nil {
			t.Fatalf("create test directory: %v", err)
		}
		if err := os.WriteFile(absolute, []byte(content), 0644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}

	root, err := os.OpenRoot(rootDir)
	if err != nil {
		t.Fatalf("open root: %v", err)
	}
	defer root.Close()

	type progressPoint struct{ visited, total int }
	var paths []string
	var progress []progressPoint
	err = WalkMarkdownWithProgress(root, func(_ *os.Root, rel string, _ fs.FileInfo, _ []byte) error {
		paths = append(paths, rel)
		return nil
	}, func(visited int, total int) {
		progress = append(progress, progressPoint{visited: visited, total: total})
	})
	if err != nil {
		t.Fatalf("WalkMarkdownWithProgress: %v", err)
	}

	if want := []string{"alpha.md", "nested/bravo.MD"}; !reflect.DeepEqual(paths, want) {
		t.Fatalf("visited paths = %v, want %v", paths, want)
	}
	if want := []progressPoint{{0, 2}, {1, 2}, {2, 2}}; !reflect.DeepEqual(progress, want) {
		t.Fatalf("progress = %v, want %v", progress, want)
	}
}
