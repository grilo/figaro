package desktop

import (
	"context"
	"reflect"
	"testing"
)

type fakeWindowRuntime struct {
	calls      []string
	positionX  int
	positionY  int
	width      int
	height     int
	minimised  bool
	maximised  bool
	normal     bool
	panicTitle bool
}

func (f *fakeWindowRuntime) record(call string) { f.calls = append(f.calls, call) }
func (f *fakeWindowRuntime) Minimise(context.Context) {
	f.record("minimise")
}
func (f *fakeWindowRuntime) SetTitle(_ context.Context, _ string) {
	if f.panicTitle {
		panic("native title failure")
	}
	f.record("set-title")
}
func (f *fakeWindowRuntime) ToggleMaximise(context.Context) { f.record("toggle-maximise") }
func (f *fakeWindowRuntime) Quit(context.Context)           { f.record("quit") }
func (f *fakeWindowRuntime) SetPosition(_ context.Context, x, y int) {
	f.positionX, f.positionY = x, y
	f.record("set-position")
}
func (f *fakeWindowRuntime) GetPosition(context.Context) (int, int) {
	f.record("get-position")
	return f.positionX, f.positionY
}
func (f *fakeWindowRuntime) SetSize(_ context.Context, width, height int) {
	f.width, f.height = width, height
	f.record("set-size")
}
func (f *fakeWindowRuntime) GetSize(context.Context) (int, int) {
	f.record("get-size")
	return f.width, f.height
}
func (f *fakeWindowRuntime) IsMinimised(context.Context) bool {
	f.record("is-minimised")
	return f.minimised
}
func (f *fakeWindowRuntime) IsMaximised(context.Context) bool {
	f.record("is-maximised")
	return f.maximised
}
func (f *fakeWindowRuntime) IsNormal(context.Context) bool {
	f.record("is-normal")
	return f.normal
}

func TestWindowCommandsUseInjectedRuntime(t *testing.T) {
	app, _ := newTestApp(t)
	window := &fakeWindowRuntime{positionX: 100, positionY: 200, width: 640, height: 300}
	app.ctx = context.Background()
	app.windowRuntime = window

	app.WindowSetTitle("Project brief.md — Figaro")
	app.WindowSetPosition(12, 34)
	app.WindowSetSize(900, 700)
	if got := app.WindowGetPosition(); !reflect.DeepEqual(got, map[string]int{"x": 12, "y": 34}) {
		t.Fatalf("WindowGetPosition() = %v", got)
	}
	if got := app.WindowGetSize(); !reflect.DeepEqual(got, map[string]int{"w": 900, "h": 700}) {
		t.Fatalf("WindowGetSize() = %v", got)
	}

	want := []string{"set-title", "set-position", "set-size", "get-position", "get-size"}
	if !reflect.DeepEqual(window.calls, want) {
		t.Fatalf("native calls = %v, want %v", window.calls, want)
	}
}

func TestWindowLifecycleCommandsCaptureStateThenUseInjectedRuntime(t *testing.T) {
	app, _ := newTestApp(t)
	window := &fakeWindowRuntime{}
	app.ctx = context.Background()
	app.windowRuntime = window

	app.WindowMinimize()
	app.WindowMaximize()
	app.WindowClose()

	want := []string{
		"is-minimised", "is-maximised", "is-normal", "minimise",
		"is-minimised", "is-maximised", "is-normal", "toggle-maximise",
		"is-minimised", "is-maximised", "is-normal", "quit",
	}
	if !reflect.DeepEqual(window.calls, want) {
		t.Fatalf("native lifecycle calls = %v, want %v", window.calls, want)
	}
}

func TestWindowStartResizePlansNativeGeometry(t *testing.T) {
	app, _ := newTestApp(t)
	window := &fakeWindowRuntime{positionX: 100, positionY: 200, width: 640, height: 300}
	app.ctx = context.Background()
	app.windowRuntime = window

	app.WindowStartResize("SW")

	if window.positionX != 80 || window.positionY != 200 || window.width != 660 || window.height != 320 {
		t.Fatalf("south-west resize geometry = (%d,%d) %dx%d", window.positionX, window.positionY, window.width, window.height)
	}
	if want := []string{"get-position", "get-size", "set-position", "set-size"}; !reflect.DeepEqual(window.calls, want) {
		t.Fatalf("native resize calls = %v, want %v", window.calls, want)
	}
}

func TestPlanWindowResizeCoversEveryDirection(t *testing.T) {
	tests := map[string]windowResizePlan{
		"N":  {x: 100, y: 180, width: 640, height: 320, move: true},
		"S":  {x: 100, y: 200, width: 640, height: 320},
		"E":  {x: 100, y: 200, width: 660, height: 300},
		"W":  {x: 80, y: 200, width: 660, height: 300, move: true},
		"NE": {x: 100, y: 180, width: 660, height: 320, move: true},
		"NW": {x: 80, y: 180, width: 660, height: 320, move: true},
		"SE": {x: 100, y: 200, width: 660, height: 320},
		"SW": {x: 80, y: 200, width: 660, height: 320, move: true},
	}
	for direction, want := range tests {
		t.Run(direction, func(t *testing.T) {
			got, ok := planWindowResize(direction, 100, 200, 640, 300)
			if !ok || got != want {
				t.Fatalf("planWindowResize(%q) = (%+v, %t), want (%+v, true)", direction, got, ok, want)
			}
		})
	}
	if got, ok := planWindowResize("invalid", 100, 200, 640, 300); ok || got != (windowResizePlan{}) {
		t.Fatalf("invalid resize plan = (%+v, %t), want zero, false", got, ok)
	}
}

func TestWindowRuntimeFailuresAreNotSilentlySwallowed(t *testing.T) {
	app, _ := newTestApp(t)
	app.ctx = context.Background()
	app.windowRuntime = &fakeWindowRuntime{panicTitle: true}

	defer func() {
		if recovered := recover(); recovered != "native title failure" {
			t.Fatalf("recovered panic = %v, want native runtime failure", recovered)
		}
	}()
	app.WindowSetTitle("Project brief.md — Figaro")
}
