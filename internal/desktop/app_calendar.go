package desktop

import (
	"fmt"
	"os"
	"os/user"
	"strings"
	"time"
)

// ============================================================================
// 5. Calendar / Daily Notes
// ============================================================================

// LinkedNote holds info about a note linked to a date.
type LinkedNote struct {
	Path    string  `json:"path"`
	Name    string  `json:"name"`
	LineNum int     `json:"line_num"`
	Snippet string  `json:"snippet"`
	Mtime   float64 `json:"mtime"`
}

const maxCalendarTimelineDays = 93

// CalendarTimelineDay contains the indexed notes associated with one populated
// date. Empty dates stay a frontend presentation concern so the native payload
// remains proportional to vault activity rather than to the requested span.
type CalendarTimelineDay struct {
	Date  string       `json:"date"`
	Notes []LinkedNote `json:"notes"`
}

// CalendarTimelineData is a bounded, inclusive projection of the shared
// calendar index for the horizontally scrollable Calendar presentation.
type CalendarTimelineData struct {
	StartDate string                `json:"start_date"`
	EndDate   string                `json:"end_date"`
	Days      []CalendarTimelineDay `json:"days"`
}

func calendarTimelineRange(startDate, endDate string) (time.Time, time.Time, error) {
	start, startErr := time.Parse("2006-01-02", startDate)
	end, endErr := time.Parse("2006-01-02", endDate)
	if startErr != nil || endErr != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("timeline dates must use YYYY-MM-DD")
	}
	if end.Before(start) {
		return time.Time{}, time.Time{}, fmt.Errorf("timeline end date must not precede its start date")
	}
	days := int(end.Sub(start).Hours()/24) + 1
	if days > maxCalendarTimelineDays {
		return time.Time{}, time.Time{}, fmt.Errorf("timeline range exceeds %d days", maxCalendarTimelineDays)
	}
	return start, end, nil
}

func calendarTimelineDays(index *calendarDateIndex, start, end time.Time) []CalendarTimelineDay {
	days := make([]CalendarTimelineDay, 0)
	for date := start; !date.After(end); date = date.AddDate(0, 0, 1) {
		dateStr := date.Format("2006-01-02")
		notes := index.linkedNotes[dateStr]
		if len(notes) == 0 {
			continue
		}
		days = append(days, CalendarTimelineDay{
			Date:  dateStr,
			Notes: append([]LinkedNote(nil), notes...),
		})
	}
	return days
}

// GetLinkedNotesForDate returns the distinct daily/ordinarily-linked note rows
// that contribute to a date's activity count. Task deadlines live in metadata.
func (a *App) GetLinkedNotesForDate(dateStr string) ([]LinkedNote, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()

	index, err := a.calendarIndexLocked()
	if err != nil {
		return nil, err
	}
	results := append([]LinkedNote(nil), index.linkedNotes[dateStr]...)
	return results, nil
}

// GetCalendarTimelineData reads one inclusive, bounded span from the existing
// shared Markdown index. It performs no filesystem walk and copies every
// returned slice so callers cannot mutate the cached projection.
func (a *App) GetCalendarTimelineData(startDate, endDate string) (*CalendarTimelineData, error) {
	start, end, err := calendarTimelineRange(startDate, endDate)
	if err != nil {
		return nil, err
	}

	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	index, err := a.calendarIndexLocked()
	if err != nil {
		return nil, err
	}
	return &CalendarTimelineData{
		StartDate: startDate,
		EndDate:   endDate,
		Days:      calendarTimelineDays(index, start, end),
	}, nil
}

// CalendarMonthData returns calendar information for a month.
type CalendarMonthData struct {
	Year             int                  `json:"year"`
	Month            int                  `json:"month"`
	DaysWithNotes    []int                `json:"days_with_notes"`
	DaysWithLinks    []int                `json:"days_with_links"`
	DaysWithDueTasks []int                `json:"days_with_due_tasks"`
	DaySummaries     []CalendarDaySummary `json:"day_summaries"`
	Calendar         [][]int              `json:"calendar"`
}

// CalendarDaySummary is the bounded activity projection needed to style and
// describe one populated day without loading every task or linked-note row.
type CalendarDaySummary struct {
	Day       int      `json:"day"`
	NoteCount int      `json:"note_count"`
	DueTitles []string `json:"due_titles"`
}

func calendarMonthDaySummaries(index *vaultIndex, tasksByDate map[string][]KanbanCard, year, month int) []CalendarDaySummary {
	daysInMonth := time.Date(year, time.Month(month)+1, 0, 0, 0, 0, 0, time.UTC).Day()
	summaries := make([]CalendarDaySummary, 0)
	for day := 1; day <= daysInMonth; day++ {
		dateStr := time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
		noteCount := index.calendar.noteCount(dateStr)
		tasks := tasksByDate[dateStr]
		if noteCount == 0 && len(tasks) == 0 {
			continue
		}
		dueTitles := make([]string, 0, len(tasks))
		for _, task := range tasks {
			title := strings.TrimSpace(task.Text)
			if title == "" {
				title = "Untitled task"
			}
			dueTitles = append(dueTitles, title)
		}
		summaries = append(summaries, CalendarDaySummary{
			Day:       day,
			NoteCount: noteCount,
			DueTitles: dueTitles,
		})
	}
	return summaries
}

// GetCalendarMonthData returns the bounded activity projection for one month.
func (a *App) GetCalendarMonthData(year int, month int) (*CalendarMonthData, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()

	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, err
	}
	calendarIndex := index.calendar
	board, err := a.scheduledBoardLocked(index)
	if err != nil {
		return nil, err
	}
	tasksByDate := dueCardsByDate(board)
	dueDaysByMonth := make(map[string][]int)
	for date := range tasksByDate {
		addCalendarMonthDay(dueDaysByMonth, date)
	}

	// Build calendar grid
	firstDay := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	startDow := int(firstDay.Weekday()) // Sunday=0
	daysInMonth := time.Date(year, time.Month(month)+1, 0, 0, 0, 0, 0, time.UTC).Day()

	cal := make([][]int, 0)
	week := make([]int, 7)
	for i := range week {
		week[i] = 0
	}
	day := 1
	for dow := 0; dow < startDow; dow++ {
		week[dow] = 0
	}
	for dow := startDow; day <= daysInMonth; dow++ {
		week[dow] = day
		day++
		if dow == 6 || day > daysInMonth {
			cal = append(cal, append([]int{}, week...))
			for i := range week {
				week[i] = 0
			}
			dow = -1
		}
	}

	return &CalendarMonthData{
		Year:             year,
		Month:            month,
		DaysWithNotes:    calendarMonthDays(calendarIndex.dailyDaysByMonth, year, month),
		DaysWithLinks:    calendarMonthDays(calendarIndex.linkedDaysByMonth, year, month),
		DaysWithDueTasks: calendarMonthDays(dueDaysByMonth, year, month),
		DaySummaries:     calendarMonthDaySummaries(index, tasksByDate, year, month),
		Calendar:         cal,
	}, nil
}

// GetTodayLink returns today's date string.
func (a *App) GetTodayLink() string {
	return time.Now().Format("2006-01-02")
}

func normalizeOSUsername(username string) string {
	username = strings.TrimSpace(username)
	if separator := strings.LastIndexAny(username, "\\/"); separator >= 0 {
		username = username[separator+1:]
	}
	return strings.TrimSpace(username)
}

// GetOSUsername returns the current operating-system account name for use as
// a local document metadata default. It intentionally does not persist it.
func (a *App) GetOSUsername() string {
	if current, err := user.Current(); err == nil {
		if username := normalizeOSUsername(current.Username); username != "" {
			return username
		}
	}
	for _, envName := range []string{"USERNAME", "USER"} {
		if username := normalizeOSUsername(os.Getenv(envName)); username != "" {
			return username
		}
	}
	return ""
}

// GetTomorrowLink returns tomorrow's date string.
func (a *App) GetTomorrowLink() string {
	return time.Now().AddDate(0, 0, 1).Format("2006-01-02")
}

// GetYesterdayLink returns yesterday's date string.
func (a *App) GetYesterdayLink() string {
	return time.Now().AddDate(0, 0, -1).Format("2006-01-02")
}
