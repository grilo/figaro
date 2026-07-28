package desktop

import (
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ============================================================================
// 11. Window Management (native, hardware-accelerated via Wails runtime)
// ============================================================================

// WindowMinimize minimizes the application window.
func (a *App) WindowMinimize() {
	if a.ctx != nil {
		a.captureWindowState(a.ctx)
		safeRuntimeCall(func() { runtime.WindowMinimise(a.ctx) })
	}
}

// WindowMaximize toggles between maximized and normal window size.
func (a *App) WindowMaximize() {
	if a.ctx != nil {
		// Preserve the current normal dimensions before entering maximized
		// state. A resize observation records the resulting state afterwards.
		a.captureWindowState(a.ctx)
		safeRuntimeCall(func() { runtime.WindowToggleMaximise(a.ctx) })
	}
}

// WindowClose closes the application window.
func (a *App) WindowClose() {
	if a.ctx != nil {
		// Capture while GTK still owns a realised window. OnShutdown runs after
		// native teardown has begun on Linux, where querying state would emit
		// gtk_widget_get_window / gdk_window_get_state critical assertions.
		a.captureWindowState(a.ctx)
		safeRuntimeCall(func() { runtime.Quit(a.ctx) })
	}
}

// WindowSetPosition moves the window to (x, y). Used by the drag handler.
func (a *App) WindowSetPosition(x int, y int) {
	if a.ctx != nil {
		safeRuntimeCall(func() { runtime.WindowSetPosition(a.ctx, x, y) })
	}
}

// WindowGetPosition returns the current window position as {x, y}.
// Used by the drag handler to track the window during moves.
func (a *App) WindowGetPosition() map[string]int {
	if a.ctx == nil {
		return map[string]int{"x": 0, "y": 0}
	}
	var x, y int
	safeRuntimeCall(func() {
		x, y = runtime.WindowGetPosition(a.ctx)
	})
	return map[string]int{"x": x, "y": y}
}

// WindowGetSize returns the current window size as {w, h}.
func (a *App) WindowGetSize() map[string]int {
	if a.ctx == nil {
		return map[string]int{"w": 800, "h": 600}
	}
	var w, h int
	safeRuntimeCall(func() {
		w, h = runtime.WindowGetSize(a.ctx)
	})
	return map[string]int{"w": w, "h": h}
}

// WindowSetSize sets the window dimensions.
func (a *App) WindowSetSize(w int, h int) {
	if a.ctx != nil {
		safeRuntimeCall(func() { runtime.WindowSetSize(a.ctx, w, h) })
	}
}

// WindowStartResize performs a window resize operation using Wails v2 runtime.
// direction is one of: "N", "S", "E", "W", "NE", "NW", "SE", "SW".
// The frontend perimeter mouse listeners pass these directional tokens.
// On Linux/GTK frameless windows, the native window manager handles edge
// resize automatically; this method provides a programmatic alternative.
// For zero-latency native resize, use CSS cursor hints at window edges
// combined with the GTK frameless window's built-in edge behavior.
func (a *App) WindowStartResize(direction string) {
	if a.ctx == nil {
		return
	}
	safeRuntimeCall(func() {
		x, y := runtime.WindowGetPosition(a.ctx)
		w, h := runtime.WindowGetSize(a.ctx)
		delta := 20 // pixels per step
		switch strings.ToUpper(direction) {
		case "N":
			runtime.WindowSetPosition(a.ctx, x, y-delta)
			runtime.WindowSetSize(a.ctx, w, h+delta)
		case "S":
			runtime.WindowSetSize(a.ctx, w, h+delta)
		case "E":
			runtime.WindowSetSize(a.ctx, w+delta, h)
		case "W":
			runtime.WindowSetPosition(a.ctx, x-delta, y)
			runtime.WindowSetSize(a.ctx, w+delta, h)
		case "NE":
			runtime.WindowSetPosition(a.ctx, x, y-delta)
			runtime.WindowSetSize(a.ctx, w+delta, h+delta)
		case "NW":
			runtime.WindowSetPosition(a.ctx, x-delta, y-delta)
			runtime.WindowSetSize(a.ctx, w+delta, h+delta)
		case "SE":
			runtime.WindowSetSize(a.ctx, w+delta, h+delta)
		case "SW":
			runtime.WindowSetPosition(a.ctx, x-delta, y)
			runtime.WindowSetSize(a.ctx, w+delta, h+delta)
		}
	})
}

// safeRuntimeCall wraps a call to the Wails runtime to prevent panics
// when a non-Wails context (e.g., context.Background()) is passed during testing.
func safeRuntimeCall(fn func()) {
	defer func() {
		if r := recover(); r != nil {
			// Runtime panics with non-Wails contexts are expected in tests; suppress.
		}
	}()
	fn()
}
