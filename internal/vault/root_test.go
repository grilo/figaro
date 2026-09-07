package vault

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
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
		{input: "bad\x00name.md", valid: false},
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

func TestWriteFileAtomicReplacesContentAndPreservesPermissions(t *testing.T) {
	rootDir := t.TempDir()
	root, err := os.OpenRoot(rootDir)
	if err != nil {
		t.Fatalf("open root: %v", err)
	}
	t.Cleanup(func() { _ = root.Close() })

	path := filepath.Join("notes", "draft.md")
	if err := root.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	if err := root.WriteFile(path, []byte("old"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := root.Chmod(path, 0600); err != nil {
		t.Fatal(err)
	}
	originalInfo, err := root.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := WriteFileAtomic(root, path, []byte("replacement"), 0644); err != nil {
		t.Fatalf("WriteFileAtomic: %v", err)
	}

	content, err := root.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "replacement" {
		t.Fatalf("content = %q, want replacement", content)
	}
	info, err := root.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != originalInfo.Mode().Perm() {
		t.Fatalf("permissions = %o, want preserved mode %o", info.Mode().Perm(), originalInfo.Mode().Perm())
	}
	entries, err := os.ReadDir(filepath.Join(rootDir, "notes"))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".draft.md.tmp-") {
			t.Fatalf("successful replacement left temporary file %q", entry.Name())
		}
	}
}

func TestWriteFileAtomicRemovesTemporaryFileWhenRenameFails(t *testing.T) {
	rootDir := t.TempDir()
	root, err := os.OpenRoot(rootDir)
	if err != nil {
		t.Fatalf("open root: %v", err)
	}
	t.Cleanup(func() { _ = root.Close() })
	if err := root.Mkdir("occupied", 0755); err != nil {
		t.Fatal(err)
	}

	if err := WriteFileAtomic(root, "occupied", []byte("cannot replace a directory"), 0644); err == nil {
		t.Fatal("WriteFileAtomic unexpectedly replaced a directory")
	}
	info, err := root.Stat("occupied")
	if err != nil || !info.IsDir() {
		t.Fatalf("destination directory was damaged: info=%v err=%v", info, err)
	}
	entries, err := os.ReadDir(rootDir)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".occupied.tmp-") {
			t.Fatalf("failed replacement left temporary file %q", entry.Name())
		}
	}
}

func TestCreateFileDoesNotClobberExistingContent(t *testing.T) {
	rootDir := t.TempDir()
	root, err := os.OpenRoot(rootDir)
	if err != nil {
		t.Fatalf("open root: %v", err)
	}
	t.Cleanup(func() { _ = root.Close() })

	path := filepath.Join("Inbox", "note.md")
	if err := CreateFile(root, path, []byte("first"), 0600); err != nil {
		t.Fatalf("CreateFile: %v", err)
	}
	originalInfo, err := root.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := CreateFile(root, path, []byte("second"), 0644); err == nil {
		t.Fatal("CreateFile unexpectedly replaced an existing file")
	}
	content, err := root.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "first" {
		t.Fatalf("existing content = %q, want first", content)
	}
	info, err := root.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != originalInfo.Mode().Perm() {
		t.Fatalf("permissions = %o, want unchanged mode %o", info.Mode().Perm(), originalInfo.Mode().Perm())
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

func TestMarkdownWalksStopOnVisitorFailureWithoutReportingFalseProgress(t *testing.T) {
	rootDir := t.TempDir()
	for _, name := range []string{"alpha.md", "bravo.md"} {
		if err := os.WriteFile(filepath.Join(rootDir, name), []byte(name), 0600); err != nil {
			t.Fatal(err)
		}
	}
	root, err := os.OpenRoot(rootDir)
	if err != nil {
		t.Fatalf("open root: %v", err)
	}
	t.Cleanup(func() { _ = root.Close() })

	visitorFailure := errors.New("stop metadata scan")
	var progress [][2]int
	err = WalkMarkdownMetadataWithProgress(root, func(_ *os.Root, rel string, _ fs.FileInfo) error {
		if rel != "alpha.md" {
			t.Fatalf("first metadata path = %q, want alpha.md", rel)
		}
		return visitorFailure
	}, func(visited, total int) {
		progress = append(progress, [2]int{visited, total})
	})
	if !errors.Is(err, visitorFailure) {
		t.Fatalf("metadata walk error = %v, want visitor failure", err)
	}
	if want := [][2]int{{0, 2}}; !reflect.DeepEqual(progress, want) {
		t.Fatalf("progress = %v, want %v", progress, want)
	}

	contentFailure := errors.New("stop content scan")
	err = WalkMarkdown(root, func(_ *os.Root, rel string, _ fs.FileInfo, data []byte) error {
		if rel != "alpha.md" || string(data) != "alpha.md" {
			t.Fatalf("content visit = %q %q", rel, data)
		}
		return contentFailure
	})
	if !errors.Is(err, contentFailure) {
		t.Fatalf("content walk error = %v, want visitor failure", err)
	}
}
