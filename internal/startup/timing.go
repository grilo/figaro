// Package startup records a bounded, content-free description of startup.
package startup

import (
	"math"
	"sync"
	"time"
)

const MaxEvents = 128

var frontendStages = map[string]bool{
	"bootstrap": true, "backend": true, "file-issues": true,
	"activity": true, "appearance": true, "preferences": true, "editor": true,
	"save-protection": true, "restore-document": true, "launch-documents": true,
	"dictionary": true, "writing": true, "reveal": true,
	"vault-start": true, "vault-ready": true, "file-tree": true, "parsers": true, "ready": true,
}
var nativeStages = map[string]bool{
	"process": true, "vault-open": true, "history-open": true,
	"native-startup": true, "settings": true, "welcome-note": true,
	"webview-launch": true, "dom-ready": true, "writing": true,
	"writing-rules": true, "vault-index": true,
	"shutdown": true,
}

type FrontendTiming struct {
	Stage      string  `json:"stage"`
	Phase      string  `json:"phase"`
	ElapsedMS  float64 `json:"elapsed_ms"`
	DurationMS float64 `json:"duration_ms"`
}

type Event struct {
	Time       time.Time `json:"time"`
	Source     string    `json:"source"`
	Stage      string    `json:"stage"`
	Phase      string    `json:"phase"`
	ElapsedMS  float64   `json:"elapsed_ms"`
	DurationMS float64   `json:"duration_ms,omitempty"`
	WebviewMS  *float64  `json:"webview_ms,omitempty"`
}

func validPhase(phase string) bool {
	return phase == "begin" || phase == "end" || phase == "error" || phase == "mark"
}
func validMillis(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= 0 && value <= 24*60*60*1000
}
func ValidFrontendTiming(t FrontendTiming) bool {
	return frontendStages[t.Stage] && validPhase(t.Phase) && validMillis(t.ElapsedMS) && validMillis(t.DurationMS) && t.DurationMS <= t.ElapsedMS
}

// Trace coordinates an injected clock and nonblocking event sink. Neither
// arbitrary error strings nor caller-provided paths can enter an event.
type Trace struct {
	mu       sync.Mutex
	now      func() time.Time
	emit     func(Event)
	start    time.Time
	seen     map[string]bool
	complete bool
}

func NewTrace(now func() time.Time, emit func(Event)) *Trace {
	return &Trace{now: now, emit: emit, start: now(), seen: make(map[string]bool)}
}

func (t *Trace) record(source, stage, phase string, duration float64, webview *float64) {
	if t == nil {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	key := source + ":" + stage + ":" + phase
	finishesStarted := (phase == "end" || phase == "error") && t.seen[source+":"+stage+":begin"]
	if (t.complete && stage != "shutdown" && !finishesStarted) || t.seen[key] || len(t.seen) >= MaxEvents {
		return
	}
	t.seen[key] = true
	now := t.now()
	t.emit(Event{now.UTC(), source, stage, phase, max(0, float64(now.Sub(t.start))/float64(time.Millisecond)), duration, webview})
	if source == "webview" && stage == "ready" && phase == "mark" {
		t.complete = true
	}
}

func (t *Trace) Mark(stage string) {
	if nativeStages[stage] {
		t.record("native", stage, "mark", 0, nil)
	}
}

func (t *Trace) Begin(stage string) func(error) {
	if t == nil || !nativeStages[stage] {
		return func(error) {}
	}
	start := t.now()
	t.record("native", stage, "begin", 0, nil)
	var once sync.Once
	return func(err error) {
		once.Do(func() {
			phase := "end"
			if err != nil {
				phase = "error"
			}
			t.record("native", stage, phase, max(0, float64(t.now().Sub(start))/float64(time.Millisecond)), nil)
		})
	}
}

func (t *Trace) Frontend(timing FrontendTiming) {
	if ValidFrontendTiming(timing) {
		t.record("webview", timing.Stage, timing.Phase, timing.DurationMS, &timing.ElapsedMS)
	}
}
