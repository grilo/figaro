package taskschedule

import (
	"regexp"
	"strings"
)

var inlineDateToken = regexp.MustCompile("\\\\.|`[^`]*`|!?\\[\\[[^\\]]*\\]\\]|!?\\[[^\\]]*\\]\\([^)]*\\)|<[^>]*>|https?://\\S+|[0-9]{4}-[0-9]{2}-[0-9]{2}|@date\\b")
var wikiDateToken = regexp.MustCompile(`^\[\[(\d{4}-\d{2}-\d{2})(?:\.md)?(?:\|[^\]]*)?\]\]$`)
var markdownDateToken = regexp.MustCompile(`^\[[^\]]*\]\((\d{4}-\d{2}-\d{2})\.md\)$`)

// Date-independent comparison is used only across a known note save. Ordinary
// identity still includes authored dates, and unrelated title edits never bind.
func dateNeutralText(source string) string {
	text := Text(source)
	var result strings.Builder
	position := 0
	for _, span := range inlineDateToken.FindAllStringIndex(text, -1) {
		value := text[span[0]:span[1]]
		date := ""
		if match := wikiDateToken.FindStringSubmatch(value); match != nil {
			date = match[1]
		} else if match := markdownDateToken.FindStringSubmatch(value); match != nil {
			date = match[1]
		} else if validDate(value) && inlineDateBoundary(text, span[0]-1) && inlineDateBoundary(text, span[1]) {
			date = value
		}
		if (date != "" && validDate(date)) || (value == "@date" && (span[0] == 0 || text[span[0]-1] == ' ')) {
			result.WriteString(text[position:span[0]])
			position = span[1]
		}
	}
	result.WriteString(text[position:])
	return strings.Join(strings.Fields(result.String()), " ")
}

func inlineDateBoundary(text string, index int) bool {
	if index < 0 || index >= len(text) {
		return true
	}
	c := text[index]
	if c == '.' && index+1 < len(text) {
		next := text[index+1]
		if (next >= 'a' && next <= 'z') || (next >= 'A' && next <= 'Z') || (next >= '0' && next <= '9') {
			return false
		}
	}
	return !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '/' || c == '-')
}

type DateEdit struct{ Before, After Task }

// DateEdits identifies only unique tasks whose authored change is date-only.
// Multiple similar tasks are deliberately left unresolved, never guessed.
func DateEdits(before, after []Task) []DateEdit {
	group := func(tasks []Task) map[string][]Task {
		groups := map[string][]Task{}
		for _, task := range tasks {
			text := dateNeutralText(task.Source)
			if text != "" {
				key := task.File + "\x00" + text
				groups[key] = append(groups[key], task)
			}
		}
		return groups
	}
	old, current := group(before), group(after)
	var edits []DateEdit
	for _, task := range after {
		key := task.File + "\x00" + dateNeutralText(task.Source)
		if len(old[key]) == 1 && len(current[key]) == 1 && Text(old[key][0].Source) != Text(task.Source) {
			edits = append(edits, DateEdit{old[key][0], task})
		}
	}
	return edits
}

// RebindDateEdits preserves the exact record, start and end while authored date
// links change. Set still refuses a collision with another schedule.
func RebindDateEdits(entries []Entry, before, after []Task, edits []DateEdit) ([]Entry, bool, error) {
	next := entries
	changed := false
	for _, resolved := range Resolve(entries, before) {
		if resolved.Task == nil {
			continue
		}
		for _, edit := range edits {
			if *resolved.Task != edit.Before {
				continue
			}
			var err error
			next, err = Set(next, after, edit.After, resolved.Start, resolved.End, resolved.ID, "")
			if err != nil {
				return nil, false, err
			}
			changed = true
		}
	}
	return next, changed, nil
}
