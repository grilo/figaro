package repositorycheck

import (
	"os"
	"path/filepath"
	"testing"
)

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
	code := m.Run()
	_ = os.Chdir(originalDirectory)
	os.Exit(code)
}
