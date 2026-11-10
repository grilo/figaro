package desktop

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const kanbanOrderPath = ".config/kanban-order.json"

var kanbanColumnNameRe = regexp.MustCompile(`^[a-z][a-z0-9_-]*$`)

// KanbanCardOrderRef is the smallest stable card identity the browser needs to
// persist. Line numbers make the common case exact; text provides a safe
// fallback when edits above a task move it to another line.
type KanbanCardOrderRef struct {
	File string `json:"file"`
	Line int    `json:"line"`
	Text string `json:"text"`
}

type kanbanOrderConfig struct {
	Version int                             `json:"version"`
	Columns map[string][]KanbanCardOrderRef `json:"columns"`
}

func newKanbanOrderConfig() kanbanOrderConfig {
	return kanbanOrderConfig{Version: 1, Columns: make(map[string][]KanbanCardOrderRef)}
}

func (a *App) loadKanbanOrderConfig() (kanbanOrderConfig, error) {
	data, err := a.readVaultFile(kanbanOrderPath)
	if os.IsNotExist(err) {
		return newKanbanOrderConfig(), nil
	}
	if err != nil {
		return kanbanOrderConfig{}, err
	}
	config := newKanbanOrderConfig()
	if err := json.Unmarshal(data, &config); err != nil {
		return kanbanOrderConfig{}, fmt.Errorf("parse Kanban card order: %w", err)
	}
	if config.Columns == nil {
		config.Columns = make(map[string][]KanbanCardOrderRef)
	}
	return config, nil
}

func (a *App) saveKanbanOrderConfig(config kanbanOrderConfig) error {
	config.Version = 1
	if config.Columns == nil {
		config.Columns = make(map[string][]KanbanCardOrderRef)
	}
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("serialize Kanban card order: %w", err)
	}
	return a.writeVaultFileAtomic(kanbanOrderPath, data, 0600)
}

// orderedKanbanCards applies saved preferences without hiding newly discovered
// cards. Exact file/line matches win, then file/text matches, and every
// unmatched card retains its index order at the end.
//
// The cards are indexed once by both identities, so a board costs time in
// proportion to its cards plus its saved references instead of their product.
// Each queue lists card positions in board order, which keeps the choice among
// identical cards the same as a front-to-back search: the earliest one not yet
// placed.
func orderedKanbanCards(cards []KanbanCard, order []KanbanCardOrderRef) []KanbanCard {
	if len(cards) < 2 || len(order) == 0 {
		return append([]KanbanCard(nil), cards...)
	}
	type exactIdentity struct {
		file string
		line int
		text string
	}
	type textIdentity struct {
		file string
		text string
	}
	byLine := make(map[exactIdentity][]int, len(cards))
	byText := make(map[textIdentity][]int, len(cards))
	for index, card := range cards {
		file := filepath.ToSlash(card.File)
		exact := exactIdentity{file: file, line: card.Line, text: card.Text}
		byLine[exact] = append(byLine[exact], index)
		loose := textIdentity{file: file, text: card.Text}
		byText[loose] = append(byText[loose], index)
	}

	result := make([]KanbanCard, 0, len(cards))
	used := make([]bool, len(cards))
	// firstUnused returns the earliest card in a queue that is still unplaced
	// and the queue that remains after it; cards placed through the other
	// identity are dropped on the way.
	firstUnused := func(queue []int) (int, []int) {
		for len(queue) > 0 && used[queue[0]] {
			queue = queue[1:]
		}
		if len(queue) == 0 {
			return -1, nil
		}
		return queue[0], queue[1:]
	}
	for _, ref := range order {
		file := filepath.ToSlash(ref.File)
		index := -1
		exact := exactIdentity{file: file, line: ref.Line, text: ref.Text}
		if queue, found := byLine[exact]; found {
			index, byLine[exact] = firstUnused(queue)
		}
		if index < 0 {
			loose := textIdentity{file: file, text: ref.Text}
			if queue, found := byText[loose]; found {
				index, byText[loose] = firstUnused(queue)
			}
		}
		if index < 0 {
			continue
		}
		used[index] = true
		result = append(result, cards[index])
	}
	for index, card := range cards {
		if !used[index] {
			result = append(result, card)
		}
	}
	return result
}

func validateKanbanOrderRefs(refs []KanbanCardOrderRef) ([]KanbanCardOrderRef, error) {
	if len(refs) > 100000 {
		return nil, fmt.Errorf("too many Kanban cards")
	}
	validated := make([]KanbanCardOrderRef, 0, len(refs))
	seen := make(map[string]bool, len(refs))
	for _, ref := range refs {
		clean, err := vaultRelativePath(ref.File)
		if err != nil || clean == "." || ref.Line < 1 {
			return nil, fmt.Errorf("invalid Kanban card reference")
		}
		if len(ref.Text) > 10000 {
			return nil, fmt.Errorf("Kanban card text is too long")
		}
		ref.File = filepath.ToSlash(clean)
		key := fmt.Sprintf("%s\x00%d\x00%s", ref.File, ref.Line, ref.Text)
		if seen[key] {
			continue
		}
		seen[key] = true
		validated = append(validated, ref)
	}
	return validated, nil
}

// SetKanbanCardOrder saves the user-defined vertical order for one column.
func (a *App) SetKanbanCardOrder(column string, refs []KanbanCardOrderRef) (map[string]interface{}, error) {
	column = strings.TrimSpace(strings.ToLower(column))
	if !kanbanColumnNameRe.MatchString(column) {
		return map[string]interface{}{"success": false, "error": "Invalid column name"}, nil
	}
	validated, err := validateKanbanOrderRefs(refs)
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}, nil
	}

	a.vaultMu.RLock()
	defer a.vaultMu.RUnlock()
	a.mu.RLock()
	found := false
	for _, savedColumn := range a.kanbanColumns {
		if savedColumn == column {
			found = true
			break
		}
	}
	a.mu.RUnlock()
	if !found {
		return map[string]interface{}{"success": false, "error": "Column not found"}, nil
	}
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	config, err := a.loadKanbanOrderConfig()
	if err != nil {
		return nil, err
	}
	if len(validated) == 0 {
		delete(config.Columns, column)
	} else {
		config.Columns[column] = validated
	}
	if err := a.saveKanbanOrderConfig(config); err != nil {
		return nil, err
	}
	return map[string]interface{}{"success": true}, nil
}

func (a *App) applyKanbanCardOrder(board map[string][]KanbanCard) {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()
	config, err := a.loadKanbanOrderConfig()
	if err != nil {
		log.Printf("[kanban] load card order: %v", err)
		return
	}
	for column, cards := range board {
		board[column] = orderedKanbanCards(cards, config.Columns[column])
	}
}

func (a *App) renameKanbanOrderColumn(oldName, newName string) error {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	config, err := a.loadKanbanOrderConfig()
	if err != nil {
		return err
	}
	if refs, exists := config.Columns[oldName]; exists {
		config.Columns[newName] = refs
		delete(config.Columns, oldName)
		return a.saveKanbanOrderConfig(config)
	}
	return nil
}

func (a *App) removeKanbanOrderColumn(name string) error {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	config, err := a.loadKanbanOrderConfig()
	if err != nil {
		return err
	}
	if _, exists := config.Columns[name]; !exists {
		return nil
	}
	delete(config.Columns, name)
	return a.saveKanbanOrderConfig(config)
}

func pathWithinKanbanOrderRef(refPath, root string) bool {
	refPath = filepath.ToSlash(refPath)
	root = strings.TrimSuffix(filepath.ToSlash(root), "/")
	return refPath == root || strings.HasPrefix(refPath, root+"/")
}

func (a *App) rewriteKanbanOrderPaths(oldPath, newPath string, remove bool) error {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	config, err := a.loadKanbanOrderConfig()
	if err != nil {
		return err
	}
	changed := false
	for column, refs := range config.Columns {
		kept := refs[:0]
		for _, ref := range refs {
			if !pathWithinKanbanOrderRef(ref.File, oldPath) {
				kept = append(kept, ref)
				continue
			}
			changed = true
			if remove {
				continue
			}
			suffix := strings.TrimPrefix(filepath.ToSlash(ref.File), strings.TrimSuffix(filepath.ToSlash(oldPath), "/"))
			ref.File = strings.TrimSuffix(filepath.ToSlash(newPath), "/") + suffix
			kept = append(kept, ref)
		}
		config.Columns[column] = kept
	}
	if !changed {
		return nil
	}
	return a.saveKanbanOrderConfig(config)
}
