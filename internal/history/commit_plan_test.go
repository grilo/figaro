package history

import (
	"strings"
	"testing"

	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/filemode"
	"github.com/go-git/go-git/v5/plumbing/format/index"
)

func TestSingleFileCommitPlan(t *testing.T) {
	old := gitPathState{exists: true, hash: plumbing.ComputeHash(plumbing.BlobObject, []byte("old")), mode: filemode.Regular}
	fresh := gitPathState{exists: true, hash: plumbing.ComputeHash(plumbing.BlobObject, []byte("new")), mode: filemode.Regular}
	entry := func(name string, value gitPathState) *index.Entry {
		return &index.Entry{Name: name, Hash: value.hash, Mode: value.mode}
	}
	cases := []struct {
		name                   string
		head                   map[string]gitPathState
		entries                []*index.Entry
		target                 gitPathState
		ignored, stage, commit bool
		failure                string
	}{
		{name: "new", head: map[string]gitPathState{}, target: fresh, stage: true, commit: true},
		{name: "clean", head: map[string]gitPathState{"note.md": old}, entries: []*index.Entry{entry("note.md", old)}, target: old},
		{name: "modified", head: map[string]gitPathState{"note.md": old}, entries: []*index.Entry{entry("note.md", old)}, target: fresh, stage: true, commit: true},
		{name: "already staged", head: map[string]gitPathState{"note.md": old}, entries: []*index.Entry{entry("note.md", fresh)}, target: fresh, commit: true},
		{name: "undo staged edit", head: map[string]gitPathState{"note.md": old}, entries: []*index.Entry{entry("note.md", fresh)}, target: old, stage: true},
		{name: "deletion", head: map[string]gitPathState{"note.md": old}, entries: []*index.Entry{entry("note.md", old)}, stage: true, commit: true},
		{name: "ignored", head: map[string]gitPathState{}, target: fresh, ignored: true},
		{name: "unrelated staged addition", head: map[string]gitPathState{}, entries: []*index.Entry{entry("other.md", old)}, target: fresh, failure: "other.md has staged changes"},
		{name: "unrelated staged removal", head: map[string]gitPathState{"other.md": old}, target: fresh, failure: "other.md has staged changes"},
		{name: "conflict", head: map[string]gitPathState{}, entries: []*index.Entry{{Name: "note.md", Stage: 2}}, target: fresh, failure: "unresolved"},
		{name: "sparse target", head: map[string]gitPathState{}, entries: []*index.Entry{{Name: "note.md", SkipWorktree: true}}, target: fresh, failure: "sparse"},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			got, err := planFileCommit("note.md", tt.head, &index.Index{Entries: tt.entries}, tt.target, tt.ignored)
			if tt.failure != "" {
				if err == nil || !strings.Contains(err.Error(), tt.failure) {
					t.Fatalf("error=%v, want %s", err, tt.failure)
				}
				return
			}
			if err != nil || got.stage != tt.stage || got.commit != tt.commit {
				t.Fatalf("plan=%+v err=%v, want stage=%v commit=%v", got, err, tt.stage, tt.commit)
			}
		})
	}
}
