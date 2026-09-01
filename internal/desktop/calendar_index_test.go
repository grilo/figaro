package desktop

import (
	"reflect"
	"testing"
)

func TestCalendarIndexesPreferredWikilinkDatesWithoutDuplicateNotes(t *testing.T) {
	app, vault := newTestApp(t)
	writeTestFile(t, vault, "plan.md", "Before\nMeet [[2026-01-01]]\nAgain [2026-01-01](2026-01-01.md)\n[[2026-01-02.md|Next]]")
	for _, date := range []string{"2026-01-01", "2026-01-02"} {
		notes, err := app.GetLinkedNotesForDate(date)
		if err != nil || len(notes) != 1 || notes[0].Path != "plan.md" {
			t.Fatal(notes, err)
		}
	}
	month, err := app.GetCalendarMonthData(2026, 1)
	if err != nil {
		t.Fatal(err)
	}
	summary, found := calendarSummaryForDay(month.DaySummaries, 1)
	if !found || summary.NoteCount != 1 {
		t.Fatal(summary)
	}
}

func cachedCalendarIndex(app *App) *calendarDateIndex {
	app.calendarMu.Lock()
	defer app.calendarMu.Unlock()
	return app.calendarIndex
}

func calendarSummaryForDay(summaries []CalendarDaySummary, day int) (CalendarDaySummary, bool) {
	for _, summary := range summaries {
		if summary.Day == day {
			return summary, true
		}
	}
	return CalendarDaySummary{}, false
}

func TestCalendarMonthSummariesCountDistinctNotesAndExposeDueTitles(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "2025-01-15.md", "# Daily note\n")
	writeTestFile(t, vaultPath, "notes/alpha.md", "[Planning](2025-01-15.md)\n")
	writeTestFile(t, vaultPath, "notes/bravo.md", "[First](2025-01-15.md)\n[Second](2025-01-15.md)\n")
	writeTestFile(t, vaultPath, "notes/mixed.md", "- [ ] Review launch #todo\n[Context](2025-01-15.md)\n")
	writeTestFile(t, vaultPath, "tasks.md", "- [ ] Ship release #todo\n")
	setTestTaskDueDate(t, app, "notes/mixed.md", 1, "2025-01-15")
	setTestTaskDueDate(t, app, "tasks.md", 1, "2025-01-15")

	month, err := app.GetCalendarMonthData(2025, 1)
	if err != nil {
		t.Fatalf("GetCalendarMonthData: %v", err)
	}
	summary, found := calendarSummaryForDay(month.DaySummaries, 15)
	if !found {
		t.Fatalf("day 15 summary missing from %#v", month.DaySummaries)
	}
	if got, want := summary.NoteCount, 4; got != want {
		t.Fatalf("NoteCount = %d, want %d distinct daily/linked note files", got, want)
	}
	if got, want := summary.DueTitles, []string{"Review launch", "Ship release"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("DueTitles = %#v, want %#v", got, want)
	}

	notes, err := app.GetLinkedNotesForDate("2025-01-15")
	if err != nil {
		t.Fatalf("GetLinkedNotesForDate: %v", err)
	}
	paths := make(map[string]LinkedNote, len(notes))
	for _, note := range notes {
		paths[note.Path] = note
	}
	if got, want := len(paths), summary.NoteCount; got != want {
		t.Fatalf("selected-day notes = %d, want summary count %d: %#v", got, want, notes)
	}
	for _, path := range []string{"2025-01-15.md", "notes/alpha.md", "notes/bravo.md", "notes/mixed.md"} {
		if _, found := paths[path]; !found {
			t.Fatalf("selected-day notes missing %q: %#v", path, notes)
		}
	}
	if _, found := paths["tasks.md"]; found {
		t.Fatalf("due-only task file was returned as a note: %#v", notes)
	}
	if got := paths["notes/mixed.md"].LineNum; got != 2 {
		t.Fatalf("mixed note row points to line %d, want ordinary date link on line 2", got)
	}
}

func TestCalendarTimelineReturnsBoundedIndexedNotesAtFirstDateOccurrence(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "2025-01-15.md", "# Daily note\n")
	writeTestFile(t, vaultPath, "notes/alpha.md", "Before\n[Planning](2025-01-16.md)\n[Repeated](2025-01-16.md)\n")
	writeTestFile(t, vaultPath, "notes/outside.md", "[Outside](2025-02-20.md)\n")

	timeline, err := app.GetCalendarTimelineData("2025-01-14", "2025-01-18")
	if err != nil {
		t.Fatalf("GetCalendarTimelineData: %v", err)
	}
	if got, want := []string{timeline.StartDate, timeline.EndDate}, []string{"2025-01-14", "2025-01-18"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("timeline bounds = %v, want %v", got, want)
	}
	if got, want := len(timeline.Days), 2; got != want {
		t.Fatalf("timeline populated days = %d, want %d: %#v", got, want, timeline.Days)
	}
	if got := timeline.Days[0].Notes[0]; got.Path != "2025-01-15.md" || got.LineNum != 1 {
		t.Fatalf("daily-note timeline row = %#v, want line 1", got)
	}
	if got := timeline.Days[1].Notes[0]; got.Path != "notes/alpha.md" || got.LineNum != 2 {
		t.Fatalf("linked timeline row = %#v, want first date occurrence on line 2", got)
	}

	// Responses must not expose the shared index's backing slices.
	timeline.Days[1].Notes[0].LineNum = 99
	reloaded, err := app.GetCalendarTimelineData("2025-01-16", "2025-01-16")
	if err != nil || reloaded.Days[0].Notes[0].LineNum != 2 {
		t.Fatalf("timeline response retained caller mutation: %#v, err=%v", reloaded, err)
	}

	for _, bounds := range [][2]string{
		{"not-a-date", "2025-01-18"},
		{"2025-01-18", "2025-01-14"},
		{"2025-01-01", "2025-04-30"},
	} {
		if _, err := app.GetCalendarTimelineData(bounds[0], bounds[1]); err == nil {
			t.Fatalf("GetCalendarTimelineData(%q, %q) unexpectedly accepted invalid bounds", bounds[0], bounds[1])
		}
	}
}

func TestCalendarIndexUpdatesDatesIncrementallyAfterVaultMutation(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "2025-01-15.md", "# Daily note")
	writeTestFile(t, vaultPath, "notes/source.md", "[Project date](2025-01-20.md)\n")
	writeTestFile(t, vaultPath, "tasks.md", "- [ ] Due work #todo\n- [x] Finished #done\n")
	setTestTaskDueDate(t, app, "tasks.md", 1, "2025-01-22")
	setTestTaskDueDate(t, app, "tasks.md", 2, "2025-01-23")

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
	if got, want := month.DaysWithDueTasks, []int{22}; !reflect.DeepEqual(got, want) {
		t.Fatalf("DaysWithDueTasks = %v, want %v", got, want)
	}
	if summary, found := calendarSummaryForDay(month.DaySummaries, 22); !found || summary.NoteCount != 0 || !reflect.DeepEqual(summary.DueTitles, []string{"Due work"}) {
		t.Fatalf("due-only day summary = %#v, found=%v", summary, found)
	}
	dueTasks, err := app.GetTasksDueOnDate("2025-01-22")
	if err != nil || len(dueTasks) != 1 || dueTasks[0].Text != "Due work" {
		t.Fatalf("GetTasksDueOnDate = %+v, err=%v", dueTasks, err)
	}
	finished, err := app.GetTasksDueOnDate("2025-01-23")
	if err != nil || len(finished) != 0 {
		t.Fatalf("completed due tasks = %+v, err=%v", finished, err)
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
	if summary, found := calendarSummaryForDay(month.DaySummaries, 21); !found || summary.NoteCount != 1 {
		t.Fatalf("incremental linked-note summary = %#v, found=%v", summary, found)
	}
	if got := cachedCalendarIndex(app); got != firstIndex {
		t.Fatal("incremental mutation replaced the unaffected calendar projection instead of updating it in place")
	}
}

func TestCalendarMonthDataReadsTheRequestedMonthProjection(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "2025-01-15.md", "# January daily note")
	writeTestFile(t, vaultPath, "2025-02-16.md", "# February daily note")
	writeTestFile(t, vaultPath, "notes/links.md", "[January](2025-01-20.md)\n[February](2025-02-21.md)\n")

	month, err := app.GetCalendarMonthData(2025, 1)
	if err != nil {
		t.Fatalf("GetCalendarMonthData: %v", err)
	}
	if got, want := month.DaysWithNotes, []int{15}; !reflect.DeepEqual(got, want) {
		t.Fatalf("January note days = %v, want %v", got, want)
	}
	if got, want := month.DaysWithLinks, []int{20}; !reflect.DeepEqual(got, want) {
		t.Fatalf("January link days = %v, want %v", got, want)
	}
	if summary, found := calendarSummaryForDay(month.DaySummaries, 15); !found || summary.NoteCount != 1 {
		t.Fatalf("January daily-note summary = %#v, found=%v", summary, found)
	}
	if summary, found := calendarSummaryForDay(month.DaySummaries, 20); !found || summary.NoteCount != 1 {
		t.Fatalf("January linked-note summary = %#v, found=%v", summary, found)
	}

	index := app.vaultIndex.calendar
	if got, want := index.dailyDaysByMonth["2025-02"], []int{16}; !reflect.DeepEqual(got, want) {
		t.Fatalf("February daily projection = %v, want %v", got, want)
	}
	if got, want := index.linkedDaysByMonth["2025-02"], []int{21}; !reflect.DeepEqual(got, want) {
		t.Fatalf("February linked projection = %v, want %v", got, want)
	}

	month.DaysWithNotes[0] = 99
	month.DaySummaries[0].NoteCount = 99
	reloaded, err := app.GetCalendarMonthData(2025, 1)
	if err != nil || !reflect.DeepEqual(reloaded.DaysWithNotes, []int{15}) {
		t.Fatalf("calendar response mutated its cached month projection: %#v, err=%v", reloaded, err)
	}
	if summary, found := calendarSummaryForDay(reloaded.DaySummaries, 15); !found || summary.NoteCount != 1 {
		t.Fatalf("calendar summary response retained caller mutation: %#v, found=%v", summary, found)
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
