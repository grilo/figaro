package desktop

import (
	"path/filepath"
	"sort"
	"strings"
)

// VaultGraphNode is the stable note metadata required by the browser graph.
// The native index remains authoritative for link parsing and path resolution;
// layout and presentation stay in the frontend.
type VaultGraphNode struct {
	Path     string  `json:"path"`
	Name     string  `json:"name"`
	Group    string  `json:"group"`
	Mtime    float64 `json:"mtime"`
	Daily    bool    `json:"daily"`
	Incoming int     `json:"incoming"`
	Outgoing int     `json:"outgoing"`
}

// VaultGraphEdge preserves Markdown link direction from one existing note to
// another. Repeated links inside one source note are collapsed by the shared
// vault index before this projection is built.
type VaultGraphEdge struct {
	Source string `json:"source"`
	Target string `json:"target"`
}

// VaultGraphData is a deterministic snapshot of the current Markdown graph.
type VaultGraphData struct {
	Nodes []VaultGraphNode `json:"nodes"`
	Edges []VaultGraphEdge `json:"edges"`
}

func graphNodeGroup(path string) string {
	path = filepath.ToSlash(path)
	if separator := strings.IndexByte(path, '/'); separator > 0 {
		return path[:separator]
	}
	return "Vault root"
}

func uniqueGraphPathLookup(paths []string, key func(string) string) map[string]string {
	lookup := make(map[string]string, len(paths))
	for _, path := range paths {
		candidate := key(path)
		if candidate == "" {
			continue
		}
		if existing, found := lookup[candidate]; found && existing != path {
			lookup[candidate] = ""
			continue
		}
		lookup[candidate] = path
	}
	return lookup
}

func resolveGraphTarget(
	target string,
	files map[string]vaultIndexedFile,
	caseFolded map[string]string,
	byBasename map[string]string,
) string {
	if _, found := files[target]; found {
		return target
	}
	if resolved := caseFolded[strings.ToLower(target)]; resolved != "" {
		return resolved
	}
	if !strings.Contains(target, "/") {
		return byBasename[strings.ToLower(filepath.Base(target))]
	}
	return ""
}

// buildVaultGraph is an effect-free projection over an already-built vault
// index. Keeping this separate from GetVaultGraph makes direction, grouping,
// ambiguous basename handling, and degree counts independently testable.
func buildVaultGraph(index *vaultIndex) VaultGraphData {
	graph := VaultGraphData{
		Nodes: make([]VaultGraphNode, 0),
		Edges: make([]VaultGraphEdge, 0),
	}
	if index == nil {
		return graph
	}

	paths := append([]string(nil), index.paths...)
	sort.Strings(paths)
	caseFolded := uniqueGraphPathLookup(paths, strings.ToLower)
	byBasename := uniqueGraphPathLookup(paths, func(path string) string {
		return strings.ToLower(filepath.Base(path))
	})
	nodeIndexes := make(map[string]int, len(paths))
	for _, path := range paths {
		file, found := index.files[path]
		if !found {
			continue
		}
		nodeIndexes[path] = len(graph.Nodes)
		graph.Nodes = append(graph.Nodes, VaultGraphNode{
			Path:  path,
			Name:  strings.TrimSuffix(file.name, filepath.Ext(file.name)),
			Group: graphNodeGroup(path),
			Mtime: file.mtime,
			Daily: file.dailyNote != "",
		})
	}

	seenEdges := make(map[string]struct{})
	for _, source := range paths {
		file, found := index.files[source]
		if !found {
			continue
		}
		for _, candidate := range file.linkTargets {
			target := resolveGraphTarget(candidate, index.files, caseFolded, byBasename)
			if target == "" || target == source {
				continue
			}
			key := source + "\x00" + target
			if _, duplicate := seenEdges[key]; duplicate {
				continue
			}
			seenEdges[key] = struct{}{}
			graph.Edges = append(graph.Edges, VaultGraphEdge{Source: source, Target: target})
			graph.Nodes[nodeIndexes[source]].Outgoing++
			graph.Nodes[nodeIndexes[target]].Incoming++
		}
	}
	sort.Slice(graph.Edges, func(left, right int) bool {
		if graph.Edges[left].Source != graph.Edges[right].Source {
			return graph.Edges[left].Source < graph.Edges[right].Source
		}
		return graph.Edges[left].Target < graph.Edges[right].Target
	})
	return graph
}

// GetVaultGraph returns the current note relationship graph without reopening
// Markdown files. The shared index is built once if another vault feature has
// not requested it yet.
func (a *App) GetVaultGraph() (VaultGraphData, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return VaultGraphData{}, err
	}
	return buildVaultGraph(index), nil
}
