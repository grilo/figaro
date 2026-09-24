package desktop

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSessionRecordPathIsMachineLocalAndKeyedByVault(t *testing.T) {
	root := t.TempDir()
	first := sessionRecordPath(root, "/vaults/one")
	if filepath.Dir(first) != filepath.Join(root, "figaro", "sessions") || filepath.Ext(first) != ".json" {
		t.Fatalf("unexpected session record location %q", first)
	}
	if first != sessionRecordPath(root, "/vaults/one/") {
		t.Fatal("equivalent vault paths must share one session record")
	}
	if first == sessionRecordPath(root, "/vaults/two") {
		t.Fatal("different vaults must not share a session record")
	}
	if sessionRecordPath("", "/vaults/one") != "" {
		t.Fatal("without a machine-local root the legacy vault record is used")
	}
}

func TestMachineLocalSessionLeavesVaultUntouchedAndMigratesLegacyRecord(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "hello.md", "# Hello")
	legacy := filepath.Join(vaultPath, ".config", "session.json")
	if err := os.WriteFile(legacy, []byte(`{"openTabs":[{"id":"hello.md","type":"file","path":"hello.md"}],"activeTabId":"hello.md"}`), 0600); err != nil {
		t.Fatal(err)
	}
	stateRoot := t.TempDir()
	app.configureSessionStateRoot(stateRoot)

	// The first launch after upgrading restores the previous vault workspace.
	loaded, err := app.LoadSession()
	if err != nil {
		t.Fatalf("LoadSession: %v", err)
	}
	if loaded["activeTabId"] != "hello.md" {
		t.Fatalf("legacy workspace was not restored: %v", loaded)
	}

	legacyBefore, err := os.ReadFile(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := app.SaveSession(map[string]interface{}{"activeTabId": "hello.md", "theme": "dark"}); err != nil {
		t.Fatalf("SaveSession: %v", err)
	}
	legacyAfter, err := os.ReadFile(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if string(legacyAfter) != string(legacyBefore) {
		t.Fatal("saving the session must not write into the synchronized vault")
	}
	record := sessionRecordPath(stateRoot, vaultPath)
	info, err := os.Stat(record)
	if err != nil {
		t.Fatalf("machine-local session record missing: %v", err)
	}
	if info.Mode().Perm() != 0600 {
		t.Fatalf("session record permissions = %v", info.Mode().Perm())
	}
	leftovers, _ := filepath.Glob(filepath.Join(filepath.Dir(record), ".session-*.tmp"))
	if len(leftovers) != 0 {
		t.Fatalf("temporary session files remain: %v", leftovers)
	}

	// The machine-local record now wins over the stale legacy one.
	loaded, err = app.LoadSession()
	if err != nil {
		t.Fatalf("LoadSession after save: %v", err)
	}
	if loaded["theme"] != "dark" {
		t.Fatalf("machine-local record was not preferred: %v", loaded)
	}
}

func TestMachineLocalSessionRecoversFromCorruptRecord(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	stateRoot := t.TempDir()
	app.configureSessionStateRoot(stateRoot)
	record := sessionRecordPath(stateRoot, vaultPath)
	if err := os.MkdirAll(filepath.Dir(record), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(record, []byte(`{"openTabs":[`), 0600); err != nil {
		t.Fatal(err)
	}
	loaded, err := app.LoadSession()
	if err != nil || len(loaded) != 0 {
		t.Fatalf("a truncated session must reset to defaults, got %v, %v", loaded, err)
	}
	data, err := os.ReadFile(record)
	if err != nil || string(data) != "{}" {
		t.Fatalf("corrupt record was not repaired: %q, %v", data, err)
	}
}
