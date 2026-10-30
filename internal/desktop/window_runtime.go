package desktop

import (
	"context"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// windowRuntime is the native-window effect boundary consumed by App. Tests
// provide a small fake; the composition root uses wailsWindowRuntime.
type windowRuntime interface {
	Minimise(context.Context)
	SetTitle(context.Context, string)
	ToggleMaximise(context.Context)
	Quit(context.Context)
	SetPosition(context.Context, int, int)
	GetPosition(context.Context) (int, int)
	SetSize(context.Context, int, int)
	GetSize(context.Context) (int, int)
	IsMinimised(context.Context) bool
	IsMaximised(context.Context) bool
	IsNormal(context.Context) bool
	ExecJS(context.Context, string)
	ChooseFile(context.Context, fileChooserRequest) (string, error)
}

// fileChooserRequest is the platform-neutral description of a single-file
// native chooser. An empty selection means the user cancelled.
type fileChooserRequest struct {
	Title   string
	Filters []fileChooserFilter
}

type fileChooserFilter struct {
	DisplayName string
	Pattern     string
}

// wailsWindowRuntime adapts Figaro's single main window to Wails v3's window
// and application objects. The context remains part of the port so App can
// keep treating "no runtime context yet" as "native window not ready".
type wailsWindowRuntime struct {
	app    *application.App
	window application.Window
}

func (r wailsWindowRuntime) ready() bool { return r.app != nil && r.window != nil }

func (r wailsWindowRuntime) Minimise(context.Context) {
	if r.ready() {
		r.window.Minimise()
	}
}

func (r wailsWindowRuntime) SetTitle(_ context.Context, title string) {
	if r.ready() {
		r.window.SetTitle(title)
	}
}

func (r wailsWindowRuntime) ToggleMaximise(context.Context) {
	if r.ready() {
		r.window.ToggleMaximise()
	}
}

func (r wailsWindowRuntime) Quit(context.Context) {
	if r.app != nil {
		r.app.Quit()
	}
}

func (r wailsWindowRuntime) SetPosition(_ context.Context, x, y int) {
	if r.ready() {
		r.window.SetPosition(x, y)
	}
}

func (r wailsWindowRuntime) GetPosition(context.Context) (int, int) {
	if !r.ready() {
		return 0, 0
	}
	return r.window.Position()
}

func (r wailsWindowRuntime) SetSize(_ context.Context, width, height int) {
	if r.ready() {
		r.window.SetSize(width, height)
	}
}

func (r wailsWindowRuntime) GetSize(context.Context) (int, int) {
	if !r.ready() {
		return 0, 0
	}
	return r.window.Size()
}

func (r wailsWindowRuntime) IsMinimised(context.Context) bool {
	return r.ready() && r.window.IsMinimised()
}

func (r wailsWindowRuntime) IsMaximised(context.Context) bool {
	return r.ready() && r.window.IsMaximised()
}

// IsNormal has no direct v3 counterpart. Figaro only asks it to decide whether
// the current bounds are the restorable normal bounds.
func (r wailsWindowRuntime) IsNormal(context.Context) bool {
	return r.ready() && !r.window.IsMinimised() && !r.window.IsMaximised() && !r.window.IsFullscreen()
}

func (r wailsWindowRuntime) ExecJS(_ context.Context, script string) {
	if r.ready() {
		r.window.ExecJS(script)
	}
}

func (r wailsWindowRuntime) ChooseFile(_ context.Context, request fileChooserRequest) (string, error) {
	if !r.ready() {
		return "", nil
	}
	filters := make([]application.FileFilter, 0, len(request.Filters))
	for _, filter := range request.Filters {
		filters = append(filters, application.FileFilter{DisplayName: filter.DisplayName, Pattern: filter.Pattern})
	}
	return r.app.Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		Title:          request.Title,
		CanChooseFiles: true,
		Filters:        filters,
		Window:         r.window,
	}).PromptForSingleSelection()
}

// showWailsWindow restores and focuses the main window for a second launch.
func showWailsWindow(window application.Window) func(context.Context) {
	return func(context.Context) {
		if window == nil {
			return
		}
		if window.IsMinimised() {
			window.UnMinimise()
		}
		window.Show()
		window.Focus()
	}
}
