package settings

import (
	"encoding/json"
	"fmt"
	"regexp"
	"slices"
	"strings"
)

var spellingWordPattern = regexp.MustCompile(`^[\p{L}\p{M}]+(?:['-][\p{L}\p{M}]+)*$`)

func spellingWordKey(word string) (string, error) {
	word = strings.ReplaceAll(strings.ReplaceAll(strings.ToLower(strings.TrimSpace(word)), "’", "'"), "‘", "'")
	if len(word) > 256 || !spellingWordPattern.MatchString(word) {
		return "", fmt.Errorf("add a single spelling word")
	}
	return word, nil
}

// ReadSpellingWords validates without silently repairing or overwriting user data.
func ReadSpellingWords(data []byte) (map[string]json.RawMessage, []string, error) {
	record := map[string]json.RawMessage{"version": json.RawMessage("1")}
	words := []string{}
	if data != nil {
		if len(data) > 3<<20 || json.Unmarshal(data, &record) != nil || record == nil {
			return nil, nil, fmt.Errorf("invalid spelling dictionary; original file preserved")
		}
		var version int
		if json.Unmarshal(record["version"], &version) != nil || version != 1 || json.Unmarshal(record["words"], &words) != nil || words == nil || len(words) > 10000 {
			return nil, nil, fmt.Errorf("unsupported spelling dictionary; original file preserved")
		}
	}
	for i, word := range words {
		key, err := spellingWordKey(word)
		if err != nil {
			return nil, nil, err
		}
		words[i] = key
	}
	slices.Sort(words)
	return record, slices.Compact(words), nil
}

// AddSpellingWord plans a deduplicated dictionary write, preserving unknown fields.
func AddSpellingWord(data []byte, word string) ([]byte, []string, error) {
	key, err := spellingWordKey(word)
	if err != nil {
		return nil, nil, err
	}
	record, words, err := ReadSpellingWords(data)
	if err != nil {
		return nil, nil, err
	}
	if !slices.Contains(words, key) {
		if len(words) >= 10000 {
			return nil, nil, fmt.Errorf("spelling dictionary is full")
		}
		words = append(words, key)
		slices.Sort(words)
	}
	record["words"], _ = json.Marshal(words)
	encoded, err := json.MarshalIndent(record, "", "  ")
	return encoded, words, err
}
