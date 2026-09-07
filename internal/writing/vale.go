// Package writing owns the isolated, offline Vale process and its bundled assets.
package writing

import (
	"bytes"
	"compress/gzip"
	"context"
	"embed"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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
	name := "assets/vale-" + Version + "-" + runtime.GOOS + "-" + runtime.GOARCH + ".gz"
	data, err := bundled.ReadFile(name)
	if err != nil {
		return nil, fmt.Errorf("bundled writing engine unavailable: %w", err)
	}
	cache, err := os.UserCacheDir()
	if err != nil {
		return nil, err
	}
	if err = os.MkdirAll(cache, 0700); err != nil {
		return nil, err
	}
	dir, err := os.MkdirTemp(cache, "figaro-writing-")
	if err != nil {
		return nil, err
	}
	engine := &Engine{dir: dir, executable: filepath.Join(dir, "vale"), commandContext: exec.CommandContext}
	if runtime.GOOS == "windows" {
		engine.executable += ".exe"
	}
	ok := false
	defer func() {
		if !ok {
			engine.Close()
		}
	}()
	reader, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	binary, err := io.ReadAll(io.LimitReader(reader, 150<<20))
	if err != nil {
		return nil, err
	}
	if err = os.WriteFile(engine.executable, binary, 0700); err != nil {
		return nil, err
	}
	// This embedded directory contains only explicitly selected, pinned rules
	// and their notices. Never discover styles in the vault or global config.
	if err = fs.WalkDir(bundled, "styles", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		target := filepath.Join(dir, filepath.FromSlash(path))
		if entry.IsDir() {
			return os.MkdirAll(target, 0700)
		}
		data, err := bundled.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0600)
	}); err != nil {
		return nil, err
	}
	config, err := bundled.ReadFile("styles/figaro.ini")
	if err != nil {
		return nil, err
	}
	if err = os.WriteFile(filepath.Join(dir, "figaro.ini"), config, 0600); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, engine.executable, "--version")
	hideProcessWindow(command)
	if _, err = command.Output(); err != nil {
		return nil, fmt.Errorf("writing engine could not start: %w", err)
	}
	ok = true
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
	if e.dir != "" {
		_ = os.RemoveAll(e.dir)
	}
}
