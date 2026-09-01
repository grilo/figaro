package desktop

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"figaro/internal/taskschedule"
)

const taskSchedulesPath = ".config/task-schedules.json"

type taskScheduleConfig struct {
	Version int                  `json:"version"`
	Entries []taskschedule.Entry `json:"entries"`
}

func (a *App) loadTaskSchedules() (taskScheduleConfig, error) {
	config := taskScheduleConfig{Version: 1, Entries: []taskschedule.Entry{}}
	data, err := a.readVaultFile(taskSchedulesPath)
	if os.IsNotExist(err) {
		return config, nil
	}
	if err != nil {
		return config, err
	}
	if err := json.Unmarshal(data, &config); err != nil {
		return config, fmt.Errorf("Read task schedules: %w", err)
	}
	if config.Version != 1 {
		return config, fmt.Errorf("Unsupported task schedule version %d", config.Version)
	}
	ids := make(map[string]bool)
	for _, entry := range config.Entries {
		if entry.ID == "" || ids[entry.ID] || taskschedule.ValidateDates(entry.Start, entry.End) != nil {
			return config, fmt.Errorf("Invalid task schedule metadata; the original file has been preserved")
		}
		ids[entry.ID] = true
	}
	return config, nil
}

func (a *App) saveTaskSchedules(config taskScheduleConfig) error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	return a.writeVaultFileAtomic(taskSchedulesPath, data, 0600)
}

func scheduleTasks(cards []KanbanCard) []taskschedule.Task {
	tasks := make([]taskschedule.Task, 0, len(cards))
	for _, card := range cards {
		tasks = append(tasks, taskschedule.Task{File: card.File, Line: card.Line, Source: card.Source})
	}
	return tasks
}

// GetTaskSchedules is read-only; unresolved records stay available to reconnect.
func (a *App) GetTaskSchedules() ([]taskschedule.Resolved, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, err
	}
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()
	config, err := a.loadTaskSchedules()
	if err != nil {
		return nil, err
	}
	var cards []KanbanCard
	for _, file := range index.files {
		cards = append(cards, file.cards...)
	}
	return taskschedule.Resolve(config.Entries, scheduleTasks(cards)), nil
}

// SetTaskSchedule changes only ignored metadata. The exact source precondition
// rejects stale/unsaved tasks and reconnect collisions before any write.
func (a *App) SetTaskSchedule(task taskschedule.Task, start, end, id string) error {
	return a.setTaskSchedule(task, start, end, id, false)
}

// SetTaskDueDate uses the same private metadata as Gantt, preserving the start.
// The exact source precondition prevents a stale card from editing another task.
func (a *App) SetTaskDueDate(task taskschedule.Task, dueDate string) error {
	return a.setTaskSchedule(task, "", dueDate, "", true)
}

func (a *App) setTaskSchedule(task taskschedule.Task, start, end, id string, dueOnly bool) error {
	if err := taskschedule.ValidateDates(start, end); err != nil {
		return err
	}
	clean, err := vaultRelativePath(task.File)
	if err != nil || clean == "." || strings.HasPrefix(filepath.ToSlash(clean), ".") || !strings.HasSuffix(strings.ToLower(clean), ".md") || task.Line < 1 {
		return fmt.Errorf("Invalid task source")
	}
	task.File = filepath.ToSlash(clean)
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	content, err := a.readVaultFile(clean)
	if err != nil {
		return err
	}
	lines := strings.Split(string(content), "\n")
	if task.Line > len(lines) || lines[task.Line-1] != task.Source {
		return fmt.Errorf("The task changed. Save the note and refresh Kanban before scheduling it")
	}
	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return err
	}
	var tasks []taskschedule.Task
	for _, file := range index.files {
		tasks = append(tasks, scheduleTasks(file.cards)...)
	}
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	config, err := a.loadTaskSchedules()
	if err != nil {
		return err
	}
	if dueOnly {
		for _, entry := range taskschedule.Resolve(config.Entries, tasks) {
			if entry.Task != nil && *entry.Task == task {
				start = entry.Start
				break
			}
		}
	}
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return err
	}
	config.Entries, err = taskschedule.Set(config.Entries, tasks, task, start, end, id, hex.EncodeToString(bytes))
	if err != nil {
		return err
	}
	return a.saveTaskSchedules(config)
}

func (a *App) rewriteTaskSchedulePaths(oldPath, newPath string) error {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	config, err := a.loadTaskSchedules()
	if err != nil {
		return err
	}
	entries, changed := taskschedule.RewritePaths(config.Entries, filepath.ToSlash(oldPath), filepath.ToSlash(newPath))
	if !changed {
		return nil
	}
	config.Entries = entries
	return a.saveTaskSchedules(config)
}
