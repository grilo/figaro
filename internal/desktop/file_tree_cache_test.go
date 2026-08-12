package desktop

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/fsnotify/fsnotify"
)

func TestBuildFileTreeFromEntriesPreservesHierarchyAndSortOrder(t *testing.T) {
	tree := buildFileTreeFromEntries(map[string]fileTreeCacheEntry{
		"z.md":         {typeName: "file", mtime: 3},
		"notes":        {typeName: "directory"},
		"notes/B.md":   {typeName: "file", mtime: 2},
		"notes/a.md":   {typeName: "file", mtime: 1},
		"Empty folder": {typeName: "directory"},
	})
	if got, want := []string{tree[0].Path, tree[1].Path, tree[2].Path},
		[]string{"Empty folder", "notes", "z.md"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("root paths = %#v, want %#v", got, want)
	}
	if got, want := []string{tree[1].Children[0].Path, tree[1].Children[1].Path},
		[]string{"notes/a.md", "notes/B.md"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("nested paths = %#v, want %#v", got, want)
	}
	if tree[0].Type != "directory" || len(tree[0].Children) != 0 || tree[2].Mtime != 3 {
		t.Fatalf("projected tree metadata = %#v", tree)
	}
}

func TestFileTreeCacheReusesSnapshotAndRemapsKnownMove(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "Projects/A.md", "alpha\n")
	writeTestFile(t, vaultPath, "stable.md", "stable\n")

	first, err := app.GetFileTree()
	if err != nil {
		t.Fatalf("initial GetFileTree: %v", err)
	}
	second, err := app.GetFileTree()
	if err != nil {
		t.Fatalf("cached GetFileTree: %v", err)
	}
	if len(first) == 0 || &first[0] != &second[0] {
		t.Fatal("unchanged GetFileTree did not reuse its immutable snapshot")
	}

	created, err := app.CreateFile("Projects/B.md", "beta\n")
	if err != nil || !created.Success {
		t.Fatalf("CreateFile: result=%+v err=%v", created, err)
	}
	result, err := app.RenamePath("Projects", "Archive/Projects")
	if err != nil || !result.Success {
		t.Fatalf("RenamePath: result=%+v err=%v", result, err)
	}
	if app.fileTreeEntries == nil {
		t.Fatal("known move discarded the warm file-tree metadata cache")
	}
	for _, oldPath := range []string{"Projects", "Projects/A.md", "Projects/B.md"} {
		if _, found := app.fileTreeEntries[oldPath]; found {
			t.Errorf("file-tree cache retained old path %q", oldPath)
		}
	}
	for _, newPath := range []string{"Archive", "Archive/Projects", "Archive/Projects/A.md", "Archive/Projects/B.md"} {
		if _, found := app.fileTreeEntries[newPath]; !found {
			t.Errorf("file-tree cache omitted new path %q", newPath)
		}
	}

	tree, err := app.GetFileTree()
	if err != nil {
		t.Fatalf("GetFileTree after move: %v", err)
	}
	paths := make([]string, 0)
	flattenObservableTree(tree, &paths)
	want := []string{
		"directory:Archive",
		"directory:Archive/Projects",
		"file:Archive/Projects/A.md",
		"file:Archive/Projects/B.md",
		"file:stable.md",
	}
	if !reflect.DeepEqual(paths, want) {
		t.Fatalf("tree after cached move = %#v, want %#v", paths, want)
	}
}

func TestFileTreeCacheAndVaultIndexStayWarmAcrossKnownCopy(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "Projects/plan.md", "copy marker\n- [ ] Copied task #todo\n")
	writeTestFile(t, vaultPath, "stable.md", "stable marker\n")
	if _, err := app.GetFileTree(); err != nil {
		t.Fatalf("warm file-tree cache: %v", err)
	}
	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("warm vault index: %v", err)
	}
	warmIndex := app.vaultIndex
	stableEntry, found := app.fileTreeEntries["stable.md"]
	if !found {
		t.Fatal("warm file-tree cache omitted stable.md")
	}

	result, err := app.CopyPath("Projects", ".")
	if err != nil || result == nil || !result.Success || result.Path != "Projects copy" {
		t.Fatalf("CopyPath: result=%+v err=%v", result, err)
	}
	if app.vaultIndex != warmIndex {
		t.Fatal("known copy discarded and rebuilt the warm vault index")
	}
	if app.fileTreeEntries == nil {
		t.Fatal("known copy discarded the warm file-tree metadata cache")
	}
	if got, found := app.fileTreeEntries["stable.md"]; !found || got != stableEntry {
		t.Fatalf("known copy changed unrelated cached metadata: got=%#v found=%v want=%#v", got, found, stableEntry)
	}
	for _, copiedPath := range []string{"Projects copy", "Projects copy/plan.md"} {
		if _, found := app.fileTreeEntries[copiedPath]; !found {
			t.Errorf("file-tree cache omitted copied path %q", copiedPath)
		}
	}
	if _, found := app.vaultIndex.files["Projects copy/plan.md"]; !found {
		t.Fatal("warm vault index omitted copied Markdown")
	}
}

func TestFileTreeCacheRefreshesNonMarkdownMtimeWithoutReloadingTheTree(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "assets/data.json", "{}\n")
	first, err := app.GetFileTree()
	if err != nil {
		t.Fatalf("initial GetFileTree: %v", err)
	}
	initialMtime := first[0].Children[0].Mtime

	absPath := filepath.Join(vaultPath, "assets", "data.json")
	writeTestFile(t, vaultPath, "assets/data.json", "{\"updated\":true}\n")
	updatedTime := time.Now().Add(2 * time.Second)
	if err := os.Chtimes(absPath, updatedTime, updatedTime); err != nil {
		t.Fatalf("set external asset mtime: %v", err)
	}
	result := app.applyVaultFilesystemChanges([]vaultWatchChange{{
		Path: absPath,
		Op:   fsnotify.Write,
	}})
	if result.treeChanged {
		t.Fatal("content-only asset write unexpectedly requested a tree reload")
	}

	second, err := app.GetFileTree()
	if err != nil {
		t.Fatalf("GetFileTree after external asset write: %v", err)
	}
	if got := second[0].Children[0].Mtime; got == initialMtime || got != float64(updatedTime.UnixNano())/1e9 {
		t.Fatalf("updated asset mtime = %f, initial %f", got, initialMtime)
	}
}

func TestRefreshFileTreeCachePathPublishesGeneratedFile(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "reports/summary.md", "# Summary\n")
	if _, err := app.GetFileTree(); err != nil {
		t.Fatalf("warm file-tree cache: %v", err)
	}

	writeTestFile(t, vaultPath, "reports/summary.pdf", "%PDF generated fixture\n")
	app.refreshFileTreeCachePath("reports/summary.pdf")

	entry, found := app.fileTreeEntries["reports/summary.pdf"]
	if !found || entry.typeName != "file" || entry.mtime == 0 {
		t.Fatalf("generated file cache entry = %#v, found=%v", entry, found)
	}
	tree, err := app.GetFileTree()
	if err != nil {
		t.Fatalf("GetFileTree after generated file: %v", err)
	}
	paths := make([]string, 0)
	flattenObservableTree(tree, &paths)
	want := []string{
		"directory:reports",
		"file:reports/summary.md",
		"file:reports/summary.pdf",
	}
	if !reflect.DeepEqual(paths, want) {
		t.Fatalf("tree after generated file = %#v, want %#v", paths, want)
	}
}
