package links

import (
	"reflect"
	"testing"
)

func TestRewriteMarkdownLinksForMove(t *testing.T) {
	fence := "```"
	source := "[Spec](projects/Spec%20Note.md#overview)\n" +
		"![Spec](projects/Spec%20Note.md)\n" +
		"[release]: projects/Spec%20Note.md \"Spec\"\n" +
		"[[projects/Spec Note|Read]]\n" +
		fence + "md\n[Code](projects/Spec%20Note.md)\n" + fence + "\n"

	got := RewriteMarkdownLinksForMove(source, "notes/source.md", "notes/source.md", "projects/Spec Note.md", "archive/Spec Note.md")
	want := "[Spec](archive/Spec%20Note.md#overview)\n" +
		"![Spec](archive/Spec%20Note.md)\n" +
		"[release]: archive/Spec%20Note.md \"Spec\"\n" +
		"[[archive/Spec Note|Read]]\n" +
		fence + "md\n[Code](projects/Spec%20Note.md)\n" + fence + "\n"
	if got != want {
		t.Fatalf("rewritten links = %q, want %q", got, want)
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
