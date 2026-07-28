package desktop

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type directoryAssetFS struct {
	fs.FS
}

func (d directoryAssetFS) ReadFile(name string) ([]byte, error) {
	if name != "frontend" && !strings.HasPrefix(name, "frontend/") {
		return nil, &fs.PathError{Op: "open", Path: name, Err: fs.ErrNotExist}
	}
	return fs.ReadFile(d.FS, name)
}

func (d directoryAssetFS) ReadDir(name string) ([]fs.DirEntry, error) {
	if name != "frontend" && !strings.HasPrefix(name, "frontend/") {
		return nil, &fs.PathError{Op: "readdir", Path: name, Err: fs.ErrNotExist}
	}
	return fs.ReadDir(d.FS, name)
}

func TestMain(m *testing.M) {
	originalDirectory, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	repositoryRoot, err := filepath.Abs(filepath.Join(originalDirectory, "..", ".."))
	if err != nil {
		panic(err)
	}
	if err := os.Chdir(repositoryRoot); err != nil {
		panic(err)
	}
	assets = directoryAssetFS{FS: os.DirFS(repositoryRoot)}
	code := m.Run()
	_ = os.Chdir(originalDirectory)
	os.Exit(code)
}
