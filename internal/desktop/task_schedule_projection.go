package desktop

import (
	"figaro/internal/taskschedule"
	"strconv"
)

// scheduledBoardLocked joins metadata onto a copy, keeping the Markdown index
// immutable and free of filesystem/settings dependencies.
func (a *App) scheduledBoardLocked(index *vaultIndex) (map[string][]KanbanCard, error) {
	a.settingsMu.RLock()
	config, err := a.loadTaskSchedules()
	a.settingsMu.RUnlock()
	if err != nil {
		return scheduleBoard(index.cardsByTag, nil), err
	}
	return scheduleBoard(index.cardsByTag, config.Entries), nil
}

func scheduleBoard(board map[string][]KanbanCard, entries []taskschedule.Entry) map[string][]KanbanCard {
	var tasks []taskschedule.Task
	for _, cards := range board {
		tasks = append(tasks, scheduleTasks(cards)...)
	}
	dates := map[string]taskschedule.Entry{}
	key := func(file string, line int) string { return file + "\x00" + strconv.Itoa(line) }
	for _, entry := range taskschedule.Resolve(entries, tasks) {
		if entry.Task != nil {
			dates[key(entry.Task.File, entry.Task.Line)] = entry.Entry
		}
	}
	result := map[string][]KanbanCard{}
	for column, cards := range board {
		result[column] = make([]KanbanCard, len(cards))
		for i, card := range cards {
			entry := dates[key(card.File, card.Line)]
			card.DueDate, card.StartDate = entry.End, entry.Start
			result[column][i] = card
		}
	}
	return result
}

func dueCardsByDate(board map[string][]KanbanCard) map[string][]KanbanCard {
	dates := map[string][]KanbanCard{}
	seen := map[string]bool{}
	for _, cards := range board {
		for _, card := range cards {
			key := card.File + "\x00" + strconv.Itoa(card.Line)
			if card.Completed || card.DueDate == "" || seen[key] {
				continue
			}
			seen[key] = true
			// Task titles omit all column tags, never ordinary Markdown links.
			for _, tag := range standaloneTaskTags(card.Source) {
				card.Text = removeHashtag(card.Text, tag)
			}
			dates[card.DueDate] = append(dates[card.DueDate], card)
		}
	}
	for _, cards := range dates {
		sortKanbanCards(cards)
	}
	return dates
}

func standaloneTaskTags(source string) []string {
	var tags []string
	for _, match := range hashtagRe.FindAllStringSubmatchIndex(source, -1) {
		if len(match) >= 4 && isHashtagBoundaryOK(source, match[0], match[1]) {
			tags = append(tags, source[match[2]:match[3]])
		}
	}
	return tags
}
