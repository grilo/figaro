package desktop

import (
	"context"
	"testing"
	"time"
)

func TestNativeCloseIsForwardedOnceThenHeldWhileThePageAnswers(t *testing.T) {
	start := time.Unix(1000, 0)
	state := windowCloseState{}

	decision, state := nextWindowCloseDecision(state, true, start)
	if decision != windowCloseAsk || !state.requestedAt.Equal(start) {
		t.Fatalf("first close = %v %+v, want it forwarded to the page", decision, state)
	}

	// The page said it is asking the author: every later close waits, however
	// long the prompt stays open.
	state.acknowledged = true
	for _, later := range []time.Duration{time.Second, time.Hour} {
		if decision, _ := nextWindowCloseDecision(state, true, start.Add(later)); decision != windowCloseHold {
			t.Fatalf("close %v after an acknowledged request = %v, want it held", later, decision)
		}
	}
}

func TestNativeCloseIsNeverTrappedByAPageThatDoesNotAnswer(t *testing.T) {
	start := time.Unix(1000, 0)
	_, waiting := nextWindowCloseDecision(windowCloseState{}, true, start)

	if decision, _ := nextWindowCloseDecision(waiting, true, start.Add(windowCloseAnswerGrace-time.Millisecond)); decision != windowCloseHold {
		t.Fatalf("a close inside the grace period = %v, want it held", decision)
	}
	if decision, _ := nextWindowCloseDecision(waiting, true, start.Add(windowCloseAnswerGrace)); decision != windowCloseProceed {
		t.Fatalf("a close after an unanswered request = %v, want the window to close", decision)
	}
	// Before the page can receive events there is nobody to ask.
	if decision, _ := nextWindowCloseDecision(windowCloseState{}, false, start); decision != windowCloseProceed {
		t.Fatalf("a close before the page is ready = %v, want the window to close", decision)
	}
}

func TestNativeCloseProceedsOnceThePageApprovedAndAsksAgainAfterADecline(t *testing.T) {
	now := time.Unix(1000, 0)
	gate := newWindowCloseGate(func() time.Time { return now })

	if decision := gate.request(true); decision != windowCloseAsk {
		t.Fatalf("first close = %v, want it forwarded", decision)
	}
	gate.acknowledge()
	if decision := gate.request(true); decision != windowCloseHold {
		t.Fatalf("second close while the author is asked = %v, want it held", decision)
	}

	// Keep editing: the next close asks again instead of being held forever
	// or slipping through.
	gate.decline()
	now = now.Add(time.Minute)
	if decision := gate.request(true); decision != windowCloseAsk {
		t.Fatalf("close after Keep editing = %v, want it forwarded again", decision)
	}

	gate.approve()
	if decision := gate.request(true); decision != windowCloseProceed {
		t.Fatalf("close after the page approved = %v, want the window to close", decision)
	}

	// A restart that failed leaves Figaro open: closing asks again.
	gate.withdraw()
	if decision := gate.request(true); decision != windowCloseAsk {
		t.Fatalf("close after a withdrawn approval = %v, want it forwarded", decision)
	}
	// An acknowledgement with nothing waiting changes nothing.
	gate.decline()
	gate.acknowledge()
	if decision := gate.request(true); decision != windowCloseAsk {
		t.Fatalf("close after a stray acknowledgement = %v, want it forwarded", decision)
	}
}

func TestHoldNativeCloseForwardsTheRequestToThePageOnce(t *testing.T) {
	app, _ := newTestApp(t)
	var events []string
	app.desktopRuntime.configureForTest(context.Background(), true, nil, func(name string, _ ...any) {
		events = append(events, name)
	})

	if !app.holdNativeClose() {
		t.Fatal("the first native close should be held")
	}
	app.WindowCloseAcknowledged()
	if !app.holdNativeClose() {
		t.Fatal("a native close while the page is asking should be held")
	}
	if len(events) != 1 || events[0] != nativeCloseRequestedEventName {
		t.Fatalf("events = %v, want one %q", events, nativeCloseRequestedEventName)
	}

	app.WindowCloseDeclined()
	if !app.holdNativeClose() || len(events) != 2 {
		t.Fatalf("after Keep editing the next close should be forwarded again; events = %v", events)
	}

	// The page's own exit is never forwarded back to it.
	app.closeGate.approve()
	if app.holdNativeClose() {
		t.Fatal("a close after the page approved should proceed")
	}
}

func TestHoldNativeCloseLetsTheWindowCloseBeforeThePageIsReady(t *testing.T) {
	app, _ := newTestApp(t)
	var events []string
	app.desktopRuntime.configureForTest(nil, false, nil, func(name string, _ ...any) {
		events = append(events, name)
	})
	if app.holdNativeClose() || len(events) != 0 {
		t.Fatalf("a close before the page is ready must proceed without an event; events = %v", events)
	}
}
