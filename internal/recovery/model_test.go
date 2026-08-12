package recovery

import "testing"

func TestRegistryRulesKeepNewestFirstAndRemoveOnlyTheRequestedItem(t *testing.T) {
	older := Item{ID: "old", Path: "Draft.md", DeletedAt: 10}
	newer := Item{ID: "new", Path: "Notes", DeletedAt: 20}
	items := Add([]Item{older}, newer)
	if len(items) != 2 || items[0].ID != "new" || items[1].ID != "old" {
		t.Fatalf("Add() = %#v; want newest first", items)
	}

	remaining, found := Remove(items, "new")
	if !found || len(remaining) != 1 || remaining[0].ID != "old" {
		t.Fatalf("Remove() = %#v, %v; want only old", remaining, found)
	}
	if item, ok := Find(items, "old"); !ok || item.Path != "Draft.md" {
		t.Fatalf("Find() = %#v, %v", item, ok)
	}
}
