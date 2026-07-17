package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

func TestPrepareCommitMessageHookAllowsUnchangedProposedMessage(t *testing.T) {
	if runtime.GOOS == "windows" {
		if _, err := exec.LookPath("sh"); err != nil {
			t.Skip("Git shell is not available")
		}
	}

	tempDir := t.TempDir()
	proposal := filepath.Join(tempDir, "proposal")
	message := filepath.Join(tempDir, "COMMIT_EDITMSG")
	want := "fix: make commit handoff frictionless\n\n- preload the reviewed message\n"
	if err := os.WriteFile(proposal, []byte(want), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(message, []byte("# status comments\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	command := exec.Command("sh", filepath.Join(".githooks", "prepare-commit-msg"), message)
	command.Env = append(os.Environ(), "FIGARO_COMMIT_TEMPLATE="+proposal)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("prepare-commit-msg failed: %v\n%s", err, output)
	}
	got, err := os.ReadFile(message)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != want {
		t.Fatalf("message = %q, want %q", got, want)
	}
}

func TestPrepareCommitMessageHookPreservesGitGeneratedMessages(t *testing.T) {
	tempDir := t.TempDir()
	proposal := filepath.Join(tempDir, "proposal")
	message := filepath.Join(tempDir, "COMMIT_EDITMSG")
	if err := os.WriteFile(proposal, []byte("replacement\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(message, []byte("existing amend message\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	command := exec.Command("sh", filepath.Join(".githooks", "prepare-commit-msg"), message, "commit")
	command.Env = append(os.Environ(), "FIGARO_COMMIT_TEMPLATE="+proposal)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("prepare-commit-msg failed: %v\n%s", err, output)
	}
	got, err := os.ReadFile(message)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "existing amend message\n" {
		t.Fatalf("generated message was overwritten: %q", got)
	}
}
