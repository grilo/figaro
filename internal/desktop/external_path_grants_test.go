package desktop

import (
	"fmt"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
	"testing"
)

// dropFilesForTest stands in for the window's drop handler: it grants paths
// through the same call a real file drop makes before the page hears of it.
func dropFilesForTest(app *App, paths ...string) {
	app.grantDroppedPaths(paths)
}

// absoluteTestPath builds an absolute path that needs no file on disk.
func absoluteTestPath(parts ...string) string {
	root := string(filepath.Separator)
	if goruntime.GOOS == "windows" {
		root = `C:\`
	}
	return filepath.Join(append([]string{root}, parts...)...)
}

func TestExternalPathGrantsCoverOnlyTheExactDroppedPaths(t *testing.T) {
	grants := newExternalPathGrants(8)
	note := absoluteTestPath("home", "writer", "Notes", "plan.md")
	folder := absoluteTestPath("home", "writer", "Pictures")
	grants.grant([]string{note, folder, "relative.md", "", "  "})

	for _, path := range []string{
		note,
		folder,
		"  " + note + "  ",
		filepath.Join(filepath.Dir(note), ".", "plan.md"),
		filepath.Join(filepath.Dir(note), "sub", "..", "plan.md"),
		folder + string(filepath.Separator),
	} {
		if !grants.granted(path) {
			t.Errorf("granted(%q) = false, want the dropped path recognized in this spelling", path)
		}
	}
	for _, path := range []string{
		absoluteTestPath("home", "writer", "Notes", "other.md"),
		filepath.Dir(note),
		filepath.Join(folder, "photo.png"),
		absoluteTestPath("home", "writer"),
		absoluteTestPath(),
		note + ".bak",
		"relative.md",
		"plan.md",
		"",
		".",
	} {
		if grants.granted(path) {
			t.Errorf("granted(%q) = true, want only the dropped paths themselves covered", path)
		}
	}
	if got := grants.len(); got != 2 {
		t.Fatalf("ledger holds %d paths, want the two absolute ones", got)
	}
}

func TestExternalPathGrantKeyFoldsCaseOnlyWhereThePlatformDoes(t *testing.T) {
	upper := absoluteTestPath("Users", "Writer", "Plan.MD")
	lower := strings.ToLower(upper)
	folded, ok := externalPathGrantKey(upper, true)
	if !ok || folded != lower {
		t.Fatalf("folded key = %q, %v; want %q", folded, ok, lower)
	}
	exact, ok := externalPathGrantKey(upper, false)
	if !ok || exact != upper {
		t.Fatalf("exact key = %q, %v; want %q", exact, ok, upper)
	}
	if _, ok := externalPathGrantKey(filepath.Join("Users", "Writer", "Plan.md"), true); ok {
		t.Fatal("a relative path received a grant key")
	}

	grants := newExternalPathGrants(4)
	grants.foldCase = true
	grants.grant([]string{upper})
	if !grants.granted(lower) {
		t.Fatal("a case variant was refused on a platform whose paths ignore case")
	}
	grants.foldCase = false
	if lower != upper && grants.granted(upper) {
		t.Fatal("the ledger compared an exact key with a folded one")
	}
	exactGrants := newExternalPathGrants(4)
	exactGrants.foldCase = false
	exactGrants.grant([]string{upper})
	if lower != upper && exactGrants.granted(lower) {
		t.Fatal("a case variant was accepted on a platform whose paths are case-sensitive")
	}
}

func TestExternalPathGrantsKeepTheMostRecentPathsAndTheNewestDropWhole(t *testing.T) {
	grants := newExternalPathGrants(3)
	path := func(index int) string { return absoluteTestPath("drops", fmt.Sprintf("file-%d.md", index)) }

	grants.grant([]string{path(1), path(2)})
	grants.grant([]string{path(3)})
	// Dropping a path again makes it the newest.
	grants.grant([]string{path(1)})
	grants.grant([]string{path(4)})
	if grants.granted(path(2)) {
		t.Fatal("the oldest grant outlived the limit")
	}
	for _, index := range []int{1, 3, 4} {
		if !grants.granted(path(index)) {
			t.Fatalf("recent grant %d was evicted", index)
		}
	}

	// One drop larger than the limit is kept whole and evicts everything older.
	large := []string{path(10), path(11), path(12), path(13), path(14), path(10)}
	grants.grant(large)
	for _, dropped := range large {
		if !grants.granted(dropped) {
			t.Fatalf("part of one drop was refused: %s", dropped)
		}
	}
	if grants.granted(path(4)) || grants.len() != 5 {
		t.Fatalf("ledger after a large drop holds %d paths (older grant kept: %v), want exactly the 5 dropped", grants.len(), grants.granted(path(4)))
	}
	// The next drop brings the ledger back within its limit.
	grants.grant([]string{path(20)})
	if grants.len() != 3 || !grants.granted(path(20)) || !grants.granted(path(14)) || grants.granted(path(10)) {
		t.Fatalf("ledger after the following drop holds %d paths", grants.len())
	}
}

func TestExternalPathGrantsAreSafeForConcurrentDropsAndImports(t *testing.T) {
	grants := newExternalPathGrants(64)
	var wait sync.WaitGroup
	for worker := range 8 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			for index := range 200 {
				path := absoluteTestPath("drops", fmt.Sprintf("%d-%d.md", worker, index))
				grants.grant([]string{path})
				if !grants.granted(path) && grants.len() < 64 {
					t.Errorf("a path granted a moment ago is missing from a ledger with room")
				}
			}
		}()
	}
	wait.Wait()
	if got := grants.len(); got != 64 {
		t.Fatalf("ledger holds %d paths, want its limit of 64", got)
	}
	var missing *externalPathGrants
	missing.grant([]string{absoluteTestPath("x.md")})
	if missing.granted(absoluteTestPath("x.md")) || missing.len() != 0 {
		t.Fatal("an absent ledger granted a path")
	}
}

// The import bindings take absolute paths from the page. They act only on a
// path a file drop handed to Figaro or one registered as an external
// document, and say so in words the user can act on.
func TestExternalImportRefusesPathsThatWereNeverDroppedOrOpened(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	outside := t.TempDir()
	secret := filepath.Join(outside, "secret.txt")
	if err := os.WriteFile(secret, []byte("not for the vault"), 0600); err != nil {
		t.Fatal(err)
	}
	secretFolder := filepath.Join(outside, "Private")
	if err := os.MkdirAll(secretFolder, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(secretFolder, "key.txt"), []byte("key"), 0600); err != nil {
		t.Fatal(err)
	}
	dropped := filepath.Join(outside, "dropped.md")
	if err := os.WriteFile(dropped, []byte("dropped"), 0644); err != nil {
		t.Fatal(err)
	}
	missing := filepath.Join(outside, "missing.txt")
	before := vaultUserFiles(t, vaultPath)

	imports := map[string]func(paths []string) (*CopyExternalResult, error){
		"copy":    func(paths []string) (*CopyExternalResult, error) { return app.CopyExternalPaths(paths, "", false) },
		"replace": func(paths []string) (*CopyExternalResult, error) { return app.CopyExternalPaths(paths, "", true) },
		"merge":   func(paths []string) (*CopyExternalResult, error) { return app.MergeExternalPaths(paths, "") },
	}
	dropFilesForTest(app, dropped)
	for name, run := range imports {
		for _, paths := range [][]string{{secret}, {secretFolder}, {missing}, {dropped, secret}, {filepath.Join(outside, ".", "secret.txt")}} {
			result, err := run(paths)
			if err != nil {
				t.Fatalf("%s %v: %v", name, paths, err)
			}
			if result.Success || !strings.Contains(result.Error, "dropped onto its window or opened with it") {
				t.Fatalf("%s %v = %+v, want the ungranted path refused", name, paths, result)
			}
			// An existing path and a missing one draw the same refusal.
			if strings.Contains(result.Error, "Cannot inspect") {
				t.Fatalf("%s %v inspected a path before refusing it: %q", name, paths, result.Error)
			}
		}
	}
	if after := vaultUserFiles(t, vaultPath); len(after) != len(before) {
		t.Fatalf("a refused import wrote to the vault: %v", after)
	}

	// The dropped file itself imports, in any spelling of its path.
	result, err := app.MergeExternalPaths([]string{filepath.Join(outside, ".", "dropped.md")}, "")
	if err != nil || !result.Success || len(result.Paths) != 1 || result.Paths[0] != "dropped.md" {
		t.Fatalf("import of the dropped file = %+v, %v", result, err)
	}
	if got := readTestFile(t, vaultPath, "dropped.md"); got != "dropped" {
		t.Fatalf("imported content = %q", got)
	}
	// A dropped folder imports with everything beneath it.
	dropFilesForTest(app, secretFolder)
	result, err = app.CopyExternalPaths([]string{secretFolder}, "", false)
	if err != nil || !result.Success {
		t.Fatalf("import of a dropped folder = %+v, %v", result, err)
	}
	if got := readTestFile(t, vaultPath, "Private/key.txt"); got != "key" {
		t.Fatalf("imported folder content = %q", got)
	}
	// Its contents were not dropped by themselves.
	result, err = app.MergeExternalPaths([]string{filepath.Join(secretFolder, "key.txt")}, "")
	if err != nil || result.Success {
		t.Fatalf("import of a file inside a dropped folder = %+v, %v; want it refused", result, err)
	}
}

// A file the operating system opened is registered as an external document;
// "Import this note into the vault" passes its path without any drop.
func TestExternalImportAcceptsARegisteredExternalDocument(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	outside := t.TempDir()
	opened := filepath.Join(outside, "opened.md")
	if err := os.WriteFile(opened, []byte("# Opened\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if registered := app.registerLaunchExternalFiles([]string{opened}); len(registered) != 1 {
		t.Fatalf("registered = %#v", registered)
	}

	result, err := app.MergeExternalPaths([]string{opened}, "")
	if err != nil || !result.Success || len(result.Paths) != 1 || result.Paths[0] != "opened.md" {
		t.Fatalf("import of an opened external note = %+v, %v", result, err)
	}
	if got := readTestFile(t, vaultPath, "opened.md"); got != "# Opened\n" {
		t.Fatalf("imported content = %q", got)
	}
	// A dropped Markdown file opened in place is registered the same way.
	droppedNote := filepath.Join(outside, "dropped.md")
	if err := os.WriteFile(droppedNote, []byte("# Dropped\n"), 0644); err != nil {
		t.Fatal(err)
	}
	dropFilesForTest(app, droppedNote)
	openedDrop, err := app.OpenDroppedMarkdownFiles([]string{droppedNote})
	if err != nil || len(openedDrop.External) != 1 {
		t.Fatalf("OpenDroppedMarkdownFiles = %#v, %v", openedDrop, err)
	}
	app.droppedPaths = newExternalPathGrants(externalPathGrantLimit) // the drop's grant has since been evicted
	result, err = app.MergeExternalPaths([]string{droppedNote}, "")
	if err != nil || !result.Success {
		t.Fatalf("import of an open dropped note after its grant expired = %+v, %v", result, err)
	}
}
