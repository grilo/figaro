package desktop

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
)

func TestVaultFileIssueClassification(t *testing.T) {
	t.Parallel()

	if issue := vaultFileContentIssue("binary.md", []byte{'a', 0, 'b'}); issue == nil || issue.Code != fileIssueBinary {
		t.Fatalf("binary issue = %+v", issue)
	}
	if issue := vaultFileContentIssue("legacy.md", []byte{0xff, 0xfe, 'a'}); issue == nil || issue.Code != fileIssueUnsupportedEncoding {
		t.Fatalf("encoding issue = %+v", issue)
	}
	if issue := vaultFileContentIssue("valid.md", []byte("café")); issue != nil {
		t.Fatalf("valid UTF-8 issue = %+v", issue)
	}
	if !isDiskFullFailure(syscall.ENOSPC) || !isDiskFullFailure(errors.New("The disk is full")) || isDiskFullFailure(errors.New("permission denied")) {
		t.Fatal("disk-full classification did not preserve platform distinctions")
	}
}

func TestReadFileRejectsOversizedMarkdownBeforeReading(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	path := filepath.Join(vaultPath, "oversized.md")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(maxEditableFileBytes + 1); err != nil {
		file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	result, err := app.ReadFile("oversized.md")
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if result == nil || result.Issue == nil || result.Issue.Code != fileIssueTooLarge {
		t.Fatalf("ReadFile result = %+v", result)
	}
	if result.Content != "" {
		t.Fatal("oversized file unexpectedly returned editor content")
	}
	issues := app.GetVaultFileIssues()
	if len(issues) != 1 || issues[0].Path != "oversized.md" {
		t.Fatalf("issues = %+v", issues)
	}
}

func TestInitialVaultIndexSkipsProblemFilesAndKeepsHealthyNotes(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "healthy.md", "# Healthy\n\nSearchable marker")
	if err := os.WriteFile(filepath.Join(vaultPath, "binary.md"), []byte{'a', 0, 'b'}, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(vaultPath, "legacy.md"), []byte{0xff, 0xfe, 'a'}, 0o644); err != nil {
		t.Fatal(err)
	}
	large, err := os.Create(filepath.Join(vaultPath, "oversized.md"))
	if err != nil {
		t.Fatal(err)
	}
	if err := large.Truncate(maxEditableFileBytes + 1); err != nil {
		large.Close()
		t.Fatal(err)
	}
	if err := large.Close(); err != nil {
		t.Fatal(err)
	}

	app.vaultMu.RLock()
	index, err := app.ensureVaultIndexLocked()
	app.vaultMu.RUnlock()
	if err != nil {
		t.Fatalf("ensureVaultIndexLocked: %v", err)
	}
	if _, found := index.files["healthy.md"]; !found {
		t.Fatal("healthy note was not indexed")
	}
	for _, path := range []string{"binary.md", "legacy.md", "oversized.md"} {
		if _, found := index.files[path]; found {
			t.Fatalf("problem file %q was indexed", path)
		}
	}
	issues := app.GetVaultFileIssues()
	if len(issues) != 3 {
		t.Fatalf("issues = %+v", issues)
	}
	codes := make(map[string]string)
	for _, issue := range issues {
		codes[issue.Path] = issue.Code
	}
	if codes["binary.md"] != fileIssueBinary ||
		codes["legacy.md"] != fileIssueUnsupportedEncoding ||
		codes["oversized.md"] != fileIssueTooLarge {
		t.Fatalf("issue codes = %+v", codes)
	}
}

func TestRecheckVaultFileIssuesClearsResolvedEncodingAndRestoresIndex(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	path := filepath.Join(vaultPath, "legacy.md")
	if err := os.WriteFile(path, []byte{0xff, 0xfe, 'a'}, 0o644); err != nil {
		t.Fatal(err)
	}
	app.vaultMu.RLock()
	_, err := app.ensureVaultIndexLocked()
	app.vaultMu.RUnlock()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("# Recovered\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	issues, err := app.RecheckVaultFileIssues()
	if err != nil {
		t.Fatalf("RecheckVaultFileIssues: %v", err)
	}
	if len(issues) != 0 {
		t.Fatalf("issues after recovery = %+v", issues)
	}
	if _, found := app.vaultIndex.files["legacy.md"]; !found {
		t.Fatal("recovered Markdown was not restored to the warm index")
	}
}

func TestInvalidSettingsArePreservedAndReportedWithoutBlockingStartup(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	settingsPath := filepath.Join(vaultPath, ".config", "settings.json")
	invalid := []byte(`{"theme":`)
	if err := os.WriteFile(settingsPath, invalid, 0o600); err != nil {
		t.Fatal(err)
	}

	app.ensureSettingsDefaults()
	data, err := os.ReadFile(settingsPath)
	if err != nil || !strings.Contains(string(data), `"theme": "default"`) {
		t.Fatalf("recovered settings = %q, %v", data, err)
	}
	backups, err := filepath.Glob(filepath.Join(vaultPath, ".config", "settings.invalid-*.json"))
	if err != nil || len(backups) != 1 {
		t.Fatalf("settings backups = %v, %v", backups, err)
	}
	backup, err := os.ReadFile(backups[0])
	if err != nil || string(backup) != string(invalid) {
		t.Fatalf("preserved settings = %q, %v", backup, err)
	}

	app.vaultMu.RLock()
	_, err = app.ensureVaultIndexLocked()
	app.vaultMu.RUnlock()
	if err != nil {
		t.Fatal(err)
	}
	issues := app.GetVaultFileIssues()
	if len(issues) != 1 || issues[0].Code != fileIssueConfigRecovered {
		t.Fatalf("settings issues = %+v", issues)
	}
	issues, err = app.RecheckVaultFileIssues()
	if err != nil || len(issues) != 0 {
		t.Fatalf("settings issues after check = %+v, %v", issues, err)
	}
}

func TestNullSettingsRecordIsPreservedBeforeDefaults(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	settingsPath := filepath.Join(vaultPath, ".config", "settings.json")
	if err := os.WriteFile(settingsPath, []byte("null"), 0o600); err != nil {
		t.Fatal(err)
	}

	app.ensureSettingsDefaults()
	backups, err := filepath.Glob(filepath.Join(vaultPath, ".config", "settings.invalid-*.json"))
	if err != nil || len(backups) != 1 {
		t.Fatalf("null settings backups = %v, %v", backups, err)
	}
	if issues := app.GetVaultFileIssues(); len(issues) != 1 || issues[0].Code != fileIssueConfigRecovered {
		t.Fatalf("null settings issues = %+v", issues)
	}
}

func TestUnavailableGitHistoryIsReportedWhileNotesRemainWritable(t *testing.T) {
	vaultPath := t.TempDir()
	if err := os.WriteFile(filepath.Join(vaultPath, ".git"), []byte("not a repository"), 0o600); err != nil {
		t.Fatal(err)
	}
	app := NewApp(vaultPath)

	issues := app.GetVaultFileIssues()
	if len(issues) != 1 || issues[0].Code != fileIssueHistoryUnavailable || issues[0].Severity != "warning" {
		t.Fatalf("history issues = %+v", issues)
	}
	saved, err := app.SaveFile("note.md", "# Still safe", 0)
	if err != nil || saved == nil || !saved.Success {
		t.Fatalf("SaveFile = %+v, %v", saved, err)
	}
	if err := app.CommitCurrentFile("note.md"); err == nil {
		t.Fatal("CommitCurrentFile unexpectedly hid unavailable history")
	}
	if err := os.Rename(filepath.Join(vaultPath, ".git"), filepath.Join(vaultPath, ".git.invalid")); err != nil {
		t.Fatal(err)
	}
	issues, err = app.RecheckVaultFileIssues()
	if err != nil || len(issues) != 0 || app.history == nil {
		t.Fatalf("history recovery = %+v, history=%v, err=%v", issues, app.history != nil, err)
	}
}
