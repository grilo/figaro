package core

import (
	"context"
	"errors"
	"testing"

	"github.com/vale-cli/vale/v3/internal/nlp"
)

func TestEmbeddedAlertWorkLimitFailsBeforeAnotherAlertIsAllocated(t *testing.T) {
	f := &File{Alerts: make([]Alert, MaxAlerts)}
	defer func() {
		err, _ := recover().(error)
		if !errors.Is(err, ErrWorkLimit) {
			t.Fatalf("got %v", err)
		}
		if len(f.Alerts) != MaxAlerts {
			t.Fatal("alert limit exceeded")
		}
	}()
	f.AddAlert(Alert{}, nlp.Block{}, 0, 0, false)
}

func TestEmbeddedSourceMappingCheckpointPreservesCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	defer func() {
		err, _ := recover().(error)
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("got %v", err)
		}
	}()
	(&File{Context: ctx}).Checkpoint()
}
