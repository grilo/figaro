package desktop

import (
	"os"
	"testing"
)

func TestGetVaultHealthFindsOnlyActionableLocalVaultIssues(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "notes/Exists.md", "# Exists\n")
	writeTestFile(t, vaultPath, "notes/source.md", "\n[Existing](Exists.md)\n[Missing](missing.md)\n![Used asset](../assets/used.png)\n[Outside](https://example.com/path)\n[Mail](mailto:hello@example.com)\n```md\n[Ignored code link](also-missing.md)\n```\n")
	writeTestFile(t, vaultPath, "notes/broken-frontmatter.md", "---\ntitle: unfinished\n# Heading\n")
	writeTestFile(t, vaultPath, "assets/used.png", "used")
	writeTestFile(t, vaultPath, "assets/orphan.jpg", "orphan")
	writeTestFile(t, vaultPath, "one/Duplicate.md", "one")
	writeTestFile(t, vaultPath, "two/Duplicate.md", "two")

	report, err := app.GetVaultHealth()
	if err != nil {
		t.Fatalf("GetVaultHealth: %v", err)
	}
	if len(report.BrokenLinks) != 1 {
		t.Fatalf("broken links = %#v, want only the local missing link", report.BrokenLinks)
	}
	broken := report.BrokenLinks[0]
	if broken.Path != "notes/source.md" || broken.LineNum != 3 || broken.Target != "missing.md" {
		t.Fatalf("broken link = %#v, want notes/source.md:3 -> missing.md", broken)
	}
	if len(report.OrphanAttachments) != 1 || report.OrphanAttachments[0].Path != "assets/orphan.jpg" {
		t.Fatalf("orphan attachments = %#v, want only orphan.jpg", report.OrphanAttachments)
	}
	if len(report.DuplicateNames) != 1 || len(report.DuplicateNames[0].Paths) != 2 ||
		report.DuplicateNames[0].Paths[0] != "one/Duplicate.md" || report.DuplicateNames[0].Paths[1] != "two/Duplicate.md" {
		t.Fatalf("duplicate names = %#v, want the two Duplicate.md files", report.DuplicateNames)
	}
	if len(report.InvalidFrontmatter) != 1 || report.InvalidFrontmatter[0].Path != "notes/broken-frontmatter.md" {
		t.Fatalf("invalid frontmatter = %#v, want unclosed frontmatter", report.InvalidFrontmatter)
	}
}

func TestGetVaultHealthKeepsEmptyGroupsAsArrays(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "Note.md", "# Clean note\n")

	report, err := app.GetVaultHealth()
	if err != nil {
		t.Fatalf("GetVaultHealth: %v", err)
	}
	if report.BrokenLinks == nil || report.OrphanAttachments == nil || report.DuplicateNames == nil || report.SimilarNotes == nil || report.InvalidFrontmatter == nil {
		t.Fatalf("health groups must be non-nil arrays: %#v", report)
	}
}

func TestGetVaultHealthSeparatesRepeatedFilenamesFromPossibleDuplicateNotes(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "monday/shopping-list.md", "milk bread eggs")
	writeTestFile(t, vaultPath, "tuesday/shopping-list.md", "paint brushes tape")
	writeTestFile(t, vaultPath, "notes/InnerSource.md", "An internal collaboration guide.")
	writeTestFile(t, vaultPath, "notes/Inner Source.md", "A separate draft in the same folder.")
	shared := "Architecture teams document ownership boundaries dependencies testing releases security performance"
	writeTestFile(t, vaultPath, "current/ReleaseNotes.md", shared+" delivery")
	writeTestFile(t, vaultPath, "archive/Release Notes.md", shared+" maintenance")
	writeTestFile(t, vaultPath, "monday/TravelPlan.md", "flights hotels beaches museums restaurants tickets packing weather transport")
	writeTestFile(t, vaultPath, "tuesday/Travel Plan.md", "architecture ownership dependencies releases security reviews testing maintenance performance")

	report, err := app.GetVaultHealth()
	if err != nil {
		t.Fatalf("GetVaultHealth: %v", err)
	}
	if len(report.DuplicateNames) != 1 || len(report.DuplicateNames[0].Paths) != 2 {
		t.Fatalf("repeated filenames = %#v, want only the two shopping-list notes", report.DuplicateNames)
	}
	if len(report.SimilarNotes) != 2 {
		t.Fatalf("similar notes = %#v, want same-folder InnerSource and overlapping ReleaseNotes pairs", report.SimilarNotes)
	}
	if report.SimilarNotes[0].Paths[0] != "archive/Release Notes.md" || report.SimilarNotes[0].Paths[1] != "current/ReleaseNotes.md" {
		t.Fatalf("first similar pair = %#v, want cross-folder release notes", report.SimilarNotes[0])
	}
	if report.SimilarNotes[1].Paths[0] != "notes/Inner Source.md" || report.SimilarNotes[1].Paths[1] != "notes/InnerSource.md" {
		t.Fatalf("second similar pair = %#v, want same-folder InnerSource notes", report.SimilarNotes[1])
	}
}
