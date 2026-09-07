package desktop

import (
	"figaro/internal/writing"
	"fmt"
)

// WritingInitialize prepares the bundled executable before frontend readiness.
func (a *App) WritingInitialize() error {
	a.writingMu.Lock()
	defer a.writingMu.Unlock()
	if a.writingEngine != nil {
		return nil
	}
	engine, err := writing.Open()
	if err != nil {
		return err
	}
	a.writingEngine = engine
	return nil
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
