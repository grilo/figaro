package desktop

import (
	"os"
	"testing"
)

func rankedSearch(t *testing.T, app *App, query string, request NoteSearchRequest) *NoteSearchResponse {
	t.Helper()
	response, err := app.SearchNotes(query, request)
	if err != nil {
		t.Fatalf("SearchNotes(%q): %v", query, err)
	}
	return response
}

func TestSearchNotesRanksNaturalMultiWordMatchesAndBestExcerpt(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "Quarter Planning.md", "A generic introduction.\nQuarter appears here.\nThe quarter planning checklist is authoritative.\n")
	writeTestFile(t, vaultPath, "Recent Meeting.md", "quarter planning repeated in body\nquarter planning again\n")
	writeTestFile(t, vaultPath, "Partial.md", "quarter only\n")

	response := rankedSearch(t, app, "quarter planning", NoteSearchRequest{})
	if len(response.Results) != 3 {
		t.Fatalf("results = %#v, want three natural multi-word candidates", response.Results)
	}
	if response.Results[0].Path != "Quarter Planning.md" {
		t.Fatalf("ranked paths = %#v, want title/strong passage first", observableSearchPaths(response.Results))
	}
	if got := response.Results[0].Matches; len(got) != 1 || got[0].Line != 3 || got[0].Text != "The quarter planning checklist is authoritative." {
		t.Fatalf("best excerpt = %#v", got)
	}
	if response.Results[0].MatchCount != 2 {
		t.Fatalf("matching line count = %d, want 2", response.Results[0].MatchCount)
	}
	if response.Results[len(response.Results)-1].Path != "Partial.md" {
		t.Fatalf("partial match did not rank last: %#v", observableSearchPaths(response.Results))
	}
}

func TestSearchNotesSupportsPrefixAndTypoToleranceWithSuggestion(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "Deployment Guide.md", "# Deployment Guide\nProduction rollout procedure.\n")

	prefix := rankedSearch(t, app, "deplo", NoteSearchRequest{Suggest: true})
	if len(prefix.Results) != 1 || prefix.Results[0].Path != "Deployment Guide.md" {
		t.Fatalf("prefix results = %#v", prefix.Results)
	}
	if prefix.Suggestion != "" {
		t.Fatalf("prefix query offered noisy correction %q", prefix.Suggestion)
	}

	typo := rankedSearch(t, app, "deploymnet", NoteSearchRequest{Suggest: true})
	if len(typo.Results) != 1 || typo.Results[0].Path != "Deployment Guide.md" {
		t.Fatalf("typo results = %#v", typo.Results)
	}
	if typo.Suggestion != "deployment" {
		t.Fatalf("suggestion = %q, want deployment", typo.Suggestion)
	}
	if len(typo.Results[0].MatchedTerms) == 0 || typo.Results[0].MatchedTerms[0] != "deployment" {
		t.Fatalf("matched terms = %#v", typo.Results[0].MatchedTerms)
	}
}

func TestSearchNotesMatchesAccentsWithoutWeakeningCaseFilter(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "Café Notes.md", "# Café Notes\nRésumé ideas.\n")

	insensitive := rankedSearch(t, app, "cafe resume", NoteSearchRequest{})
	if len(insensitive.Results) != 1 || insensitive.Results[0].Path != "Café Notes.md" {
		t.Fatalf("accent-insensitive results = %#v", insensitive.Results)
	}
	matchingCase := rankedSearch(t, app, "Cafe", NoteSearchRequest{CaseSensitive: true})
	if len(matchingCase.Results) != 1 {
		t.Fatalf("case-preserving accent result = %#v", matchingCase.Results)
	}
	nonMatchingCase := rankedSearch(t, app, "cafe", NoteSearchRequest{CaseSensitive: true})
	if len(nonMatchingCase.Results) != 0 {
		t.Fatalf("case-sensitive lowercase query matched %#v", nonMatchingCase.Results)
	}
}

func TestSearchNotesUsesSharedRelevanceProfileForLinkTargets(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "Distributed Systems.md", "A short note.\n")
	writeTestFile(t, vaultPath, "Meeting.md", "We discussed distributed systems repeatedly. Distributed systems.\n")

	response := rankedSearch(t, app, "distributed sys", NoteSearchRequest{Profile: "links", Limit: 10})
	if len(response.Results) != 2 {
		t.Fatalf("link results = %#v", response.Results)
	}
	if response.Results[0].Path != "Distributed Systems.md" || !response.Results[0].TitleMatch {
		t.Fatalf("link ranking = %#v, want title target first", response.Results)
	}
	if len(response.Results[0].Matches) != 0 {
		t.Fatalf("link profile unexpectedly transferred body excerpts: %#v", response.Results[0].Matches)
	}
}

func TestSearchNotesTitleFilterExcludesBodyOnlyMatches(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "Named.md", "bodyneedle\n")
	if response := rankedSearch(t, app, "bodyneedle", NoteSearchRequest{TitleOnly: true}); len(response.Results) != 0 {
		t.Fatalf("title-only results = %#v", response.Results)
	}
}
