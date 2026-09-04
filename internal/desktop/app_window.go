package desktop

// ============================================================================
// 11. Window Management (native, hardware-accelerated via Wails runtime)
// ============================================================================

// WindowMinimize minimizes the application window.
func (a *App) WindowMinimize() {
	if a.ctx != nil {
		a.captureWindowState(a.ctx)
		a.windowRuntime.Minimise(a.ctx)
	}
}

// WindowSetTitle keeps the native task-switcher identity aligned with the
// active Figaro document. The frontend owns the presentation decision.
func (a *App) WindowSetTitle(title string) {
	if a.ctx != nil {
		a.windowRuntime.SetTitle(a.ctx, title)
	}
}

// WindowMaximize toggles between maximized and normal window size.
func (a *App) WindowMaximize() {
	if a.ctx != nil {
		// Preserve the current normal dimensions before entering maximized
		// state. A resize observation records the resulting state afterwards.
		a.captureWindowState(a.ctx)
		a.windowRuntime.ToggleMaximise(a.ctx)
	}
}

// WindowClose closes the application window.
func (a *App) WindowClose() {
	if a.ctx != nil {
		// Capture while GTK still owns a realised window. OnShutdown runs after
		// native teardown has begun on Linux, where querying state would emit
		// gtk_widget_get_window / gdk_window_get_state critical assertions.
		a.captureWindowState(a.ctx)
		a.windowRuntime.Quit(a.ctx)
	}
}

// WindowSetPosition moves the window to (x, y). Used by the drag handler.
func (a *App) WindowSetPosition(x int, y int) {
	if a.ctx != nil {
		a.windowRuntime.SetPosition(a.ctx, x, y)
	}
}

// WindowGetPosition returns the current window position as {x, y}.
// Used by the drag handler to track the window during moves.
func (a *App) WindowGetPosition() map[string]int {
	if a.ctx == nil {
		return map[string]int{"x": 0, "y": 0}
	}
	x, y := a.windowRuntime.GetPosition(a.ctx)
	return map[string]int{"x": x, "y": y}
}

// WindowGetSize returns the current window size as {w, h}.
func (a *App) WindowGetSize() map[string]int {
	if a.ctx == nil {
		return map[string]int{"w": 800, "h": 600}
	}
	w, h := a.windowRuntime.GetSize(a.ctx)
	return map[string]int{"w": w, "h": h}
}

// WindowSetSize sets the window dimensions.
func (a *App) WindowSetSize(w int, h int) {
	if a.ctx != nil {
		a.windowRuntime.SetSize(a.ctx, w, h)
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
	x, y := a.windowRuntime.GetPosition(a.ctx)
	w, h := a.windowRuntime.GetSize(a.ctx)
	plan, ok := planWindowResize(direction, x, y, w, h)
	if !ok {
		return
	}
	if plan.move {
		a.windowRuntime.SetPosition(a.ctx, plan.x, plan.y)
	}
	a.windowRuntime.SetSize(a.ctx, plan.width, plan.height)
}
