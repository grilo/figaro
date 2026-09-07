package settings

import (
	"encoding/json"
	"fmt"
	"path"
	"strings"
)

// PlanWritingPathMove preserves opaque metadata and exact decision identities.
// Only affected entries are interpreted; unrelated future fields stay intact.
func PlanWritingPathMove(data []byte, oldPath, newPath string, decisions bool) ([]byte, error) {
	if len(data) == 0 {
		return data, nil
	}
	oldPath, newPath = path.Clean(strings.ReplaceAll(oldPath, "\\", "/")), path.Clean(strings.ReplaceAll(newPath, "\\", "/"))
	for _, p := range []string{oldPath, newPath} {
		if p == "." || p == ".." || strings.HasPrefix(p, "../") || path.IsAbs(p) {
			return nil, fmt.Errorf("invalid writing document move")
		}
	}
	var record map[string]json.RawMessage
	var err error
	if decisions {
		record, _, err = ReadWritingDecisions(data, "")
	} else {
		record, _, err = ReadWritingLenses(data, "")
	}
	if err != nil {
		return nil, err
	}
	documents := map[string]json.RawMessage{}
	if raw, ok := record["documents"]; ok {
		if json.Unmarshal(raw, &documents) != nil || documents == nil {
			return nil, fmt.Errorf("invalid writing document records")
		}
	}
	moved := false
	planned := make(map[string]json.RawMessage, len(documents))
	for key, value := range documents {
		planned[key] = value
	}
	for key, value := range documents {
		if key != oldPath && !strings.HasPrefix(key, oldPath+"/") {
			continue
		}
		destination := newPath + strings.TrimPrefix(key, oldPath)
		if destination == key {
			continue
		}
		if _, exists := documents[destination]; exists {
			return nil, fmt.Errorf("saved writing data already exists for %q; nothing was replaced", destination)
		}
		// Validate only this entry without reparsing the full vault record for
		// every note in a folder (which would make relocation quadratic).
		entryRecord := map[string]json.RawMessage{"version": record["version"]}
		entryRecord["documents"], err = json.Marshal(map[string]json.RawMessage{key: value})
		if err != nil {
			return nil, err
		}
		encoded, encodeErr := json.Marshal(entryRecord)
		if encodeErr != nil {
			return nil, encodeErr
		}
		if decisions {
			_, _, err = ReadWritingDecisions(encoded, key)
		} else {
			_, _, err = ReadWritingLenses(encoded, key)
		}
		if err != nil {
			return nil, err
		}
		delete(planned, key)
		planned[destination] = value
		moved = true
	}
	if !moved {
		return data, nil
	}
	record["documents"], err = json.Marshal(planned)
	if err != nil {
		return nil, err
	}
	return json.MarshalIndent(record, "", "  ")
}
