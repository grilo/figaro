package desktop

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/fsnotify/fsnotify"
)

type vaultObservableSnapshot struct {
	Searches         map[string][]SearchResult   `json:"searches"`
	Backlinks        map[string][]BacklinkResult `json:"backlinks"`
	UnlinkedMentions map[string][]BacklinkResult `json:"unlinkedMentions"`
	Kanban           map[string][]KanbanCard     `json:"kanban"`
	Calendar         *CalendarMonthData          `json:"calendar"`
	Health           *VaultHealthReport          `json:"health"`
	TreePaths        []string                    `json:"treePaths"`
}

func flattenObservableTree(items []*FileTreeItem, paths *[]string) {
	for _, item := range items {
		*paths = append(*paths, item.Type+":"+filepath.ToSlash(item.Path))
		flattenObservableTree(item.Children, paths)
	}
}

func observableDiskPaths(t *testing.T, vaultPath string) []string {
	t.Helper()
	paths := make([]string, 0)
	err := filepath.WalkDir(vaultPath, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == vaultPath {
			return nil
		}
		if strings.HasPrefix(entry.Name(), ".") {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		rel, err := filepath.Rel(vaultPath, path)
		if err != nil {
			return err
		}
		kind := "file"
		if entry.IsDir() {
			kind = "directory"
		}
		paths = append(paths, kind+":"+filepath.ToSlash(rel))
		return nil
	})
	if err != nil {
		t.Fatalf("walk independent vault tree: %v", err)
	}
	sort.Strings(paths)
	return paths
}

func captureVaultObservables(t *testing.T, app *App) vaultObservableSnapshot {
	t.Helper()
	snapshot := vaultObservableSnapshot{
		Searches:         make(map[string][]SearchResult),
		Backlinks:        make(map[string][]BacklinkResult),
		UnlinkedMentions: make(map[string][]BacklinkResult),
	}
	for _, query := range []struct {
		name          string
		value         string
		caseSensitive bool
	}{
		{name: "alpha-insensitive", value: "alpha marker"},
		{name: "beta-insensitive", value: "beta marker"},
		{name: "move-insensitive", value: "move marker"},
		{name: "case-sensitive", value: "CASE-SENSITIVE", caseSensitive: true},
	} {
		results, err := app.SearchFiles(query.value, query.caseSensitive)
		if err != nil {
			t.Fatalf("SearchFiles(%s): %v", query.name, err)
		}
		snapshot.Searches[query.name] = results
	}
	for _, target := range []string{"Target.md", "Destination.md"} {
		backlinks, err := app.SearchBacklinks(target)
		if err != nil {
			t.Fatalf("SearchBacklinks(%s): %v", target, err)
		}
		snapshot.Backlinks[target] = backlinks
		mentions, err := app.SearchUnlinkedMentions(target)
		if err != nil {
			t.Fatalf("SearchUnlinkedMentions(%s): %v", target, err)
		}
		snapshot.UnlinkedMentions[target] = mentions
	}

	var err error
	snapshot.Kanban, err = app.GetKanbanBoard()
	if err != nil {
		t.Fatalf("GetKanbanBoard: %v", err)
	}
	snapshot.Calendar, err = app.GetCalendarMonthData(2026, 8)
	if err != nil {
		t.Fatalf("GetCalendarMonthData: %v", err)
	}
	snapshot.Health, err = app.GetVaultHealth()
	if err != nil {
		t.Fatalf("GetVaultHealth: %v", err)
	}
	tree, err := app.GetFileTree()
	if err != nil {
		t.Fatalf("GetFileTree: %v", err)
	}
	flattenObservableTree(tree, &snapshot.TreePaths)
	sort.Strings(snapshot.TreePaths)
	return snapshot
}

func formattedSnapshot(t *testing.T, snapshot vaultObservableSnapshot) string {
	t.Helper()
	data, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		t.Fatalf("marshal vault snapshot: %v", err)
	}
	return string(data)
}

func assertStringSet(t *testing.T, label string, got, want []string) {
	t.Helper()
	if len(got) == 0 && len(want) == 0 {
		return
	}
	sort.Strings(got)
	sort.Strings(want)
	if !reflect.DeepEqual(got, want) {
		t.Errorf("%s = %#v, want %#v", label, got, want)
	}
}

func observableSearchPaths(results []SearchResult) []string {
	paths := make([]string, 0, len(results))
	for _, result := range results {
		paths = append(paths, result.Path)
	}
	return paths
}

func observableBacklinkPaths(results []BacklinkResult) []string {
	paths := make([]string, 0, len(results))
	for _, result := range results {
		paths = append(paths, result.Path)
	}
	return paths
}

func observableKanbanPaths(cards []KanbanCard) []string {
	paths := make([]string, 0, len(cards))
	for _, card := range cards {
		paths = append(paths, card.File)
	}
	return paths
}

func assertWarmVaultMatchesColdRebuild(t *testing.T, app *App, vaultPath, stage string) vaultObservableSnapshot {
	t.Helper()
	warm := captureVaultObservables(t, app)
	if disk := observableDiskPaths(t, vaultPath); !reflect.DeepEqual(warm.TreePaths, disk) {
		t.Fatalf("%s warm tree differs from independent filesystem walk\nwarm: %#v\ndisk: %#v", stage, warm.TreePaths, disk)
	}
	cold := captureVaultObservables(t, NewApp(vaultPath))
	if !reflect.DeepEqual(warm, cold) {
		t.Fatalf("%s warm state differs from a cold rebuild\nwarm:\n%s\ncold:\n%s",
			stage, formattedSnapshot(t, warm), formattedSnapshot(t, cold))
	}
	return warm
}

func TestWarmVaultStateMatchesColdRebuildAcrossMutationSequence(t *testing.T) {
	vaultPath := t.TempDir()
	app := NewApp(vaultPath)
	writeTestFile(t, vaultPath, "Target.md", "# Target\n")
	writeTestFile(t, vaultPath, "Destination.md", "# Destination\n")
	writeTestFile(t, vaultPath, "alpha.md", strings.Join([]string{
		"# Alpha",
		"alpha marker",
		"- [ ] Initial task #todo",
		"[Target](Target.md)",
		"[Launch](2026-08-20.md)",
	}, "\n")+"\n")
	writeTestFile(t, vaultPath, "Projects/move.md", "move marker\n- [ ] Move task #later\n")
	writeTestFile(t, vaultPath, "Archive/stable.md", "CASE-SENSITIVE alpha marker\n- [ ] Stable task #review\n")
	writeTestFile(t, vaultPath, "mentions.md", "Target needs a decision.\n")
	writeTestFile(t, vaultPath, "index.md", "[Move](Projects/move.md)\n")

	initial := assertWarmVaultMatchesColdRebuild(t, app, vaultPath, "initial build")
	assertStringSet(t, "initial alpha search", observableSearchPaths(initial.Searches["alpha-insensitive"]),
		[]string{"Archive/stable.md", "alpha.md"})
	assertStringSet(t, "initial Target backlinks", observableBacklinkPaths(initial.Backlinks["Target.md"]),
		[]string{"alpha.md"})
	assertStringSet(t, "initial Target mentions", observableBacklinkPaths(initial.UnlinkedMentions["Target.md"]),
		[]string{"mentions.md"})
	assertStringSet(t, "initial todo", observableKanbanPaths(initial.Kanban["todo"]), []string{"alpha.md"})
	assertStringSet(t, "initial later", observableKanbanPaths(initial.Kanban["later"]), []string{"Projects/move.md"})
	assertStringSet(t, "initial review", observableKanbanPaths(initial.Kanban["review"]), []string{"Archive/stable.md"})
	if got, want := initial.Calendar.DaysWithLinks, []int{20}; !reflect.DeepEqual(got, want) {
		t.Errorf("initial linked days = %v, want %v", got, want)
	}

	saved, err := app.SaveFile("alpha.md", strings.Join([]string{
		"# Alpha revised",
		"beta marker",
		"- [ ] Revised task #wip",
		"[Destination](Destination.md)",
		"[Launch](2026-08-21.md)",
	}, "\n")+"\n", 0)
	if err != nil || !saved.Success {
		t.Fatalf("SaveFile: result=%+v err=%v", saved, err)
	}
	afterSave := assertWarmVaultMatchesColdRebuild(t, app, vaultPath, "known save")
	assertStringSet(t, "saved alpha search", observableSearchPaths(afterSave.Searches["alpha-insensitive"]),
		[]string{"Archive/stable.md"})
	assertStringSet(t, "saved beta search", observableSearchPaths(afterSave.Searches["beta-insensitive"]),
		[]string{"alpha.md"})
	assertStringSet(t, "saved Destination backlinks", observableBacklinkPaths(afterSave.Backlinks["Destination.md"]),
		[]string{"alpha.md"})
	assertStringSet(t, "saved wip", observableKanbanPaths(afterSave.Kanban["wip"]), []string{"alpha.md"})
	if got, want := afterSave.Calendar.DaysWithLinks, []int{21}; !reflect.DeepEqual(got, want) {
		t.Errorf("saved linked days = %v, want %v", got, want)
	}

	writeTestFile(t, vaultPath, "external-new.md", "alpha marker\n- [ ] External task #done\n[Target](Target.md)\n")
	app.handleVaultFilesystemChanges([]vaultWatchChange{{
		Path: filepath.Join(vaultPath, "external-new.md"),
		Op:   fsnotify.Create,
	}})
	afterCreate := assertWarmVaultMatchesColdRebuild(t, app, vaultPath, "external create")
	assertStringSet(t, "created alpha search", observableSearchPaths(afterCreate.Searches["alpha-insensitive"]),
		[]string{"Archive/stable.md", "external-new.md"})
	assertStringSet(t, "created Target backlinks", observableBacklinkPaths(afterCreate.Backlinks["Target.md"]),
		[]string{"external-new.md"})
	assertStringSet(t, "created done", observableKanbanPaths(afterCreate.Kanban["done"]), []string{"external-new.md"})

	result, err := app.MovePath("Projects", "Archive")
	if err != nil || result == nil || !result.Success {
		t.Fatalf("MovePath: result=%+v err=%v", result, err)
	}
	afterMove := assertWarmVaultMatchesColdRebuild(t, app, vaultPath, "directory move")
	assertStringSet(t, "moved search", observableSearchPaths(afterMove.Searches["move-insensitive"]),
		[]string{"Archive/Projects/move.md"})
	assertStringSet(t, "moved later", observableKanbanPaths(afterMove.Kanban["later"]),
		[]string{"Archive/Projects/move.md"})
	if got := readTestFile(t, vaultPath, "index.md"); got != "[Move](Archive/Projects/move.md)\n" {
		t.Errorf("incoming link after move = %q", got)
	}

	if err := os.Remove(filepath.Join(vaultPath, "external-new.md")); err != nil {
		t.Fatalf("remove external note: %v", err)
	}
	app.handleVaultFilesystemChanges([]vaultWatchChange{{
		Path: filepath.Join(vaultPath, "external-new.md"),
		Op:   fsnotify.Remove,
	}})
	afterRemove := assertWarmVaultMatchesColdRebuild(t, app, vaultPath, "external remove")
	assertStringSet(t, "removed alpha search", observableSearchPaths(afterRemove.Searches["alpha-insensitive"]),
		[]string{"Archive/stable.md"})
	assertStringSet(t, "removed Target backlinks", observableBacklinkPaths(afterRemove.Backlinks["Target.md"]), nil)
	assertStringSet(t, "removed done", observableKanbanPaths(afterRemove.Kanban["done"]), nil)
}

func TestWarmCopyMatchesColdRebuildAcrossVaultProjections(t *testing.T) {
	vaultPath := t.TempDir()
	app := NewApp(vaultPath)
	writeTestFile(t, vaultPath, "Projects/Target.md", "# Target\n")
	writeTestFile(t, vaultPath, "Projects/guide.md", "# Guide\n")
	writeTestFile(t, vaultPath, "Projects/plan.md", strings.Join([]string{
		"alpha marker",
		"- [ ] Copy task #todo",
		"[Target](Target.md)",
		"[Guide](guide.md)",
		"[Launch](2026-08-20.md)",
	}, "\n")+"\n")
	writeTestFile(t, vaultPath, "stable.md", "CASE-SENSITIVE\n")

	assertWarmVaultMatchesColdRebuild(t, app, vaultPath, "before known copy")
	result, err := app.CopyPath("Projects", ".")
	if err != nil || result == nil || !result.Success || result.Path != "Projects copy" {
		t.Fatalf("CopyPath: result=%+v err=%v", result, err)
	}
	afterCopy := assertWarmVaultMatchesColdRebuild(t, app, vaultPath, "known directory copy")
	assertStringSet(t, "copied alpha search", observableSearchPaths(afterCopy.Searches["alpha-insensitive"]),
		[]string{"Projects copy/plan.md", "Projects/plan.md"})
	assertStringSet(t, "copied Target backlinks", observableBacklinkPaths(afterCopy.Backlinks["Target.md"]),
		[]string{"Projects copy/plan.md", "Projects/plan.md"})
	assertStringSet(t, "copied todo cards", observableKanbanPaths(afterCopy.Kanban["todo"]),
		[]string{"Projects copy/plan.md", "Projects/plan.md"})
	if got, want := afterCopy.Calendar.DaysWithLinks, []int{20}; !reflect.DeepEqual(got, want) {
		t.Errorf("copied linked days = %v, want %v", got, want)
	}
}

func TestCopyFallsBackToColdRebuildWhenWarmIndexMissesExternalChange(t *testing.T) {
	vaultPath := t.TempDir()
	app := NewApp(vaultPath)
	writeTestFile(t, vaultPath, "source.md", "alpha marker\n")
	assertWarmVaultMatchesColdRebuild(t, app, vaultPath, "before stale copy")
	warmIndex := app.vaultIndex

	writeTestFile(t, vaultPath, "unseen.md", "beta marker\n- [ ] External #urgent\n")
	result, err := app.CopyPath("source.md", ".")
	if err != nil || result == nil || !result.Success {
		t.Fatalf("CopyPath with stale index: result=%+v err=%v", result, err)
	}
	if app.vaultIndex == warmIndex {
		t.Fatal("copy used the warm incremental path despite an unobserved external Markdown change")
	}
	afterCopy := assertWarmVaultMatchesColdRebuild(t, app, vaultPath, "stale-index copy fallback")
	assertStringSet(t, "fallback beta search", observableSearchPaths(afterCopy.Searches["beta-insensitive"]),
		[]string{"unseen.md"})
	assertStringSet(t, "fallback urgent cards", observableKanbanPaths(afterCopy.Kanban["urgent"]),
		[]string{"unseen.md"})
}
