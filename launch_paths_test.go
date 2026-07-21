package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMarkdownLaunchPathsKeepsOnlyExistingMarkdownDocuments(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	markdown := filepath.Join(root, "opened.md")
	text := filepath.Join(root, "ignored.txt")
	if err := os.WriteFile(markdown, []byte("# Open"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(text, []byte("ignore"), 0644); err != nil {
		t.Fatal(err)
	}

	got := markdownLaunchPaths([]string{"-psn_0_1", text, root, markdown, markdown, filepath.Join(root, "missing.md")})
	if len(got) != 1 || got[0] != markdown {
		t.Fatalf("markdownLaunchPaths = %#v, want [%q]", got, markdown)
	}
}
