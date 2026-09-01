package taskschedule

import (
	"reflect"
	"testing"
)

func TestScheduleRangeValidation(t *testing.T) {
	for _, pair := range [][2]string{{"", ""}, {"", "2026-09-01"}, {"2026-08-31", "2026-09-01"}, {"2028-02-29", "2028-02-29"}, {"2026-09-02", "2026-09-01"}, {"2026-09-01", ""}} {
		if err := ValidateDates(pair[0], pair[1]); err != nil {
			t.Fatal(pair, err)
		}
	}
	for _, pair := range [][2]string{{"2026-02-29", "2026-03-01"}, {"", "tomorrow"}} {
		if ValidateDates(pair[0], pair[1]) == nil {
			t.Fatal("accepted", pair)
		}
	}
}

func TestScheduleFollowsUniqueTaskLineMovesAndKanbanTags(t *testing.T) {
	task := Task{"tasks.md", 2, "- [ ] Ship #todo"}
	entries, err := Set(nil, []Task{task}, task, "2026-08-31", "2026-09-01", "", "one")
	if err != nil {
		t.Fatal(err)
	}
	moved := Task{"tasks.md", 8, "- [x] Ship #done"}
	resolved := Resolve(entries, []Task{moved})
	if resolved[0].Task == nil || *resolved[0].Task != moved {
		t.Fatal(resolved)
	}
	if Text("Use #fff and #thing") != "Use #fff and" {
		t.Fatal("color literal lost")
	}
	if Resolve(entries, []Task{{"tasks.md", 2, "- [ ] A replacement #todo"}})[0].Task != nil {
		t.Fatal("dates transferred to replacement")
	}
}

func TestDuplicateSchedulesDetachOnAmbiguousEditsAndNeverOverwriteOnReconnect(t *testing.T) {
	a, b := Task{"tasks.md", 1, "Same #todo"}, Task{"tasks.md", 2, "Same #todo"}
	entries, _ := Set(nil, []Task{a, b}, a, "", "2026-09-01", "", "one")
	if Resolve(entries, []Task{a, b})[0].Task == nil {
		t.Fatal("unchanged duplicate detached")
	}
	if Resolve(entries, []Task{b})[0].Task != nil {
		t.Fatal("remaining duplicate stole dates")
	}
	shifted := []Task{{"tasks.md", 2, a.Source}, {"tasks.md", 3, b.Source}}
	if Resolve(entries, shifted)[0].Task != nil {
		t.Fatal("ambiguous shifted duplicate matched")
	}
	c := Task{"tasks.md", 4, "Other #todo"}
	entries, _ = Set(entries, []Task{a, b, c}, c, "", "2026-09-03", "", "two")
	before := append([]Entry(nil), entries...)
	if _, err := Set(entries, []Task{a, b, c}, c, "", "2026-09-01", "one", "unused"); err == nil {
		t.Fatal("overwrote existing schedule")
	}
	if !reflect.DeepEqual(entries, before) {
		t.Fatal("mutated source records")
	}
	renamed := Task{"tasks.md", 1, "Renamed task #todo"}
	reconnected, err := Set(entries, []Task{renamed, b, c}, renamed, "", "2026-09-01", "one", "unused")
	if err != nil || reconnected[0].ID != "one" || reconnected[1] != entries[1] {
		t.Fatal(reconnected, err)
	}
}

func TestScheduleClearOverridesLegacyDueAndRenameOnlyMovesSubtree(t *testing.T) {
	task := Task{"project/task.md", 1, "Task #todo"}
	entries, _ := Set(nil, []Task{task}, task, "", "2026-09-01", "", "one")
	cleared, _ := Set(entries, []Task{task}, task, "", "", "one", "unused")
	if len(cleared) != 1 || cleared[0].End != "" || cleared[0].ID != "one" {
		t.Fatal(cleared)
	}
	entries = append(entries, Entry{File: "projects/other.md"})
	renamed, changed := RewritePaths(entries, "project", "renamed")
	if !changed || renamed[0].File != "renamed/task.md" || renamed[1].File != "projects/other.md" || entries[0].File != task.File {
		t.Fatal(renamed)
	}
}
