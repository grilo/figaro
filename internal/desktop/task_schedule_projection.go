package desktop

import (
	"figaro/internal/taskschedule"
	"slices"
	"strconv"
)

type taskScheduleProjectionCache struct {
	index         *vaultIndex
	indexRevision uint64
	entries       []taskschedule.Entry
	dates         map[string]taskschedule.Entry
}

// scheduledBoardLocked joins metadata onto a copy, keeping the Markdown index
// immutable and free of filesystem/settings dependencies.
func (a *App) scheduledBoardLocked(index *vaultIndex) (map[string][]KanbanCard, error) {
	dates, err := a.scheduledTaskDatesLocked(index)
	return scheduleBoardWithDates(index.cardsByTag, dates), err
}

// scheduledTaskDatesLocked caches the expensive task-identity resolution while
// still reading the small metadata file on every request. An external metadata
// edit changes the entry slice and a note edit changes the index revision, so
// neither can reuse a stale projection.
func (a *App) scheduledTaskDatesLocked(index *vaultIndex) (map[string]taskschedule.Entry, error) {
	a.settingsMu.RLock()
	config, err := a.loadTaskSchedules()
	a.settingsMu.RUnlock()
	if err != nil {
		return map[string]taskschedule.Entry{}, err
	}

	a.taskProjectionMu.Lock()
	defer a.taskProjectionMu.Unlock()
	cache := &a.taskProjection
	if cache.index == index && cache.indexRevision == index.revision && slices.Equal(cache.entries, config.Entries) {
		return cache.dates, nil
	}
	dates := scheduleDateProjection(index.cardsByTag, config.Entries)
	*cache = taskScheduleProjectionCache{
		index:         index,
		indexRevision: index.revision,
		entries:       append([]taskschedule.Entry(nil), config.Entries...),
		dates:         dates,
	}
	return dates, nil
}

func scheduleBoard(board map[string][]KanbanCard, entries []taskschedule.Entry) map[string][]KanbanCard {
	return scheduleBoardWithDates(board, scheduleDateProjection(board, entries))
}

func scheduleDateProjection(board map[string][]KanbanCard, entries []taskschedule.Entry) map[string]taskschedule.Entry {
	dates := map[string]taskschedule.Entry{}
	if len(entries) == 0 {
		return dates
	}
	var tasks []taskschedule.Task
	for _, cards := range board {
		tasks = append(tasks, scheduleTasks(cards)...)
	}
	key := func(file string, line int) string { return file + "\x00" + strconv.Itoa(line) }
	for _, entry := range taskschedule.Resolve(entries, tasks) {
		if entry.Task != nil {
			dates[key(entry.Task.File, entry.Task.Line)] = entry.Entry
		}
	}
	return dates
}

func scheduleBoardWithDates(board map[string][]KanbanCard, dates map[string]taskschedule.Entry) map[string][]KanbanCard {
	key := func(file string, line int) string { return file + "\x00" + strconv.Itoa(line) }
	result := map[string][]KanbanCard{}
	for column, cards := range board {
		if len(dates) == 0 {
			result[column] = cards
			continue
		}
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
	return dueCardsByDateWithSchedules(board, nil)
}

func dueCardsByDateWithSchedules(board map[string][]KanbanCard, scheduled map[string]taskschedule.Entry) map[string][]KanbanCard {
	dates := map[string][]KanbanCard{}
	seen := map[string]bool{}
	for _, cards := range board {
		for _, card := range cards {
			key := card.File + "\x00" + strconv.Itoa(card.Line)
			if schedule, found := scheduled[key]; found {
				card.DueDate, card.StartDate = schedule.End, schedule.Start
			}
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
