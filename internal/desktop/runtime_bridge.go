package desktop

import (
	"context"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// runtimeBridge owns Wails lifecycle readiness and event delivery. Keeping it
// behind App prevents unrelated vault services from sharing runtime locks and
// focus state directly.
type runtimeBridge struct {
	mu           sync.RWMutex
	ctx          context.Context
	ready        bool
	focusPending bool
	emitOverride func(name string, data ...any)
	showWindow   func(context.Context)
}

func newRuntimeBridge(showWindow func(context.Context)) *runtimeBridge {
	return &runtimeBridge{showWindow: showWindow}
}

func (r *runtimeBridge) start(ctx context.Context) {
	r.mu.Lock()
	r.ctx = ctx
	r.ready = true
	focusPending := r.focusPending
	r.focusPending = false
	showWindow := r.showWindow
	r.mu.Unlock()
	if focusPending && showWindow != nil {
		showWindow(ctx)
	}
}

func (r *runtimeBridge) context() context.Context {
	if r == nil {
		return nil
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.ctx
}

func (r *runtimeBridge) requestFocus() {
	if r == nil {
		return
	}
	r.mu.Lock()
	ctx := r.ctx
	showWindow := r.showWindow
	if ctx == nil || !r.ready {
		r.focusPending = true
		r.mu.Unlock()
		return
	}
	r.mu.Unlock()
	if showWindow != nil {
		showWindow(ctx)
	}
}

func (r *runtimeBridge) emit(name string, data ...any) {
	if r == nil || name == "" {
		return
	}
	r.mu.RLock()
	ctx := r.ctx
	ready := r.ready
	override := r.emitOverride
	r.mu.RUnlock()
	if override != nil {
		override(name, data...)
		return
	}
	if ctx != nil && ready {
		runtime.EventsEmit(ctx, name, data...)
	}
}

func (r *runtimeBridge) configureForTest(ctx context.Context, ready bool, showWindow func(context.Context), emit func(string, ...any)) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.ctx = ctx
	r.ready = ready
	if showWindow != nil {
		r.showWindow = showWindow
	}
	if emit == nil {
		emit = func(string, ...any) {}
	}
	r.emitOverride = emit
}
