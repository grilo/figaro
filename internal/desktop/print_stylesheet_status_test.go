package desktop

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseStarterVersionReadsOnlyTheLeadingComment(t *testing.T) {
	for _, tc := range []struct {
		css  string
		want int
	}{
		{"/*\n * Figaro PDF stylesheet\n * figaro-pdf-starter-version: 3\n */\nbody{}", 3},
		{"\ufeff\n  /* figaro-pdf-starter-version:12 */", 12},
		// An upgraded copy carries the old marker inside its migrated section.
		{"/* figaro-pdf-starter-version: 3 */\n/* Migrated overrides */\n/* figaro-pdf-starter-version: 2 */", 3},
		{"body { color: red; }\n/* figaro-pdf-starter-version: 3 */", 0},
		{"/* hand-written print CSS */", 0},
		{"/* figaro-pdf-starter-version: 3", 0},
		{"", 0},
	} {
		if got := parseStarterVersion(tc.css); got != tc.want {
			t.Errorf("parseStarterVersion(%q) = %d, want %d", tc.css, got, tc.want)
		}
	}
}

func TestPrintStylesheetStatusAndUpgradeGuard(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "notes/report.md", "# Report")
	starter, err := loadStarterPrintStylesheet(app.assets)
	if err != nil {
		t.Fatal(err)
	}
	current := parseStarterVersion(string(starter))
	if current < 1 {
		t.Fatalf("bundled starter has no version marker")
	}

	missing, err := app.GetPrintStylesheetStatus("notes/report.md", "missing.css")
	if err != nil || missing.Exists || missing.UpToDate || missing.CurrentVersion != current {
		t.Fatalf("missing stylesheet status = %#v, %v", missing, err)
	}

	writeTestFile(t, vaultPath, "notes/hand.css", "body { color: red; }\n")
	hand, err := app.GetPrintStylesheetStatus("notes/report.md", "hand.css")
	if err != nil || !hand.Exists || hand.Version != 0 || hand.UpToDate {
		t.Fatalf("unmarked stylesheet must remain upgradable: %#v, %v", hand, err)
	}
	writeTestFile(t, vaultPath, "notes/old.css", "/* figaro-pdf-starter-version: 1 */\nbody{}\n")
	old, err := app.GetPrintStylesheetStatus("notes/report.md", "old.css")
	if err != nil || old.Version != 1 || old.UpToDate {
		t.Fatalf("older starter must remain upgradable: %#v, %v", old, err)
	}

	// A current copy, even with the user's own edits, has nothing to upgrade.
	writeTestFile(t, vaultPath, "notes/pdf.css", string(starter)+"\nh1 { color: teal; }\n")
	status, err := app.GetPrintStylesheetStatus("notes/report.md", "pdf.css")
	if err != nil || !status.Exists || status.Version != current || !status.UpToDate {
		t.Fatalf("current starter copy status = %#v, %v", status, err)
	}
	result, err := app.CreateUpgradedPrintStylesheet("notes/report.md", "pdf.css", "pdf-v2.css")
	if err != nil || result.Success {
		t.Fatalf("upgrading a current copy must be refused: %#v, %v", result, err)
	}
	if _, statErr := os.Stat(filepath.Join(vaultPath, "notes", "pdf-v2.css")); !os.IsNotExist(statErr) {
		t.Fatalf("a refused upgrade must not create a file: %v", statErr)
	}

	for _, unsafe := range []string{"../../outside.css", "/abs.css", "https://example.com/x.css"} {
		status, err := app.GetPrintStylesheetStatus("notes/report.md", unsafe)
		if err != nil || status.Exists || status.UpToDate {
			t.Fatalf("unsafe reference %q status = %#v, %v", unsafe, status, err)
		}
	}
}
