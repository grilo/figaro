package desktop

import "testing"

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
