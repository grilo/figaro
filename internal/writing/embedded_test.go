package writing

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path"
	"reflect"
	"sort"
	"strings"
	"sync/atomic"
	"testing"
	"testing/fstest"
	"time"

	"github.com/vale-cli/vale/v3/embedded"
)

func TestEmbeddedWritingAssetsExcludeExecutablePayloads(t *testing.T) {
	err := fs.WalkDir(bundled, ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		if path.Base(name) != "LICENSE" && path.Base(name) != "SOURCE.json" && path.Ext(name) != ".yml" && path.Ext(name) != ".ini" {
			t.Errorf("unexpected writing asset (only rules, config, provenance and notices are allowed): %s", name)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

type analyzerFunc func(context.Context, string) ([]embedded.Alert, error)

func (f analyzerFunc) Analyze(ctx context.Context, text string) ([]embedded.Alert, error) {
	return f(ctx, text)
}
func awaitError(t *testing.T, ch <-chan error, want error) {
	t.Helper()
	select {
	case err := <-ch:
		if !errors.Is(err, want) {
			t.Fatalf("got %v, want %v", err, want)
		}
	case <-time.After(time.Second):
		t.Fatal("writing caller blocked")
	}
}
func submit(e *Engine, id, text string) <-chan error {
	ch := make(chan error, 1)
	go func() { _, err := e.Analyze(id, text); ch <- err }()
	return ch
}
func waitQueued(t *testing.T, e *Engine) {
	t.Helper()
	until := time.Now().Add(time.Second)
	for len(e.jobs) == 0 {
		if time.Now().After(until) {
			t.Fatal("no queued replacement")
		}
		time.Sleep(time.Millisecond)
	}
}

func TestEmbeddedCancellationReturnsBeforeWorkerStopsAndBoundsReplacementQueue(t *testing.T) {
	started, release := make(chan struct{}, 1), make(chan struct{})
	var calls atomic.Int32
	e := newEngine(analyzerFunc(func(ctx context.Context, text string) ([]embedded.Alert, error) {
		if calls.Add(1) == 1 {
			started <- struct{}{}
			<-release
		}
		return nil, nil
	}))
	defer e.Close()
	first := submit(e, "first", "old text")
	<-started
	e.Cancel("first")
	awaitError(t, first, context.Canceled)
	second := submit(e, "second", "obsolete replacement")
	waitQueued(t, e)
	if _, err := e.Analyze("overflow", "extra"); err == nil {
		t.Fatal("unbounded admission")
	}
	e.Cancel("second")
	awaitError(t, second, context.Canceled)
	third := submit(e, "third", "latest text")
	waitQueued(t, e)
	if calls.Load() != 1 {
		t.Fatal("overlapping in-process scans")
	}
	close(release)
	awaitError(t, third, nil)
	if calls.Load() != 2 {
		t.Fatal("cancelled replacement executed")
	}
}

func TestEmbeddedDeadlineAndCloseNeverWaitForUncooperativeWorker(t *testing.T) {
	for _, mode := range []string{"deadline", "close"} {
		t.Run(mode, func(t *testing.T) {
			started, release := make(chan struct{}), make(chan struct{})
			e := newEngine(analyzerFunc(func(ctx context.Context, _ string) ([]embedded.Alert, error) {
				close(started)
				<-release
				return nil, ctx.Err()
			}))
			defer e.Close()
			defer close(release)
			e.budget = func(int) time.Duration { return 50 * time.Millisecond }
			result := submit(e, "slow", "saved text")
			<-started
			if mode == "close" {
				e.Close()
				awaitError(t, result, context.Canceled)
			} else {
				awaitError(t, result, context.DeadlineExceeded)
			}
			select {
			case <-e.done:
				t.Fatal("worker claimed to exit while still running")
			default:
			}
		})
	}
}

func TestEmbeddedPreCancellationLongBudgetAndEngineReuse(t *testing.T) {
	var calls int
	e := newEngine(analyzerFunc(func(ctx context.Context, _ string) ([]embedded.Alert, error) {
		calls++
		deadline, ok := ctx.Deadline()
		if !ok || time.Until(deadline) > 10*time.Second || time.Until(deadline) < 9*time.Second {
			t.Error("wrong long-note budget")
		}
		return nil, nil
	}))
	defer e.Close()
	e.Cancel("before")
	if _, err := e.Analyze("before", "text"); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	for range 3 {
		if _, err := e.Analyze("repeat", strings.Repeat("word ", 60000)); err != nil {
			t.Fatal(err)
		}
	}
	if calls != 3 {
		t.Fatal("pre-cancelled work ran or reuse failed")
	}
}

func TestEmbeddedFailureAndPanicAllowNextRequest(t *testing.T) {
	for _, failure := range []bool{false, true} {
		first := true
		e := newEngine(analyzerFunc(func(context.Context, string) ([]embedded.Alert, error) {
			if first {
				first = false
				if failure {
					panic("engine panic")
				}
				return nil, errors.New("engine failure")
			}
			return nil, nil
		}))
		if _, err := e.Analyze("bad", "text"); err == nil {
			t.Fatal("failure hidden")
		}
		if output, err := e.Analyze("good", "text"); err != nil || output != "{}" {
			t.Fatalf("reuse: %s %v", output, err)
		}
		e.Close()
	}
}

func TestEmbeddedOutputLimitNeverReturnsTruncatedJSON(t *testing.T) {
	if output, err := encodeAlerts([]embedded.Alert{{Message: strings.Repeat("x", maxBytes)}}); err == nil || output != "" {
		t.Fatal("oversized result escaped")
	}
}

func TestEmbeddedUsesMemoryRulesAndTreatsExistingFilenameAsText(t *testing.T) {
	t.Chdir(t.TempDir())
	for _, key := range []string{"VALE_CONFIG_PATH", "VALE_STYLES_PATH", "XDG_DATA_HOME", "XDG_CACHE_HOME"} {
		t.Setenv(key, "missing/unused")
	}
	source := "The file is very large."
	if err := os.WriteFile(source, []byte("Plain wording."), 0600); err != nil {
		t.Fatal(err)
	}
	e, err := Open()
	if err != nil {
		t.Fatal(err)
	}
	defer e.Close()
	output, err := e.Analyze("literal", source)
	if err != nil || !strings.Contains(output, "proselint.Very") {
		t.Fatalf("%s %v", output, err)
	}
	if _, err := os.Stat("missing"); !os.IsNotExist(err) {
		t.Fatal("host storage was accessed or created", err)
	}
}

func TestEmbeddedLibraryBoundsPathologicalRegexAndRejectsExternalRuleTypes(t *testing.T) {
	rule := []byte("extends: existence\nmessage: 'Bad pattern.'\nlevel: warning\nnonword: true\nraw: ['^(a+)+$']\n")
	engine, err := embedded.New(fstest.MapFS{"proselint.Pathological.yml": {Data: rule}, "proselint.Second.yml": {Data: rule}})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if _, err := engine.Analyze(ctx, strings.Repeat("a", 10000)+"!"); err == nil {
		t.Fatal("pathological regex returned as a successful scan")
	}
	if _, err := engine.Analyze(context.Background(), "ordinary words"); err != nil {
		t.Fatal("timeout damaged engine", err)
	}
	for _, kind := range []string{"script", "spelling", "Some.OtherRule"} {
		if _, err := embedded.New(fstest.MapFS{"proselint.External.yml": {Data: []byte("extends: " + kind + "\nmessage: unavailable\n")}}); err == nil {
			t.Fatal("external rule accepted", kind)
		}
	}
}

func TestEmbeddedRuleErrorsUseAssetLabelsWithoutReadingHostFiles(t *testing.T) {
	t.Chdir(t.TempDir())
	if err := os.WriteFile("proselint.Invalid.yml", []byte("private host contents"), 0600); err != nil {
		t.Fatal(err)
	}
	rule := []byte("extends: existence\nmessage: bad pattern\nnonword: true\nraw: ['(']\n")
	_, err := embedded.New(fstest.MapFS{"proselint.Invalid.yml": {Data: rule}})
	if err == nil || !strings.Contains(err.Error(), "Invalid.yml") || strings.Contains(err.Error(), "private host contents") || strings.Contains(err.Error(), "\x1b[") {
		t.Fatalf("unexpected embedded rule error: %v", err)
	}
}

func TestEmbeddedLongNoteCancellationReleasesRealEngineForNextNote(t *testing.T) {
	e, err := Open()
	if err != nil {
		t.Fatal(err)
	}
	defer e.Close()
	result := submit(e, "long", strings.Repeat("The report was written in order to help the team utilize clear language.\n\n", 12000))
	time.Sleep(20 * time.Millisecond)
	e.Cancel("long")
	awaitError(t, result, context.Canceled)
	next := submit(e, "next", "The file is very large.")
	select {
	case err := <-next:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("cancelled native work did not release worker")
	}
}

func canonicalJSONAlerts(raw []json.RawMessage) []string {
	values := make([]string, 0, len(raw))
	for _, item := range raw {
		var value any
		_ = json.Unmarshal(item, &value)
		b, _ := json.Marshal(value)
		values = append(values, string(b))
	}
	sort.Strings(values)
	return values
}
func TestEmbeddedMatchesPinnedCLIAlertsAcrossEditorialAndUnicodeFixtures(t *testing.T) {
	data, err := os.ReadFile("../../tests/fixtures/writing-vale-equivalence.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct {
		Name, Source string
		Alerts       []json.RawMessage
	}
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	e, err := Open()
	if err != nil {
		t.Fatal(err)
	}
	defer e.Close()
	for repeat := 0; repeat < 2; repeat++ {
		for _, sample := range fixtures {
			t.Run(sample.Name, func(t *testing.T) {
				output, err := e.Analyze(sample.Name, sample.Source)
				if err != nil {
					t.Fatal(err)
				}
				var actual map[string][]json.RawMessage
				if err := json.Unmarshal([]byte(output), &actual); err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(canonicalJSONAlerts(sample.Alerts), canonicalJSONAlerts(actual["stdin.txt"])) {
					t.Fatalf("CLI parity changed: %s", output)
				}
			})
		}
	}
}
