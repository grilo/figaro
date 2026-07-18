package main

import (
	"os"
	"strings"
	"testing"
)

func TestRelationshipsShowBacklinkContextAndOnlyPlainUnlinkedMentions(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "Atlas.md", "# Atlas\n")
	writeTestFile(t, vaultPath, "linked.md", "Before context.\n[Atlas](Atlas.md) is linked here.\nAfter context.\n")
	writeTestFile(t, vaultPath, "mentions.md", "Atlas needs a decision.\n[Atlas](Atlas.md) is already linked, but Atlas appears later.\n```md\nAtlas in code is not a mention.\n```\nAtlas appears again.\n")

	backlinks, err := app.SearchBacklinks("Atlas.md")
	if err != nil {
		t.Fatalf("SearchBacklinks: %v", err)
	}
	if len(backlinks) != 2 {
		t.Fatalf("backlinks = %#v, want both linked notes", backlinks)
	}
	var linked BacklinkResult
	for _, backlink := range backlinks {
		if backlink.Path == "linked.md" {
			linked = backlink
		}
	}
	if linked.MatchText != "Atlas" || !strings.Contains(linked.Context, "Before context.") || !strings.Contains(linked.Context, "After context.") {
		t.Fatalf("backlink context = %#v, want surrounding linked paragraph", linked)
	}

	mentions, err := app.SearchUnlinkedMentions("Atlas.md")
	if err != nil {
		t.Fatalf("SearchUnlinkedMentions: %v", err)
	}
	if len(mentions) != 3 {
		t.Fatalf("mentions = %#v, want every plain-text mention including one beside a link", mentions)
	}
	for _, mention := range mentions {
		if mention.Path != "mentions.md" || mention.MatchText != "Atlas" || strings.Contains(mention.Snippet, "in code") {
			t.Fatalf("unlinked mention = %#v, want a plain-text Atlas occurrence", mention)
		}
	}
}

func TestLinkUnlinkedMentionUsesPreferredStyleAndRefusesStaleLines(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "notes/Target Note.md", "# Target Note\n")
	writeTestFile(t, vaultPath, "source.md", "[Target Note](notes/Target%20Note.md) and Target Note need decisions.\n")

	linked, err := app.LinkUnlinkedMention("source.md", 1, "notes/Target Note.md", "markdown")
	if err != nil || !linked.Success {
		t.Fatalf("LinkUnlinkedMention(markdown) = %#v, %v", linked, err)
	}
	if got := readTestFile(t, vaultPath, "source.md"); got != "[Target Note](notes/Target%20Note.md) and [Target Note](notes/Target%20Note.md) need decisions.\n" {
		t.Fatalf("markdown link result = %q", got)
	}
	mentions, err := app.SearchUnlinkedMentions("notes/Target Note.md")
	if err != nil || len(mentions) != 0 {
		t.Fatalf("linked mention remained discoverable: %#v, %v", mentions, err)
	}

	writeTestFile(t, vaultPath, "source.md", "Target Note needs a decision.\n")
	info, err := os.Stat(vaultPath + "/source.md")
	if err != nil {
		t.Fatal(err)
	}
	app.vaultMu.Lock()
	app.updateVaultIndexFileLocked("source.md", info, "Target Note needs a decision.\n")
	app.vaultMu.Unlock()
	linked, err = app.LinkUnlinkedMention("source.md", 1, "notes/Target Note.md", "wikilink")
	if err != nil || !linked.Success {
		t.Fatalf("LinkUnlinkedMention(wikilink) = %#v, %v", linked, err)
	}
	if got := readTestFile(t, vaultPath, "source.md"); got != "[[notes/Target Note.md|Target Note]] needs a decision.\n" {
		t.Fatalf("wikilink result = %q", got)
	}

	stale, err := app.LinkUnlinkedMention("source.md", 1, "notes/Target Note.md", "wikilink")
	if err != nil || stale.Success || !strings.Contains(stale.Error, "already links") {
		t.Fatalf("stale link action = %#v, %v", stale, err)
	}
}

func TestSearchUnlinkedMentionsMatchesUnicodeNoteTitlesWithoutBreakingByteRanges(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "Café.md", "# Café\n")
	writeTestFile(t, vaultPath, "source.md", "CAFÉ needs a decision.\n")

	mentions, err := app.SearchUnlinkedMentions("Café.md")
	if err != nil || len(mentions) != 1 || mentions[0].LineNum != 1 {
		t.Fatalf("Unicode mention search = %#v, %v", mentions, err)
	}
	linked, err := app.LinkUnlinkedMention("source.md", 1, "Café.md", "markdown")
	if err != nil || !linked.Success {
		t.Fatalf("Unicode LinkUnlinkedMention = %#v, %v", linked, err)
	}
	if got := readTestFile(t, vaultPath, "source.md"); got != "[Café](Caf%C3%A9.md) needs a decision.\n" {
		t.Fatalf("Unicode linked source = %q", got)
	}
}
