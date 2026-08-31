package desktop

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
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

func TestPreviewRenamePathAndExplicitLinkChoice(t *testing.T) {
	t.Run("update referenced Draw.io image", func(t *testing.T) {
		app, vaultPath := newTestApp(t)
		defer os.RemoveAll(vaultPath)

		writeTestFile(t, vaultPath, "notes/diagram1.drawio.svg", "<svg></svg>")
		writeTestFile(t, vaultPath, "notes/plan.md", "![Diagram](./diagram1.drawio.svg)\n")
		writeTestFile(t, vaultPath, "notes/other.md", "No reference\n")

		preview, err := app.PreviewRenamePath("notes/diagram1.drawio.svg", "notes/system.drawio.svg")
		if err != nil || preview == nil || !preview.Success {
			t.Fatalf("PreviewRenamePath: result=%+v err=%v", preview, err)
		}
		if !reflect.DeepEqual(preview.UpdatedLinks, []string{"notes/plan.md"}) {
			t.Fatalf("preview references = %#v, want plan note", preview.UpdatedLinks)
		}
		if got := readTestFile(t, vaultPath, "notes/plan.md"); got != "![Diagram](./diagram1.drawio.svg)\n" {
			t.Fatalf("preview mutated source: %q", got)
		}

		result, err := app.RenamePathWithLinkUpdates(
			"notes/diagram1.drawio.svg",
			"notes/system.drawio.svg",
			true,
		)
		if err != nil || result == nil || !result.Success {
			t.Fatalf("RenamePathWithLinkUpdates: result=%+v err=%v", result, err)
		}
		if got := readTestFile(t, vaultPath, "notes/plan.md"); got != "![Diagram](./system.drawio.svg)\n" {
			t.Fatalf("accepted Draw.io reference rewrite = %q", got)
		}
	})

	t.Run("keep Markdown references unchanged", func(t *testing.T) {
		app, vaultPath := newTestApp(t)
		defer os.RemoveAll(vaultPath)

		writeTestFile(t, vaultPath, "old.md", "# Old\n[Self](old.md)\n")
		writeTestFile(t, vaultPath, "source.md", "[Old](old.md)\n[[old]]\n")

		preview, err := app.PreviewRenamePath("old.md", "new.md")
		if err != nil || preview == nil || !preview.Success {
			t.Fatalf("PreviewRenamePath: result=%+v err=%v", preview, err)
		}
		if !reflect.DeepEqual(preview.UpdatedLinks, []string{"source.md"}) {
			t.Fatalf("preview references = %#v, want only the other Markdown source", preview.UpdatedLinks)
		}

		result, err := app.RenamePathWithLinkUpdates("old.md", "new.md", false)
		if err != nil || result == nil || !result.Success {
			t.Fatalf("RenamePathWithLinkUpdates: result=%+v err=%v", result, err)
		}
		if len(result.UpdatedLinks) != 0 {
			t.Fatalf("kept references reported rewrites: %#v", result.UpdatedLinks)
		}
		if got := readTestFile(t, vaultPath, "source.md"); got != "[Old](old.md)\n[[old]]\n" {
			t.Fatalf("declined reference rewrite changed source: %q", got)
		}
		if got := readTestFile(t, vaultPath, "new.md"); got != "# Old\n[Self](old.md)\n" {
			t.Fatalf("renamed Markdown source changed unexpectedly: %q", got)
		}
	})
}

func TestDirectoryMoveRewritesSparseLinksAcrossLargeVault(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "Projects/Spec.md", "# Specification\n")
	for index := 0; index < 256; index++ {
		path := fmt.Sprintf("Bulk/%02d/Note-%03d.md", index%16, index)
		writeTestFile(t, vaultPath, path, fmt.Sprintf("Unrelated scale note %03d.\n", index))
	}
	writeTestFile(t, vaultPath, "References/first.md", "[Spec](../Projects/Spec.md)\n")
	writeTestFile(t, vaultPath, "Bulk/07/middle.md", "[Spec](../../Projects/Spec.md#overview)\n")
	writeTestFile(t, vaultPath, "References/last.md", "[spec]: ../Projects/Spec.md \"Specification\"\n")
	writeTestFile(t, vaultPath, "wiki.md", "[[Projects/Spec|Read the spec]]\n")
	if _, err := app.SearchFiles("Unrelated scale", false); err != nil {
		t.Fatalf("warm shared index: %v", err)
	}
	initialIndex := app.vaultIndex

	result, err := app.MovePath("Projects", "Archive")
	if err != nil || result == nil || !result.Success {
		t.Fatalf("MovePath: result=%+v err=%v", result, err)
	}
	sort.Strings(result.UpdatedLinks)
	wantUpdated := []string{"Bulk/07/middle.md", "References/first.md", "References/last.md", "wiki.md"}
	if !reflect.DeepEqual(result.UpdatedLinks, wantUpdated) {
		t.Fatalf("updated sparse links = %#v, want %#v", result.UpdatedLinks, wantUpdated)
	}
	if app.vaultIndex != initialIndex {
		t.Fatal("sparse directory move replaced the warm index instead of remapping it")
	}
	if _, found := app.vaultIndex.files["Projects/Spec.md"]; found {
		t.Fatal("warm index retained the old moved path")
	}
	if _, found := app.vaultIndex.files["Archive/Projects/Spec.md"]; !found {
		t.Fatal("warm index did not publish the moved path")
	}

	checks := map[string]string{
		"References/first.md": "[Spec](../Archive/Projects/Spec.md)\n",
		"Bulk/07/middle.md":   "[Spec](../../Archive/Projects/Spec.md#overview)\n",
		"References/last.md":  "[spec]: ../Archive/Projects/Spec.md \"Specification\"\n",
		"wiki.md":             "[[Archive/Projects/Spec|Read the spec]]\n",
	}
	for path, want := range checks {
		if got := readTestFile(t, vaultPath, path); got != want {
			t.Errorf("rewritten %s = %q, want %q", path, got, want)
		}
	}
	for _, index := range []int{0, 127, 255} {
		path := fmt.Sprintf("Bulk/%02d/Note-%03d.md", index%16, index)
		want := fmt.Sprintf("Unrelated scale note %03d.\n", index)
		if got := readTestFile(t, vaultPath, path); got != want {
			t.Errorf("unrelated %s changed: %q", path, got)
		}
	}
}

func TestIndexedMoveFallsBackWhenExternalMarkdownWasNotObserved(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "Projects/Spec.md", "# Specification\n")
	writeTestFile(t, vaultPath, "known.md", "Known note\n")
	if _, err := app.SearchFiles("Known note", false); err != nil {
		t.Fatalf("warm shared index: %v", err)
	}
	writeTestFile(t, vaultPath, "external.md", "[Spec](Projects/Spec.md)\n")

	root, err := app.openVaultRoot()
	if err != nil {
		t.Fatalf("open vault root: %v", err)
	}
	defer root.Close()
	rewrites, usedIndex, err := collectVaultLinkRewritesIndexed(root, app.vaultIndex, "Projects", "Archive/Projects")
	if err != nil {
		t.Fatalf("collect rewrites with stale index: %v", err)
	}
	if usedIndex {
		t.Fatal("stale index unexpectedly used the pruned rewrite path")
	}
	if len(rewrites) != 1 || filepath.ToSlash(rewrites[0].path) != "external.md" {
		t.Fatalf("fallback rewrites = %#v, want external.md", rewrites)
	}
	if result, err := app.MovePath("Projects", "Archive"); err != nil || !result.Success {
		t.Fatalf("MovePath with stale index: result=%+v err=%v", result, err)
	}
	if got := readTestFile(t, vaultPath, "external.md"); got != "[Spec](Archive/Projects/Spec.md)\n" {
		t.Fatalf("fallback move rewrite = %q", got)
	}
	if _, found := app.vaultIndex.files["external.md"]; !found {
		t.Fatal("fallback move did not rebuild the externally changed index")
	}
}
