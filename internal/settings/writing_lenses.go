package settings

import (
	"encoding/json"
	"fmt"
)

// WritingLensesPreferences records the independent checks and language for one note.
type WritingLensesPreferences struct {
	Lenses   []string `json:"lenses"`
	Language string   `json:"language"`
}

func DefaultWritingLenses() WritingLensesPreferences {
	return WritingLensesPreferences{Lenses: []string{}, Language: "none"}
}

func ValidateWritingLenses(value WritingLensesPreferences) error {
	if value.Language != "none" && value.Language != "en-US" && value.Language != "en-GB" && value.Language != "es" {
		return fmt.Errorf("unsupported writing language")
	}
	valid := map[string]bool{"spelling": true, "plain": true, "direct": true, "repetition": true, "consistency": true, "grammar": true, "readability": true, "inclusive": true, "formulaic": true}
	seen := make(map[string]bool)
	for _, lens := range value.Lenses {
		if !valid[lens] || seen[lens] {
			return fmt.Errorf("invalid writing lens selection")
		}
		seen[lens] = true
	}
	return nil
}

func decodeWritingPreferences(raw json.RawMessage) (WritingLensesPreferences, error) {
	value := DefaultWritingLenses()
	if len(raw) == 0 {
		return value, nil
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil || fields == nil {
		return value, fmt.Errorf("invalid writing preferences; original file preserved")
	}
	if err := json.Unmarshal(raw, &value); err != nil {
		return value, err
	}
	if _, ok := fields["lenses"]; !ok {
		var legacy struct {
			Primary  string   `json:"primary"`
			Overlays []string `json:"overlays"`
		}
		if err := json.Unmarshal(raw, &legacy); err != nil {
			return value, err
		}
		if legacy.Primary != "" && legacy.Primary != "none" {
			value.Lenses = append(value.Lenses, legacy.Primary)
		}
		for _, lens := range legacy.Overlays {
			if lens == legacy.Primary {
				continue
			}
			value.Lenses = append(value.Lenses, lens)
		}
	}
	if value.Lenses == nil {
		value.Lenses = []string{}
	}
	return value, ValidateWritingLenses(value)
}

// ReadWritingLenses is a pure, read-only migration. Legacy vault choices become
// defaults for documents without saved choices; unknown fields remain opaque.
func ReadWritingLenses(data []byte, document string) (map[string]json.RawMessage, WritingLensesPreferences, error) {
	record := map[string]json.RawMessage{"version": json.RawMessage("3")}
	value := DefaultWritingLenses()
	if len(data) != 0 {
		if err := json.Unmarshal(data, &record); err != nil || record == nil {
			return nil, value, fmt.Errorf("invalid writing preferences; original file preserved")
		}
	}
	var version int
	if json.Unmarshal(record["version"], &version) != nil || version < 1 || version > 3 {
		return nil, value, fmt.Errorf("unsupported writing preferences version; original file preserved")
	}
	value, err := decodeWritingPreferences(record["preferences"])
	if err != nil {
		return nil, value, err
	}
	if raw, ok := record["documents"]; ok {
		var documents map[string]json.RawMessage
		if json.Unmarshal(raw, &documents) != nil || documents == nil {
			return nil, value, fmt.Errorf("invalid document preferences")
		}
		if entry, ok := documents[document]; ok {
			var fields map[string]json.RawMessage
			if json.Unmarshal(entry, &fields) != nil || fields == nil {
				return nil, value, fmt.Errorf("invalid document preferences")
			}
			if raw, ok := fields["preferences"]; ok {
				value, err = decodeWritingPreferences(raw)
			}
		}
	}
	return record, value, err
}

func mergeWritingPreferences(raw json.RawMessage, value WritingLensesPreferences) json.RawMessage {
	fields := map[string]json.RawMessage{}
	_ = json.Unmarshal(raw, &fields)
	if fields == nil {
		fields = map[string]json.RawMessage{}
	}
	delete(fields, "primary")
	delete(fields, "overlays")
	delete(fields, "profile")
	fields["lenses"], _ = json.Marshal(value.Lenses)
	fields["language"], _ = json.Marshal(value.Language)
	result, _ := json.Marshal(fields)
	return result
}

// PlanWritingLensesSave preserves other documents, extension fields and source.
func PlanWritingLensesSave(data []byte, document string, value WritingLensesPreferences) ([]byte, error) {
	if document == "" {
		return nil, fmt.Errorf("document is required")
	}
	if err := ValidateWritingLenses(value); err != nil {
		return nil, err
	}
	record, _, err := ReadWritingLenses(data, document)
	if err != nil {
		return nil, err
	}
	defaults, err := decodeWritingPreferences(record["preferences"])
	if err != nil {
		return nil, err
	}
	record["preferences"] = mergeWritingPreferences(record["preferences"], defaults)
	documents := map[string]json.RawMessage{}
	if raw, ok := record["documents"]; ok {
		_ = json.Unmarshal(raw, &documents)
	}
	fields := map[string]json.RawMessage{}
	if raw, ok := documents[document]; ok {
		_ = json.Unmarshal(raw, &fields)
	}
	if value.Lenses == nil {
		value.Lenses = []string{}
	}
	fields["preferences"] = mergeWritingPreferences(fields["preferences"], value)
	documents[document], _ = json.Marshal(fields)
	record["documents"], _ = json.Marshal(documents)
	record["version"] = json.RawMessage("3")
	return json.MarshalIndent(record, "", "  ")
}

// PlanWritingLensesApplyAll changes saved documents and defaults in one plan,
// preserving extension fields and refusing malformed entries before any write.
func PlanWritingLensesApplyAll(data []byte, value WritingLensesPreferences) ([]byte, error) {
	if err := ValidateWritingLenses(value); err != nil {
		return nil, err
	}
	record, _, err := ReadWritingLenses(data, "")
	if err != nil {
		return nil, err
	}
	if value.Lenses == nil {
		value.Lenses = []string{}
	}
	documents := map[string]json.RawMessage{}
	if raw, ok := record["documents"]; ok {
		_ = json.Unmarshal(raw, &documents)
	}
	for document, raw := range documents {
		var fields map[string]json.RawMessage
		if json.Unmarshal(raw, &fields) != nil || fields == nil {
			return nil, fmt.Errorf("invalid document preferences")
		}
		if _, err := decodeWritingPreferences(fields["preferences"]); err != nil {
			return nil, err
		}
		fields["preferences"] = mergeWritingPreferences(fields["preferences"], value)
		documents[document], _ = json.Marshal(fields)
	}
	record["preferences"] = mergeWritingPreferences(record["preferences"], value)
	record["documents"], _ = json.Marshal(documents)
	record["version"] = json.RawMessage("3")
	return json.MarshalIndent(record, "", "  ")
}
