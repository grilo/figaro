package main

import (
	"reflect"
	"testing"
)

func cachedCalendarIndex(app *App) *calendarDateIndex {
	app.calendarMu.Lock()
	defer app.calendarMu.Unlock()
	return app.calendarIndex
}

func TestCalendarIndexUpdatesDatesIncrementallyAfterVaultMutation(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "2025-01-15.md", "# Daily note")
	writeTestFile(t, vaultPath, "notes/source.md", "[Project date](2025-01-20.md)\n")

	month, err := app.GetCalendarMonthData(2025, 1)
	if err != nil {
		t.Fatalf("GetCalendarMonthData: %v", err)
	}
	if got, want := month.DaysWithNotes, []int{15}; !reflect.DeepEqual(got, want) {
		t.Fatalf("DaysWithNotes = %v, want %v", got, want)
	}
	if got, want := month.DaysWithLinks, []int{20}; !reflect.DeepEqual(got, want) {
		t.Fatalf("DaysWithLinks = %v, want %v", got, want)
	}
	firstIndex := cachedCalendarIndex(app)
	if firstIndex == nil {
		t.Fatal("calendar request did not publish an index")
	}

	linked, err := app.GetLinkedNotesForDate("2025-01-20")
	if err != nil {
		t.Fatalf("GetLinkedNotesForDate: %v", err)
	}
	if len(linked) != 1 || linked[0].Path != "notes/source.md" || linked[0].LineNum != 1 {
		t.Fatalf("linked notes = %#v, want source.md line 1", linked)
	}
	if _, err := app.GetCalendarMonthData(2025, 1); err != nil {
		t.Fatalf("second GetCalendarMonthData: %v", err)
	}
	if got := cachedCalendarIndex(app); got != firstIndex {
		t.Fatal("unchanged calendar request rebuilt the vault index")
	}

	// App-owned mutations update the one known file in the shared index. The
	// visible calendar must immediately see the new date without discarding and
	// rescanning every other Markdown note.
	created, err := app.CreateFile("notes/later.md", "[Later](2025-01-21.md)\n")
	if err != nil || !created.Success {
		t.Fatalf("CreateFile: result=%+v err=%v", created, err)
	}
	if got := cachedCalendarIndex(app); got == nil {
		t.Fatal("calendar index was unexpectedly discarded after an incremental vault mutation")
	}

	month, err = app.GetCalendarMonthData(2025, 1)
	if err != nil {
		t.Fatalf("rebuilt GetCalendarMonthData: %v", err)
	}
	if got, want := month.DaysWithLinks, []int{20, 21}; !reflect.DeepEqual(got, want) {
		t.Fatalf("DaysWithLinks after mutation = %v, want %v", got, want)
	}
	if got := cachedCalendarIndex(app); got != firstIndex {
		t.Fatal("incremental mutation replaced the unaffected calendar projection instead of updating it in place")
	}
}

func TestNewAppDefersKanbanIndexingUntilStartupWork(t *testing.T) {
	vaultPath := t.TempDir()
	writeTestFile(t, vaultPath, "tasks.md", "- background task #later\n")

	app := NewApp(vaultPath)
	initial, err := app.GetKanbanColumns()
	if err != nil {
		t.Fatalf("GetKanbanColumns: %v", err)
	}
	if got, want := initial["columns"], []string{"todo", "wip", "done"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("NewApp synchronously scanned the vault: columns = %v, want %v", got, want)
	}

	app.syncKanbanColumns()
	indexed, err := app.GetKanbanColumns()
	if err != nil {
		t.Fatalf("GetKanbanColumns after index: %v", err)
	}
	if got, want := indexed["columns"], []string{"later", "todo", "wip", "done"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("background index columns = %v, want %v", got, want)
	}
}
