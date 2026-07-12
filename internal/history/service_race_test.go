package history

import (
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"
)

func TestStartAutoCommitConcurrentStop(t *testing.T) {
	service, err := New(t.TempDir())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	service.StartAutoCommit(3600)
	t.Cleanup(func() { service.StartAutoCommit(0) })

	const callers = 16
	start := make(chan struct{})
	var wait sync.WaitGroup
	for range callers {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			service.StartAutoCommit(0)
		}()
	}
	close(start)
	wait.Wait()
	if service.SchedulerActive() {
		t.Fatal("concurrent scheduler stop left the ticker active")
	}
}

func TestRestartStopsThePreviousTicker(t *testing.T) {
	previousProcs := runtime.GOMAXPROCS(1)
	defer runtime.GOMAXPROCS(previousProcs)

	dir := t.TempDir()
	service, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	path := filepath.Join(dir, "note.md")
	if err := os.WriteFile(path, []byte("initial"), 0644); err != nil {
		t.Fatalf("write initial note: %v", err)
	}
	if err := service.CommitFile("note.md"); err != nil {
		t.Fatalf("initial commit: %v", err)
	}
	before, err := service.GetFileHistory("note.md")
	if err != nil {
		t.Fatalf("history before restart: %v", err)
	}

	service.StartAutoCommit(1)
	service.StartAutoCommit(3)
	t.Cleanup(func() { service.StartAutoCommit(0) })
	runtime.Gosched()
	if err := os.WriteFile(path, []byte("changed"), 0644); err != nil {
		t.Fatalf("write changed note: %v", err)
	}

	time.Sleep(1500 * time.Millisecond)
	after, err := service.GetFileHistory("note.md")
	if err != nil {
		t.Fatalf("history after restart: %v", err)
	}
	if len(after) != len(before) {
		t.Fatalf("previous auto-commit ticker remained active: %d -> %d", len(before), len(after))
	}
}
