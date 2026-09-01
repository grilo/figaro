package taskschedule

import "testing"

func TestDateOnlySourceEditsPreserveScheduleIdentityAndStart(t *testing.T) {
	before := TasksInDocument("tasks.md", "- [ ] Ship [2026-01-01](2026-01-01.md) #wip")
	entries, err := Set(nil, before, before[0], "2025-12-30", "2026-01-01", "", "one")
	if err != nil {
		t.Fatal(err)
	}
	for _, source := range []string{
		"- [ ] Ship [[2026-02-01]] #wip",
		"- [ ] Ship 2026-02-01 #wip",
		"- [ ] Ship [2026-01-01](2026-01-01.md) [[2026-02-01]] #wip",
		"- [ ] Ship #wip",
	} {
		after := TasksInDocument("tasks.md", "Above\n"+source)
		next, changed, err := RebindDateEdits(entries, before, after, DateEdits(before, after))
		if err != nil || !changed || len(next) != 1 || next[0].ID != "one" || next[0].Start != "2025-12-30" || next[0].End != "2026-01-01" {
			t.Fatalf("%q: %v %v", source, next, err)
		}
		if resolved := Resolve(next, after); resolved[0].Task == nil || *resolved[0].Task != after[0] {
			t.Fatal(resolved)
		}
		if entries[0].Text != Text(before[0].Source) {
			t.Fatal("mutated original metadata")
		}
	}
}

func TestDateMacroReplacementPreservesScheduleIdentity(t *testing.T) {
	before := TasksInDocument("tasks.md", "- [ ] Ship @date #wip")
	after := TasksInDocument("tasks.md", "- [ ] Ship [[2026-02-01]] #wip")
	entries, err := Set(nil, before, before[0], "2026-01-20", "2026-02-01", "", "macro")
	if err != nil {
		t.Fatal(err)
	}
	next, changed, err := RebindDateEdits(entries, before, after, DateEdits(before, after))
	if err != nil || !changed || len(next) != 1 || next[0].ID != "macro" {
		t.Fatalf("macro replacement lost schedule identity: %v %v", next, err)
	}
}

func TestDateEditsDoNotGuessTitlesDuplicatesOrLiteralDates(t *testing.T) {
	for _, pair := range [][2]string{
		{"Ship [[2026-01-01]] #todo", "Review [[2026-02-01]] #todo"},
		{"Ship [[2026-01-01]] #todo\nShip [[2026-02-01]] #todo", "Ship [[2026-03-01]] #todo"},
		{"Ship `2026-01-01` #todo", "Ship `2026-02-01` #todo"},
		{"Ship [web](https://site/2026-01-01) #todo", "Ship [web](https://site/2026-02-01) #todo"},
	} {
		before, after := TasksInDocument("tasks.md", pair[0]), TasksInDocument("tasks.md", pair[1])
		if edits := DateEdits(before, after); len(edits) != 0 {
			t.Fatalf("guessed %v", edits)
		}
	}
}

func TestDateEditRejectsExistingScheduleCollision(t *testing.T) {
	before := TasksInDocument("tasks.md", "Ship [[2026-01-01]] #todo")
	after := TasksInDocument("tasks.md", "Ship [[2026-02-01]] #todo")
	old, _ := Set(nil, before, before[0], "", "2026-01-01", "", "old")
	other, _ := Set(nil, after, after[0], "", "2026-02-01", "", "other")
	entries := append(old, other...)
	if _, _, err := RebindDateEdits(entries, before, after, DateEdits(before, after)); err == nil {
		t.Fatal("overwrote another schedule")
	}
}
