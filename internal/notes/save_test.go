package notes

import (
	"errors"
	"testing"
)

type fakeSaveRepository struct {
	version   float64
	exists    bool
	next      float64
	writeErr  error
	writes    []string
	statCalls int
}

func (r *fakeSaveRepository) CurrentVersion() (float64, bool) {
	r.statCalls++
	return r.version, r.exists
}

func (r *fakeSaveRepository) Write(content string) (float64, error) {
	r.writes = append(r.writes, content)
	return r.next, r.writeErr
}

func TestSaveRejectsStaleVersionWithoutWriting(t *testing.T) {
	repository := &fakeSaveRepository{version: 12, exists: true}
	result, err := (Service{Repository: repository}).Save(SaveRequest{
		Content:         "mine",
		ExpectedVersion: 10,
	})

	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if result.Success || result.Error != ConflictError || result.Version != 12 {
		t.Fatalf("unexpected conflict result: %+v", result)
	}
	if len(repository.writes) != 0 {
		t.Fatalf("conflict wrote content: %v", repository.writes)
	}
}

func TestSaveWithoutExpectedVersionSkipsReadAndWrites(t *testing.T) {
	repository := &fakeSaveRepository{next: 13}
	result, err := (Service{Repository: repository}).Save(SaveRequest{Content: "forced"})

	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if !result.Success || result.Version != 13 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if repository.statCalls != 0 {
		t.Fatalf("forced save read current version %d times", repository.statCalls)
	}
	if len(repository.writes) != 1 || repository.writes[0] != "forced" {
		t.Fatalf("unexpected writes: %v", repository.writes)
	}
}

func TestSavePropagatesRepositoryFailure(t *testing.T) {
	want := errors.New("disk full")
	repository := &fakeSaveRepository{writeErr: want}
	_, err := (Service{Repository: repository}).Save(SaveRequest{Content: "body"})
	if !errors.Is(err, want) {
		t.Fatalf("expected %v, got %v", want, err)
	}
}
