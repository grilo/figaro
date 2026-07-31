package desktop

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var taskDueLinkRE = regexp.MustCompile(`(?i)\[due\s+(\d{4}-\d{2}-\d{2})\]\((\d{4}-\d{2}-\d{2})\.md\)`)

func parseTaskDueDate(line string) string {
	for _, match := range taskDueLinkRE.FindAllStringSubmatch(line, -1) {
		if len(match) == 3 && match[1] == match[2] && isCalendarDate(match[1]) {
			return match[1]
		}
	}
	return ""
}

func stripTaskDueLinks(line string) string {
	return strings.Join(strings.Fields(removeTaskDueLinks(line)), " ")
}

func removeTaskDueLinks(line string) string {
	cleaned := taskDueLinkRE.ReplaceAllStringFunc(line, func(candidate string) string {
		match := taskDueLinkRE.FindStringSubmatch(candidate)
		if len(match) == 3 && match[1] == match[2] && isCalendarDate(match[1]) {
			return ""
		}
		return candidate
	})
	return strings.TrimRight(cleaned, " \t")
}

func setTaskDueDateOnLine(line, dueDate string) (string, bool) {
	dueDate = strings.TrimSpace(dueDate)
	if dueDate != "" && !isCalendarDate(dueDate) {
		return line, false
	}

	cleaned := strings.TrimRight(removeTaskDueLinks(line), " \t")
	if dueDate == "" {
		return cleaned, true
	}
	link := "[due " + dueDate + "](" + dueDate + ".md)"
	if cleaned == "" {
		return link, true
	}
	return cleaned + " " + link, true
}

func homeTaskProjection(cardsByTag map[string][]KanbanCard, columns []string, limit int, today string) []KanbanCard {
	if limit <= 0 {
		return []KanbanCard{}
	}

	tasks := make([]KanbanCard, 0)
	seen := make(map[string]struct{})
	for _, column := range columns {
		if strings.EqualFold(column, "done") {
			continue
		}
		for _, card := range cardsByTag[column] {
			if card.Completed {
				continue
			}
			key := card.File + "\x00" + strconv.Itoa(card.Line)
			if _, found := seen[key]; found {
				continue
			}
			seen[key] = struct{}{}
			tasks = append(tasks, card)
		}
	}

	sort.SliceStable(tasks, func(i, j int) bool {
		leftGroup, leftDate := dueSortKey(tasks[i].DueDate, today)
		rightGroup, rightDate := dueSortKey(tasks[j].DueDate, today)
		if leftGroup != rightGroup {
			return leftGroup < rightGroup
		}
		if leftDate != rightDate {
			return leftDate < rightDate
		}
		return false
	})
	if len(tasks) > limit {
		tasks = tasks[:limit]
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
