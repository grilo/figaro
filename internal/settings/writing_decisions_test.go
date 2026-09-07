package settings

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestWritingDecisionsPlanPersistsAndReversesWithMetadataAndIdempotentRetry(t *testing.T) {
	before := []byte(`{"version":1,"extension":"keep","documents":{"Other.md":{"custom":1,"decisions":[]},"Memo.md":{"custom":2,"decisions":[]}}}`)
	command := WritingDecisionChange{Action: "add", Decision: WritingDecision{ID: "one", Type: "acronym", Acronym: "SLO", Language: "en-US"}}
	saved, values, err := PlanWritingDecisionChange(before, "Memo.md", command)
	if err != nil || len(values) != 1 {
		t.Fatalf("%s %v %v", saved, values, err)
	}
	retry, values, err := PlanWritingDecisionChange(saved, "Memo.md", command)
	if err != nil || string(retry) != string(saved) || len(values) != 1 {
		t.Fatal("retry was not idempotent", err)
	}
	command.Decision.Acronym = "XYZ"
	if _, _, err := PlanWritingDecisionChange(saved, "Memo.md", command); err == nil {
		t.Fatal("overwrote colliding ID")
	}
	restored, values, err := PlanWritingDecisionChange(saved, "Memo.md", WritingDecisionChange{Action: "remove", ID: "one"})
	if err != nil || len(values) != 0 {
		t.Fatal("restore", err)
	}
	var record map[string]json.RawMessage
	_ = json.Unmarshal(restored, &record)
	if string(record["extension"]) != `"keep"` || !strings.Contains(string(record["documents"]), `"custom": 1`) || !strings.Contains(string(record["documents"]), `"custom": 2`) {
		t.Fatal("metadata lost", string(restored))
	}
}

func TestWritingDecisionsRejectsCorruptionUnsupportedDataAndLimits(t *testing.T) {
	command := WritingDecisionChange{Action: "add", Decision: WritingDecision{ID: "one", Type: "occurrence", Language: "en-US", Kind: "grammar.spelling", Title: "Check spelling", Text: "teh"}}
	for _, invalid := range []string{"", "{broken", `{"version":2,"documents":{}}`, `{"version":1,"documents":null}`, `{"version":1,"documents":{"Memo.md":{"decisions":null}}}`, `{"version":1,"documents":{"Memo.md":{"decisions":[{"id":"bad","type":"unknown"}]}}}`} {
		if _, _, err := PlanWritingDecisionChange([]byte(invalid), "Memo.md", command); err == nil {
			t.Fatal("accepted invalid", invalid)
		}
	}
	for _, invalid := range []WritingDecision{
		{ID: "../bad", Type: "acronym", Acronym: "SLO", Language: "en-US"},
		{ID: "one", Type: "acronym", Acronym: "slo", Language: "en-US"},
		{ID: "one", Type: "acronym", Acronym: "SLO", Language: "es"},
		{ID: "one", Type: "occurrence", Kind: "grammar.spelling", Title: "Word", Text: strings.Repeat("x", 32769), Language: "en-US"},
	} {
		if _, _, err := PlanWritingDecisionChange(nil, "Memo.md", WritingDecisionChange{Action: "add", Decision: invalid}); err == nil {
			t.Fatal("invalid decision", invalid.ID)
		}
	}
	saved, _, err := PlanWritingDecisionChange(nil, "Memo.md", command)
	if err != nil {
		t.Fatal(err)
	}
	_, values, err := ReadWritingDecisions(saved, "Memo.md")
	if err != nil || values[0].Text != "teh" {
		t.Fatal("occurrence not retained", err)
	}
	_, values, err = ReadWritingDecisions(saved, "Other.md")
	if err != nil || len(values) != 0 {
		t.Fatal("leaked across notes", err)
	}
}

func TestWritingDecisionReanchorsPreserveIdentityMetadataAndNeverResurrectRemovedDecisions(t *testing.T) {
	data := []byte(`{"version":1,"documents":{"Memo.md":{"custom":true,"decisions":[{"id":"one","type":"occurrence","language":"en-US","kind":"lexicon.complex-word","title":"Simpler word","text":"utilize","before":"Before ","after":" clear language.","extra":"keep"}]}}}`)
	_, values, err := ReadWritingDecisions(data, "Memo.md")
	if err != nil {
		t.Fatal(err)
	}
	anchor := values[0]
	anchor.After = " concise language."
	anchor.ExactOnly = true
	command := WritingDecisionChange{Action: "reanchor", Anchors: []WritingDecision{anchor}}
	saved, values, err := PlanWritingDecisionChange(data, "Memo.md", command)
	if err != nil || values[0].After != anchor.After || !values[0].ExactOnly || !strings.Contains(string(saved), `"extra": "keep"`) {
		t.Fatal(string(saved), values, err)
	}
	retry, _, err := PlanWritingDecisionChange(saved, "Memo.md", command)
	if err != nil || string(retry) != string(saved) {
		t.Fatal("non-idempotent reanchor", err)
	}
	bad := anchor
	bad.Text = "different"
	if _, _, err := PlanWritingDecisionChange(saved, "Memo.md", WritingDecisionChange{Action: "reanchor", Anchors: []WritingDecision{bad}}); err == nil {
		t.Fatal("changed target identity")
	}
	removed, _, err := PlanWritingDecisionChange(saved, "Memo.md", WritingDecisionChange{Action: "remove", ID: "one"})
	if err != nil {
		t.Fatal(err)
	}
	_, values, err = PlanWritingDecisionChange(removed, "Memo.md", command)
	if err != nil || len(values) != 0 {
		t.Fatal("resurrected removed decision", values, err)
	}
}
