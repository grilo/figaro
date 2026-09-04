package desktop

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
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
}

type wailsWindowRuntime struct{}

func (wailsWindowRuntime) Minimise(ctx context.Context) { runtime.WindowMinimise(ctx) }
func (wailsWindowRuntime) SetTitle(ctx context.Context, title string) {
	runtime.WindowSetTitle(ctx, title)
}
func (wailsWindowRuntime) ToggleMaximise(ctx context.Context) { runtime.WindowToggleMaximise(ctx) }
func (wailsWindowRuntime) Quit(ctx context.Context)           { runtime.Quit(ctx) }
func (wailsWindowRuntime) SetPosition(ctx context.Context, x, y int) {
	runtime.WindowSetPosition(ctx, x, y)
}
func (wailsWindowRuntime) GetPosition(ctx context.Context) (int, int) {
	return runtime.WindowGetPosition(ctx)
}
func (wailsWindowRuntime) SetSize(ctx context.Context, width, height int) {
	runtime.WindowSetSize(ctx, width, height)
}
func (wailsWindowRuntime) GetSize(ctx context.Context) (int, int) {
	return runtime.WindowGetSize(ctx)
}
func (wailsWindowRuntime) IsMinimised(ctx context.Context) bool {
	return runtime.WindowIsMinimised(ctx)
}
func (wailsWindowRuntime) IsMaximised(ctx context.Context) bool {
	return runtime.WindowIsMaximised(ctx)
}
func (wailsWindowRuntime) IsNormal(ctx context.Context) bool { return runtime.WindowIsNormal(ctx) }
