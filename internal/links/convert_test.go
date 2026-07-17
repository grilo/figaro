package links

import "testing"

func noteSet(paths ...string) func(string) bool {
	known := make(map[string]bool, len(paths))
	for _, path := range paths {
		known[path] = true
	}
	return func(path string) bool { return known[path] }
}

func TestConvertVaultLinksUsesConventionalTargetFirstWikilinks(t *testing.T) {
	exists := noteSet("Welcome.md", "docs/Guide Note.md")
	source := "[Welcome](Welcome.md) and [Guide](docs/Guide%20Note.md#start)."
	got, count := ConvertVaultLinks(source, "index.md", WikiLinkStyle, exists)
	want := "[[Welcome.md|Welcome]] and [[docs/Guide Note.md#start|Guide]]."
	if got != want || count != 2 {
		t.Fatalf("ConvertVaultLinks() = %q, %d; want %q, 2", got, count, want)
	}
}

func TestConvertVaultLinksAddsAFileStemAliasAndRoundTrips(t *testing.T) {
	exists := noteSet("Welcome to my site.md")
	wiki, count := ConvertVaultLinks("[[Welcome to my site.md]]", "index.md", WikiLinkStyle, exists)
	if want := "[[Welcome to my site.md|Welcome to my site]]"; wiki != want || count != 1 {
		t.Fatalf("wiki normalization = %q, %d; want %q, 1", wiki, count, want)
	}
	markdown, count := ConvertVaultLinks(wiki, "index.md", MarkdownLinkStyle, exists)
	if want := "[Welcome to my site](Welcome%20to%20my%20site.md)"; markdown != want || count != 1 {
		t.Fatalf("Markdown round trip = %q, %d; want %q, 1", markdown, count, want)
	}
	wikiAgain, _ := ConvertVaultLinks(markdown, "index.md", WikiLinkStyle, exists)
	if wikiAgain != wiki {
		t.Fatalf("round trip changed semantic wikilink: %q != %q", wikiAgain, wiki)
	}
}

func TestConvertVaultLinksTouchesOnlyExistingVaultNotes(t *testing.T) {
	exists := noteSet("notes/Exists.md")
	source := "[Exists](notes/Exists.md) [Missing](notes/Missing.md) " +
		"[Web](https://example.com/note.md) [Mail](mailto:hello@example.com) " +
		"[Anchor](#part) ![Image](notes/Exists.md) [PDF](manual.pdf)"
	got, count := ConvertVaultLinks(source, "index.md", WikiLinkStyle, exists)
	want := "[[notes/Exists.md|Exists]] [Missing](notes/Missing.md) " +
		"[Web](https://example.com/note.md) [Mail](mailto:hello@example.com) " +
		"[Anchor](#part) ![Image](notes/Exists.md) [PDF](manual.pdf)"
	if got != want || count != 1 {
		t.Fatalf("safe conversion = %q, %d; want %q, 1", got, count, want)
	}
}

func TestConvertVaultLinksPreservesCodeTitlesAndUnresolvedWikilinks(t *testing.T) {
	fence := "```"
	exists := noteSet("notes/Exists.md")
	source := "`[Inline](notes/Exists.md)`\n" +
		fence + "md\n[Code](notes/Exists.md)\n" + fence + "\n" +
		"[Titled](notes/Exists.md \"title\")\n[[notes/Missing.md|Missing]]\n" +
		`\[Escaped](notes/Exists.md) and \[[notes/Exists.md|Escaped]]` + "\n"
	got, count := ConvertVaultLinks(source, "index.md", WikiLinkStyle, exists)
	if got != source || count != 0 {
		t.Fatalf("protected source changed to %q with count %d", got, count)
	}
}

func TestConvertVaultLinksResolvesExplicitRelativeMarkdownTargets(t *testing.T) {
	exists := noteSet("shared/Overview.md")
	got, count := ConvertVaultLinks("[Overview](../shared/Overview.md)", "notes/current.md", WikiLinkStyle, exists)
	if want := "[[shared/Overview.md|Overview]]"; got != want || count != 1 {
		t.Fatalf("relative conversion = %q, %d; want %q, 1", got, count, want)
	}
}
