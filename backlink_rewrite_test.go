package main

import (
	"os"
	"strings"
	"testing"
)

func TestMovePathRewritesMarkdownBacklinks(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "projects/Spec Note.md", "# Specification\n")
	fence := "```"
	writeTestFile(t, vaultPath, "notes/standard.md", strings.Join([]string{
		"[Spec](projects/Spec%20Note.md#overview)",
		"![Spec image](projects/Spec%20Note.md)",
		"[release]: projects/Spec%20Note.md \"Specification\"",
		"[[projects/Spec Note|Read the spec]]",
		fence + "md",
		"[Do not rewrite](projects/Spec%20Note.md)",
		fence,
		"[Different](projects/Spec Notes.md)",
	}, "\n"))
	writeTestFile(t, vaultPath, "notes/relative.md", "[Spec](../projects/Spec%20Note.md)\n")

	result, err := app.MovePath("projects/Spec Note.md", "archive")
	if err != nil {
		t.Fatalf("MovePath: %v", err)
	}
	if !result.Success {
		t.Fatalf("MovePath failed: %+v", result)
	}
	hasUpdatedLink := func(path string) bool {
		for _, updatedPath := range result.UpdatedLinks {
			if updatedPath == path {
				return true
			}
		}
		return false
	}
	if len(result.UpdatedLinks) != 2 || !hasUpdatedLink("notes/relative.md") || !hasUpdatedLink("notes/standard.md") {
		t.Fatalf("expected rewritten paths in move result, got %+v", result.UpdatedLinks)
	}

	standard := readTestFile(t, vaultPath, "notes/standard.md")
	for _, want := range []string{
		"[Spec](archive/Spec%20Note.md#overview)",
		"![Spec image](archive/Spec%20Note.md)",
		"[release]: archive/Spec%20Note.md \"Specification\"",
		"[[archive/Spec Note|Read the spec]]",
		fence + "md\n[Do not rewrite](projects/Spec%20Note.md)\n" + fence,
		"[Different](projects/Spec Notes.md)",
	} {
		if !strings.Contains(standard, want) {
			t.Errorf("rewritten note does not contain %q:\n%s", want, standard)
		}
	}
	if got := readTestFile(t, vaultPath, "notes/relative.md"); got != "[Spec](../archive/Spec%20Note.md)\n" {
		t.Fatalf("relative backlink was not rewritten correctly: %q", got)
	}
}

func TestMovePathPreservesRelativeLinksInsideMovedFolder(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "docs/guide.md", "# Guide\n")
	writeTestFile(t, vaultPath, "docs/readme.md", "[Guide](./guide.md)\n[Outside](../outside.md)\n")
	writeTestFile(t, vaultPath, "outside.md", "[Guide](docs/guide.md)\n[[docs/guide]]\n")

	result, err := app.MovePath("docs", "archive")
	if err != nil {
		t.Fatalf("MovePath: %v", err)
	}
	if !result.Success {
		t.Fatalf("MovePath failed: %+v", result)
	}

	if got := readTestFile(t, vaultPath, "archive/docs/readme.md"); got != "[Guide](./guide.md)\n[Outside](../../outside.md)\n" {
		t.Fatalf("relative links in moved folder were not preserved: %q", got)
	}
	if got := readTestFile(t, vaultPath, "outside.md"); got != "[Guide](archive/docs/guide.md)\n[[archive/docs/guide]]\n" {
		t.Fatalf("incoming links to moved folder were not rewritten: %q", got)
	}
}

func TestRenamePathRewritesRootMarkdownAndWikiLinks(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "old.md", "# Old\n")
	writeTestFile(t, vaultPath, "source.md", "[Old](old.md)\n[[old]]\n")

	result, err := app.RenamePath("old.md", "new.md")
	if err != nil {
		t.Fatalf("RenamePath: %v", err)
	}
	if !result.Success {
		t.Fatalf("RenamePath failed: %+v", result)
	}
	if got := readTestFile(t, vaultPath, "source.md"); got != "[Old](new.md)\n[[new]]\n" {
		t.Fatalf("links were not rewritten after rename: %q", got)
	}
}
