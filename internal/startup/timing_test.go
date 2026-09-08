package startup

import (
	"encoding/json"
	"errors"
	"math"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestStartupTimingsMeasureStagesAndPreserveIncompleteWork(t *testing.T) {
	now := time.Date(2026, 9, 8, 12, 0, 0, 0, time.UTC)
	var events []Event
	trace := NewTrace(func() time.Time { return now }, func(e Event) { events = append(events, e) })
	trace.Mark("process")
	finish := trace.Begin("writing-cache")
	if len(events) != 2 || events[1].Phase != "begin" {
		t.Fatalf("missing in-progress marker: %+v", events)
	}
	now = now.Add(275 * time.Millisecond)
	finish(errors.New("private note /vault/client.md"))
	finish(nil)
	if len(events) != 3 || events[2].DurationMS != 275 || events[2].ElapsedMS != 275 || events[2].Phase != "error" {
		t.Fatalf("wrong completed span: %+v", events)
	}
	data, _ := json.Marshal(events)
	if strings.Contains(string(data), "private") {
		t.Fatalf("error contents leaked: %s", data)
	}
}

func TestStartupTimingsValidateBridgeLabelsAndNumericBounds(t *testing.T) {
	valid := FrontendTiming{"restore-document", "end", 50, 20}
	if !ValidFrontendTiming(valid) {
		t.Fatal("rejected valid stage")
	}
	for _, change := range []func(*FrontendTiming){
		func(v *FrontendTiming) { v.Stage = "/vault/secret.md" },
		func(v *FrontendTiming) { v.Phase = "error: note content" },
		func(v *FrontendTiming) { v.ElapsedMS = math.NaN() },
		func(v *FrontendTiming) { v.DurationMS = math.Inf(1) },
		func(v *FrontendTiming) { v.ElapsedMS = -1 },
		func(v *FrontendTiming) { v.ElapsedMS = 25 * 60 * 60 * 1000 },
		func(v *FrontendTiming) { v.DurationMS = 51 },
	} {
		invalid := valid
		change(&invalid)
		if ValidFrontendTiming(invalid) {
			t.Fatalf("accepted invalid event: %+v", invalid)
		}
	}
}

func TestStartupTimingsStopAtReadyButCloseExistingSpansAndRecordShutdown(t *testing.T) {
	var events []Event
	trace := NewTrace(time.Now, func(e Event) { events = append(events, e) })
	finish := trace.Begin("vault-index")
	trace.Frontend(FrontendTiming{"ready", "mark", 80, 0})
	trace.Frontend(FrontendTiming{"dictionary", "mark", 90, 0})
	trace.Begin("writing-cache")(nil)
	finish(nil)
	trace.Mark("shutdown")
	trace.Mark("shutdown")
	if len(events) != 4 || events[2].Phase != "end" || events[3].Stage != "shutdown" {
		t.Fatalf("unexpected stages: %+v", events)
	}
	if events[1].WebviewMS == nil || *events[1].WebviewMS != 80 {
		t.Fatal("webview clock was not preserved")
	}
	var disabled *Trace
	disabled.Begin("vault-open")(nil)
	disabled.Mark("process")
	disabled.Frontend(FrontendTiming{"ready", "mark", 0, 0})
}

func TestStartupTimingsBoundConcurrentDuplicateReports(t *testing.T) {
	var events []Event
	trace := NewTrace(time.Now, func(e Event) { events = append(events, e) })
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for stage := range frontendStages {
				for _, phase := range []string{"begin", "end", "error", "mark"} {
					if stage != "ready" {
						trace.Frontend(FrontendTiming{stage, phase, 10, 0})
					}
				}
			}
			for stage := range nativeStages {
				trace.Begin(stage)(nil)
				trace.Mark(stage)
			}
		}()
	}
	wg.Wait()
	if len(events) > MaxEvents || len(events) == 0 {
		t.Fatalf("unbounded events: %d", len(events))
	}
	seen := map[string]bool{}
	for _, e := range events {
		key := e.Source + e.Stage + e.Phase
		if seen[key] {
			t.Fatalf("duplicate: %+v", e)
		}
		seen[key] = true
	}
}
