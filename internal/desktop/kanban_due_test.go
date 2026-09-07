package desktop

import (
	"fmt"
	"reflect"
	"testing"

	"figaro/internal/taskschedule"
)

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

func TestHomeTaskProjectionKeepsOnlyTheBestBoundedScheduledCards(t *testing.T) {
	cards := make([]KanbanCard, 1000)
	for index := range cards {
		cards[index] = KanbanCard{
			File: fmt.Sprintf("task-%04d.md", index),
			Line: 1,
			Text: fmt.Sprintf("Task %d", index),
			Tag:  "todo",
		}
	}
	scheduled := map[string]taskschedule.Entry{
		"task-0999.md\x001": {End: "2026-08-13"},
		"task-0998.md\x001": {End: "2026-08-14"},
		"task-0997.md\x001": {End: "2026-08-20"},
	}

	result := homeTaskProjectionWithSchedules(
		map[string][]KanbanCard{"todo": cards},
		[]string{"todo", "done"},
		3,
		"2026-08-14",
		scheduled,
		nil,
	)
	if got, want := []string{result[0].File, result[1].File, result[2].File},
		[]string{"task-0999.md", "task-0998.md", "task-0997.md"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("bounded scheduled projection = %#v, want %#v", got, want)
	}
}
