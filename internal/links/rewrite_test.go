package links

import (
	"reflect"
	"testing"
)

func TestRewriteMarkdownLinksForMove(t *testing.T) {
	fence := "```"
	source := "[Spec](projects/Spec%20Note.md#overview)\n" +
		"![Spec](/projects/Spec%20Note.md)\n" +
		"[release]: projects/Spec%20Note.md \"Spec\"\n" +
		"[[projects/Spec Note|Read]]\n" +
		fence + "md\n[Code](projects/Spec%20Note.md)\n" + fence + "\n"

	got := RewriteMarkdownLinksForMove(source, "notes/source.md", "notes/source.md", "projects/Spec Note.md", "archive/Spec Note.md")
	want := "[Spec](archive/Spec%20Note.md#overview)\n" +
		"![Spec](/archive/Spec%20Note.md)\n" +
		"[release]: archive/Spec%20Note.md \"Spec\"\n" +
		"[[archive/Spec Note|Read]]\n" +
		fence + "md\n[Code](projects/Spec%20Note.md)\n" + fence + "\n"
	if got != want {
		t.Fatalf("rewritten links = %q, want %q", got, want)
	}
}

// A bare image path is read from beside the note (docs/PROMPT.md, Image Path
// Resolution), so every folder may hold its own image1.png.
func TestRewriteMarkdownLinksForMoveResolvesBareImagesBesideTheNote(t *testing.T) {
	embed := "![Image1](image1.png)\n[Note](image1.png)\n"
	cases := []struct {
		name            string
		sourceRel       string
		futureSourceRel string
		oldRel          string
		newRel          string
		want            string
	}{
		{"renaming the embedded image", "Notes/a.md", "Notes/a.md", "Notes/image1.png", "Notes/chart.png", "![Image1](chart.png)\n[Note](image1.png)\n"},
		{"moving the embedded image elsewhere", "Notes/a.md", "Notes/a.md", "Notes/image1.png", "assets/image1.png", "![Image1](../assets/image1.png)\n[Note](image1.png)\n"},
		{"moving a same-named image at the vault root", "Notes/a.md", "Notes/a.md", "image1.png", "assets/image1.png", "![Image1](image1.png)\n[Note](assets/image1.png)\n"},
		{"moving the note away from its image", "Notes/a.md", "Archive/a.md", "Notes/a.md", "Archive/a.md", "![Image1](../Notes/image1.png)\n[Note](image1.png)\n"},
		{"moving the folder that holds both", "Notes/a.md", "Archive/Notes/a.md", "Notes", "Archive/Notes", embed},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			got := RewriteMarkdownLinksForMove(embed, test.sourceRel, test.futureSourceRel, test.oldRel, test.newRel)
			if got != test.want {
				t.Fatalf("rewritten = %q, want %q", got, test.want)
			}
		})
	}

	if targets := MarkdownLinkTargets(embed, "Notes/a.md"); !reflect.DeepEqual(targets, []string{"Notes/image1.png", "image1.png"}) {
		t.Fatalf("targets = %#v, want the embed beside the note and the vault-path link", targets)
	}
}

func TestRewriteMarkdownLinksForMoveLeavesFootnoteDefinitionsAlone(t *testing.T) {
	source := "Tracked.[^1][^Projects]\n\n[^1]: Projects are tracked in the roadmap.\n[^Projects]: Projects/plan.md is the plan.\n[ref]: Projects/plan.md\n"
	want := "Tracked.[^1][^Projects]\n\n[^1]: Projects are tracked in the roadmap.\n[^Projects]: Projects/plan.md is the plan.\n[ref]: Work/plan.md\n"

	if got := RewriteMarkdownLinksForMove(source, "Notes/a.md", "Notes/a.md", "Projects", "Work"); got != want {
		t.Fatalf("rewritten = %q, want %q", got, want)
	}
	if targets := MarkdownLinkTargets(source, "Notes/a.md"); !reflect.DeepEqual(targets, []string{"Projects/plan.md"}) {
		t.Fatalf("targets = %#v, want only the reference definition", targets)
	}
}

func TestRewriteMarkdownLinksForMovePreservesMovedFolderRelativeLinks(t *testing.T) {
	got := RewriteMarkdownLinksForMove(
		"[Guide](./guide.md)\n[Outside](../outside.md)\n",
		"docs/readme.md",
		"archive/docs/readme.md",
		"docs",
		"archive/docs",
	)
	if want := "[Guide](./guide.md)\n[Outside](../../outside.md)\n"; got != want {
		t.Fatalf("rewritten relative links = %q, want %q", got, want)
	}
}

func TestRewriteMarkdownLinksForCopyPreservesInternalAndExternalTargets(t *testing.T) {
	fence := "```"
	got := RewriteMarkdownLinksForCopy(
		"[Nearby](./guide.md)\n"+
			"[Outside](../outside.md#section)\n"+
			"[Vault internal](docs/guide.md)\n"+
			"[Root internal](/docs/guide.md)\n"+
			"[[docs/guide|Copied guide]]\n"+
			"[Web](https://example.com/docs/guide.md)\n"+
			fence+"md\n[Code](../outside.md)\n"+fence+"\n",
		"docs/readme.md",
		"archive/docs/readme.md",
		"docs",
		"archive/docs",
	)
	want := "[Nearby](./guide.md)\n" +
		"[Outside](../../outside.md#section)\n" +
		"[Vault internal](archive/docs/guide.md)\n" +
		"[Root internal](/archive/docs/guide.md)\n" +
		"[[archive/docs/guide|Copied guide]]\n" +
		"[Web](https://example.com/docs/guide.md)\n" +
		fence + "md\n[Code](../outside.md)\n" + fence + "\n"
	if got != want {
		t.Fatalf("copied links = %q, want %q", got, want)
	}
}

func TestMarkdownLinkTargetsMatchesMoveRewriteSyntax(t *testing.T) {
	fence := "```"
	content := "[Relative](../Projects/Spec%20Note.md#overview)\n" +
		"![Root](/assets/image.png?raw=1)\n" +
		"[reference]: ../Projects/Reference.md \"Reference\"\n" +
		"[[Projects/Wiki Note|Read]]\n" +
		"[Anchor](#section)\n" +
		"[External](https://example.com/Projects/Web.md)\n" +
		fence + "md\n[Code](../Projects/Hidden.md)\n" + fence + "\n"

	got := MarkdownLinkTargets(content, "notes/source.md")
	want := []string{
		"Projects/Reference.md",
		"Projects/Spec Note.md",
		"Projects/Wiki Note.md",
		"assets/image.png",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("MarkdownLinkTargets = %#v, want %#v", got, want)
	}
}

func TestMarkdownLinkOccurrencesPreserveAliasFragmentContext(t *testing.T) {
	source := "Before\n[[notes/Target Note#Details|Label]]\n[Other label](<./Target Note.md#Details>)\n```md\n[[Ignored]]\n```\n[Web](https://example.com/Target.md)"
	got := MarkdownLinkOccurrences(source, "notes/source.md")
	want := []MarkdownLinkOccurrence{
		{Target: "notes/Target Note.md", Line: 2, Source: "[[notes/Target Note#Details|Label]]"},
		{Target: "notes/Target Note.md", Line: 3, Source: "[Other label](<./Target Note.md#Details>)"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("occurrences = %#v, want %#v", got, want)
	}
	if targets := MarkdownLinkTargets(source, "notes/source.md"); !reflect.DeepEqual(targets, []string{"notes/Target Note.md"}) {
		t.Fatalf("deduplicated targets = %#v", targets)
	}
}

// The resolution rule shared by the move rewriter, the link index and Vault
// Health (docs/PROMPT.md, Markdown Links and Image Path Resolution).
func TestLinkDestinationTargetResolvesNoteLinksFromTheVaultRootAndBareImagesBesideTheNote(t *testing.T) {
	const source = "Projects/Alpha/plan.md"
	for _, test := range []struct {
		destination string
		image       bool
		want        string
		ok          bool
	}{
		{destination: "Projects/b.md", want: "Projects/b.md", ok: true},
		{destination: "b.md", want: "b.md", ok: true},
		{destination: "./b.md", want: "Projects/Alpha/b.md", ok: true},
		{destination: "../b.md#heading", want: "Projects/b.md", ok: true},
		{destination: "/Inbox.md", want: "Inbox.md", ok: true},
		{destination: "<Spec%20Note.md?x=1>", want: "Spec Note.md", ok: true},
		{destination: "photo.png", image: true, want: "Projects/Alpha/photo.png", ok: true},
		{destination: "assets/photo.png", image: true, want: "Projects/Alpha/assets/photo.png", ok: true},
		{destination: "../assets/photo.png", image: true, want: "Projects/assets/photo.png", ok: true},
		{destination: "/assets/photo.png", image: true, want: "assets/photo.png", ok: true},
		{destination: "photo.png", want: "photo.png", ok: true},
		{destination: "../../../outside.md"},
		{destination: "#heading"},
		{destination: "https://example.com/a.md"},
		{destination: "mailto:hello@example.com"},
		{destination: ""},
	} {
		got, ok := LinkDestinationTarget(test.destination, source, test.image)
		if got != test.want || ok != test.ok {
			t.Errorf("LinkDestinationTarget(%q, image=%v) = %q, %v; want %q, %v", test.destination, test.image, got, ok, test.want, test.ok)
		}
	}
}

func TestWikiLinkTargetAlwaysNamesANoteFromTheVaultRoot(t *testing.T) {
	for _, test := range []struct {
		body string
		want string
		ok   bool
	}{
		{body: "Projects/b", want: "Projects/b.md", ok: true},
		{body: " Projects/b.MD | Read ", want: "Projects/b.MD", ok: true},
		{body: "/Inbox#Today|Inbox", want: "Inbox.md", ok: true},
		{body: "v1.2 Release Notes", want: "v1.2 Release Notes.md", ok: true},
		{body: "Spec%20Note", want: "Spec Note.md", ok: true},
		{body: "#Heading"},
		{body: "|alias only"},
		{body: "../outside"},
		{body: "https://example.com/page"},
	} {
		got, ok := WikiLinkTarget(test.body)
		if got != test.want || ok != test.ok {
			t.Errorf("WikiLinkTarget(%q) = %q, %v; want %q, %v", test.body, got, ok, test.want, test.ok)
		}
	}
	// A heading-only wikilink points at its own note and is no link target.
	if targets := MarkdownLinkTargets("[[#Heading]] and [[Real]]\n", "notes/source.md"); !reflect.DeepEqual(targets, []string{"Real.md"}) {
		t.Fatalf("link targets = %v, want only Real.md", targets)
	}
}
