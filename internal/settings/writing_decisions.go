package settings

import (
	"encoding/json"
	"fmt"
	"reflect"
	"regexp"
	"unicode/utf8"
)

type WritingDecision struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Language  string `json:"language"`
	Acronym   string `json:"acronym,omitempty"`
	Kind      string `json:"kind,omitempty"`
	Title     string `json:"title,omitempty"`
	Text      string `json:"text,omitempty"`
	Before    string `json:"before,omitempty"`
	After     string `json:"after,omitempty"`
	ExactOnly bool   `json:"exactOnly,omitempty"`
}

type WritingDecisionChange struct {
	Action   string            `json:"action"`
	ID       string            `json:"id,omitempty"`
	Decision WritingDecision   `json:"decision,omitempty"`
	Anchors  []WritingDecision `json:"anchors,omitempty"`
}

var decisionID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,80}$`)
var decisionKind = regexp.MustCompile(`^[a-z][a-z0-9.-]{0,100}$`)
var decisionAcronym = regexp.MustCompile(`^[A-Z]{3,5}$`)

func validateWritingDecision(d WritingDecision) error {
	if !decisionID.MatchString(d.ID) || (d.Language != "en-US" && d.Language != "en-GB" && d.Language != "es") {
		return fmt.Errorf("invalid review decision identity or language")
	}
	if d.Type == "acronym" && decisionAcronym.MatchString(d.Acronym) && d.Language != "es" && d.Kind == "" && d.Text == "" && d.Title == "" && d.Before == "" && d.After == "" {
		return nil
	}
	if d.Type == "occurrence" && d.Acronym == "" && decisionKind.MatchString(d.Kind) && len(d.Title) > 0 && len(d.Title) <= 512 && len(d.Text) > 0 && len(d.Text) <= 32768 && len(d.Before) <= 256 && len(d.After) <= 256 && utf8.ValidString(d.Text+d.Before+d.After+d.Title) {
		return nil
	}
	return fmt.Errorf("invalid review decision")
}

// ReadWritingDecisions leaves unknown fields opaque and never repairs invalid data.
func ReadWritingDecisions(data []byte, document string) (map[string]json.RawMessage, []WritingDecision, error) {
	record := map[string]json.RawMessage{"version": json.RawMessage("1"), "documents": json.RawMessage("{}")}
	if data != nil {
		if len(data) > 16<<20 || json.Unmarshal(data, &record) != nil || record == nil {
			return nil, nil, fmt.Errorf("invalid saved review decisions; original file preserved")
		}
	}
	var version int
	var documents map[string]json.RawMessage
	if json.Unmarshal(record["version"], &version) != nil || version != 1 || json.Unmarshal(record["documents"], &documents) != nil || documents == nil {
		return nil, nil, fmt.Errorf("unsupported saved review decisions; original file preserved")
	}
	values := []WritingDecision{}
	if raw, ok := documents[document]; ok {
		var fields map[string]json.RawMessage
		if json.Unmarshal(raw, &fields) != nil || fields == nil || json.Unmarshal(fields["decisions"], &values) != nil || values == nil || len(values) > 1000 {
			return nil, nil, fmt.Errorf("invalid document review decisions")
		}
		seen := map[string]bool{}
		for _, value := range values {
			if err := validateWritingDecision(value); err != nil {
				return nil, nil, err
			}
			if seen[value.ID] {
				return nil, nil, fmt.Errorf("duplicate review decision identity")
			}
			seen[value.ID] = true
		}
	}
	return record, values, nil
}

// PlanWritingDecisionChange adds/removes one decision without replacing other notes
// or unknown fields. Replaying an identical command is safe after an uncertain save.
func PlanWritingDecisionChange(data []byte, document string, command WritingDecisionChange) ([]byte, []WritingDecision, error) {
	if document == "" || len(document) > 4096 {
		return nil, nil, fmt.Errorf("document is required")
	}
	record, values, err := ReadWritingDecisions(data, document)
	if err != nil {
		return nil, nil, err
	}
	var documents map[string]json.RawMessage
	_ = json.Unmarshal(record["documents"], &documents)
	fields := map[string]json.RawMessage{}
	if raw, ok := documents[document]; ok {
		_ = json.Unmarshal(raw, &fields)
	}
	entries := []json.RawMessage{}
	if raw, ok := fields["decisions"]; ok {
		_ = json.Unmarshal(raw, &entries)
	}
	switch command.Action {
	case "reanchor":
		if len(command.Anchors) > 1000 {
			return nil, nil, fmt.Errorf("too many review anchors")
		}
		for _, anchor := range command.Anchors {
			if anchor.Type != "occurrence" {
				return nil, nil, fmt.Errorf("invalid review anchor")
			}
			if err := validateWritingDecision(anchor); err != nil {
				return nil, nil, err
			}
			for i, value := range values {
				if value.ID != anchor.ID {
					continue
				}
				if value.Type != anchor.Type || value.Text != anchor.Text || value.Kind != anchor.Kind || value.Language != anchor.Language {
					return nil, nil, fmt.Errorf("review anchor identity changed")
				}
				var fields map[string]json.RawMessage
				_ = json.Unmarshal(entries[i], &fields)
				fields["before"], _ = json.Marshal(anchor.Before)
				fields["after"], _ = json.Marshal(anchor.After)
				fields["exactOnly"], _ = json.Marshal(anchor.ExactOnly)
				entries[i], _ = json.Marshal(fields)
				values[i].Before, values[i].After = anchor.Before, anchor.After
				values[i].ExactOnly = anchor.ExactOnly
			}
		}
	case "add":
		if err := validateWritingDecision(command.Decision); err != nil {
			return nil, nil, err
		}
		found := false
		for _, value := range values {
			if value.ID == command.Decision.ID {
				if !reflect.DeepEqual(value, command.Decision) {
					return nil, nil, fmt.Errorf("review decision identity already exists")
				}
				found = true
			}
		}
		if !found {
			if len(values) >= 1000 {
				return nil, nil, fmt.Errorf("this document has too many saved review decisions")
			}
			values = append(values, command.Decision)
			raw, _ := json.Marshal(command.Decision)
			entries = append(entries, raw)
		}
	case "remove":
		if !decisionID.MatchString(command.ID) {
			return nil, nil, fmt.Errorf("invalid review decision identity")
		}
		for i, value := range values {
			if value.ID == command.ID {
				values = append(values[:i], values[i+1:]...)
				entries = append(entries[:i], entries[i+1:]...)
				break
			}
		}
	default:
		return nil, nil, fmt.Errorf("unknown review decision action")
	}
	fields["decisions"], _ = json.Marshal(entries)
	documents[document], _ = json.Marshal(fields)
	record["documents"], _ = json.Marshal(documents)
	planned, err := json.MarshalIndent(record, "", "  ")
	if len(planned) > 16<<20 {
		return nil, nil, fmt.Errorf("saved review decisions are full")
	}
	return planned, values, err
}
