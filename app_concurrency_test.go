package main

import (
	"fmt"
	"strings"
	"sync"
	"testing"
)

// These regressions exercise the Wails API boundaries most exposed to
// concurrent frontend calls.

func TestSafePathRejectsVaultTraversal(t *testing.T) {
	app := NewApp(t.TempDir())

	if _, err := app.safePath("../outside.md"); err == nil {
		t.Fatal("safePath accepted a path outside the vault")
	}
}

func TestSaveFileConcurrentStaleMtimeRejectsOneWrite(t *testing.T) {
	app := NewApp(t.TempDir())
	if result, err := app.CreateFile("note.md", "initial"); err != nil || !result.Success {
		t.Fatalf("CreateFile: result=%+v err=%v", result, err)
	}

	initial, err := app.ReadFile("note.md")
	if err != nil || initial == nil {
		t.Fatalf("ReadFile: result=%+v err=%v", initial, err)
	}

	start := make(chan struct{})
	results := make(chan *SaveFileResult, 2)
	errors := make(chan error, 2)
	var wait sync.WaitGroup

	for _, content := range []string{"first writer", "second writer"} {
		wait.Add(1)
		go func(content string) {
			defer wait.Done()
			<-start
			result, saveErr := app.SaveFile("note.md", content, initial.Mtime)
			results <- result
			errors <- saveErr
		}(content)
	}

	close(start)
	wait.Wait()
	close(results)
	close(errors)

	successes := 0
	for result := range results {
		if result != nil && result.Success {
			successes++
		}
	}
	for saveErr := range errors {
		if saveErr != nil {
			t.Fatalf("SaveFile returned an unexpected error: %v", saveErr)
		}
	}

	if successes != 1 {
		t.Fatalf("expected exactly one stale-mtime write to succeed, got %d", successes)
	}
}

func TestConcurrentTaskTagUpdatesPreserveBothChanges(t *testing.T) {
	app := NewApp(t.TempDir())
	if result, err := app.CreateFile("tasks.md", "- first #todo\n- second #wip\n"); err != nil || !result.Success {
		t.Fatalf("CreateFile: result=%+v err=%v", result, err)
	}

	start := make(chan struct{})
	errors := make(chan error, 2)
	var wait sync.WaitGroup
	for _, update := range []struct {
		line int
		from string
		to   string
	}{
		{line: 1, from: "todo", to: "done"},
		{line: 2, from: "wip", to: "review"},
	} {
		wait.Add(1)
		go func(update struct {
			line int
			from string
			to   string
		}) {
			defer wait.Done()
			<-start
			result, err := app.UpdateTaskTag("tasks.md", update.line, update.from, update.to)
			if err == nil && (result == nil || !result.Success) {
				err = fmt.Errorf("unexpected update result: %+v", result)
			}
			errors <- err
		}(update)
	}

	close(start)
	wait.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatalf("UpdateTaskTag: %v", err)
		}
	}

	loaded, err := app.ReadFile("tasks.md")
	if err != nil || loaded == nil {
		t.Fatalf("ReadFile: result=%+v err=%v", loaded, err)
	}
	if !strings.Contains(loaded.Content, "#done") || !strings.Contains(loaded.Content, "#review") {
		t.Fatalf("concurrent updates lost content: %q", loaded.Content)
	}
}
