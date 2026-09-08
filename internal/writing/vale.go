// Package writing owns the isolated, offline Vale process and its bundled assets.
package writing

import (
	"bytes"
	"context"
	"embed"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

//go:embed assets/* styles
var bundled embed.FS

const Version = "3.20.0"
const maxBytes = 4 << 20

type Engine struct {
	mu             sync.Mutex
	runMu          sync.Mutex
	dir            string
	executable     string
	current        string
	cancel         context.CancelFunc
	closed         bool
	cancelled      map[string]bool
	commandContext func(context.Context, string, ...string) *exec.Cmd
}

func Open() (*Engine, error) {
	return OpenWithTimings(func(string) func(error) { return func(error) {} })
}

// OpenWithTimings reports only fixed stages, leaving clocks and log I/O to the caller.
func OpenWithTimings(begin func(string) func(error)) (*Engine, error) {
	finishCache := begin("writing-cache")
	dir, executable, err := prepareBundledCache()
	finishCache(err)
	if err != nil {
		return nil, err
	}
	engine := &Engine{dir: dir, executable: executable, commandContext: exec.CommandContext}
	finishProcess := begin("writing-process")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, engine.executable, "--version")
	hideProcessWindow(command)
	_, err = command.Output()
	finishProcess(err)
	if err != nil {
		return nil, fmt.Errorf("writing engine could not start: %w", err)
	}
	return engine, nil
}

type limitedBuffer struct{ bytes.Buffer }

func (b *limitedBuffer) Write(data []byte) (int, error) {
	if b.Len()+len(data) > maxBytes {
		return 0, fmt.Errorf("writing output exceeds limit")
	}
	return b.Buffer.Write(data)
}

func (e *Engine) Analyze(id, text string) (string, error) {
	if len(text) > maxBytes {
		return "", fmt.Errorf("document exceeds writing analysis limit")
	}
	e.runMu.Lock()
	defer e.runMu.Unlock()
	e.mu.Lock()
	if e.closed {
		e.mu.Unlock()
		return "", fmt.Errorf("writing engine is closed")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(AnalysisBudgetMillis(len(text)))*time.Millisecond)
	if e.cancelled[id] {
		e.mu.Unlock()
		cancel()
		return "", context.Canceled
	}
	e.current, e.cancel = id, cancel
	e.mu.Unlock()
	defer func() { cancel(); e.mu.Lock(); e.cancel = nil; e.current = ""; e.mu.Unlock() }()
	command := e.commandContext(ctx, e.executable, "--config="+filepath.Join(e.dir, "figaro.ini"), "--no-global", "--output=JSON", "--ext=.txt", "--no-exit")
	command.Dir = e.dir
	command.Stdin = bytes.NewBufferString(text)
	command.WaitDelay = time.Second
	var output, stderr limitedBuffer
	command.Stdout, command.Stderr = &output, &stderr
	hideProcessWindow(command)
	err := command.Run()
	if ctx.Err() != nil {
		return "", ctx.Err()
	}
	if err != nil {
		return "", fmt.Errorf("writing analysis failed: %w", err)
	}
	if !bytes.HasPrefix(bytes.TrimSpace(output.Bytes()), []byte("{")) {
		return "", errors.New("invalid writing engine output")
	}
	return output.String(), nil
}
func (e *Engine) Cancel(id string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.cancelled == nil || len(e.cancelled) > 128 {
		e.cancelled = map[string]bool{}
	}
	e.cancelled[id] = true
	if e.current == id && e.cancel != nil {
		e.cancel()
	}
}
func (e *Engine) Close() {
	e.mu.Lock()
	e.closed = true
	if e.cancel != nil {
		e.cancel()
	}
	e.mu.Unlock()
	e.runMu.Lock()
	defer e.runMu.Unlock()
	// Verified bundled assets belong to the reusable cache, not this session.
}
