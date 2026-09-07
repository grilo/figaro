package desktop

import (
	"figaro/internal/taskschedule"
	"sort"
	"strconv"
	"strings"
	"time"
)

func homeTaskProjection(cardsByTag map[string][]KanbanCard, columns []string, limit int, today string) []KanbanCard {
	return homeTaskProjectionWithSchedules(cardsByTag, columns, limit, today, nil, nil)
}

type rankedHomeTask struct {
	card    KanbanCard
	group   int
	date    string
	ordinal int
}

func homeTaskProjectionWithSchedules(
	cardsByTag map[string][]KanbanCard,
	columns []string,
	limit int,
	today string,
	scheduled map[string]taskschedule.Entry,
	orders map[string][]KanbanCardOrderRef,
) []KanbanCard {
	if limit <= 0 {
		return []KanbanCard{}
	}

	ranked := make([]rankedHomeTask, 0, limit)
	seen := make(map[string]struct{})
	ordinal := 0
	for _, column := range columns {
		if strings.EqualFold(column, "done") {
			continue
		}
		cards := cardsByTag[column]
		if len(orders[column]) > 0 {
			cards = orderedKanbanCards(cards, orders[column])
		}
		for _, card := range cards {
			if card.Completed {
				continue
			}
			key := card.File + "\x00" + strconv.Itoa(card.Line)
			if _, found := seen[key]; found {
				continue
			}
			seen[key] = struct{}{}
			if schedule, found := scheduled[key]; found {
				card.DueDate, card.StartDate = schedule.End, schedule.Start
			}
			group, date := dueSortKey(card.DueDate, today)
			candidate := rankedHomeTask{card: card, group: group, date: date, ordinal: ordinal}
			ordinal++
			position := sort.Search(len(ranked), func(index int) bool {
				current := ranked[index]
				if candidate.group != current.group {
					return candidate.group < current.group
				}
				if candidate.date != current.date {
					return candidate.date < current.date
				}
				return candidate.ordinal < current.ordinal
			})
			if position >= limit {
				continue
			}
			ranked = append(ranked, rankedHomeTask{})
			copy(ranked[position+1:], ranked[position:])
			ranked[position] = candidate
			if len(ranked) > limit {
				ranked = ranked[:limit]
			}
		}
	}

	tasks := make([]KanbanCard, len(ranked))
	for index := range ranked {
		tasks[index] = ranked[index].card
	}
	return tasks
}

func dueSortKey(dueDate, today string) (int, string) {
	switch {
	case dueDate == "":
		return 3, ""
	case dueDate < today:
		return 0, dueDate
	case dueDate == today:
		return 1, dueDate
	default:
		return 2, dueDate
	}
}

func dueTaskSummary(tasksByDate map[string][]KanbanCard, today string) DueTaskSummary {
	summary := DueTaskSummary{}
	for dueDate, tasks := range tasksByDate {
		if dueDate == today {
			summary.DueToday += len(tasks)
		} else if dueDate < today {
			summary.Overdue += len(tasks)
		}
	}
	return summary
}

func localToday() string {
	return time.Now().Format("2006-01-02")
}
