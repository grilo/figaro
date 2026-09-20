package embedded

import (
	"context"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func sequenceAssets(dictionary string) fstest.MapFS {
	return fstest.MapFS{
		"config/dictionaries/harper.dict": {Data: []byte(dictionary)},
		"Harper.Test.yml":                 {Data: []byte("extends: sequence\nmessage: 'Use a base verb.'\nmodel: harper\nignorecase: true\ntokens:\n  - pattern: 'will'\n  - tag: '^VBZ$'\n    target: true\n")},
	}
}
func TestEmbeddedSequenceModelsAreEagerAndIsolatedByDictionary(t *testing.T) {
	first, err := New(sequenceAssets("quux\tVBZ\n"))
	if err != nil {
		t.Fatal(err)
	}
	second, err := New(sequenceAssets("quux\tNN\n"))
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		e    *Engine
		want int
	}{{first, 1}, {second, 0}, {first, 1}} {
		got, err := tc.e.Analyze(context.Background(), "They will quux.")
		if err != nil || len(got) != tc.want {
			t.Fatalf("model contamination: %+v %v", got, err)
		}
	}
}
func TestEmbeddedSequencePreservesRepeatedUnicodePositionsAndReuse(t *testing.T) {
	e, err := New(sequenceAssets("goes\tVBZ\n"))
	if err != nil {
		t.Fatal(err)
	}
	source := "😀 They will goes.\r\nThey will goes."
	alerts, err := e.Analyze(context.Background(), source)
	if err != nil || len(alerts) != 2 {
		t.Fatalf("%+v %v", alerts, err)
	}
	for i, a := range alerts {
		if a.Line != i+1 || a.Match != "goes" {
			t.Fatalf("wrong occurrence: %+v", a)
		}
		line := strings.Split(source, "\n")[a.Line-1]
		if string([]rune(line)[a.Span[0]-1:a.Span[1]]) != a.Match {
			t.Fatal("wrong Unicode span", a)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := e.Analyze(ctx, source); err != context.Canceled {
		t.Fatal(err)
	}
	if alerts, err := e.Analyze(context.Background(), "They will go."); err != nil || len(alerts) > 0 {
		t.Fatalf("reuse: %+v %v", alerts, err)
	}
}
func TestEmbeddedSequenceRejectsExternalOrMissingModelAndUnboundedTokens(t *testing.T) {
	for _, model := range []string{"", "model: other\n", "model: ../private\n", "model: harper\n"} {
		assets := fstest.MapFS{"Harper.Test.yml": {Data: []byte("extends: sequence\nmessage: test\n" + model + "tokens:\n  - pattern: test\n")}}
		if _, err := New(assets); err == nil {
			t.Fatal("accepted missing or external model", model)
		}
	}
	for _, tokens := range []string{"tokens: invalid\n", "tokens:\n  - pattern: test\n    min: 999999\n", "tokens:\n  - pattern: test\n    skip: -1\n"} {
		assets := sequenceAssets("test\tNN\n")
		assets["Harper.Test.yml"] = &fstest.MapFile{Data: []byte("extends: sequence\nmessage: test\nmodel: harper\n" + tokens)}
		if _, err := New(assets); err == nil {
			t.Fatal("accepted invalid expansion", tokens)
		}
	}
}
func TestEmbeddedSequenceStopsExcessiveTaggingBeforeModelWork(t *testing.T) {
	e, err := New(sequenceAssets("goes\tVBZ\n"))
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if _, err := e.Analyze(ctx, "They will "+strings.Repeat("goes ", 65537)); err == nil {
		t.Fatal("tagged token limit returned partial success")
	}
	if _, err := e.Analyze(context.Background(), "They will go."); err != nil {
		t.Fatal("work limit damaged model", err)
	}
}
