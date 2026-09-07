package desktop

import "testing"

func TestMentionPathsUsePortableNestedIndexKeysAndRejectUnsafeNotes(t *testing.T) {
	for _, test := range []struct{ name, source, target, wantSource, wantTarget, problem string }{
		{"portable folders", "drafts/source.md", "notes/Target Note.md", "drafts/source.md", "notes/Target Note.md", ""},
		{"Windows folders", `drafts\source.md`, `notes\Target Note.md`, "drafts/source.md", "notes/Target Note.md", ""},
		{"equivalent self", `notes\Target Note.md`, "notes/Target Note.md", "", "", "A note cannot link one of its own mentions"},
		{"source escape", "../source.md", "target.md", "", "", "A Markdown source note is required"},
		{"target escape", "source.md", `..\target.md`, "", "", "A Markdown target note is required"},
		{"absolute target", "source.md", `C:\notes\target.md`, "", "", "A Markdown target note is required"},
		{"non-note", "source.md", "notes/data.json", "", "", "A Markdown target note is required"},
	} {
		t.Run(test.name, func(t *testing.T) {
			source, target, problem := planMentionPaths(test.source, test.target)
			if source != test.wantSource || target != test.wantTarget || problem != test.problem {
				t.Fatalf("plan = (%q, %q, %q), want (%q, %q, %q)", source, target, problem, test.wantSource, test.wantTarget, test.problem)
			}
		})
	}
}
