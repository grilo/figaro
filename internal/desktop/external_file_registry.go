package desktop

import (
	"fmt"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
)

type externalLaunchCandidate struct {
	path  string
	mtime float64
}

// externalFileRegistry owns process-local capabilities for files explicitly
// supplied by the operating system. App delegates storage and synchronization
// instead of exposing the registry's maps and locks across the façade.
type externalFileRegistry struct {
	mu     sync.RWMutex
	paths  map[string]string
	ids    []string
	nextID int
}

func newExternalFileRegistry() *externalFileRegistry {
	return &externalFileRegistry{paths: make(map[string]string)}
}

func (r *externalFileRegistry) reset() {
	r.mu.Lock()
	r.paths = make(map[string]string)
	r.ids = nil
	r.nextID = 0
	r.mu.Unlock()
}

func (r *externalFileRegistry) register(candidates []externalLaunchCandidate) []*ExternalLaunchFile {
	r.mu.Lock()
	defer r.mu.Unlock()
	registered := make([]*ExternalLaunchFile, 0, len(candidates))
	for _, candidate := range candidates {
		r.nextID++
		id := fmt.Sprintf("external-%d", r.nextID)
		r.paths[id] = candidate.path
		r.ids = append(r.ids, id)
		registered = append(registered, &ExternalLaunchFile{
			ID:    id,
			Name:  filepath.Base(candidate.path),
			Path:  candidate.path,
			Mtime: candidate.mtime,
		})
	}
	return registered
}

func (r *externalFileRegistry) snapshot() ([]string, map[string]string) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ids := append([]string(nil), r.ids...)
	paths := make(map[string]string, len(r.paths))
	for id, path := range r.paths {
		paths[id] = path
	}
	return ids, paths
}

func (r *externalFileRegistry) path(id string) (string, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	path, ok := r.paths[id]
	return path, ok
}

// idForPath returns the capability already registered for path, so a file
// dropped twice keeps one tab and one shortcut.
func (r *externalFileRegistry) idForPath(path string) (string, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	same := func(a, b string) bool {
		if goruntime.GOOS == "windows" {
			return strings.EqualFold(a, b)
		}
		return a == b
	}
	for _, id := range r.ids {
		if same(r.paths[id], path) {
			return id, true
		}
	}
	return "", false
}
