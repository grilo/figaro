// Package recovery contains the deterministic recently-deleted registry rules.
// Filesystem and Git effects remain in the desktop and history adapters.
package recovery

import "sort"

// Item identifies one path that Figaro archived immediately before deletion.
type Item struct {
	ID        string  `json:"id"`
	Path      string  `json:"path"`
	Kind      string  `json:"kind"`
	Snapshot  string  `json:"snapshot,omitempty"`
	DeletedAt float64 `json:"deleted_at"`
}

// Add returns a newest-first registry containing item exactly once.
func Add(items []Item, item Item) []Item {
	next := make([]Item, 0, len(items)+1)
	for _, existing := range items {
		if existing.ID != item.ID {
			next = append(next, existing)
		}
	}
	next = append(next, item)
	return Sorted(next)
}

// Sorted returns a newest-first copy of items.
func Sorted(items []Item) []Item {
	next := append([]Item(nil), items...)
	sort.SliceStable(next, func(i, j int) bool {
		if next[i].DeletedAt == next[j].DeletedAt {
			return next[i].ID > next[j].ID
		}
		return next[i].DeletedAt > next[j].DeletedAt
	})
	return next
}

// Remove returns the registry without id and reports whether it was present.
func Remove(items []Item, id string) ([]Item, bool) {
	next := make([]Item, 0, len(items))
	found := false
	for _, item := range items {
		if item.ID == id {
			found = true
			continue
		}
		next = append(next, item)
	}
	return next, found
}

// Find returns a registry item by its opaque identifier.
func Find(items []Item, id string) (Item, bool) {
	for _, item := range items {
		if item.ID == id {
			return item, true
		}
	}
	return Item{}, false
}
