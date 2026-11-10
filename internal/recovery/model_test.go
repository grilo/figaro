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

func TestUniqueIDKeepsEveryRecordOfOneOperationDistinct(t *testing.T) {
	items := []Item{{ID: "100"}, {ID: "200"}, {ID: "200-2"}}
	for _, test := range []struct{ id, want string }{
		{"300", "300"},
		{"100", "100-2"},
		{"200", "200-3"},
	} {
		if got := UniqueID(items, test.id); got != test.want {
			t.Errorf("UniqueID(%q) = %q, want %q", test.id, got, test.want)
		}
	}
	// Records handed the same clock reading all survive Add.
	var registry []Item
	for range 3 {
		registry = Add(registry, Item{ID: UniqueID(registry, "500"), DeletedAt: 5})
	}
	if len(registry) != 3 {
		t.Fatalf("registry = %#v, want three distinct records", registry)
	}
}
