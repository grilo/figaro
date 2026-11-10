package desktop

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"

	"figaro/internal/taskschedule"
)

func TestOrderedKanbanCardsReconcilesMovedLinesAndAppendsNewCards(t *testing.T) {
	cards := []KanbanCard{
		{File: "tasks.md", Line: 2, Text: "First"},
		{File: "tasks.md", Line: 3, Text: "Second"},
		{File: "tasks.md", Line: 4, Text: "New"},
	}
	order := []KanbanCardOrderRef{
		{File: "tasks.md", Line: 20, Text: "Second"},
		{File: "tasks.md", Line: 2, Text: "First"},
	}

	ordered := orderedKanbanCards(cards, order)
	got := []string{ordered[0].Text, ordered[1].Text, ordered[2].Text}
	if want := []string{"Second", "First", "New"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("ordered cards = %v, want %v", got, want)
	}
}

func TestOrderedKanbanCardsKeepsMatchingPrecedenceForRepeatedAndMovedCards(t *testing.T) {
	cards := []KanbanCard{
		{File: "a.md", Line: 1, Text: "Call"},       // 0
		{File: "a.md", Line: 2, Text: "Call"},       // 1
		{File: "a.md", Line: 3, Text: "Email"},      // 2
		{File: "b.md", Line: 1, Text: "Call"},       // 3
		{File: "a.md", Line: 9, Text: "Call"},       // 4
		{File: "b.md", Line: 2, Text: "Unsaved"},    // 5
		{File: "a.md", Line: 4, Text: "Also new"},   // 6
		{File: "a.md", Line: 3, Text: "Line reuse"}, // 7
	}
	order := []KanbanCardOrderRef{
		{File: "a.md", Line: 30, Text: "Call"},      // moved line: earliest unplaced "Call" in a.md, card 0
		{File: "a.md", Line: 1, Text: "Call"},       // its exact card is taken, so the next by text, card 1
		{File: "a.md", Line: 9, Text: "Call"},       // exact match, card 4
		{File: "a.md", Line: 9, Text: "Call"},       // repeated reference with no "Call" left in a.md
		{File: "b.md", Line: 1, Text: "Call"},       // exact match in another file, card 3
		{File: "a.md", Line: 3, Text: "Renamed"},    // same line, different text: no match
		{File: "gone.md", Line: 1, Text: "Call"},    // file no longer has cards
		{File: "a.md", Line: 12, Text: "Email"},     // moved line, card 2
		{File: "a.md", Line: 3, Text: "Line reuse"}, // exact match on a line shared by text, card 7
	}

	ordered := orderedKanbanCards(cards, order)
	got := make([]int, 0, len(ordered))
	for _, card := range ordered {
		for index, original := range cards {
			if card == original {
				got = append(got, index)
			}
		}
	}
	if want := []int{0, 1, 4, 3, 2, 7, 5, 6}; !reflect.DeepEqual(got, want) {
		t.Fatalf("ordered card positions = %v, want %v", got, want)
	}
}

// TestOrderedKanbanCardsAgreesWithFrontToBackSearch compares the indexed
// ordering with the plain search it replaced over many boards that repeat
// texts and lines, where the choice among equal cards is easiest to disturb.
func TestOrderedKanbanCardsAgreesWithFrontToBackSearch(t *testing.T) {
	searchOrdered := func(cards []KanbanCard, order []KanbanCardOrderRef) []KanbanCard {
		result := make([]KanbanCard, 0, len(cards))
		used := make([]bool, len(cards))
		place := func(ref KanbanCardOrderRef, exactLine bool) bool {
			for index, card := range cards {
				if used[index] || filepath.ToSlash(card.File) != filepath.ToSlash(ref.File) || card.Text != ref.Text {
					continue
				}
				if exactLine && card.Line != ref.Line {
					continue
				}
				used[index] = true
				result = append(result, card)
				return true
			}
			return false
		}
		for _, ref := range order {
			if !place(ref, true) {
				place(ref, false)
			}
		}
		for index, card := range cards {
			if !used[index] {
				result = append(result, card)
			}
		}
		return result
	}

	// A fixed linear congruential sequence keeps every run identical.
	state := uint32(20261110)
	next := func(limit int) int {
		state = state*1664525 + 1013904223
		return int(state>>16) % limit
	}
	files := []string{"a.md", "b.md", "notes/c.md"}
	texts := []string{"Call", "Email", "Review", ""}
	for round := 0; round < 400; round++ {
		cards := make([]KanbanCard, 2+next(12))
		for index := range cards {
			cards[index] = KanbanCard{File: files[next(len(files))], Line: 1 + next(5), Text: texts[next(len(texts))], Source: fmt.Sprint(round, index)}
		}
		order := make([]KanbanCardOrderRef, 1+next(16))
		for index := range order {
			order[index] = KanbanCardOrderRef{File: files[next(len(files))], Line: 1 + next(6), Text: texts[next(len(texts))]}
		}
		if got, want := orderedKanbanCards(cards, order), searchOrdered(cards, order); !reflect.DeepEqual(got, want) {
			t.Fatalf("round %d: indexed order differs from the front-to-back search\ncards: %+v\norder: %+v\n got: %+v\nwant: %+v", round, cards, order, got, want)
		}
	}
}

func TestSetKanbanCardOrderPersistsBoardOrderInVault(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "tasks.md", "- [ ] First #todo\n- [ ] Second #todo\n")
	app.syncKanbanColumns()

	result, err := app.SetKanbanCardOrder("todo", []KanbanCardOrderRef{
		{File: "tasks.md", Line: 2, Text: "Second"},
		{File: "tasks.md", Line: 1, Text: "First"},
	})
	if err != nil || result["success"] != true {
		t.Fatalf("SetKanbanCardOrder result=%v err=%v", result, err)
	}
	board, err := app.GetKanbanBoard()
	if err != nil {
		t.Fatalf("GetKanbanBoard: %v", err)
	}
	if got := []string{board["todo"][0].Text, board["todo"][1].Text}; !reflect.DeepEqual(got, []string{"Second", "First"}) {
		t.Fatalf("persisted board order = %v", got)
	}
	home, err := app.GetHomeTasks(2)
	if err != nil || len(home) != 2 || home[0].Text != "Second" || home[1].Text != "First" {
		t.Fatalf("Home task order = %#v err=%v", home, err)
	}
	if info, err := os.Stat(filepath.Join(vaultPath, kanbanOrderPath)); err != nil || (runtime.GOOS != "windows" && info.Mode().Perm() != 0600) {
		t.Fatalf("Kanban order config mode=%v err=%v", info, err)
	}
}

func TestSetKanbanCardOrderRejectsPathEscapeWithoutWriting(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	result, err := app.SetKanbanCardOrder("todo", []KanbanCardOrderRef{{File: "../outside.md", Line: 1, Text: "Nope"}})
	if err != nil || result["success"] != false {
		t.Fatalf("SetKanbanCardOrder result=%v err=%v", result, err)
	}
	if _, err := os.Stat(filepath.Join(vaultPath, kanbanOrderPath)); !os.IsNotExist(err) {
		t.Fatalf("unsafe order request wrote config: %v", err)
	}
}

func TestMergeDirectoryCarriesCardOrderAndTaskDatesToTheDestination(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "Drafts/tasks.md", "- [ ] First #todo\n- [ ] Second #todo\n")
	writeTestFile(t, vaultPath, "Drafts/report.md", "- [ ] Source report #todo\n")
	writeTestFile(t, vaultPath, "Archive/Drafts/report.md", "- [ ] Kept report #todo\n")
	app.syncKanbanColumns()

	if result, err := app.SetKanbanCardOrder("todo", []KanbanCardOrderRef{
		{File: "Drafts/tasks.md", Line: 2, Text: "Second"},
		{File: "Drafts/report.md", Line: 1, Text: "Source report"},
		{File: "Archive/Drafts/report.md", Line: 1, Text: "Kept report"},
		{File: "Drafts/tasks.md", Line: 1, Text: "First"},
	}); err != nil || result["success"] != true {
		t.Fatalf("SetKanbanCardOrder result=%v err=%v", result, err)
	}
	for _, schedule := range []struct {
		task taskschedule.Task
		end  string
	}{
		{task: taskschedule.Task{File: "Drafts/tasks.md", Line: 2, Source: "- [ ] Second #todo"}, end: "2026-09-01"},
		{task: taskschedule.Task{File: "Drafts/report.md", Line: 1, Source: "- [ ] Source report #todo"}, end: "2026-09-02"},
	} {
		if err := app.SetTaskSchedule(schedule.task, "", schedule.end, ""); err != nil {
			t.Fatalf("SetTaskSchedule(%+v): %v", schedule.task, err)
		}
	}

	result, err := app.MergeDirectory("Drafts", "Archive")
	if err != nil || !result.Success {
		t.Fatalf("MergeDirectory: result=%+v err=%v", result, err)
	}

	config, err := app.loadKanbanOrderConfig()
	if err != nil {
		t.Fatalf("load card order after merge: %v", err)
	}
	if want := []KanbanCardOrderRef{
		{File: "Archive/Drafts/tasks.md", Line: 2, Text: "Second"},
		{File: "Archive/Drafts/report (copy).md", Line: 1, Text: "Source report"},
		{File: "Archive/Drafts/report.md", Line: 1, Text: "Kept report"},
		{File: "Archive/Drafts/tasks.md", Line: 1, Text: "First"},
	}; !reflect.DeepEqual(config.Columns["todo"], want) {
		t.Fatalf("saved card order after merge = %+v, want %+v", config.Columns["todo"], want)
	}
	board, err := app.GetKanbanBoard()
	if err != nil {
		t.Fatalf("GetKanbanBoard after merge: %v", err)
	}
	texts := make([]string, 0, len(board["todo"]))
	for _, card := range board["todo"] {
		texts = append(texts, card.Text)
	}
	if want := []string{"Second", "Source report", "Kept report", "First"}; !reflect.DeepEqual(texts, want) {
		t.Fatalf("board order after merge = %v, want the manual order %v", texts, want)
	}

	schedules, err := app.GetTaskSchedules()
	if err != nil || len(schedules) != 2 {
		t.Fatalf("task schedules after merge = %+v, err=%v", schedules, err)
	}
	dates := make(map[string]string, len(schedules))
	for _, schedule := range schedules {
		if schedule.Task == nil {
			t.Fatalf("task schedule lost its task after the merge: %+v", schedule)
		}
		dates[schedule.Task.File] = schedule.End
	}
	if want := map[string]string{
		"Archive/Drafts/tasks.md":         "2026-09-01",
		"Archive/Drafts/report (copy).md": "2026-09-02",
	}; !reflect.DeepEqual(dates, want) {
		t.Fatalf("task dates after merge = %v, want %v", dates, want)
	}
}
