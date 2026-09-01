// Package taskschedule owns conservative task identity and date-range policy.
// It never reads notes or writes metadata.
package taskschedule

import (
	"crypto/sha256"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"
)

type Task struct {
	File   string `json:"file"`
	Line   int    `json:"line"`
	Source string `json:"source"`
}

type Entry struct {
	ID          string `json:"id"`
	File        string `json:"file"`
	Line        int    `json:"line"`
	Text        string `json:"text"`
	Snapshot    string `json:"snapshot"`
	Occurrences int    `json:"occurrences"`
	Start       string `json:"start"`
	End         string `json:"end"`
}

type Resolved struct {
	Entry
	Task *Task `json:"task"`
}

var taskPrefix = regexp.MustCompile(`^[-*+]\s*\[[ xX]\]\s*`)
var tag = regexp.MustCompile(`^#[a-zA-Z][a-zA-Z0-9_-]*$`)
var hex = regexp.MustCompile(`(?i)^#(?:[0-9a-f]{3}|[0-9a-f]{6})$`)

// Text ignores only task markup that Figaro itself changes when moving cards.
func Text(source string) string {
	source = taskPrefix.ReplaceAllString(strings.TrimSpace(source), "")
	words := strings.Fields(source)
	kept := words[:0]
	for _, word := range words {
		if !tag.MatchString(word) || hex.MatchString(word) {
			kept = append(kept, word)
		}
	}
	return strings.Join(kept, " ")
}

func validDate(value string) bool {
	date, err := time.Parse("2006-01-02", value)
	return err == nil && date.Year() >= 100 && date.Format("2006-01-02") == value
}

func ValidateDates(start, end string) error {
	if (start != "" && !validDate(start)) || (end != "" && !validDate(end)) {
		return fmt.Errorf("Choose valid start and end dates")
	}
	return nil
}

// Fingerprint distinguishes identical task lines only while their source task
// sequence is unchanged. Any ambiguous external edit detaches, never guesses.
func Fingerprint(tasks []Task, file string) string {
	lines := make(map[int]string)
	for _, task := range tasks {
		if task.File == file {
			lines[task.Line] = Text(task.Source)
		}
	}
	keys := make([]int, 0, len(lines))
	for line := range lines {
		keys = append(keys, line)
	}
	sort.Ints(keys)
	var text strings.Builder
	for _, line := range keys {
		fmt.Fprintf(&text, "%d:%s\n", line, lines[line])
	}
	return fmt.Sprintf("%x", sha256.Sum256([]byte(text.String())))
}

func Resolve(entries []Entry, tasks []Task) []Resolved {
	groups := make(map[string][]Task)
	seen := make(map[string]bool)
	for _, task := range tasks {
		key := fmt.Sprintf("%s\x00%d", task.File, task.Line)
		if seen[key] {
			continue
		}
		seen[key] = true
		group := task.File + "\x00" + Text(task.Source)
		groups[group] = append(groups[group], task)
	}
	result := make([]Resolved, len(entries))
	owners := make(map[string][]int)
	fingerprints := make(map[string]string)
	for i, entry := range entries {
		result[i].Entry = entry
		matches := groups[entry.File+"\x00"+entry.Text]
		if len(matches) == 1 && entry.Occurrences == 1 {
			task := matches[0]
			result[i].Task = &task
		} else if len(matches) > 1 {
			fingerprint, found := fingerprints[entry.File]
			if !found {
				fingerprint = Fingerprint(tasks, entry.File)
				fingerprints[entry.File] = fingerprint
			}
			if entry.Snapshot != fingerprint {
				continue
			}
			for _, task := range matches {
				if task.Line == entry.Line {
					copy := task
					result[i].Task = &copy
					break
				}
			}
		}
		if task := result[i].Task; task != nil {
			key := fmt.Sprintf("%s\x00%d", task.File, task.Line)
			owners[key] = append(owners[key], i)
		}
	}
	// Two old records converging on one remaining duplicate is also ambiguous.
	for _, indices := range owners {
		if len(indices) > 1 {
			for _, i := range indices {
				result[i].Task = nil
			}
		}
	}
	return result
}

func RewritePaths(entries []Entry, oldPath, newPath string) ([]Entry, bool) {
	result := append([]Entry(nil), entries...)
	changed := false
	for i := range result {
		path := result[i].File
		if path == oldPath || strings.HasPrefix(path, oldPath+"/") {
			result[i].File = newPath + strings.TrimPrefix(path, oldPath)
			changed = true
		}
	}
	return result, changed
}

// Set plans one immutable update, including explicit reconnection. The caller
// supplies a fresh ID; neither task source nor another record is overwritten.
func Set(entries []Entry, tasks []Task, task Task, start, end, id, freshID string) ([]Entry, error) {
	if err := ValidateDates(start, end); err != nil {
		return nil, err
	}
	found := false
	for _, candidate := range tasks {
		if candidate == task {
			found = true
			break
		}
	}
	if !found {
		return nil, fmt.Errorf("This task is no longer on the board; refresh Kanban")
	}
	selected := -1
	for i, resolved := range Resolve(entries, tasks) {
		if resolved.ID == id && id != "" {
			selected = i
		}
		if resolved.Task != nil && *resolved.Task == task {
			if id != "" && resolved.ID != id {
				return nil, fmt.Errorf("This task already has a schedule; no dates were replaced")
			}
			selected = i
		}
	}
	if id != "" && selected < 0 {
		return nil, fmt.Errorf("The saved schedule no longer exists; refresh Kanban")
	}
	result := append([]Entry(nil), entries...)
	if selected < 0 {
		selected = len(result)
		result = append(result, Entry{ID: freshID})
	}
	entry := &result[selected]
	entry.File, entry.Line, entry.Text = task.File, task.Line, Text(task.Source)
	entry.Snapshot = Fingerprint(tasks, task.File)
	entry.Occurrences = 0
	seen := make(map[int]bool)
	for _, candidate := range tasks {
		if candidate.File == task.File && Text(candidate.Source) == entry.Text && !seen[candidate.Line] {
			entry.Occurrences++
			seen[candidate.Line] = true
		}
	}
	entry.Start, entry.End = start, end
	return result, nil
}
