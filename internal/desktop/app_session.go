package desktop

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
)

const legacySessionPath = ".config/session.json"

// configureSessionStateRoot places session records in the machine-local
// application-data root. Without one (tests, unavailable home directory),
// sessions stay in the legacy vault record.
func (a *App) configureSessionStateRoot(root string) {
	a.sessionMu.Lock()
	defer a.sessionMu.Unlock()
	a.sessionStateRoot = root
}

// sessionRecordPath keys each vault's session by its resolved path. Open tabs,
// cursors and tree state describe this computer's workspace, so they are not
// written into a vault that may be synchronized to other machines.
func sessionRecordPath(stateRoot, vaultPath string) string {
	if stateRoot == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(filepath.Clean(vaultPath)))
	return filepath.Join(stateRoot, "figaro", "sessions", hex.EncodeToString(sum[:16])+".json")
}

// readSessionRecord prefers the machine-local record and falls back once to
// the legacy vault record, so upgrading keeps the previous workspace.
func (a *App) readSessionRecord() ([]byte, error) {
	path := sessionRecordPath(a.sessionStateRoot, a.vaultPath)
	if path == "" {
		return a.readVaultFile(legacySessionPath)
	}
	data, err := os.ReadFile(path) // #nosec G304 -- derived from the application-data root and a hash.
	if os.IsNotExist(err) {
		return a.readVaultFile(legacySessionPath)
	}
	return data, err
}

// writeMachineStateFile replaces a machine-local record through a temporary
// file and rename. It deliberately skips fsync: a session is recoverable
// workspace state, and a missing or truncated record falls back to defaults.
func writeMachineStateFile(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("create session directory: %w", err)
	}
	temporary, err := os.CreateTemp(dir, ".session-*.tmp")
	if err != nil {
		return fmt.Errorf("create session record: %w", err)
	}
	name := temporary.Name()
	_, writeErr := temporary.Write(data)
	closeErr := temporary.Close()
	if writeErr == nil {
		writeErr = closeErr
	}
	if writeErr == nil {
		writeErr = os.Chmod(name, 0600)
	}
	if writeErr == nil {
		writeErr = os.Rename(name, path)
	}
	if writeErr != nil {
		_ = os.Remove(name)
		return fmt.Errorf("write session record: %w", writeErr)
	}
	return nil
}

// ============================================================================
// 6. Session Persistence
// ============================================================================

// SaveSession saves session state to the machine-local session record.
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
	if path := sessionRecordPath(a.sessionStateRoot, a.vaultPath); path != "" {
		return writeMachineStateFile(path, jsonData)
	}
	return a.writeVaultFileAtomic(legacySessionPath, jsonData, 0600)
}

// LoadSession loads the machine-local session record, or the legacy vault
// record when this machine has none yet. It repairs
// malformed or stale records as it reads them so an old tab cannot leave the
// client trying to restore a file that no longer exists.
func (a *App) LoadSession() (map[string]interface{}, error) {
	a.sessionMu.Lock()
	defer a.sessionMu.Unlock()

	data, err := a.readSessionRecord()
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
