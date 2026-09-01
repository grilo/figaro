package desktop

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"

	"figaro/internal/taskschedule"
)

type scheduledNoteChange struct {
	app       *App
	original  taskScheduleConfig
	next      taskScheduleConfig
	writeNote func() error
}

func (c scheduledNoteChange) WriteDates() error   { return c.app.saveTaskSchedules(c.next) }
func (c scheduledNoteChange) RestoreDates() error { return c.app.saveTaskSchedules(c.original) }
func (c scheduledNoteChange) WriteNote() error    { return c.writeNote() }

// The caller holds vaultMu. Date planning is pure; metadata is committed before
// the note, and restored if atomic note replacement fails.
func (a *App) writeNoteWithTaskSchedules(root *os.Root, path, content string) error {
	write := func() error { return writeRootFileAtomic(root, path, []byte(content), 0644) }
	if !strings.EqualFold(filepath.Ext(path), ".md") {
		return write()
	}
	original, err := root.ReadFile(path)
	if os.IsNotExist(err) {
		return write()
	}
	if err != nil {
		return err
	}
	before := taskschedule.TasksInDocument(filepath.ToSlash(path), string(original))
	after := taskschedule.TasksInDocument(filepath.ToSlash(path), content)
	started := taskschedule.StartedTasks(before, after)
	dateEdits := taskschedule.DateEdits(before, after)
	if len(started) == 0 && len(dateEdits) == 0 {
		return write()
	}
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	config, err := a.loadTaskSchedules()
	if err != nil {
		return err
	}
	next := taskScheduleConfig{Version: config.Version, Entries: config.Entries}
	var rebound bool
	next.Entries, rebound, err = taskschedule.RebindDateEdits(config.Entries, before, after, dateEdits)
	if err != nil {
		return err
	}
	if !rebound && len(started) == 0 {
		return write()
	}
	today := localToday()
	for _, task := range started {
		id := make([]byte, 16)
		if _, err := rand.Read(id); err != nil {
			return err
		}
		next.Entries, err = taskschedule.Begin(next.Entries, after, task, today, hex.EncodeToString(id))
		if err != nil {
			return err
		}
	}
	return taskschedule.CommitChange(scheduledNoteChange{a, config, next, write})
}
