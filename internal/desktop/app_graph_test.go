package desktop

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func writeGraphTestNote(t *testing.T, root string, rel string, content string) {
	t.Helper()
	path := filepath.Join(root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatalf("create graph note directory: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write graph note: %v", err)
	}
}

func TestGetVaultGraphProjectsExistingMarkdownLinksFromSharedIndex(t *testing.T) {
	vaultPath := t.TempDir()
	writeGraphTestNote(t, vaultPath, "Projects/Atlas.md", "[Graph](../Research/Graph.md) [[Roadmap]] [[Missing]] [Web](https://example.com)\n")
	writeGraphTestNote(t, vaultPath, "Projects/Roadmap.md", "[Atlas](Atlas.md) [Case-folded graph](../research/graph.MD)\n")
	writeGraphTestNote(t, vaultPath, "Research/Graph.md", "[[Atlas]]\n")
	writeGraphTestNote(t, vaultPath, "2026-08-29.md", "# Daily note\n")
	writeGraphTestNote(t, vaultPath, "Loose.md", "# No links\n")

	graph, err := NewApp(vaultPath).GetVaultGraph()
	if err != nil {
		t.Fatalf("GetVaultGraph: %v", err)
	}
	if got, want := len(graph.Nodes), 5; got != want {
		t.Fatalf("graph nodes = %d, want %d: %#v", got, want, graph.Nodes)
	}
	wantEdges := []VaultGraphEdge{
		{Source: "Projects/Atlas.md", Target: "Projects/Roadmap.md"},
		{Source: "Projects/Atlas.md", Target: "Research/Graph.md"},
		{Source: "Projects/Roadmap.md", Target: "Projects/Atlas.md"},
		{Source: "Projects/Roadmap.md", Target: "Research/Graph.md"},
		{Source: "Research/Graph.md", Target: "Projects/Atlas.md"},
	}
	if !reflect.DeepEqual(graph.Edges, wantEdges) {
		t.Fatalf("graph edges = %#v, want %#v", graph.Edges, wantEdges)
	}

	nodes := make(map[string]VaultGraphNode, len(graph.Nodes))
	for _, node := range graph.Nodes {
		nodes[node.Path] = node
	}
	if got := nodes["Projects/Atlas.md"]; got.Name != "Atlas" || got.Group != "Projects" || got.Incoming != 2 || got.Outgoing != 2 {
		t.Fatalf("Atlas node = %#v", got)
	}
	if got := nodes["2026-08-29.md"]; !got.Daily || got.Group != "Vault root" || got.Incoming != 0 || got.Outgoing != 0 {
		t.Fatalf("daily node = %#v", got)
	}
	if got := nodes["Loose.md"]; got.Daily || got.Incoming != 0 || got.Outgoing != 0 {
		t.Fatalf("orphan node = %#v", got)
	}
}

func TestBuildVaultGraphDoesNotGuessAmbiguousBasenames(t *testing.T) {
	index := newVaultIndex()
	index.paths = []string{"A/Target.md", "B/Target.md", "Source.md"}
	index.files["A/Target.md"] = vaultIndexedFile{path: "A/Target.md", name: "Target.md"}
	index.files["B/Target.md"] = vaultIndexedFile{path: "B/Target.md", name: "Target.md"}
	index.files["Source.md"] = vaultIndexedFile{
		path: "Source.md", name: "Source.md", linkTargets: []string{"Target.md"},
	}

	graph := buildVaultGraph(index)
	if len(graph.Edges) != 0 {
		t.Fatalf("ambiguous basename produced edges: %#v", graph.Edges)
	}
}

func TestGetVaultGraphReflectsKnownSaveWithoutRebuildingSharedIndex(t *testing.T) {
	vaultPath := t.TempDir()
	writeGraphTestNote(t, vaultPath, "Source.md", "# Source\n")
	writeGraphTestNote(t, vaultPath, "Target.md", "# Target\n")
	app := NewApp(vaultPath)

	initial, err := app.GetVaultGraph()
	if err != nil {
		t.Fatalf("initial GetVaultGraph: %v", err)
	}
	if len(initial.Edges) != 0 {
		t.Fatalf("initial graph edges = %#v, want none", initial.Edges)
	}
	initialIndex := app.vaultIndex

	saved, err := app.SaveFile("Source.md", "# Source\n[Target](Target.md)\n", 0)
	if err != nil || !saved.Success {
		t.Fatalf("SaveFile: result=%+v err=%v", saved, err)
	}
	if app.vaultIndex != initialIndex {
		t.Fatal("known save replaced the shared vault index")
	}

	updated, err := app.GetVaultGraph()
	if err != nil {
		t.Fatalf("updated GetVaultGraph: %v", err)
	}
	wantEdges := []VaultGraphEdge{{Source: "Source.md", Target: "Target.md"}}
	if !reflect.DeepEqual(updated.Edges, wantEdges) {
		t.Fatalf("updated graph edges = %#v, want %#v", updated.Edges, wantEdges)
	}
}
