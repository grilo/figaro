package startup

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"sync"
	"testing"
	"time"
)

type testLogWriter struct {
	bytes.Buffer
	closed bool
	write  func([]byte) (int, error)
}

func (w *testLogWriter) Write(p []byte) (int, error) {
	if w.write != nil {
		return w.write(p)
	}
	return w.Buffer.Write(p)
}
func (w *testLogWriter) Close() error { w.closed = true; return nil }
func awaitSink(t *testing.T, done <-chan struct{}) {
	t.Helper()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("diagnostics blocked caller")
	}
}

func TestStartupLogSinkNeverBlocksProducerOrShutdownOnSlowStorage(t *testing.T) {
	for _, stage := range []string{"open", "write"} {
		t.Run(stage, func(t *testing.T) {
			entered, release := make(chan struct{}), make(chan struct{})
			var once sync.Once
			defer once.Do(func() { close(release) })
			writer := &testLogWriter{}
			sink := NewSink(func() (io.WriteCloser, error) {
				if stage == "open" {
					close(entered)
					<-release
				} else {
					writer.write = func(p []byte) (int, error) {
						close(entered)
						<-release
						writer.write = nil
						return writer.Buffer.Write(p)
					}
				}
				return writer, nil
			})
			sink.Emit(Event{Stage: "process"})
			awaitSink(t, entered)
			returned := make(chan struct{})
			go func() {
				for i := 0; i < MaxEvents*10; i++ {
					sink.Emit(Event{Stage: "editor"})
				}
				sink.Close()
				sink.Emit(Event{})
				close(returned)
			}()
			awaitSink(t, returned)
			select {
			case <-sink.done:
				t.Fatal("storage should still be held")
			default:
			}
			once.Do(func() { close(release) })
			awaitSink(t, sink.Close())
			lines := bytes.Split(bytes.TrimSpace(writer.Bytes()), []byte("\n"))
			if len(lines) > MaxEvents+1 {
				t.Fatalf("unbounded queue: %d", len(lines))
			}
			if !writer.closed {
				t.Fatal("log not closed")
			}
		})
	}
}

func TestStartupLogSinkPersistsEachEventWithoutWaitingForExit(t *testing.T) {
	written := make(chan []byte, 2)
	writer := &testLogWriter{write: func(p []byte) (int, error) { written <- append([]byte(nil), p...); return len(p), nil }}
	sink := NewSink(func() (io.WriteCloser, error) { return writer, nil })
	sink.Emit(Event{Stage: "vault-open", Phase: "begin"})
	select {
	case line := <-written:
		var event Event
		if err := json.Unmarshal(line, &event); err != nil || event.Stage != "vault-open" || event.Phase != "begin" {
			t.Fatalf("invalid incremental event: %s (%v)", line, err)
		}
	case <-time.After(time.Second):
		t.Fatal("event buffered until shutdown")
	}
	awaitSink(t, sink.Close())
}

func TestStartupLogSinkDiscardsEventsOnStorageFailure(t *testing.T) {
	for _, stage := range []string{"open", "write"} {
		t.Run(stage, func(t *testing.T) {
			writes := 0
			writer := &testLogWriter{write: func([]byte) (int, error) { writes++; return 0, errors.New("disk unavailable") }}
			sink := NewSink(func() (io.WriteCloser, error) {
				if stage == "open" {
					return nil, errors.New("denied")
				}
				return writer, nil
			})
			for i := 0; i < 10; i++ {
				sink.Emit(Event{})
			}
			awaitSink(t, sink.Close())
			if stage == "write" && (writes != 1 || !writer.closed) {
				t.Fatalf("failed writer reused: %d", writes)
			}
		})
	}
}
