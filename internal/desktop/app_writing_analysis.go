package desktop

import (
	"figaro/internal/writing"
	"fmt"
)

type writingInitialization struct {
	done chan struct{}
	err  error
}

// WritingInitialize starts eagerly, independently of editor readiness. Slow
// native preparation must never own the lock used by cancellation or shutdown.
func (a *App) WritingInitialize() error {
	finish := a.startupTrace.Begin("writing")
	err := a.initializeWriting(func() (*writing.Engine, error) { return writing.OpenWithTimings(a.startupTrace.Begin) })
	finish(err)
	return err
}

func (a *App) initializeWriting(open func() (*writing.Engine, error)) error {
	a.writingMu.Lock()
	if a.writingStopped {
		a.writingMu.Unlock()
		return fmt.Errorf("writing engine is closed")
	}
	if a.writingEngine != nil {
		a.writingMu.Unlock()
		return nil
	}
	if pending := a.writingOpening; pending != nil {
		a.writingMu.Unlock()
		<-pending.done
		return pending.err
	}
	pending := &writingInitialization{done: make(chan struct{})}
	a.writingOpening = pending
	a.writingMu.Unlock()
	engine, err := open()
	a.writingMu.Lock()
	if a.writingStopped && err == nil {
		err = fmt.Errorf("writing engine is closed")
	}
	if err == nil {
		a.writingEngine = engine
	}
	pending.err = err
	a.writingOpening = nil
	close(pending.done)
	a.writingMu.Unlock()
	if err != nil && engine != nil {
		engine.Close()
	}
	return err
}
func (a *App) WritingAnalyze(id, source string) (string, error) {
	a.writingMu.Lock()
	engine := a.writingEngine
	a.writingMu.Unlock()
	if engine == nil {
		return "", fmt.Errorf("writing engine unavailable")
	}
	return engine.Analyze(id, source)
}
func (a *App) WritingCancel(id string) {
	a.writingMu.Lock()
	engine := a.writingEngine
	a.writingMu.Unlock()
	if engine != nil {
		engine.Cancel(id)
	}
}
