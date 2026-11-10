package desktop

import (
	"os"
	"reflect"
	"testing"
)

func TestGetVaultHealthFindsOnlyActionableLocalVaultIssues(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "notes/Exists.md", "# Exists\n")
	writeTestFile(t, vaultPath, "notes/source.md", "\n[Existing](notes/Exists.md)\n[Missing](missing.md)\n![Used asset](../assets/used.png)\n[Outside](https://example.com/path)\n[Mail](mailto:hello@example.com)\n```md\n[Ignored code link](also-missing.md)\n```\n")
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

func TestGetVaultHealthCachesAnUnchangedIndexAndInvalidatesAfterSave(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "Note.md", "[Missing](missing.md)\n")

	first, err := app.GetVaultHealth()
	if err != nil {
		t.Fatal(err)
	}
	second, err := app.GetVaultHealth()
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatal("unchanged vault health did not reuse its cached report")
	}
	result, err := app.SaveFile("Note.md", "# Fixed\n", 0)
	if err != nil || !result.Success {
		t.Fatalf("SaveFile: result=%+v err=%v", result, err)
	}
	third, err := app.GetVaultHealth()
	if err != nil {
		t.Fatal(err)
	}
	if third == second || len(third.BrokenLinks) != 0 {
		t.Fatalf("health cache remained stale after save: %#v", third)
	}
}

// Links are checked by the app's one resolution rule (internal/links): a note
// link or wikilink names a path from the vault root unless it starts with "./"
// or "../", and a bare image embed names a file beside its note.
func TestGetVaultHealthResolvesNestedNoteLinksFromTheVaultRoot(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "Inbox.md", "# Inbox\n")
	writeTestFile(t, vaultPath, "Projects/b.md", "# B\n")
	writeTestFile(t, vaultPath, "Projects/v1.2 Notes.md", "# Release\n")
	writeTestFile(t, vaultPath, "Projects/Alpha/sibling.md", "# Sibling\n")
	writeTestFile(t, vaultPath, "Projects/Alpha/photo.png", "beside the note")
	writeTestFile(t, vaultPath, "Projects/Alpha/img/diagram.svg", "below the note")
	writeTestFile(t, vaultPath, "Projects/shared.pdf", "one folder up")
	writeTestFile(t, vaultPath, "assets/root.png", "from the vault root")
	writeTestFile(t, vaultPath, "assets/linked.pdf", "linked, not embedded")
	writeTestFile(t, vaultPath, "assets/unused.png", "never referenced")
	writeTestFile(t, vaultPath, "Projects/Alpha/plan.md",
		"[Vault path](Projects/b.md)\n"+ // 1
			"[Root](/Inbox.md)\n"+ // 2
			"[Beside](./sibling.md)\n"+ // 3
			"[Up](../b.md#section)\n"+ // 4
			"[[Projects/b]] [[Projects/v1.2 Notes|Release]] [[/Inbox]] [[#Local heading]]\n"+ // 5
			"![Beside](photo.png) ![Below](img/diagram.svg)\n"+ // 6
			"![Up](../shared.pdf) ![Root](/assets/root.png)\n"+ // 7
			"[Linked file](assets/linked.pdf)\n"+ // 8
			"[Bare sibling](sibling.md)\n"+ // 9
			"[[sibling]]\n"+ // 10
			"![Not beside](assets/root.png)\n"+ // 11
			"[Not at the root](./Inbox.md)\n") // 12

	report, err := app.GetVaultHealth()
	if err != nil {
		t.Fatalf("GetVaultHealth: %v", err)
	}
	type broken struct {
		line   int
		target string
	}
	got := make([]broken, 0, len(report.BrokenLinks))
	for _, issue := range report.BrokenLinks {
		if issue.Path != "Projects/Alpha/plan.md" {
			t.Fatalf("broken link reported in %q: %#v", issue.Path, issue)
		}
		got = append(got, broken{line: issue.LineNum, target: issue.Target})
	}
	want := []broken{
		{line: 9, target: "sibling.md"},
		{line: 10, target: "sibling"},
		{line: 11, target: "assets/root.png"},
		{line: 12, target: "./Inbox.md"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("broken links = %+v, want only the four that resolve nowhere: %+v", got, want)
	}
	if len(report.OrphanAttachments) != 1 || report.OrphanAttachments[0].Path != "assets/unused.png" {
		t.Fatalf("orphan attachments = %#v, want only assets/unused.png", report.OrphanAttachments)
	}
}
