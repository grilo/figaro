package desktop

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"figaro/internal/taskschedule"
)

func TestEditorDateLinksPreserveScheduleStartAcrossSafeNoteSave(t *testing.T) {
	app, vault := newTestApp(t)
	defer os.RemoveAll(vault)
	source := "- [ ] Ship [[2026-01-01]] #wip"
	writeTestFile(t, vault, "tasks.md", source)
	task := taskschedule.Task{File: "tasks.md", Line: 1, Source: source}
	if err := app.SetTaskSchedule(task, "2025-12-30", "2026-01-01", ""); err != nil {
		t.Fatal(err)
	}
	original, _ := app.GetTaskSchedules()
	for _, next := range []string{
		"- [ ] Ship [2026-02-01](2026-02-01.md) #wip",
		"- [ ] Ship [[2026-03-01]] #wip",
	} {
		saved, err := app.SaveFile("tasks.md", next, 0)
		if err != nil || !saved.Success {
			t.Fatal(saved, err)
		}
		task.Source = next
		if err := app.SetTaskDueDate(task, "2026-03-01"); err != nil {
			t.Fatal(err)
		}
		entries, err := app.GetTaskSchedules()
		if err != nil || len(entries) != 1 || entries[0].ID != original[0].ID || entries[0].Start != "2025-12-30" || entries[0].End != "2026-03-01" || entries[0].Task == nil {
			t.Fatal(entries, err)
		}
	}
}

func TestTaskScheduleWritesOnlyPrivateMetadataAndReloads(t *testing.T) {
	app, vault := newTestApp(t)
	defer os.RemoveAll(vault)
	source := "- [ ] Keep my task #todo [due 2026-09-01](2026-09-01.md)"
	writeTestFile(t, vault, "tasks.md", source+"\n")
	app.syncKanbanColumns()
	task := taskschedule.Task{File: "tasks.md", Line: 1, Source: source}
	if err := app.SetTaskSchedule(task, "2026-08-31", "2026-09-02", ""); err != nil {
		t.Fatal(err)
	}
	content, _ := os.ReadFile(filepath.Join(vault, "tasks.md"))
	if string(content) != source+"\n" {
		t.Fatal("Markdown changed")
	}
	info, err := os.Stat(filepath.Join(vault, taskSchedulesPath))
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatal(info, err)
	}
	entries, err := app.GetTaskSchedules()
	if err != nil || len(entries) != 1 || entries[0].Task == nil || *entries[0].Task != task || entries[0].End != "2026-09-02" {
		t.Fatal(entries, err)
	}
	if err := app.SetTaskSchedule(task, "", "", entries[0].ID); err != nil {
		t.Fatal(err)
	}
	entries, _ = app.GetTaskSchedules()
	if entries[0].End != "" || entries[0].Task == nil {
		t.Fatal("clear did not retain override")
	}
	content, _ = os.ReadFile(filepath.Join(vault, "tasks.md"))
	if string(content) != source+"\n" {
		t.Fatal("clear removed authored due link")
	}
}

func TestScheduleStaleInvalidAndCorruptWritesPreserveMetadata(t *testing.T) {
	app, vault := newTestApp(t)
	defer os.RemoveAll(vault)
	source := "Task #todo"
	writeTestFile(t, vault, "tasks.md", source)
	app.syncKanbanColumns()
	task := taskschedule.Task{File: "tasks.md", Line: 1, Source: source}
	if err := app.SetTaskSchedule(task, "", "2026-09-01", ""); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(filepath.Join(vault, taskSchedulesPath))
	stale := task
	stale.Source = "Unsaved #todo"
	if app.SetTaskSchedule(stale, "", "2026-09-02", "") == nil {
		t.Fatal("accepted stale task")
	}
	if app.SetTaskSchedule(task, "2026-09-03", "2026-02-30", "") == nil {
		t.Fatal("accepted invalid dates")
	}
	unsafe := task
	unsafe.File = "../outside.md"
	if app.SetTaskSchedule(unsafe, "", "2026-09-01", "") == nil {
		t.Fatal("accepted escaped path")
	}
	after, _ := os.ReadFile(filepath.Join(vault, taskSchedulesPath))
	if !bytes.Equal(before, after) {
		t.Fatal("failed request changed metadata")
	}
	writeTestFile(t, vault, taskSchedulesPath, "{broken")
	app.syncKanbanColumns()
	board, boardErr := app.GetKanbanBoard()
	if boardErr != nil || len(board["todo"]) != 1 {
		t.Fatal("bad dates hid task", board, boardErr)
	}
	if app.SetTaskSchedule(task, "", "2026-09-02", "") == nil {
		t.Fatal("overwrote corrupt metadata")
	}
	after, _ = os.ReadFile(filepath.Join(vault, taskSchedulesPath))
	if string(after) != "{broken" {
		t.Fatal("corrupt metadata not preserved")
	}
}

func TestScheduleMetadataRefusesEscapingConfigSymlink(t *testing.T) {
	app, vault := newTestApp(t)
	defer os.RemoveAll(vault)
	outside := t.TempDir()
	writeTestFile(t, vault, "tasks.md", "Task #todo")
	app.syncKanbanColumns()
	// The adapter may already have created .config for unrelated preferences.
	configPath := filepath.Join(vault, ".config")
	if _, err := os.Stat(configPath); err == nil {
		if err := os.Rename(configPath, filepath.Join(vault, ".saved-config")); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Symlink(outside, configPath); err != nil {
		t.Skip(err)
	}
	if err := app.SetTaskSchedule(taskschedule.Task{File: "tasks.md", Line: 1, Source: "Task #todo"}, "", "2026-09-01", ""); err == nil {
		t.Fatal("followed escaping config symlink")
	}
	if files, _ := os.ReadDir(outside); len(files) != 0 {
		t.Fatal("wrote outside vault")
	}
}

func TestScheduleSourceRenameKeepsDates(t *testing.T) {
	app, vault := newTestApp(t)
	defer os.RemoveAll(vault)
	writeTestFile(t, vault, "tasks.md", "Task #todo")
	app.syncKanbanColumns()
	if err := app.SetTaskSchedule(taskschedule.Task{File: "tasks.md", Line: 1, Source: "Task #todo"}, "", "2026-09-01", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := app.RenamePath("tasks.md", "renamed.md"); err != nil {
		t.Fatal(err)
	}
	entries, err := app.GetTaskSchedules()
	if err != nil || len(entries) != 1 || entries[0].Task == nil || entries[0].Task.File != "renamed.md" {
		t.Fatal(entries, err)
	}
}

func setTestTaskDueDate(t *testing.T, app *App, file string, line int, date string) {
	t.Helper()
	content, err := app.readVaultFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if err := app.SetTaskDueDate(taskschedule.Task{File: file, Line: line, Source: strings.Split(string(content), "\n")[line-1]}, date); err != nil {
		t.Fatal(err)
	}
}

func TestTaskColumnMovesStartMetadataOnceAndCalendarUsesTheSameDeadline(t *testing.T) {
	app, vault := newTestApp(t)
	writeTestFile(t, vault, "tasks.md", "Ship #todo\nKeep  spacing\n")
	app.syncKanbanColumns()
	setTestTaskDueDate(t, app, "tasks.md", 1, "2026-08-01")
	result, err := app.UpdateTaskTag("tasks.md", 1, "todo", "review")
	if err != nil || !result.Success {
		t.Fatal(result, err)
	}
	entries, _ := app.GetTaskSchedules()
	if len(entries) != 1 || entries[0].Start != localToday() || entries[0].End != "2026-08-01" {
		t.Fatal(entries)
	}
	if got := readTestFile(t, vault, "tasks.md"); got != "Ship #review\nKeep  spacing\n" {
		t.Fatal(got)
	}
	// A source-editor move uses the same transaction and never resets the start.
	saved, err := app.SaveFile("tasks.md", "Ship #todo\nKeep  spacing\n", 0)
	if err != nil || !saved.Success {
		t.Fatal(saved, err)
	}
	saved, err = app.SaveFile("tasks.md", "Ship #done\nKeep  spacing\n", 0)
	if err != nil || !saved.Success {
		t.Fatal(saved, err)
	}
	again, _ := app.GetTaskSchedules()
	if again[0].Start != entries[0].Start || again[0].End != entries[0].End {
		t.Fatal(again)
	}
	due, err := app.GetTasksDueOnDate("2026-08-01")
	if err != nil || len(due) != 0 {
		t.Fatal("done task still due", due, err)
	}
}

func TestCorruptTaskMetadataRefusesMoveWithoutChangingMarkdown(t *testing.T) {
	app, vault := newTestApp(t)
	writeTestFile(t, vault, "tasks.md", "Ship #todo")
	writeTestFile(t, vault, taskSchedulesPath, "{broken")
	if _, err := app.UpdateTaskTag("tasks.md", 1, "todo", "wip"); err == nil {
		t.Fatal("accepted corrupt metadata")
	}
	if got := readTestFile(t, vault, "tasks.md"); got != "Ship #todo" {
		t.Fatal("changed note", got)
	}
	if got := readTestFile(t, vault, taskSchedulesPath); got != "{broken" {
		t.Fatal("changed metadata", got)
	}
}

func TestOldDueLookingLinksAreOrdinaryMarkdownAndNeverDeadlines(t *testing.T) {
	app, vault := newTestApp(t)
	source := "Ship #todo [due 2026-09-01](2026-09-01.md)"
	writeTestFile(t, vault, "tasks.md", source)
	app.syncKanbanColumns()
	board, err := app.GetKanbanBoard()
	if err != nil || board["todo"][0].DueDate != "" || !strings.Contains(board["todo"][0].Text, "[due ") {
		t.Fatal(board, err)
	}
	setTestTaskDueDate(t, app, "tasks.md", 1, "2026-09-02")
	month, err := app.GetCalendarMonthData(2026, 9)
	if err != nil || len(month.DaysWithDueTasks) != 1 || month.DaysWithDueTasks[0] != 2 {
		t.Fatal(month, err)
	}
	if got := readTestFile(t, vault, "tasks.md"); got != source {
		t.Fatal(got)
	}
}
