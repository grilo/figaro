package main

import (
	"io/fs"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"
)

var (
	dailyNoteFilenameRE = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2})\.md$`)
	dateMarkdownLinkRE  = regexp.MustCompile(`\[[^\]]*\]\((\d{4}-\d{2}-\d{2})\.md\)`)
	emptyDateLinkRE     = regexp.MustCompile(`\[(\d{4}-\d{2}-\d{2})\]\(\)`)
)

// calendarDateIndex is immutable once published. It lets calendar navigation
// and date selection remain constant-time after one lazy vault scan.
type calendarDateIndex struct {
	dailyNotes  map[string]struct{}
	linkedDays  map[string]struct{}
	linkedNotes map[string][]LinkedNote
}

func newCalendarDateIndex() *calendarDateIndex {
	return &calendarDateIndex{
		dailyNotes:  make(map[string]struct{}),
		linkedDays:  make(map[string]struct{}),
		linkedNotes: make(map[string][]LinkedNote),
	}
}

// calendarIndexLocked builds or returns the index while the caller holds at
// least a vault read lock. This prevents the snapshot from mixing file states
// during a write without holding the calendar mutex during normal reads.
func (a *App) calendarIndexLocked() (*calendarDateIndex, error) {
	a.calendarMu.Lock()
	defer a.calendarMu.Unlock()

	if a.calendarIndex != nil {
		return a.calendarIndex, nil
	}

	index := newCalendarDateIndex()
	err := a.walkVaultMarkdown(func(_ *os.Root, rel string, info fs.FileInfo, data []byte) error {
		if matches := dailyNoteFilenameRE.FindStringSubmatch(info.Name()); len(matches) == 2 && isCalendarDate(matches[1]) {
			index.dailyNotes[matches[1]] = struct{}{}
		}

		content := string(data)
		seenLinkedNoteDates := make(map[string]struct{})
		for lineNumber, line := range strings.Split(content, "\n") {
			for _, match := range dateMarkdownLinkRE.FindAllStringSubmatch(line, -1) {
				dateStr := match[1]
				if !isCalendarDate(dateStr) {
					continue
				}
				index.linkedDays[dateStr] = struct{}{}
				if _, seen := seenLinkedNoteDates[dateStr]; seen {
					continue
				}
				seenLinkedNoteDates[dateStr] = struct{}{}
				index.linkedNotes[dateStr] = append(index.linkedNotes[dateStr], LinkedNote{
					Path:    rel,
					Name:    info.Name(),
					LineNum: lineNumber + 1,
					Snippet: strings.TrimSpace(line),
					Mtime:   float64(info.ModTime().UnixNano()) / 1e9,
				})
			}
		}
		for _, match := range emptyDateLinkRE.FindAllStringSubmatch(content, -1) {
			if isCalendarDate(match[1]) {
				index.linkedDays[match[1]] = struct{}{}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	for dateStr := range index.linkedNotes {
		sort.Slice(index.linkedNotes[dateStr], func(i, j int) bool {
			return index.linkedNotes[dateStr][i].Mtime > index.linkedNotes[dateStr][j].Mtime
		})
	}
	a.calendarIndex = index
	return index, nil
}

// invalidateCalendarIndexLocked marks cached calendar data stale after a
// vault mutation. The caller must hold the vault write lock, which makes the
// next read rebuild against a coherent new snapshot.
func (a *App) invalidateCalendarIndexLocked() {
	a.calendarMu.Lock()
	a.calendarIndex = nil
	a.calendarMu.Unlock()
}

func isCalendarDate(value string) bool {
	_, err := time.Parse("2006-01-02", value)
	return err == nil
}

func calendarMonthDates(index map[string]struct{}, year, month int) []int {
	days := make([]int, 0)
	for dateStr := range index {
		date, err := time.Parse("2006-01-02", dateStr)
		if err == nil && date.Year() == year && int(date.Month()) == month {
			days = append(days, date.Day())
		}
	}
	sort.Ints(days)
	return days
}
