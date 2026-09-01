package taskschedule

import (
	"sort"
	"strings"
)

// TasksInDocument matches the board's whitespace-delimited tag contract.
func TasksInDocument(file, content string) []Task {
	result := []Task{}
	for i, source := range strings.Split(content, "\n") {
		todo, other := taskColumns(source)
		if todo || other {
			result = append(result, Task{File: file, Line: i + 1, Source: source})
		}
	}
	return result
}

// StartedTasks recognizes a real move into a non-TODO column, never initial
// indexing, text replacement, disappearance, or an ambiguous duplicate move.
func StartedTasks(before, after []Task) []Task {
	oldByText := map[string][]Task{}
	newByText := map[string][]Task{}
	unique := func(tasks []Task, groups map[string][]Task) {
		seen := map[Task]bool{}
		for _, task := range tasks {
			if seen[task] {
				continue
			}
			seen[task] = true
			key := task.File + "\x00" + Text(task.Source)
			groups[key] = append(groups[key], task)
		}
	}
	unique(before, oldByText)
	unique(after, newByText)
	result := []Task{}
	for key, current := range newByText {
		previous := oldByText[key]
		for _, next := range current {
			var old *Task
			if len(previous) == 1 && len(current) == 1 {
				old = &previous[0]
			} else if Fingerprint(before, next.File) == Fingerprint(after, next.File) {
				for i := range previous {
					if previous[i].Line == next.Line {
						old = &previous[i]
						break
					}
				}
			}
			if old == nil {
				continue
			}
			hadTODO, _ := taskColumns(old.Source)
			hasTODO, hasOther := taskColumns(next.Source)
			oldColumns := map[string]bool{}
			for _, word := range strings.Fields(old.Source) {
				oldColumns[strings.ToLower(word)] = true
			}
			newColumn := false
			for _, word := range strings.Fields(next.Source) {
				if tag.MatchString(word) && !hex.MatchString(word) && !oldColumns[strings.ToLower(word)] {
					newColumn = true
				}
			}
			if !hasTODO && hasOther && (hadTODO || newColumn) {
				result = append(result, next)
			}
		}
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].File != result[j].File {
			return result[i].File < result[j].File
		}
		return result[i].Line < result[j].Line
	})
	return result
}

func taskColumns(source string) (todo, other bool) {
	for _, word := range strings.Fields(source) {
		if !tag.MatchString(word) || hex.MatchString(word) {
			continue
		}
		if strings.EqualFold(word, "#todo") {
			todo = true
		} else {
			other = true
		}
	}
	return
}

// Begin preserves a previously recorded start and an already-overdue deadline.
// A deadline may predate the actual start; it must not be silently postponed.
func Begin(entries []Entry, tasks []Task, task Task, today, freshID string) ([]Entry, error) {
	end := ""
	for _, entry := range Resolve(entries, tasks) {
		if entry.Task == nil || *entry.Task != task {
			continue
		}
		if entry.Start != "" {
			return entries, nil
		}
		end = entry.End
		break
	}
	return Set(entries, tasks, task, today, end, "", freshID)
}
