// Package writing coordinates bounded, offline analysis with the embedded Vale engine.
package writing

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"sync"
	"time"

	"github.com/vale-cli/vale/v3/embedded"
)

//go:embed styles
var bundled embed.FS

const Version = "3.20.0"
const maxBytes = 4 << 20

// analyzer is the effect boundary owned by the worker. It is never called by
// concurrent requests, and no request or close path waits for it to finish.
type analyzer interface {
	Analyze(context.Context, string) ([]embedded.Alert, error)
}

type analysisResult struct {
	output string
	err    error
}
type analysisRequest struct {
	id, text string
	ctx      context.Context
	cancel   context.CancelFunc
	result   chan analysisResult
}

type Engine struct {
	mu        sync.Mutex
	worker    analyzer
	jobs      chan *analysisRequest
	stop      chan struct{}
	done      chan struct{}
	requests  map[string]*analysisRequest
	cancelled map[string]bool
	closed    bool
	budget    func(int) time.Duration
}

func Open() (*Engine, error) {
	return OpenWithTimings(func(string) func(error) { return func(error) {} })
}

// OpenWithTimings reports a fixed stage, leaving log I/O to the composition root.
func OpenWithTimings(begin func(string) func(error)) (*Engine, error) {
	finish := begin("writing-rules")
	rules, err := fs.Sub(bundled, "styles")
	if err != nil {
		finish(err)
		return nil, err
	}
	worker, err := embedded.New(rules)
	finish(err)
	if err != nil {
		return nil, fmt.Errorf("writing engine could not initialize: %w", err)
	}
	return newEngine(worker), nil
}

func newEngine(worker analyzer) *Engine {
	engine := &Engine{worker: worker, jobs: make(chan *analysisRequest, 1), stop: make(chan struct{}), done: make(chan struct{}), requests: map[string]*analysisRequest{}, cancelled: map[string]bool{}, budget: func(size int) time.Duration { return time.Duration(AnalysisBudgetMillis(size)) * time.Millisecond }}
	go engine.run()
	return engine
}

// encodeAlerts preserves the bridge's Vale JSON contract and rejects oversized
// output. The embedded library also bounds intermediate matches and alerts.
func encodeAlerts(alerts []embedded.Alert) (string, error) {
	files := map[string][]embedded.Alert{}
	if len(alerts) > 0 {
		files["stdin.txt"] = alerts
	}
	data, err := json.Marshal(files)
	if err != nil {
		return "", err
	}
	if len(data) > maxBytes {
		return "", errors.New("writing output exceeds limit")
	}
	return string(data), nil
}

func (e *Engine) run() {
	defer func() {
		e.mu.Lock()
		e.requests = nil
		e.worker = nil
		e.mu.Unlock()
		close(e.done)
	}()
	for {
		select {
		case <-e.stop:
			return
		case request := <-e.jobs:
			result := e.execute(request)
			// A cancelled caller may already have returned; this buffered send
			// never waits and the next scan still waits for actual worker exit.
			e.mu.Lock()
			delete(e.requests, request.id)
			e.mu.Unlock()
			request.result <- result
		}
	}
}

func (e *Engine) execute(request *analysisRequest) (result analysisResult) {
	defer func() {
		if recover() != nil {
			result = analysisResult{err: errors.New("writing analysis failed")}
		}
	}()
	if err := request.ctx.Err(); err != nil {
		return analysisResult{err: err}
	}
	alerts, err := e.worker.Analyze(request.ctx, request.text)
	if cancelled := request.ctx.Err(); cancelled != nil {
		return analysisResult{err: cancelled}
	}
	if err != nil {
		return analysisResult{err: fmt.Errorf("writing analysis failed: %w", err)}
	}
	output, err := encodeAlerts(alerts)
	return analysisResult{output: output, err: err}
}

func (e *Engine) Analyze(id, text string) (string, error) {
	e.mu.Lock()
	if err := admitRequest(len(text), e.closed || e.jobs == nil, e.cancelled[id], e.requests[id] != nil, len(e.requests)); err != nil {
		e.mu.Unlock()
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), e.budget(len(text)))
	request := &analysisRequest{id: id, text: text, ctx: ctx, cancel: cancel, result: make(chan analysisResult, 1)}
	e.requests[id] = request
	select {
	case e.jobs <- request:
		e.mu.Unlock()
	default:
		delete(e.requests, id)
		e.mu.Unlock()
		cancel()
		return "", errors.New("writing engine is busy")
	}
	defer func() { cancel(); e.mu.Lock(); e.removeQueued(request); e.mu.Unlock() }()

	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case result := <-request.result:
		if err := ctx.Err(); err != nil {
			return "", err
		}
		return result.output, result.err
	}
}

// admitRequest is the pure work-admission policy. The coordinator applies it
// under its lock before retaining another snapshot or creating its deadline.
func admitRequest(size int, closed, cancelled, duplicate bool, retained int) error {
	switch {
	case size > maxBytes:
		return errors.New("document exceeds writing analysis limit")
	case closed:
		return errors.New("writing engine is closed")
	case cancelled:
		return context.Canceled
	case duplicate || retained >= 2:
		return errors.New("writing engine is busy")
	default:
		return nil
	}
}

func (e *Engine) Cancel(id string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.cancelled == nil || len(e.cancelled) > 128 {
		e.cancelled = map[string]bool{}
	}
	e.cancelled[id] = true
	if request := e.requests[id]; request != nil {
		request.cancel()
		e.removeQueued(request)
	}
}

func (e *Engine) Close() {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.closed {
		return
	}
	e.closed = true
	for _, request := range e.requests {
		request.cancel()
	}
	if e.stop != nil {
		close(e.stop)
		select {
		case <-e.jobs:
		default:
		}
	}
}

// removeQueued requires mu. A cancelled pending snapshot must not occupy the
// replacement slot while active work is reaching a cooperative checkpoint.
func (e *Engine) removeQueued(request *analysisRequest) {
	select {
	case queued := <-e.jobs:
		if queued == request {
			delete(e.requests, request.id)
		} else {
			e.jobs <- queued
		}
	default:
	}
}
