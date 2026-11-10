package desktop

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	searchmodel "figaro/internal/search"

	"github.com/fsnotify/fsnotify"
)

func TestVaultIndexUpdatesKnownSaveWithoutRewalkingVault(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "tasks.md", "- [ ] Old task #todo\n")
	writeTestFile(t, vaultPath, "other.md", "Unrelated note\n")

	board, err := app.GetKanbanBoard()
	if err != nil {
		t.Fatalf("initial GetKanbanBoard: %v", err)
	}
	if got := board["todo"]; len(got) != 1 || strings.TrimSpace(got[0].Text) != "Old task" {
		t.Fatalf("initial todo cards = %#v, want Old task", got)
	}
	initialIndex := app.vaultIndex
	if initialIndex == nil {
		t.Fatal("GetKanbanBoard did not build the shared vault index")
	}

	saved, err := app.SaveFile("tasks.md", "- [ ] Updated task #review\n[Launch](2025-02-14.md)\n", 0)
	if err != nil || !saved.Success {
		t.Fatalf("SaveFile: result=%+v err=%v", saved, err)
	}
	if app.vaultIndex != initialIndex {
		t.Fatal("saving one known note replaced the vault index instead of updating it incrementally")
	}

	board, err = app.GetKanbanBoard()
	if err != nil {
		t.Fatalf("GetKanbanBoard after save: %v", err)
	}
	if len(board["todo"]) != 0 {
		t.Fatalf("stale todo cards after save = %#v", board["todo"])
	}
	if got := board["review"]; len(got) != 1 || strings.TrimSpace(got[0].Text) != "Updated task" {
		t.Fatalf("review cards after save = %#v, want Updated task", got)
	}

	results, err := app.SearchFiles("Updated task", false)
	if err != nil || len(results) != 1 || results[0].Path != "tasks.md" {
		t.Fatalf("SearchFiles after indexed save = %#v, err=%v", results, err)
	}
	month, err := app.GetCalendarMonthData(2025, 2)
	if err != nil {
		t.Fatalf("GetCalendarMonthData after indexed save: %v", err)
	}
	if got, want := month.DaysWithLinks, []int{14}; !reflect.DeepEqual(got, want) {
		t.Fatalf("DaysWithLinks after indexed save = %v, want %v", got, want)
	}
}

func TestIndexMarkdownFileBuildsTagsCardsDatesAndBacklinksInOneDocumentWalk(t *testing.T) {
	_, vaultPath := newTestApp(t)
	content := strings.Join([]string{
		"- [ ] First task #todo",
		"[Launch](2025-02-14.md)",
		"[2025-02-15]()",
		"[target](target.md)",
		"- [ ] Review task #review #todo",
		"[Anchor](#todo) #fff",
	}, "\n")
	writeTestFile(t, vaultPath, "notes/source.md", content)
	info, err := os.Stat(filepath.Join(vaultPath, "notes", "source.md"))
	if err != nil {
		t.Fatalf("stat source: %v", err)
	}

	indexed := indexMarkdownFile("notes/source.md", info, []byte(content))
	if got, want := indexed.tags, []string{"todo", "review"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("tags = %#v, want %#v", got, want)
	}
	if got, want := indexed.linkedDays, []string{"2025-02-14", "2025-02-15"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("linked days = %#v, want %#v", got, want)
	}
	if got := indexed.linked["2025-02-14"]; got.LineNum != 2 || got.Path != "notes/source.md" {
		t.Fatalf("dated linked note = %#v, want source line 2", got)
	}
	if got := indexed.backlinks["target.md"]; got.LineNum != 4 || got.Path != "notes/source.md" {
		t.Fatalf("backlink = %#v, want source line 4", got)
	}
	if got, want := []string{indexed.cards[0].Tag, indexed.cards[1].Tag, indexed.cards[2].Tag}, []string{"todo", "review", "todo"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("card tags = %#v, want %#v", got, want)
	}
	if len(indexed.cards) != 3 {
		t.Fatalf("cards = %#v, want three standalone hashtag cards", indexed.cards)
	}
}

func TestVaultIndexBulkRebuildAppendsSortedPostingsAndAdvancesRevision(t *testing.T) {
	_, vaultPath := newTestApp(t)
	index := newVaultIndex()
	for _, path := range []string{"zeta.md", "alpha.md", "middle.md"} {
		content := "shared search body\n"
		writeTestFile(t, vaultPath, path, content)
		info, err := os.Stat(filepath.Join(vaultPath, path))
		if err != nil {
			t.Fatal(err)
		}
		index.files[path] = indexMarkdownFile(path, info, []byte(content))
	}

	index.rebuildDerived()
	if got, want := index.paths, []string{"alpha.md", "middle.md", "zeta.md"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("paths = %#v, want %#v", got, want)
	}
	if got, want := index.searchTermPostings["shared"], index.paths; !reflect.DeepEqual(got, want) {
		t.Fatalf("term postings = %#v, want sorted %#v", got, want)
	}
	if got, want := index.searchTrigrams["sha"], index.paths; !reflect.DeepEqual(got, want) {
		t.Fatalf("trigram postings = %#v, want sorted %#v", got, want)
	}
	if index.revision != 1 {
		t.Fatalf("revision = %d, want 1", index.revision)
	}
	index.rebuildDerived()
	if index.revision != 2 {
		t.Fatalf("revision after second rebuild = %d, want 2", index.revision)
	}
}

func TestRemapVaultIndexedFileReusesBodyAnalysisAndUpdatesPathDerivedRecords(t *testing.T) {
	_, vaultPath := newTestApp(t)
	content := strings.Join([]string{
		"# Project day",
		"- [ ] Review #todo",
		"[Target](./Target.md)",
		"[Launch](2026-09-01.md)",
	}, "\n")
	writeTestFile(t, vaultPath, "Old/2026-09-04.md", content)
	info, err := os.Stat(filepath.Join(vaultPath, "Old", "2026-09-04.md"))
	if err != nil {
		t.Fatal(err)
	}
	original := indexMarkdownFile("Old/2026-09-04.md", info, []byte(content))
	remapped := remapVaultIndexedFile(original, "Archive/2026-09-04.md")

	if remapped.path != "Archive/2026-09-04.md" || remapped.cards[0].File != remapped.path {
		t.Fatalf("remapped path records = %#v", remapped)
	}
	if got, want := remapped.linkTargets, []string{"2026-09-01.md", "Archive/Target.md"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("link targets = %#v, want %#v", got, want)
	}
	if got := remapped.backlinks["archive/target.md"]; got.Path != remapped.path || got.Name != remapped.name {
		t.Fatalf("remapped backlink = %#v", got)
	}
	if got := remapped.noteLinks["2026-09-01"]; got.Path != remapped.path || got.Name != remapped.name {
		t.Fatalf("remapped linked note = %#v", got)
	}
	if len(original.searchTrigrams) == 0 || &original.searchTrigrams[0] != &remapped.searchTrigrams[0] {
		t.Fatal("path-only remap copied immutable body trigrams")
	}
	if body := searchmodel.FieldBody; len(original.searchDocument.Fields[body].Terms) == 0 ||
		&original.searchDocument.Fields[body].Terms[0] != &remapped.searchDocument.Fields[body].Terms[0] {
		t.Fatal("path-only remap copied immutable body term statistics")
	}
	if original.cards[0].File != "Old/2026-09-04.md" {
		t.Fatalf("remap mutated original cards: %#v", original.cards)
	}
}

func TestVaultWatcherChangesUpdateOnlyAffectedIndexedNote(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "tasks.md", "- [ ] Existing #todo\n")

	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("initial GetKanbanBoard: %v", err)
	}
	initialIndex := app.vaultIndex
	if err := os.WriteFile(filepath.Join(vaultPath, "tasks.md"), []byte("- [ ] External change #review\n"), 0644); err != nil {
		t.Fatalf("external write: %v", err)
	}
	app.handleVaultFilesystemChanges([]vaultWatchChange{{
		Path: filepath.Join(vaultPath, "tasks.md"),
		Op:   fsnotify.Write,
	}})
	if app.vaultIndex != initialIndex {
		t.Fatal("a one-file watcher write rebuilt the full vault index")
	}
	board, err := app.GetKanbanBoard()
	if err != nil {
		t.Fatalf("GetKanbanBoard after external write: %v", err)
	}
	if len(board["todo"]) != 0 || len(board["review"]) != 1 {
		t.Fatalf("board after external write = %#v, want one review card", board)
	}

	writeTestFile(t, vaultPath, "new.md", "- [ ] New note #done\n")
	app.handleVaultFilesystemChanges([]vaultWatchChange{{
		Path: filepath.Join(vaultPath, "new.md"),
		Op:   fsnotify.Create,
	}})
	board, err = app.GetKanbanBoard()
	if err != nil || len(board["done"]) != 1 {
		t.Fatalf("board after external create = %#v, err=%v", board, err)
	}

	if err := os.Remove(filepath.Join(vaultPath, "new.md")); err != nil {
		t.Fatalf("external remove: %v", err)
	}
	app.handleVaultFilesystemChanges([]vaultWatchChange{{
		Path: filepath.Join(vaultPath, "new.md"),
		Op:   fsnotify.Remove,
	}})
	board, err = app.GetKanbanBoard()
	if err != nil || len(board["done"]) != 0 {
		t.Fatalf("board after external remove = %#v, err=%v", board, err)
	}
}

func TestInternalVaultWatcherAcknowledgementSkipsRedundantKanbanRefresh(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "tasks.md", "- [ ] Existing #todo\n")
	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("initial GetKanbanBoard: %v", err)
	}

	if result, err := app.SaveFile("tasks.md", "- [ ] Saved in Figaro #review\n", 0); err != nil || !result.Success {
		t.Fatalf("SaveFile: result=%+v err=%v", result, err)
	}
	internal := app.applyVaultFilesystemChanges([]vaultWatchChange{{
		Path: filepath.Join(vaultPath, "tasks.md"),
		Op:   fsnotify.Write,
	}})
	if internal.treeChanged || internal.kanbanChanged {
		t.Fatalf("internal watcher acknowledgement = %#v, want no frontend tree or Kanban refresh", internal)
	}

	if err := os.WriteFile(filepath.Join(vaultPath, "tasks.md"), []byte("- [ ] External #urgent\n"), 0644); err != nil {
		t.Fatalf("external write: %v", err)
	}
	external := app.applyVaultFilesystemChanges([]vaultWatchChange{{
		Path: filepath.Join(vaultPath, "tasks.md"),
		Op:   fsnotify.Write,
	}})
	if !external.kanbanChanged || external.treeChanged {
		t.Fatalf("external Markdown write = %#v, want Kanban refresh without tree refresh", external)
	}
	if len(internal.paths) != 0 {
		t.Fatalf("internal acknowledgement reported paths %v", internal.paths)
	}
	if len(external.paths) != 1 || external.paths[0] != "tasks.md" {
		t.Fatalf("external change paths = %v, want [tasks.md]", external.paths)
	}
}

func TestVaultChangeScopeIsUnknownForUnscopedOrOversizedBatches(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "Images/photo.png", "png")
	if result := app.applyVaultFilesystemChanges(nil); result.paths != nil {
		t.Fatalf("unscoped notification paths = %v, want unknown", result.paths)
	}
	image := app.applyVaultFilesystemChanges([]vaultWatchChange{{Path: filepath.Join(vaultPath, "Images", "photo.png"), Op: fsnotify.Write}})
	if len(image.paths) != 1 || image.paths[0] != "Images/photo.png" {
		t.Fatalf("image change paths = %v", image.paths)
	}
	many := make([]vaultWatchChange, maximumReportedVaultChanges+1)
	for index := range many {
		many[index] = vaultWatchChange{Path: filepath.Join(vaultPath, "Images", "photo.png"), Op: fsnotify.Write}
	}
	if result := app.applyVaultFilesystemChanges(many); result.paths != nil {
		t.Fatalf("oversized batch paths should be unknown, got %d", len(result.paths))
	}
}

func TestCopyPathAcknowledgesCreatedWatcherEvents(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "Outside.md", "# Outside\n")
	writeTestFile(t, vaultPath, "Projects/tasks.md", "- [ ] Existing #todo\n[Outside](../Outside.md)\n")
	writeTestFile(t, vaultPath, "Projects/stable.md", "stable\n")
	if result, err := app.CreateDirectory("Archive"); err != nil || !result.Success {
		t.Fatalf("CreateDirectory: result=%+v err=%v", result, err)
	}
	if _, err := app.GetFileTree(); err != nil {
		t.Fatalf("warm file tree: %v", err)
	}
	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("warm vault index: %v", err)
	}
	warmIndex := app.vaultIndex

	result, err := app.CopyPath("Projects", "Archive")
	if err != nil || result == nil || !result.Success {
		t.Fatalf("CopyPath: result=%+v err=%v", result, err)
	}
	if got, want := result.UpdatedLinks, []string{"Archive/Projects/tasks.md"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("rewritten copied links = %#v, want %#v", got, want)
	}
	internal := app.applyVaultFilesystemChanges([]vaultWatchChange{
		{Path: filepath.Join(vaultPath, "Archive", "Projects"), Op: fsnotify.Create},
		{Path: filepath.Join(vaultPath, "Archive", "Projects", "stable.md"), Op: fsnotify.Create | fsnotify.Write},
		{Path: filepath.Join(vaultPath, "Archive", "Projects", "tasks.md"), Op: fsnotify.Create | fsnotify.Write},
	})
	if internal.treeChanged || internal.kanbanChanged {
		t.Fatalf("copy watcher acknowledgement = %#v, want no duplicate frontend refresh", internal)
	}
	if app.vaultIndex != warmIndex {
		t.Fatal("copy watcher events replaced the incrementally updated vault index")
	}
	rewriteBatch := app.applyVaultFilesystemChanges([]vaultWatchChange{{
		Path: filepath.Join(vaultPath, "Archive", "Projects", "tasks.md"),
		Op:   fsnotify.Rename | fsnotify.Write,
	}})
	if rewriteBatch.treeChanged || rewriteBatch.kanbanChanged {
		t.Fatalf("copied-link rewrite acknowledgement = %#v, want no duplicate frontend refresh", rewriteBatch)
	}

	copyPath := filepath.Join(vaultPath, "Archive", "Projects", "tasks.md")
	if err := os.WriteFile(copyPath, []byte("- [ ] External #urgent\n"), 0644); err != nil {
		t.Fatalf("external copied-note edit: %v", err)
	}
	external := app.applyVaultFilesystemChanges([]vaultWatchChange{{Path: copyPath, Op: fsnotify.Write}})
	if external.treeChanged || !external.kanbanChanged {
		t.Fatalf("later external copied-note edit = %#v, want a Kanban refresh only", external)
	}
	board, err := app.GetKanbanBoard()
	if err != nil || len(board["urgent"]) != 1 {
		t.Fatalf("board after external copied-note edit = %#v, err=%v", board, err)
	}
}

func TestVaultIndexKeepsUnchangedDerivedContributionsOnKnownSave(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "tasks.md", "- [ ] Replace me #todo\n[Today](2025-02-14.md)\n")
	writeTestFile(t, vaultPath, "stable.md", "- [ ] Keep me #later\n[Stable date](2025-02-15.md)\n")

	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("initial GetKanbanBoard: %v", err)
	}
	initialCalendar := app.vaultIndex.calendar
	stableCards := app.vaultIndex.cardsByTag["later"]
	if len(stableCards) != 1 {
		t.Fatalf("stable cards = %#v, want one later card", stableCards)
	}
	stableCard := &stableCards[0]

	saved, err := app.SaveFile("tasks.md", "- [ ] Replacement #review\n[Tomorrow](2025-02-16.md)\n", 0)
	if err != nil || !saved.Success {
		t.Fatalf("SaveFile: result=%+v err=%v", saved, err)
	}
	if app.vaultIndex.calendar != initialCalendar {
		t.Fatal("known save rebuilt the full calendar projection")
	}
	updatedStableCards := app.vaultIndex.cardsByTag["later"]
	if len(updatedStableCards) != 1 || &updatedStableCards[0] != stableCard {
		t.Fatalf("known save rebuilt unchanged Kanban contributions: %#v", updatedStableCards)
	}

	month, err := app.GetCalendarMonthData(2025, 2)
	if err != nil {
		t.Fatalf("GetCalendarMonthData: %v", err)
	}
	if got, want := month.DaysWithLinks, []int{15, 16}; !reflect.DeepEqual(got, want) {
		t.Fatalf("DaysWithLinks after replacement = %v, want %v", got, want)
	}
	board, err := app.GetKanbanBoard()
	if err != nil {
		t.Fatalf("GetKanbanBoard after save: %v", err)
	}
	if len(board["todo"]) != 0 || len(board["later"]) != 1 || len(board["review"]) != 1 {
		t.Fatalf("board after replacement = %#v", board)
	}
}

func TestVaultIndexUpdatesSearchAndBacklinksWithoutReplacingUnchangedProjection(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "source.md", "Old searchable phrase\n[Target](target.md)\n")
	writeTestFile(t, vaultPath, "stable.md", "[Stable-target](stable-target.md)\n")

	if _, err := app.SearchFiles("searchable", false); err != nil {
		t.Fatalf("initial SearchFiles: %v", err)
	}
	stableBacklinks := app.vaultIndex.backlinksByTarget["stable-target.md"]
	if len(stableBacklinks) != 1 {
		t.Fatalf("stable backlinks = %#v, want one contribution", stableBacklinks)
	}
	stableBacklink := &stableBacklinks[0]

	saved, err := app.SaveFile("source.md", "Replacement searchable phrase\n[Next](next.md)\n", 0)
	if err != nil || !saved.Success {
		t.Fatalf("SaveFile: result=%+v err=%v", saved, err)
	}

	oldResults, err := app.SearchFiles("old searchable", false)
	if err != nil || len(oldResults) != 0 {
		t.Fatalf("old indexed search results = %#v, err=%v", oldResults, err)
	}
	newResults, err := app.SearchFiles("replacement searchable", false)
	if err != nil || len(newResults) != 1 || newResults[0].Path != "source.md" {
		t.Fatalf("replacement indexed search results = %#v, err=%v", newResults, err)
	}
	oldBacklinks, err := app.SearchBacklinks("target.md")
	if err != nil || len(oldBacklinks) != 0 {
		t.Fatalf("stale backlinks after indexed save = %#v, err=%v", oldBacklinks, err)
	}
	newBacklinks, err := app.SearchBacklinks("next.md")
	if err != nil || len(newBacklinks) != 1 || newBacklinks[0].Path != "source.md" {
		t.Fatalf("replacement backlinks after indexed save = %#v, err=%v", newBacklinks, err)
	}
	updatedStableBacklinks := app.vaultIndex.backlinksByTarget["stable-target.md"]
	if len(updatedStableBacklinks) != 1 || &updatedStableBacklinks[0] != stableBacklink {
		t.Fatalf("known save rebuilt an unchanged backlink contribution: %#v", updatedStableBacklinks)
	}
}

func TestSortedSearchPostingsInsertRemoveAndLookupWithoutDuplicates(t *testing.T) {
	postings := []string{"a.md", "c.md"}
	postings = insertSortedPath(postings, "b.md")
	postings = insertSortedPath(postings, "b.md")
	if got, want := postings, []string{"a.md", "b.md", "c.md"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("insertSortedPath = %v, want %v", got, want)
	}
	if !containsSortedPath(postings, "b.md") || containsSortedPath(postings, "missing.md") {
		t.Fatalf("containsSortedPath returned the wrong membership for %v", postings)
	}
	postings = removeSortedPath(postings, "b.md")
	postings = removeSortedPath(postings, "missing.md")
	if got, want := postings, []string{"a.md", "c.md"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("removeSortedPath = %v, want %v", got, want)
	}
}

func TestColdIndexTextPoolSharesImmutableSearchRepresentations(t *testing.T) {
	pool := make(map[string]vaultIndexedText)
	first := pooledVaultIndexedText(pool, "Repeated template content")
	second := pooledVaultIndexedText(pool, "Repeated template content")
	if len(pool) != 1 {
		t.Fatalf("pooled text entries = %d, want 1", len(pool))
	}
	if len(first.searchTrigrams) == 0 || &first.searchTrigrams[0] != &second.searchTrigrams[0] {
		t.Fatal("identical text did not share its immutable trigram slice")
	}
	if first.content != second.content || first.searchLower != second.searchLower {
		t.Fatal("identical text pool changed searchable content")
	}
}

func TestPlanVaultWatchChangeFollowsTheDiskNotTheOperation(t *testing.T) {
	for _, test := range []struct {
		name     string
		op       fsnotify.Op
		markdown bool
		state    vaultWatchPathState
		want     vaultWatchPlan
	}{
		{
			name: "note rewritten by remove and create is read again",
			op:   fsnotify.Remove | fsnotify.Create, markdown: true, state: vaultWatchPathRegularFile,
			want: vaultWatchPlan{indexNote: true, treeChanged: true, kanbanChanged: true},
		},
		{
			name: "note replaced by rename is read again",
			op:   fsnotify.Rename | fsnotify.Create | fsnotify.Write, markdown: true, state: vaultWatchPathRegularFile,
			want: vaultWatchPlan{indexNote: true, treeChanged: true, kanbanChanged: true},
		},
		{
			name: "note written in place refreshes only its cards",
			op:   fsnotify.Write, markdown: true, state: vaultWatchPathRegularFile,
			want: vaultWatchPlan{indexNote: true, kanbanChanged: true},
		},
		{
			name: "note that is gone is forgotten",
			op:   fsnotify.Remove, markdown: true, state: vaultWatchPathMissing,
			want: vaultWatchPlan{forgetSubtree: true, treeChanged: true, kanbanChanged: true},
		},
		{
			name: "note created and deleted within the window is forgotten",
			op:   fsnotify.Create | fsnotify.Write, markdown: true, state: vaultWatchPathMissing,
			want: vaultWatchPlan{forgetSubtree: true, treeChanged: true, kanbanChanged: true},
		},
		{
			name: "note replaced by a symbolic link is forgotten",
			op:   fsnotify.Create, markdown: true, state: vaultWatchPathOther,
			want: vaultWatchPlan{forgetSubtree: true, treeChanged: true, kanbanChanged: true},
		},
		{
			name: "folder that appeared is reconciled",
			op:   fsnotify.Create, state: vaultWatchPathDirectory,
			want: vaultWatchPlan{reconcileFolder: true, treeChanged: true},
		},
		{
			name: "folder replaced in place is reconciled",
			op:   fsnotify.Rename | fsnotify.Create, state: vaultWatchPathDirectory,
			want: vaultWatchPlan{reconcileFolder: true, treeChanged: true},
		},
		{
			name: "folder named like a note is still a folder",
			op:   fsnotify.Create, markdown: true, state: vaultWatchPathDirectory,
			want: vaultWatchPlan{reconcileFolder: true, treeChanged: true},
		},
		{
			name: "folder whose listing changed only refreshes its tree entry",
			op:   fsnotify.Write, state: vaultWatchPathDirectory,
			want: vaultWatchPlan{touchEntry: true},
		},
		{
			name: "folder renamed away or removed is forgotten with its notes",
			op:   fsnotify.Rename, state: vaultWatchPathMissing,
			want: vaultWatchPlan{forgetSubtree: true, treeChanged: true},
		},
		{
			name: "attachment written in place refreshes only its tree entry",
			op:   fsnotify.Write, state: vaultWatchPathRegularFile,
			want: vaultWatchPlan{touchEntry: true},
		},
		{
			name: "attachment that appeared changes only the tree",
			op:   fsnotify.Create, state: vaultWatchPathRegularFile,
			want: vaultWatchPlan{treeChanged: true},
		},
		{
			name: "folder replaced by a plain file leaves no notes behind",
			op:   fsnotify.Remove | fsnotify.Create, state: vaultWatchPathRegularFile,
			want: vaultWatchPlan{forgetSubtree: true, treeChanged: true},
		},
		{
			name: "operation the watcher does not forward needs nothing",
			op:   fsnotify.Chmod, markdown: true, state: vaultWatchPathRegularFile,
			want: vaultWatchPlan{},
		},
	} {
		if got := planVaultWatchChange(test.op, test.markdown, test.state); got != test.want {
			t.Errorf("%s: plan = %+v, want %+v", test.name, got, test.want)
		}
	}
}

func TestVaultWatcherReindexesNoteRewrittenByRemoveAndCreate(t *testing.T) {
	app, vaultPath := newTestApp(t)
	t.Cleanup(func() { _ = os.RemoveAll(vaultPath) })
	writeTestFile(t, vaultPath, "tasks.md", "- [ ] Before #todo\n")
	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("initial GetKanbanBoard: %v", err)
	}
	initialIndex := app.vaultIndex

	notePath := filepath.Join(vaultPath, "tasks.md")
	for _, save := range []struct {
		op      fsnotify.Op
		content string
		tag     string
	}{
		// Vim and "git checkout" unlink the note and create it again.
		{op: fsnotify.Remove | fsnotify.Create | fsnotify.Write, content: "- [ ] Rewritten #review\n", tag: "review"},
		// Editors that save through a sibling temporary file rename over it.
		{op: fsnotify.Rename | fsnotify.Create, content: "- [ ] Replaced #urgent\n", tag: "urgent"},
	} {
		if err := os.Remove(notePath); err != nil {
			t.Fatalf("external remove: %v", err)
		}
		if err := os.WriteFile(notePath, []byte(save.content), 0644); err != nil {
			t.Fatalf("external create: %v", err)
		}
		result := app.applyVaultFilesystemChanges([]vaultWatchChange{{Path: notePath, Op: save.op}})
		if !result.kanbanChanged || !result.treeChanged {
			t.Fatalf("rewritten note result = %#v, want tree and Kanban refresh", result)
		}
		if app.vaultIndex != initialIndex {
			t.Fatal("an externally rewritten note rebuilt the whole index")
		}
		board, err := app.GetKanbanBoard()
		if err != nil {
			t.Fatalf("GetKanbanBoard: %v", err)
		}
		if len(board[save.tag]) != 1 || board[save.tag][0].File != "tasks.md" {
			t.Fatalf("board after op %v = %#v, want the rewritten note's %s card", save.op, board, save.tag)
		}
		results, err := app.SearchFiles(strings.Fields(save.content)[3], false)
		if err != nil || len(results) != 1 || results[0].Path != "tasks.md" {
			t.Fatalf("search after op %v = %#v, err=%v; the note left the index", save.op, results, err)
		}
	}
}

func TestVaultWatcherFollowsFolderRenamedOutsideFigaro(t *testing.T) {
	app, vaultPath := newTestApp(t)
	t.Cleanup(func() { _ = os.RemoveAll(vaultPath) })
	writeTestFile(t, vaultPath, "Projects/plan.md", "- [ ] Plan #todo\n")
	writeTestFile(t, vaultPath, "Projects/2025/roadmap.md", "- [ ] Roadmap #todo\n")
	writeTestFile(t, vaultPath, "Projects-archive.md", "- [ ] Sibling name #todo\n")
	writeTestFile(t, vaultPath, "Inbox.md", "- [ ] Inbox #todo\n")
	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("initial GetKanbanBoard: %v", err)
	}
	initialIndex := app.vaultIndex

	if err := os.Rename(filepath.Join(vaultPath, "Projects"), filepath.Join(vaultPath, "Work")); err != nil {
		t.Fatalf("external folder rename: %v", err)
	}
	result := app.applyVaultFilesystemChanges([]vaultWatchChange{
		{Path: filepath.Join(vaultPath, "Projects"), Op: fsnotify.Rename},
		{Path: filepath.Join(vaultPath, "Work"), Op: fsnotify.Create},
	})
	if !result.treeChanged || !result.kanbanChanged {
		t.Fatalf("folder rename result = %#v, want tree and Kanban refresh", result)
	}
	if app.vaultIndex != initialIndex {
		t.Fatal("a small external folder rename rebuilt the whole index")
	}
	board, err := app.GetKanbanBoard()
	if err != nil {
		t.Fatalf("GetKanbanBoard: %v", err)
	}
	files := make([]string, 0)
	for _, card := range board["todo"] {
		files = append(files, card.File)
	}
	if want := []string{"Inbox.md", "Projects-archive.md", "Work/2025/roadmap.md", "Work/plan.md"}; !reflect.DeepEqual(files, want) {
		t.Fatalf("todo card files after folder rename = %v, want %v", files, want)
	}

	outside := filepath.Join(t.TempDir(), "Work")
	if err := os.Rename(filepath.Join(vaultPath, "Work"), outside); err != nil {
		t.Skipf("cannot move a folder out of the temporary vault: %v", err)
	}
	result = app.applyVaultFilesystemChanges([]vaultWatchChange{{Path: filepath.Join(vaultPath, "Work"), Op: fsnotify.Rename}})
	if !result.treeChanged || !result.kanbanChanged {
		t.Fatalf("folder moved out result = %#v, want tree and Kanban refresh", result)
	}
	board, err = app.GetKanbanBoard()
	if err != nil || len(board["todo"]) != 2 {
		t.Fatalf("board after the folder left the vault = %#v, err=%v; want only the two root notes", board, err)
	}
	if results, err := app.SearchFiles("Roadmap", false); err != nil || len(results) != 0 {
		t.Fatalf("search still finds a note in the departed folder: %#v, err=%v", results, err)
	}
}

func TestVaultWatcherIndexesFolderMovedIntoVaultByTheSingleNoteRules(t *testing.T) {
	app, vaultPath := newTestApp(t)
	t.Cleanup(func() { _ = os.RemoveAll(vaultPath) })
	writeTestFile(t, vaultPath, "Inbox.md", "- [ ] Inbox #todo\n")
	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("initial GetKanbanBoard: %v", err)
	}
	initialIndex := app.vaultIndex

	staging := filepath.Join(t.TempDir(), "Imported")
	writeTestFile(t, staging, "note.md", "- [ ] Imported #todo\n")
	writeTestFile(t, staging, "deep/er/nested.MD", "- [ ] Nested #review\n")
	writeTestFile(t, staging, "binary.md", "not\x00text")
	writeTestFile(t, staging, ".obsidian/hidden.md", "- [ ] Hidden #todo\n")
	writeTestFile(t, staging, "photo.png", "png")
	if err := os.Symlink(filepath.Join(vaultPath, "Inbox.md"), filepath.Join(staging, "linked.md")); err != nil {
		t.Logf("symbolic links unavailable, continuing without one: %v", err)
	}
	if err := os.Rename(staging, filepath.Join(vaultPath, "Imported")); err != nil {
		t.Skipf("cannot move a folder into the temporary vault: %v", err)
	}

	result := app.applyVaultFilesystemChanges([]vaultWatchChange{{Path: filepath.Join(vaultPath, "Imported"), Op: fsnotify.Create}})
	if !result.treeChanged || !result.kanbanChanged {
		t.Fatalf("folder moved in result = %#v, want tree and Kanban refresh", result)
	}
	if len(result.paths) != 1 || result.paths[0] != "Imported" {
		t.Fatalf("folder moved in paths = %v, want [Imported]", result.paths)
	}
	if app.vaultIndex != initialIndex {
		t.Fatal("a small folder moved into the vault rebuilt the whole index")
	}
	indexed := app.vaultIndex.pathsAtOrBelow("Imported")
	if want := []string{"Imported/deep/er/nested.MD", "Imported/note.md"}; !reflect.DeepEqual(indexed, want) {
		t.Fatalf("indexed notes below the new folder = %v, want %v", indexed, want)
	}
	issues := app.GetVaultFileIssues()
	if len(issues) != 1 || issues[0].Path != "Imported/binary.md" || issues[0].Code != fileIssueBinary {
		t.Fatalf("file issues = %#v, want the binary note recorded like a single changed note", issues)
	}
	board, err := app.GetKanbanBoard()
	if err != nil || len(board["todo"]) != 2 || len(board["review"]) != 1 {
		t.Fatalf("board after folder moved in = %#v, err=%v", board, err)
	}

	// The same folder reported again, as after Figaro's own move, needs no work.
	repeated := app.applyVaultFilesystemChanges([]vaultWatchChange{{Path: filepath.Join(vaultPath, "Imported", "deep"), Op: fsnotify.Create}})
	if repeated.kanbanChanged {
		t.Fatalf("an already indexed folder asked for a Kanban refresh: %#v", repeated)
	}
}

func TestVaultWatcherRebuildsOnceWhenNewFoldersHoldTooManyNotes(t *testing.T) {
	app, vaultPath := newTestApp(t)
	t.Cleanup(func() { _ = os.RemoveAll(vaultPath) })
	writeTestFile(t, vaultPath, "Inbox.md", "- [ ] Inbox #todo\n")
	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("initial GetKanbanBoard: %v", err)
	}
	for index := 0; index <= maximumIncrementalWatchedNotes; index++ {
		writeTestFile(t, vaultPath, fmt.Sprintf("Bulk/note-%03d.md", index), "- [ ] Bulk #todo\n")
	}
	result := app.applyVaultFilesystemChanges([]vaultWatchChange{{Path: filepath.Join(vaultPath, "Bulk"), Op: fsnotify.Create}})
	if app.vaultIndex != nil {
		t.Fatal("a folder with more notes than the incremental limit was indexed one note at a time")
	}
	if !result.treeChanged || !result.kanbanChanged || result.paths != nil {
		t.Fatalf("oversized folder result = %#v, want a full refresh with unknown scope", result)
	}
	board, err := app.GetKanbanBoard()
	if err != nil || len(board["todo"]) != maximumIncrementalWatchedNotes+2 {
		t.Fatalf("rebuilt board holds %d todo cards, err=%v; want %d", len(board["todo"]), err, maximumIncrementalWatchedNotes+2)
	}
}

func TestVaultWatcherRebuildsOnceWhenOneBatchRewritesTooManyNotes(t *testing.T) {
	app, vaultPath := newTestApp(t)
	t.Cleanup(func() { _ = os.RemoveAll(vaultPath) })
	// What "git pull" does to a busy vault: hundreds of notes rewritten, each
	// reported as its own event rather than as one new folder.
	changes := make([]vaultWatchChange, 0, maximumIncrementalWatchedNotes+1)
	for index := 0; index <= maximumIncrementalWatchedNotes; index++ {
		name := fmt.Sprintf("Pulled/note-%03d.md", index)
		writeTestFile(t, vaultPath, name, "- [ ] Before #todo\n")
		changes = append(changes, vaultWatchChange{Path: filepath.Join(vaultPath, filepath.FromSlash(name)), Op: fsnotify.Write})
	}
	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("initial GetKanbanBoard: %v", err)
	}
	for index := 0; index <= maximumIncrementalWatchedNotes; index++ {
		writeTestFile(t, vaultPath, fmt.Sprintf("Pulled/note-%03d.md", index), "- [ ] After #wip\n")
	}

	// One fewer than the limit is still applied note by note.
	withinLimit := app.applyVaultFilesystemChanges(changes[:maximumIncrementalWatchedNotes])
	if app.vaultIndex == nil || withinLimit.paths == nil {
		t.Fatalf("a batch within the limit was not applied incrementally: %#v", withinLimit)
	}

	result := app.applyVaultFilesystemChanges(changes)
	if app.vaultIndex != nil {
		t.Fatal("a batch above the incremental limit was indexed one note at a time")
	}
	if !result.treeChanged || !result.kanbanChanged || result.paths != nil {
		t.Fatalf("oversized batch result = %#v, want a full refresh with unknown scope", result)
	}
	board, err := app.GetKanbanBoard()
	if err != nil || len(board["wip"]) != maximumIncrementalWatchedNotes+1 || len(board["todo"]) != 0 {
		t.Fatalf("rebuilt board: %d wip, %d todo, err=%v", len(board["wip"]), len(board["todo"]), err)
	}
}

func TestRenameAcknowledgesItsOwnLinkRewritesToTheWatcher(t *testing.T) {
	app, vaultPath := newTestApp(t)
	t.Cleanup(func() { _ = os.RemoveAll(vaultPath) })
	writeTestFile(t, vaultPath, "Target.md", "# Target\n")
	writeTestFile(t, vaultPath, "notes/source.md", "- [ ] See [Target](Target.md) #todo\n")
	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("initial GetKanbanBoard: %v", err)
	}
	result, err := app.RenamePath("Target.md", "Renamed.md")
	if err != nil || !result.Success || !reflect.DeepEqual(result.UpdatedLinks, []string{"notes/source.md"}) {
		t.Fatalf("RenamePath: result=%+v err=%v", result, err)
	}
	indexed := app.vaultIndex

	// The watcher's echo of Figaro's own rewrite must not re-read the note,
	// replace the index or ask the frontend for another refresh.
	echo := app.applyVaultFilesystemChanges([]vaultWatchChange{{
		Path: filepath.Join(vaultPath, "notes", "source.md"),
		Op:   fsnotify.Create | fsnotify.Write,
	}})
	if echo.treeChanged || echo.kanbanChanged || len(echo.paths) != 0 {
		t.Fatalf("echo of an in-app link rewrite = %#v, want it acknowledged", echo)
	}
	if app.vaultIndex != indexed {
		t.Fatal("echo of an in-app link rewrite replaced the index")
	}
	// A later outside edit of the same note is still picked up.
	writeTestFile(t, vaultPath, "notes/source.md", "- [ ] Edited outside #wip\n")
	external := app.applyVaultFilesystemChanges([]vaultWatchChange{{Path: filepath.Join(vaultPath, "notes", "source.md"), Op: fsnotify.Write}})
	if !external.kanbanChanged {
		t.Fatalf("external edit after the acknowledgement = %#v, want a Kanban refresh", external)
	}
}

func TestDeletePathDropsOnlyTheDeletedNotesFromTheIndex(t *testing.T) {
	app, vaultPath := newTestApp(t)
	t.Cleanup(func() { _ = os.RemoveAll(vaultPath) })
	writeTestFile(t, vaultPath, "Keep.md", "- [ ] Keep #todo\n")
	writeTestFile(t, vaultPath, "Single.md", "- [ ] Single #solo\n")
	writeTestFile(t, vaultPath, "Trash/a.md", "- [ ] A #scrap\n")
	writeTestFile(t, vaultPath, "Trash/deep/b.md", "- [ ] B #scrap\n")
	writeTestFile(t, vaultPath, "Trashcan.md", "- [ ] Not inside Trash #todo\n")
	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("initial GetKanbanBoard: %v", err)
	}
	warm := app.vaultIndex
	columns := func() []string {
		result, err := app.GetKanbanColumns()
		if err != nil {
			t.Fatalf("GetKanbanColumns: %v", err)
		}
		return result["columns"].([]string)
	}
	if !slices.Contains(columns(), "solo") || !slices.Contains(columns(), "scrap") {
		t.Fatalf("columns before deleting = %v", columns())
	}

	for _, path := range []string{"Single.md", "Trash"} {
		result, err := app.DeletePath(path)
		if err != nil || !result.Success {
			t.Fatalf("DeletePath(%s): result=%+v err=%v", path, result, err)
		}
		// The index is edited in place: nothing else in the vault is re-read.
		if app.vaultIndex != warm {
			t.Fatalf("deleting %s rebuilt the vault index", path)
		}
	}

	if got := app.vaultIndex.paths; !reflect.DeepEqual(got, []string{"Keep.md", "Trashcan.md"}) {
		t.Fatalf("indexed notes after deleting = %v", got)
	}
	if slices.Contains(columns(), "solo") || slices.Contains(columns(), "scrap") {
		t.Fatalf("columns after deleting their only notes = %v", columns())
	}
	board, err := app.GetKanbanBoard()
	if err != nil || len(board["todo"]) != 2 || len(board["scrap"]) != 0 {
		t.Fatalf("board after deleting = %#v, err=%v", board, err)
	}
	response, err := app.SearchNotes("Single", NoteSearchRequest{})
	if err != nil || len(response.Results) != 0 {
		t.Fatalf("search still finds a deleted note: %+v, err=%v", response, err)
	}
}

func TestVaultWatcherDoesNotRereadFolderFigaroJustMoved(t *testing.T) {
	app, vaultPath := newTestApp(t)
	t.Cleanup(func() { _ = os.RemoveAll(vaultPath) })
	writeTestFile(t, vaultPath, "Projects/plan.md", "- [ ] Plan #todo\n")
	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("initial GetKanbanBoard: %v", err)
	}
	if result, err := app.RenamePath("Projects", "Work"); err != nil || !result.Success {
		t.Fatalf("RenamePath: result=%+v err=%v", result, err)
	}
	movedIndex := app.vaultIndex
	revision := movedIndex.revision

	result := app.applyVaultFilesystemChanges([]vaultWatchChange{
		{Path: filepath.Join(vaultPath, "Projects"), Op: fsnotify.Rename},
		{Path: filepath.Join(vaultPath, "Work"), Op: fsnotify.Create},
	})
	if result.kanbanChanged {
		t.Fatalf("watcher echo of Figaro's own folder move = %#v, want no Kanban refresh", result)
	}
	if app.vaultIndex != movedIndex || movedIndex.revision != revision {
		t.Fatal("watcher echo of Figaro's own folder move re-indexed notes that were already current")
	}
}

func TestVaultWatchBatchTellsAnExactNameFromACaseVariant(t *testing.T) {
	vaultPath := t.TempDir()
	writeTestFile(t, vaultPath, "Notes/Todo.md", "# Todo\n")
	root, err := os.OpenRoot(vaultPath)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()

	batch := newVaultWatchBatch()
	if !batch.listsExactName(root, filepath.Join("Notes", "Todo.md")) {
		t.Fatal("the note's own spelling was not found in its folder listing")
	}
	if batch.listsExactName(root, filepath.Join("Notes", "todo.md")) {
		t.Fatal("a case variant was taken for the listed name")
	}
	if !batch.listsExactName(root, "Notes") || batch.listsExactName(root, "notes") {
		t.Fatal("top-level folder names were not compared exactly")
	}
	// A folder that cannot be listed leaves the earlier lookup in charge.
	if !batch.listsExactName(root, filepath.Join("Missing", "note.md")) {
		t.Fatal("an unlistable folder overruled a successful lookup")
	}
}

func TestVaultWatcherDropsOldSpellingAfterCaseOnlyRename(t *testing.T) {
	app, vaultPath := newTestApp(t)
	t.Cleanup(func() { _ = os.RemoveAll(vaultPath) })
	if !vaultFoldsLetterCase(t, vaultPath) {
		t.Skip("on a case-sensitive filesystem the old spelling simply no longer exists")
	}
	writeTestFile(t, vaultPath, "todo.md", "- [ ] Task #todo\n")
	writeTestFile(t, vaultPath, "Notes/inner.md", "- [ ] Inner #todo\n")
	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("GetKanbanBoard: %v", err)
	}
	for _, rename := range [][2]string{{"todo.md", "Todo.md"}, {"Notes", "notes"}} {
		if err := os.Rename(filepath.Join(vaultPath, rename[0]), filepath.Join(vaultPath, rename[1])); err != nil {
			t.Fatalf("external rename %v: %v", rename, err)
		}
	}
	app.applyVaultFilesystemChanges([]vaultWatchChange{
		{Path: filepath.Join(vaultPath, "Notes"), Op: fsnotify.Rename},
		{Path: filepath.Join(vaultPath, "Todo.md"), Op: fsnotify.Create},
		{Path: filepath.Join(vaultPath, "notes"), Op: fsnotify.Create},
		{Path: filepath.Join(vaultPath, "todo.md"), Op: fsnotify.Rename},
	})
	if _, err := app.GetKanbanBoard(); err != nil {
		t.Fatalf("GetKanbanBoard after renames: %v", err)
	}
	if want := []string{"Todo.md", "notes/inner.md"}; !reflect.DeepEqual(app.vaultIndex.paths, want) {
		t.Fatalf("indexed paths after case-only renames = %v, want %v", app.vaultIndex.paths, want)
	}
}
