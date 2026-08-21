package desktop

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
	dailyNotes        map[string]struct{}
	linkedDays        map[string]struct{}
	dueTaskDays       map[string]struct{}
	linkedNotes       map[string][]LinkedNote
	notePathCounts    map[string]map[string]int
	dailyDaysByMonth  map[string][]int
	linkedDaysByMonth map[string][]int
	dueDaysByMonth    map[string][]int
}

func newCalendarDateIndex() *calendarDateIndex {
	return &calendarDateIndex{
		dailyNotes:        make(map[string]struct{}),
		linkedDays:        make(map[string]struct{}),
		dueTaskDays:       make(map[string]struct{}),
		linkedNotes:       make(map[string][]LinkedNote),
		notePathCounts:    make(map[string]map[string]int),
		dailyDaysByMonth:  make(map[string][]int),
		linkedDaysByMonth: make(map[string][]int),
		dueDaysByMonth:    make(map[string][]int),
	}
}

func (index *calendarDateIndex) addNotePath(dateStr, path string) {
	if !isCalendarDate(dateStr) || path == "" {
		return
	}
	paths := index.notePathCounts[dateStr]
	if paths == nil {
		paths = make(map[string]int)
		index.notePathCounts[dateStr] = paths
	}
	paths[path]++
}

func (index *calendarDateIndex) removeNotePath(dateStr, path string) {
	paths := index.notePathCounts[dateStr]
	if paths == nil {
		return
	}
	if paths[path] <= 1 {
		delete(paths, path)
	} else {
		paths[path]--
	}
	if len(paths) == 0 {
		delete(index.notePathCounts, dateStr)
	}
}

func (index *calendarDateIndex) noteCount(dateStr string) int {
	return len(index.notePathCounts[dateStr])
}

func (index *calendarDateIndex) addLinkedNote(dateStr string, note LinkedNote) {
	if !isCalendarDate(dateStr) || note.Path == "" {
		return
	}
	for _, existing := range index.linkedNotes[dateStr] {
		if existing.Path == note.Path {
			return
		}
	}
	index.linkedNotes[dateStr] = append(index.linkedNotes[dateStr], note)
	sortLinkedNotes(index.linkedNotes[dateStr])
}

func (index *calendarDateIndex) removeLinkedNote(dateStr, path string) {
	notes := index.linkedNotes[dateStr]
	filtered := notes[:0]
	for _, note := range notes {
		if note.Path != path {
			filtered = append(filtered, note)
		}
	}
	if len(filtered) == 0 {
		delete(index.linkedNotes, dateStr)
		return
	}
	index.linkedNotes[dateStr] = filtered
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

func calendarMonthKey(dateStr string) (string, int, bool) {
	if len(dateStr) != len("2006-01-02") || !isCalendarDate(dateStr) {
		return "", 0, false
	}
	return dateStr[:7], int(dateStr[8]-'0')*10 + int(dateStr[9]-'0'), true
}

func calendarMonthKeyFor(year, month int) string {
	return time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC).Format("2006-01")
}

func addCalendarMonthDay(daysByMonth map[string][]int, dateStr string) {
	month, day, valid := calendarMonthKey(dateStr)
	if !valid {
		return
	}
	days := daysByMonth[month]
	position := sort.SearchInts(days, day)
	if position < len(days) && days[position] == day {
		return
	}
	days = append(days, 0)
	copy(days[position+1:], days[position:])
	days[position] = day
	daysByMonth[month] = days
}

func removeCalendarMonthDay(daysByMonth map[string][]int, dateStr string) {
	month, day, valid := calendarMonthKey(dateStr)
	if !valid {
		return
	}
	days := daysByMonth[month]
	position := sort.SearchInts(days, day)
	if position >= len(days) || days[position] != day {
		return
	}
	copy(days[position:], days[position+1:])
	days[len(days)-1] = 0
	days = days[:len(days)-1]
	if len(days) == 0 {
		delete(daysByMonth, month)
		return
	}
	daysByMonth[month] = days
}

func (index *calendarDateIndex) addDailyNote(dateStr string) {
	index.dailyNotes[dateStr] = struct{}{}
	addCalendarMonthDay(index.dailyDaysByMonth, dateStr)
}

func (index *calendarDateIndex) removeDailyNote(dateStr string) {
	delete(index.dailyNotes, dateStr)
	removeCalendarMonthDay(index.dailyDaysByMonth, dateStr)
}

func (index *calendarDateIndex) addLinkedDay(dateStr string) {
	index.linkedDays[dateStr] = struct{}{}
	addCalendarMonthDay(index.linkedDaysByMonth, dateStr)
}

func (index *calendarDateIndex) removeLinkedDay(dateStr string) {
	delete(index.linkedDays, dateStr)
	removeCalendarMonthDay(index.linkedDaysByMonth, dateStr)
}

func (index *calendarDateIndex) addDueTaskDay(dateStr string) {
	index.dueTaskDays[dateStr] = struct{}{}
	addCalendarMonthDay(index.dueDaysByMonth, dateStr)
}

func (index *calendarDateIndex) removeDueTaskDay(dateStr string) {
	delete(index.dueTaskDays, dateStr)
	removeCalendarMonthDay(index.dueDaysByMonth, dateStr)
}

func calendarMonthDays(daysByMonth map[string][]int, year, month int) []int {
	return append([]int(nil), daysByMonth[calendarMonthKeyFor(year, month)]...)
}
