package desktop

import (
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

// GetLinkedNotesForDate returns the distinct daily/ordinarily-linked note rows
// that contribute to a date's activity count. Semantic due links are tasks.
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

func calendarMonthDaySummaries(index *vaultIndex, year, month int) []CalendarDaySummary {
	daysInMonth := time.Date(year, time.Month(month)+1, 0, 0, 0, 0, 0, time.UTC).Day()
	summaries := make([]CalendarDaySummary, 0)
	for day := 1; day <= daysInMonth; day++ {
		dateStr := time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
		noteCount := index.calendar.noteCount(dateStr)
		tasks := index.dueTasksByDate[dateStr]
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
		DaysWithDueTasks: calendarMonthDays(calendarIndex.dueDaysByMonth, year, month),
		DaySummaries:     calendarMonthDaySummaries(index, year, month),
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
