package desktop

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
)

// ============================================================================
// 6. Session Persistence
// ============================================================================

// SaveSession saves session state to vault/.config/session.json.
func (a *App) SaveSession(data map[string]interface{}) (*SaveFileResult, error) {
	a.sessionMu.Lock()
	defer a.sessionMu.Unlock()

	if err := a.writeSessionData(data); err != nil {
		return nil, err
	}
	return &SaveFileResult{Success: true}, nil
}

func (a *App) writeSessionData(data map[string]interface{}) error {
	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	return a.writeVaultFileAtomic(".config/session.json", jsonData, 0600)
}

// LoadSession loads session state from vault/.config/session.json. It repairs
// malformed or stale records as it reads them so an old tab cannot leave the
// client trying to restore a file that no longer exists.
func (a *App) LoadSession() (map[string]interface{}, error) {
	a.sessionMu.Lock()
	defer a.sessionMu.Unlock()

	data, err := a.readVaultFile(".config/session.json")
	if os.IsNotExist(err) {
		defaults := map[string]interface{}{}
		if err := a.writeSessionData(defaults); err != nil {
			return nil, err
		}
		return defaults, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read session: %w", err)
	}
	var result map[string]interface{}
	if len(bytes.TrimSpace(data)) == 0 || json.Unmarshal(data, &result) != nil || result == nil {
		defaults := map[string]interface{}{}
		if err := a.writeSessionData(defaults); err != nil {
			return nil, err
		}
		return defaults, nil
	}

	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	normalized := normalizeSessionData(root, result)
	if !reflect.DeepEqual(result, normalized) {
		if err := a.writeSessionData(normalized); err != nil {
			return nil, err
		}
	}
	return normalized, nil
}

func sessionString(value interface{}) string {
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

func sessionFilePath(root *os.Root, value interface{}) (string, bool) {
	clean, err := vaultRelativePath(sessionString(value))
	if err != nil || clean == "." {
		return "", false
	}
	info, err := root.Stat(clean)
	if err != nil || info.IsDir() {
		return "", false
	}
	return filepath.ToSlash(clean), true
}

func sessionDirectoryPath(root *os.Root, value interface{}) (string, bool) {
	clean, err := vaultRelativePath(sessionString(value))
	if err != nil || clean == "." {
		return "", false
	}
	info, err := root.Stat(clean)
	if err != nil || !info.IsDir() {
		return "", false
	}
	return filepath.ToSlash(clean), true
}

// sessionTreePath accepts either a file or a directory because tree focus is
// independent from the active editor file. It still validates the path against
// the vault before persisting it across launches.
func sessionTreePath(root *os.Root, value interface{}) (string, bool) {
	clean, err := vaultRelativePath(sessionString(value))
	if err != nil || clean == "." {
		return "", false
	}
	if _, err := root.Stat(clean); err != nil {
		return "", false
	}
	return filepath.ToSlash(clean), true
}

func normalizeSessionData(root *os.Root, source map[string]interface{}) map[string]interface{} {
	normalized := make(map[string]interface{})
	validTabIDs := make(map[string]bool)
	fileTabIDs := make(map[string]bool)
	tabs := make([]interface{}, 0)

	if candidates, ok := source["openTabs"].([]interface{}); ok {
		for _, candidate := range candidates {
			tab, ok := candidate.(map[string]interface{})
			if !ok {
				continue
			}
			typeName := sessionString(tab["type"])
			var cleaned map[string]interface{}
			var tabID string
			switch typeName {
			case "calendar":
				date := sessionString(tab["dateStr"])
				if date == "" {
					continue
				}
				tabID = sessionString(tab["id"])
				if tabID == "" {
					tabID = "calendar-" + date
				}
				title := sessionString(tab["title"])
				if title == "" {
					title = "Calendar: " + date
				}
				cleaned = map[string]interface{}{"id": tabID, "type": "calendar", "title": title, "dateStr": date}
			case "file", "drawio":
				path, valid := sessionFilePath(root, tab["path"])
				if !valid {
					continue
				}
				tabID = sessionString(tab["id"])
				if tabID == "" {
					tabID = path
				}
				title := sessionString(tab["title"])
				if title == "" {
					title = filepath.Base(path)
				}
				cleaned = map[string]interface{}{"id": tabID, "type": typeName, "title": title, "path": path}
			default:
				continue
			}
			if validTabIDs[tabID] {
				continue
			}
			validTabIDs[tabID] = true
			if typeName == "file" {
				fileTabIDs[tabID] = true
			}
			tabs = append(tabs, cleaned)
		}
	}
	if len(tabs) > 0 {
		normalized["openTabs"] = tabs
	}

	if activeTabID := sessionString(source["activeTabId"]); validTabIDs[activeTabID] {
		normalized["activeTabId"] = activeTabID
	}
	if selectedPath, valid := sessionFilePath(root, source["selectedFilePath"]); valid {
		normalized["selectedFilePath"] = selectedPath
	}
	if selectedTreePath, valid := sessionTreePath(root, source["selectedTreePath"]); valid {
		normalized["selectedTreePath"] = selectedTreePath
	}

	if candidates, ok := source["expandedDirs"].([]interface{}); ok {
		directories := make([]interface{}, 0, len(candidates))
		seen := make(map[string]bool)
		for _, candidate := range candidates {
			if path, valid := sessionDirectoryPath(root, candidate); valid && !seen[path] {
				seen[path] = true
				directories = append(directories, path)
			}
		}
		if len(directories) > 0 {
			normalized["expandedDirs"] = directories
		}
	}

	if candidates, ok := source["pinnedTabs"].([]interface{}); ok {
		pinned := make([]interface{}, 0, len(candidates))
		seen := make(map[string]bool)
		for _, candidate := range candidates {
			id := sessionString(candidate)
			if id != "" && validTabIDs[id] && !seen[id] {
				seen[id] = true
				pinned = append(pinned, id)
			}
		}
		if len(pinned) > 0 {
			normalized["pinnedTabs"] = pinned
		}
	}

	if cursors, ok := source["cursorStates"].(map[string]interface{}); ok {
		cleaned := make(map[string]interface{})
		for id, cursor := range cursors {
			if fileTabIDs[id] {
				cleaned[id] = cursor
			}
		}
		if len(cleaned) > 0 {
			normalized["cursorStates"] = cleaned
		}
	}

	if theme := sessionString(source["theme"]); theme != "" {
		normalized["theme"] = theme
	}
	return normalized
}
