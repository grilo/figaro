package vault

import (
	"os"
	"path/filepath"
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
