package startup

import (
	"encoding/json"
	"io"
	"sync"
)

// Sink owns the I/O worker. Opening storage, retention, and every write happen
// here, never on the caller's startup, Wails dispatch, or shutdown thread.
type Sink struct {
	mu     sync.Mutex
	queue  chan Event
	done   chan struct{}
	closed bool
}

func NewSink(open func() (io.WriteCloser, error)) *Sink {
	s := &Sink{queue: make(chan Event, MaxEvents), done: make(chan struct{})}
	go func() {
		defer close(s.done)
		writer, err := open()
		if err == nil {
			defer writer.Close()
		}
		for event := range s.queue {
			if err != nil {
				continue
			}
			data, _ := json.Marshal(event)
			_, err = writer.Write(append(data, '\n'))
		}
	}()
	return s
}

func (s *Sink) Emit(event Event) {
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	select {
	case s.queue <- event:
	default:
	}
}

// Close starts draining and returns a completion signal; the composition root
// chooses a bounded grace period rather than waiting indefinitely for storage.
func (s *Sink) Close() <-chan struct{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.closed {
		s.closed = true
		close(s.queue)
	}
	return s.done
}
