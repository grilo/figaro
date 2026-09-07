package activity

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"path"
	"strings"
)

const MaxPathHistoryBytes = 4 * 1024 * 1024

const PathsFile = ".config/activity-paths.json"

type PathMove struct {
	From     string `json:"from"`
	To       string `json:"to"`
	Revision string `json:"revision"`
}
type PathHistory struct {
	Version int        `json:"version"`
	Moves   []PathMove `json:"moves"`
}

func validPath(value string) bool {
	return len(value) <= 4096 && value != "" && value != "." && !strings.Contains(value, "\\") && !strings.Contains(value, ":") && !path.IsAbs(value) && path.Clean(value) == value && value != ".." && !strings.HasPrefix(value, "../")
}
func validRevision(value string) bool {
	if len(value) != 40 {
		return false
	}
	for _, c := range value {
		if !strings.ContainsRune("0123456789abcdef", c) {
			return false
		}
	}
	return true
}
func ReadPathHistory(data []byte) (PathHistory, error) {
	if len(data) > MaxPathHistoryBytes {
		return PathHistory{}, fmt.Errorf("activity path history is too large")
	}
	result := PathHistory{Version: 1, Moves: []PathMove{}}
	if len(data) == 0 {
		return result, nil
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&result); err != nil {
		return result, fmt.Errorf("read activity path history: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return result, fmt.Errorf("invalid trailing activity path history")
	}
	if len(result.Moves) > 10000 {
		return result, fmt.Errorf("activity path history is full")
	}
	if result.Version != 1 {
		return result, fmt.Errorf("unsupported activity path history version")
	}
	for _, move := range result.Moves {
		if !validPath(move.From) || !validPath(move.To) || !validRevision(move.Revision) {
			return result, fmt.Errorf("invalid activity path history")
		}
	}
	return result, nil
}
func PlanPathMove(data []byte, from, to, revision string) ([]byte, error) {
	history, err := ReadPathHistory(data)
	if err != nil {
		return nil, err
	}
	if !validPath(from) || !validPath(to) || !validRevision(revision) {
		return nil, fmt.Errorf("invalid activity relocation")
	}
	if from == to {
		return data, nil
	}
	if len(history.Moves) >= 10000 {
		return nil, fmt.Errorf("activity path history is full")
	}
	history.Moves = append(history.Moves, PathMove{from, to, revision})
	after, err := json.MarshalIndent(history, "", "  ")
	if len(after) > MaxPathHistoryBytes {
		return nil, fmt.Errorf("activity path history is full")
	}
	return after, err
}

// Multiple moves before the next commit reverse in order at their exact Git
// boundary. Reusing a filename later cannot rewrite an earlier move's meaning.
func PathAtRevision(history PathHistory, current, revision string) string {
	for i := len(history.Moves) - 1; i >= 0; i-- {
		move := history.Moves[i]
		if move.Revision != revision {
			continue
		}
		if current == move.To {
			current = move.From
		} else if strings.HasPrefix(current, move.To+"/") {
			current = move.From + strings.TrimPrefix(current, move.To)
		}
	}
	return current
}
