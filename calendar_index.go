package main

import (
	"regexp"
	"sort"
	"time"
)

var (
	dailyNoteFilenameRE = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2})\.md$`)
	dateMarkdownLinkRE  = regexp.MustCompile(`\[[^\]]*\]\((\d{4}-\d{2}-\d{2})\.md\)`)
	emptyDateLinkRE     = regexp.MustCompile(`\[(\d{4}-\d{2}-\d{2})\]\(\)`)
)

// calendarDateIndex is read-only between vault mutations. It lets calendar
// navigation and date selection remain constant-time after one lazy vault
// scan.
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

// calendarIndexLocked returns the calendar projection from the unified vault
// index while the caller holds at least a vault read lock. Calendar navigation
// consequently never starts a second disk walk after Kanban, search, or
// backlinks have indexed the same snapshot.
func (a *App) calendarIndexLocked() (*calendarDateIndex, error) {
	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, err
	}
	return index.calendar, nil
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
