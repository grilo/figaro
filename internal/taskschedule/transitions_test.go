package taskschedule

import (
	"errors"
	"reflect"
	"testing"
)

func TestLeavingTODOStartsAnyOtherColumnButNotNewOrAmbiguousTasks(t *testing.T) {
	before := TasksInDocument("t.md", "Ship #todo\nOther #todo")
	for _, column := range []string{"wip", "done", "review"} {
		after := TasksInDocument("t.md", "Ship #"+column+"\nOther #todo")
		got := StartedTasks(before, after)
		if len(got) != 1 || got[0].Line != 1 {
			t.Fatal(column, got)
		}
		entries, err := Begin(nil, after, got[0], "2026-09-02", "one")
		if err != nil || entries[0].Start != "2026-09-02" || entries[0].End != "" {
			t.Fatal(entries, err)
		}
		again, err := Begin(entries, after, got[0], "2026-09-10", "unused")
		if err != nil || !reflect.DeepEqual(entries, again) {
			t.Fatal("start reset", again, err)
		}
	}
	for _, source := range []string{"Different #wip", "Ship #todo #wip", "", "Ship #todo"} {
		if got := StartedTasks(before, TasksInDocument("t.md", source)); len(got) != 0 {
			t.Fatal(source, got)
		}
	}
	if got := StartedTasks(nil, TasksInDocument("t.md", "New #wip")); len(got) != 0 {
		t.Fatal(got)
	}
	duplicates := TasksInDocument("t.md", "Same #todo\nSame #todo")
	if got := StartedTasks(duplicates, TasksInDocument("t.md", "\nSame #wip\nSame #todo")); len(got) != 0 {
		t.Fatal(got)
	}
}

func TestBeginningLateTaskPreservesOverdueDeadline(t *testing.T) {
	tasks := TasksInDocument("t.md", "Ship #wip")
	entries, _ := Set(nil, tasks, tasks[0], "", "2026-09-01", "", "one")
	entries, err := Begin(entries, tasks, tasks[0], "2026-09-03", "two")
	if err != nil || len(entries) != 1 || entries[0].Start != "2026-09-03" || entries[0].End != "2026-09-01" {
		t.Fatal(entries, err)
	}
}

func TestMoveBetweenNonTODOColumnsBeginsUnsetStartsInStableSourceOrder(t *testing.T) {
	before := TasksInDocument("t.md", "First #wip\nSecond #review\nUnmoved #wip")
	after := TasksInDocument("t.md", "First #review\nSecond #done\nUnmoved #wip")
	if got := StartedTasks(before, after); !reflect.DeepEqual(got, after[:2]) {
		t.Fatal(got)
	}
}

type testChangeWriter struct {
	calls []string
	fail  string
}

func (w *testChangeWriter) call(name string) error {
	w.calls = append(w.calls, name)
	if w.fail == name {
		return errors.New(name)
	}
	return nil
}
func (w *testChangeWriter) WriteDates() error   { return w.call("dates") }
func (w *testChangeWriter) WriteNote() error    { return w.call("note") }
func (w *testChangeWriter) RestoreDates() error { return w.call("restore") }
func TestTaskMoveWriteFailureRestoresDatesAndMetadataFailureNeverWritesNote(t *testing.T) {
	for _, test := range []struct {
		fail string
		want []string
	}{
		{"", []string{"dates", "note"}}, {"dates", []string{"dates"}}, {"note", []string{"dates", "note", "restore"}},
	} {
		writer := &testChangeWriter{fail: test.fail}
		err := CommitChange(writer)
		if (err != nil) != (test.fail != "") || !reflect.DeepEqual(writer.calls, test.want) {
			t.Fatal(writer, err)
		}
	}
}
