package desktop

import (
	"sync"
	"time"
)

// nativeCloseRequestedEventName asks the page to run its exit flow. The
// window button already runs that flow; a close the operating system asks for
// (Alt+F4, the window manager, the macOS close button or Quit) would
// otherwise end the process with unsaved notes still in the editors.
const nativeCloseRequestedEventName = "native:close-requested"

// windowCloseAnswerGrace is how long the page has to acknowledge a forwarded
// close. A page that does not answer is frozen or not listening yet, and a
// window must never become impossible to close.
const windowCloseAnswerGrace = 3 * time.Second

type windowCloseDecision int

const (
	// windowCloseProceed lets the close happen now.
	windowCloseProceed windowCloseDecision = iota
	// windowCloseAsk holds the close and forwards it to the page.
	windowCloseAsk
	// windowCloseHold holds the close: the page is already answering one.
	windowCloseHold
)

// windowCloseState is what the gate remembers between close requests.
type windowCloseState struct {
	// approved is set once the page finished its exit flow and is leaving.
	approved bool
	// requestedAt is when a close was forwarded; zero when none is waiting.
	requestedAt time.Time
	// acknowledged reports that the page received the forwarded close.
	acknowledged bool
}

// nextWindowCloseDecision is the pure rule for a close the operating system
// asks for. pageReady reports whether the page can receive events at all.
func nextWindowCloseDecision(state windowCloseState, pageReady bool, now time.Time) (windowCloseDecision, windowCloseState) {
	if state.approved || !pageReady {
		return windowCloseProceed, state
	}
	if state.requestedAt.IsZero() {
		return windowCloseAsk, windowCloseState{requestedAt: now}
	}
	if state.acknowledged {
		return windowCloseHold, state
	}
	if now.Sub(state.requestedAt) >= windowCloseAnswerGrace {
		return windowCloseProceed, state
	}
	return windowCloseHold, state
}

// windowCloseGate serializes the rule above for the native event loop and the
// page's answers, which arrive on different goroutines.
type windowCloseGate struct {
	mu    sync.Mutex
	state windowCloseState
	now   func() time.Time
}

func newWindowCloseGate(now func() time.Time) *windowCloseGate {
	if now == nil {
		now = time.Now
	}
	return &windowCloseGate{now: now}
}

func (g *windowCloseGate) request(pageReady bool) windowCloseDecision {
	g.mu.Lock()
	defer g.mu.Unlock()
	decision, next := nextWindowCloseDecision(g.state, pageReady, g.now())
	g.state = next
	return decision
}

// acknowledge records that the page is answering the forwarded close.
func (g *windowCloseGate) acknowledge() {
	g.mu.Lock()
	defer g.mu.Unlock()
	if !g.state.requestedAt.IsZero() {
		g.state.acknowledged = true
	}
}

// decline records that the author chose to keep working, so the next close
// is forwarded again.
func (g *windowCloseGate) decline() {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.state = windowCloseState{approved: g.state.approved}
}

// approve records that the page finished its exit flow. withdraw undoes it
// when the exit did not happen after all (a restart that failed).
func (g *windowCloseGate) approve() {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.state.approved = true
}

func (g *windowCloseGate) withdraw() {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.state = windowCloseState{}
}

// holdNativeClose answers a close the operating system asks for. It reports
// true when the close must not happen yet, forwarding the request to the page
// the first time.
func (a *App) holdNativeClose() bool {
	switch a.closeGate.request(a.desktopRuntime.isReady()) {
	case windowCloseAsk:
		a.emitRuntimeEvent(nativeCloseRequestedEventName)
		return true
	case windowCloseHold:
		return true
	default:
		return false
	}
}

// WindowCloseAcknowledged tells the host the page received a forwarded close
// and is running its exit flow.
func (a *App) WindowCloseAcknowledged() {
	a.closeGate.acknowledge()
}

// WindowCloseDeclined tells the host the author chose to keep working.
func (a *App) WindowCloseDeclined() {
	a.closeGate.decline()
}
