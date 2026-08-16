package desktop

import (
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// ============================================================================
// 4. Hashtag / Kanban
// ============================================================================

func (a *App) extractHashtags(content string) []string {
	return findHashtags(content)
}

// syncKanbanColumns rescans all vault files for hashtags and updates the column list.
func (a *App) syncKanbanColumns() {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()
	a.syncKanbanColumnsLocked()
}

// initializeVaultIndex performs the read-only initial projection without
// invalidating the independent file-tree cache. It intentionally shares the
// vault read lock with GetFileTree, so startup discovery cannot prevent the
// restored workspace tree from becoming available.
func (a *App) initializeVaultIndex() {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	if _, err := a.ensureVaultIndexLocked(); err != nil {
		log.Printf("[vault-index] Could not index vault: %v", err)
	}
}

// syncKanbanColumnsLocked requires vaultMu to be held for writing, so cache
// invalidation and the replacement scan publish one coherent snapshot.
func (a *App) syncKanbanColumnsLocked() {
	// Broad filesystem changes (rename/copy/merge and external tools) may
	// affect an unknown set of notes. Discard the old snapshot once, then build
	// a coherent replacement. Ordinary saves use updateVaultIndexFileLocked
	// instead and never enter this path.
	a.invalidateFileTreeCacheLocked()
	a.invalidateVaultIndexLocked()
	if _, err := a.ensureVaultIndexLocked(); err != nil {
		log.Printf("[vault-index] Could not index vault: %v", err)
	}
}

// GetKanbanColumns returns current columns and colors.
func (a *App) GetKanbanColumns() (map[string]interface{}, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	columns := append([]string(nil), a.kanbanColumns...)
	colors := make(map[string]string, len(a.kanbanColors))
	for name, color := range a.kanbanColors {
		colors[name] = color
	}
	return map[string]interface{}{
		"columns": columns,
		"colors":  colors,
	}, nil
}

// KanbanCard represents a task on the board.
type KanbanCard struct {
	File      string `json:"file"`
	FileName  string `json:"file_name"`
	Line      int    `json:"line"`
	Text      string `json:"text"`
	Tag       string `json:"tag"`
	DueDate   string `json:"due_date,omitempty"`
	Completed bool   `json:"completed,omitempty"`
}

// DueTaskSummary is the ambient in-app reminder projection for unfinished work.
type DueTaskSummary struct {
	DueToday int `json:"due_today"`
	Overdue  int `json:"overdue"`
}

// GetKanbanBoard returns all tasks grouped by column.
func (a *App) GetKanbanBoard() (map[string][]KanbanCard, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, err
	}

	a.mu.RLock()
	columns := make([]string, len(a.kanbanColumns))
	copy(columns, a.kanbanColumns)
	a.mu.RUnlock()

	columnSet := make(map[string]bool)
	for _, c := range columns {
		columnSet[c] = true
	}

	board := make(map[string][]KanbanCard)
	for tag, cards := range index.cardsByTag {
		if columnSet[tag] {
			board[tag] = append([]KanbanCard(nil), cards...)
		}
	}
	a.applyKanbanCardOrder(board)
	return board, nil
}

const maxHomeTaskCount = 6

// GetHomeTasks returns the first unfinished Kanban cards needed by Home
// without serializing the complete board. Cards retain the normal board order:
// custom columns first, then todo and wip, with done always omitted.
func (a *App) GetHomeTasks(limit int) ([]KanbanCard, error) {
	if limit <= 0 {
		return []KanbanCard{}, nil
	}
	if limit > maxHomeTaskCount {
		limit = maxHomeTaskCount
	}

	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, err
	}

	a.mu.RLock()
	columns := append([]string(nil), a.kanbanColumns...)
	a.mu.RUnlock()

	orderedCards := make(map[string][]KanbanCard, len(index.cardsByTag))
	for tag, cards := range index.cardsByTag {
		orderedCards[tag] = append([]KanbanCard(nil), cards...)
	}
	a.applyKanbanCardOrder(orderedCards)
	return homeTaskProjection(orderedCards, columns, limit, localToday()), nil
}

// GetDueTaskSummary returns the small local-date reminder projection used by
// Today and the persistent Kanban navigation control.
func (a *App) GetDueTaskSummary() (DueTaskSummary, error) {
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return DueTaskSummary{}, err
	}
	return dueTaskSummary(index.dueTasksByDate, localToday()), nil
}

// GetTasksDueOnDate returns each unfinished task due on a calendar day once,
// even when its source line belongs to more than one Kanban column.
func (a *App) GetTasksDueOnDate(dateStr string) ([]KanbanCard, error) {
	if !isCalendarDate(dateStr) {
		return []KanbanCard{}, nil
	}
	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	index, err := a.ensureVaultIndexLocked()
	if err != nil {
		return nil, err
	}
	return append([]KanbanCard(nil), index.dueTasksByDate[dateStr]...), nil
}

// SetColumnColor sets a color for a kanban column.
func (a *App) SetColumnColor(name string, color string) (map[string]interface{}, error) {
	name = strings.TrimSpace(strings.ToLower(name))
	a.mu.Lock()
	defer a.mu.Unlock()

	found := false
	for _, c := range a.kanbanColumns {
		if c == name {
			found = true
			break
		}
	}
	if !found {
		return map[string]interface{}{"success": false, "error": "Column not found"}, nil
	}
	if color == "" {
		delete(a.kanbanColors, name)
	} else {
		a.kanbanColors[name] = color
	}
	a.saveColors()
	columns := append([]string(nil), a.kanbanColumns...)
	colors := make(map[string]string, len(a.kanbanColors))
	for column, savedColor := range a.kanbanColors {
		colors[column] = savedColor
	}
	return map[string]interface{}{
		"success": true,
		"colors":  colors,
		"columns": columns,
	}, nil
}

// RenameKanbanColumn renames a column and updates all file occurrences.
func (a *App) RenameKanbanColumn(oldName string, newName string) (map[string]interface{}, error) {
	oldName = strings.TrimSpace(strings.ToLower(oldName))
	newName = strings.TrimSpace(strings.ToLower(newName))

	if !regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_-]*$`).MatchString(newName) {
		return map[string]interface{}{"success": false, "error": "Invalid column name"}, nil
	}

	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	a.mu.Lock()
	oldIdx := -1
	for i, c := range a.kanbanColumns {
		if c == oldName {
			oldIdx = i
			break
		}
	}
	if oldIdx < 0 {
		a.mu.Unlock()
		return map[string]interface{}{"success": false, "error": "Column not found"}, nil
	}
	for _, sc := range SystemColumns {
		if oldName == sc {
			a.mu.Unlock()
			return map[string]interface{}{"success": false, "error": "Cannot rename system column"}, nil
		}
	}
	for _, c := range a.kanbanColumns {
		if c == newName {
			a.mu.Unlock()
			return map[string]interface{}{"success": false, "error": "Column already exists"}, nil
		}
	}
	a.kanbanColumns[oldIdx] = newName
	if col, ok := a.kanbanColors[oldName]; ok {
		a.kanbanColors[newName] = col
		delete(a.kanbanColors, oldName)
		a.saveColors()
	}
	a.mu.Unlock()

	if err := a.renameHashtagInVault(oldName, newName); err != nil {
		return nil, fmt.Errorf("rename hashtag in vault: %w", err)
	}
	if err := a.renameKanbanOrderColumn(oldName, newName); err != nil {
		log.Printf("[kanban] Could not rename saved card order from %q to %q: %v", oldName, newName, err)
	}
	a.syncKanbanColumnsLocked()

	a.mu.RLock()
	defer a.mu.RUnlock()
	columns := append([]string(nil), a.kanbanColumns...)
	colors := make(map[string]string, len(a.kanbanColors))
	for column, color := range a.kanbanColors {
		colors[column] = color
	}
	return map[string]interface{}{
		"success": true,
		"columns": columns,
		"colors":  colors,
	}, nil
}

// DeleteKanbanColumn removes a column and strips its tag from all files.
func (a *App) DeleteKanbanColumn(name string) (map[string]interface{}, error) {
	name = strings.TrimSpace(strings.ToLower(name))
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	a.mu.Lock()
	for _, sc := range SystemColumns {
		if name == sc {
			a.mu.Unlock()
			return map[string]interface{}{"success": false, "error": "Cannot delete system column"}, nil
		}
	}
	found := false
	for i, c := range a.kanbanColumns {
		if c == name {
			a.kanbanColumns = append(a.kanbanColumns[:i], a.kanbanColumns[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		a.mu.Unlock()
		return map[string]interface{}{"success": false, "error": "Column not found"}, nil
	}
	delete(a.kanbanColors, name)
	a.saveColors()
	a.mu.Unlock()

	if err := a.removeHashtagFromVault(name); err != nil {
		return nil, fmt.Errorf("remove hashtag from vault: %w", err)
	}
	if err := a.removeKanbanOrderColumn(name); err != nil {
		log.Printf("[kanban] Could not remove saved card order for %q: %v", name, err)
	}
	a.syncKanbanColumnsLocked()

	a.mu.RLock()
	defer a.mu.RUnlock()
	columns := append([]string(nil), a.kanbanColumns...)
	colors := make(map[string]string, len(a.kanbanColors))
	for column, color := range a.kanbanColors {
		colors[column] = color
	}
	return map[string]interface{}{
		"success": true,
		"columns": columns,
		"colors":  colors,
	}, nil
}

// UpdateTaskTag changes a tag on a specific line in a file (card drag).
func (a *App) UpdateTaskTag(filePath string, lineNum int, oldTag string, newTag string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	cleanRel, err := vaultRelativePath(filePath)
	if err != nil {
		return nil, err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	data, err := root.ReadFile(cleanRel)
	if err != nil {
		return nil, err
	}
	lines := strings.Split(string(data), "\n")
	if lineNum < 1 || lineNum > len(lines) {
		return &SaveFileResult{Success: false, Error: "Line out of range"}, nil
	}
	line := lines[lineNum-1]
	newLine := replaceHashtag(line, oldTag, newTag)
	if newLine == line {
		return &SaveFileResult{Success: false, Error: "Tag not found on line"}, nil
	}
	lines[lineNum-1] = newLine
	updatedContent := strings.Join(lines, "\n")
	if err := writeRootFileAtomic(root, cleanRel, []byte(updatedContent), 0644); err != nil {
		return nil, err
	}
	info, err := root.Stat(cleanRel)
	if err != nil {
		return nil, fmt.Errorf("inspect updated task: %w", err)
	}
	mtime := a.recordFileVersionLocked(a.vaultAbsolutePath(cleanRel), info)
	a.updateVaultIndexFileLocked(cleanRel, info, updatedContent)
	a.markInternalVaultWriteLocked(cleanRel)
	return &SaveFileResult{Success: true, Mtime: mtime, Path: filePath}, nil
}

// RemoveTagFromTask strips a tag from a specific line.
func (a *App) RemoveTagFromTask(filePath string, lineNum int, tag string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	cleanRel, err := vaultRelativePath(filePath)
	if err != nil {
		return nil, err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	data, err := root.ReadFile(cleanRel)
	if err != nil {
		return nil, err
	}
	lines := strings.Split(string(data), "\n")
	if lineNum < 1 || lineNum > len(lines) {
		return &SaveFileResult{Success: false, Error: "Line out of range"}, nil
	}
	line := lines[lineNum-1]
	newLine := removeHashtag(line, tag)
	if newLine == line {
		return &SaveFileResult{Success: false, Error: "Tag not found on line"}, nil
	}
	lines[lineNum-1] = newLine
	updatedContent := strings.Join(lines, "\n")
	if err := writeRootFileAtomic(root, cleanRel, []byte(updatedContent), 0644); err != nil {
		return nil, err
	}
	info, err := root.Stat(cleanRel)
	if err != nil {
		return nil, fmt.Errorf("inspect updated task: %w", err)
	}
	mtime := a.recordFileVersionLocked(a.vaultAbsolutePath(cleanRel), info)
	a.updateVaultIndexFileLocked(cleanRel, info, updatedContent)
	a.markInternalVaultWriteLocked(cleanRel)
	return &SaveFileResult{Success: true, Mtime: mtime, Path: filePath}, nil
}

// SetTaskDueDate stores or clears one semantic Markdown due-date link on the
// source task line. The vault note remains the only source of truth.
func (a *App) SetTaskDueDate(filePath string, lineNum int, dueDate string) (*SaveFileResult, error) {
	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()

	cleanRel, err := vaultRelativePath(filePath)
	if err != nil {
		return nil, err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	data, err := root.ReadFile(cleanRel)
	if err != nil {
		return nil, err
	}
	lines := strings.Split(string(data), "\n")
	if lineNum < 1 || lineNum > len(lines) {
		return &SaveFileResult{Success: false, Error: "Line out of range"}, nil
	}
	newLine, valid := setTaskDueDateOnLine(lines[lineNum-1], dueDate)
	if !valid {
		return &SaveFileResult{Success: false, Error: "Invalid due date"}, nil
	}
	if newLine == lines[lineNum-1] {
		info, statErr := root.Stat(cleanRel)
		if statErr != nil {
			return nil, statErr
		}
		return &SaveFileResult{Success: true, Mtime: indexMtime(info), Path: filePath}, nil
	}

	lines[lineNum-1] = newLine
	updatedContent := strings.Join(lines, "\n")
	if err := writeRootFileAtomic(root, cleanRel, []byte(updatedContent), 0644); err != nil {
		return nil, err
	}
	info, err := root.Stat(cleanRel)
	if err != nil {
		return nil, fmt.Errorf("inspect updated task: %w", err)
	}
	mtime := a.recordFileVersionLocked(a.vaultAbsolutePath(cleanRel), info)
	a.updateVaultIndexFileLocked(cleanRel, info, updatedContent)
	a.markInternalVaultWriteLocked(cleanRel)
	return &SaveFileResult{Success: true, Mtime: mtime, Path: filePath}, nil
}

func (a *App) renameHashtagInVault(oldTag, newTag string) error {
	return a.walkVaultMarkdown(func(root *os.Root, rel string, _ fs.FileInfo, data []byte) error {
		content := string(data)
		newContent := replaceHashtag(content, oldTag, newTag)
		if newContent != content {
			if err := writeRootFileAtomic(root, filepath.FromSlash(rel), []byte(newContent), 0644); err != nil {
				return err
			}
			info, err := root.Stat(filepath.FromSlash(rel))
			if err != nil {
				return err
			}
			a.recordFileVersionLocked(a.vaultAbsolutePath(filepath.FromSlash(rel)), info)
		}
		return nil
	})
}

func (a *App) removeHashtagFromVault(tag string) error {
	return a.walkVaultMarkdown(func(root *os.Root, rel string, _ fs.FileInfo, data []byte) error {
		content := string(data)
		newContent := removeHashtag(content, tag)
		if newContent != content {
			if err := writeRootFileAtomic(root, filepath.FromSlash(rel), []byte(newContent), 0644); err != nil {
				return err
			}
			info, err := root.Stat(filepath.FromSlash(rel))
			if err != nil {
				return err
			}
			a.recordFileVersionLocked(a.vaultAbsolutePath(filepath.FromSlash(rel)), info)
		}
		return nil
	})
}
