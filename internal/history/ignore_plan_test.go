package history

import (
	"os"
	"path/filepath"
	"testing"
)

func TestConfigIgnoreMigrationPreservesOtherRulesAndLineEndings(t *testing.T) {
	for _, tc := range []struct{ source, want string }{
		{"", ""}, {".config/\n", ""},
		{"# own rules\r\n.config/\r\n.config/private.json\r\n*.tmp", "# own rules\r\n.config/private.json\r\n*.tmp"},
		{"notes/.config/\n*.secret\n", "notes/.config/\n*.secret\n"},
	} {
		if got := configHistoryIgnorePlan(tc.source); got != tc.want {
			t.Fatalf("migration %q = %q, want %q", tc.source, got, tc.want)
		}
	}
}

func TestVaultConfigIsEligibleForHistoryWithoutAnAutomaticCommit(t *testing.T) {
	dir := t.TempDir()
	writeHistoryFixture(t, filepath.Join(dir, ".gitignore"), ".config/\n")
	service, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, ".config"), 0700); err != nil {
		t.Fatal(err)
	}
	const path = ".config/writing-lenses.json"
	writeHistoryFixture(t, filepath.Join(dir, path), `{"version":1}`)
	dirty, err := service.HasUncommittedChanges(path)
	if err != nil || !dirty {
		t.Fatalf("config is not trackable: %v, %v", dirty, err)
	}
	if entries, err := service.GetFileHistory(path); err != nil || len(entries) != 0 {
		t.Fatalf("startup committed preferences: %#v, %v", entries, err)
	}
	if err := service.CommitFile(path); err != nil {
		t.Fatal(err)
	}
	entries, err := service.GetFileHistory(path)
	if err != nil || len(entries) != 1 {
		t.Fatalf("config not recorded: %#v, %v", entries, err)
	}
	if got, err := service.GetFileVersion(path, entries[0].Hash); err != nil || got != `{"version":1}` {
		t.Fatalf("config history = %q, %v", got, err)
	}
}
