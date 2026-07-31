package desktop

import "testing"

func TestTaskDueDateMarkdownContract(t *testing.T) {
	line := "- [ ] Submit report #todo [due 2026-08-14](2026-08-14.md)"
	if got := parseTaskDueDate(line); got != "2026-08-14" {
		t.Fatalf("parseTaskDueDate = %q", got)
	}
	if got := stripTaskDueLinks(line); got != "- [ ] Submit report #todo" {
		t.Fatalf("stripTaskDueLinks = %q", got)
	}
	if got := parseTaskDueDate("Task #todo [due 2026-02-30](2026-02-30.md)"); got != "" {
		t.Fatalf("invalid date parsed as %q", got)
	}
	if got := parseTaskDueDate("Task #todo [due 2026-08-14](2026-08-15.md)"); got != "" {
		t.Fatalf("mismatched date parsed as %q", got)
	}
}

func TestSetTaskDueDateOnLineReplacesAndClearsOneSemanticLink(t *testing.T) {
	line := "- [ ] Submit report #todo [due 2026-08-14](2026-08-14.md)"
	updated, valid := setTaskDueDateOnLine(line, "2026-08-18")
	if !valid || updated != "- [ ] Submit report #todo [due 2026-08-18](2026-08-18.md)" {
		t.Fatalf("unexpected replacement: valid=%v line=%q", valid, updated)
	}
	cleared, valid := setTaskDueDateOnLine(updated, "")
	if !valid || cleared != "- [ ] Submit report #todo" {
		t.Fatalf("unexpected clear: valid=%v line=%q", valid, cleared)
	}
	if unchanged, valid := setTaskDueDateOnLine(line, "2026-02-30"); valid || unchanged != line {
		t.Fatalf("invalid date changed line: valid=%v line=%q", valid, unchanged)
	}
}

func TestHomeTaskProjectionPrioritizesDueWorkAndDeduplicatesColumns(t *testing.T) {
	due := KanbanCard{File: "due.md", Line: 1, Text: "Due", Tag: "todo", DueDate: "2026-08-14"}
	tasks := homeTaskProjection(map[string][]KanbanCard{
		"urgent": {{File: "late.md", Line: 2, Text: "Late", Tag: "urgent", DueDate: "2026-08-13"}, due},
		"todo":   {due, {File: "later.md", Line: 1, Text: "Later", Tag: "todo", DueDate: "2026-08-20"}},
		"done":   {{File: "done.md", Line: 1, Text: "Done", Tag: "done", DueDate: "2026-08-14", Completed: true}},
	}, []string{"urgent", "todo", "done"}, 3, "2026-08-14")

	if len(tasks) != 3 || tasks[0].File != "late.md" || tasks[1].File != "due.md" || tasks[2].File != "later.md" {
		t.Fatalf("unexpected projection: %+v", tasks)
	}
}
