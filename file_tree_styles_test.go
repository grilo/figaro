package main

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestFileTreeStylesPersistRecentIconsAndReset(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	for index := 0; index < 12; index++ {
		path := fmt.Sprintf("note-%02d.md", index)
		writeTestFile(t, vaultPath, path, "# Note\n")
		styles, err := app.SetFileTreeStyle(path, fmt.Sprintf("Icon%d", index), "#3b82f6")
		if err != nil {
			t.Fatalf("SetFileTreeStyle(%q): %v", path, err)
		}
		if styles.Entries[path].Color != "#3b82f6" {
			t.Fatalf("style was not returned after save: %+v", styles.Entries[path])
		}
	}

	styles, err := app.GetFileTreeStyles()
	if err != nil {
		t.Fatalf("GetFileTreeStyles: %v", err)
	}
	wantRecent := []string{"Icon11", "Icon10", "Icon9", "Icon8", "Icon7", "Icon6", "Icon5", "Icon4", "Icon3", "Icon2"}
	if !reflect.DeepEqual(styles.RecentIcons, wantRecent) {
		t.Fatalf("recent icons = %#v, want %#v", styles.RecentIcons, wantRecent)
	}

	if _, err := app.SetFileTreeStyle("note-05.md", "Icon5", "#ec4899"); err != nil {
		t.Fatalf("reuse recent icon: %v", err)
	}
	styles, err = app.GetFileTreeStyles()
	if err != nil {
		t.Fatalf("reload styles: %v", err)
	}
	if styles.RecentIcons[0] != "Icon5" || len(styles.RecentIcons) != 10 {
		t.Fatalf("reused icon was not moved to the front: %#v", styles.RecentIcons)
	}
	if styles.Entries["note-05.md"].Color != "#ec4899" {
		t.Fatalf("persisted color was not reloaded: %+v", styles.Entries["note-05.md"])
	}

	styles, err = app.SetFileTreeStyle("note-05.md", "", "")
	if err != nil {
		t.Fatalf("reset style: %v", err)
	}
	if _, exists := styles.Entries["note-05.md"]; exists {
		t.Fatalf("reset left a path override behind: %+v", styles.Entries)
	}
}

func TestFileTreeStylesFollowRenameCopyAndDelete(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "Projects/plan.md", "# Plan\n")
	if _, err := app.SetFileTreeStyle("Projects", "FolderStar", "#f59e0b"); err != nil {
		t.Fatalf("style folder: %v", err)
	}
	if _, err := app.SetFileTreeStyle("Projects/plan.md", "NotebookTabs", "#14b8a6"); err != nil {
		t.Fatalf("style note: %v", err)
	}

	rename, err := app.RenamePath("Projects", "Work")
	if err != nil || !rename.Success {
		t.Fatalf("RenamePath: result=%+v err=%v", rename, err)
	}
	styles, err := app.GetFileTreeStyles()
	if err != nil {
		t.Fatalf("styles after rename: %v", err)
	}
	if _, stale := styles.Entries["Projects"]; stale {
		t.Fatalf("rename retained stale style paths: %+v", styles.Entries)
	}
	if styles.Entries["Work"].Icon != "FolderStar" || styles.Entries["Work/plan.md"].Icon != "NotebookTabs" {
		t.Fatalf("rename did not move folder subtree styles: %+v", styles.Entries)
	}

	copyResult, err := app.CopyPath("Work", ".")
	if err != nil || !copyResult.Success {
		t.Fatalf("CopyPath: result=%+v err=%v", copyResult, err)
	}
	if copyResult.Path != "Work copy" {
		t.Fatalf("unexpected non-destructive copy path: %+v", copyResult)
	}
	styles, err = app.GetFileTreeStyles()
	if err != nil {
		t.Fatalf("styles after copy: %v", err)
	}
	if styles.Entries["Work copy"].Icon != "FolderStar" || styles.Entries["Work copy/plan.md"].Icon != "NotebookTabs" {
		t.Fatalf("copy did not clone folder subtree styles: %+v", styles.Entries)
	}

	deleted, err := app.DeletePath("Work")
	if err != nil || !deleted.Success {
		t.Fatalf("DeletePath: result=%+v err=%v", deleted, err)
	}
	styles, err = app.GetFileTreeStyles()
	if err != nil {
		t.Fatalf("styles after delete: %v", err)
	}
	if _, exists := styles.Entries["Work"]; exists {
		t.Fatalf("delete retained the folder style: %+v", styles.Entries)
	}
	if _, exists := styles.Entries["Work/plan.md"]; exists {
		t.Fatalf("delete retained a descendant style: %+v", styles.Entries)
	}
	if styles.Entries["Work copy"].Icon != "FolderStar" {
		t.Fatalf("delete removed a sibling copy's style: %+v", styles.Entries)
	}
}

func TestFileTreeStylesPreserveDestinationAndFollowDirectoryMergeCollisions(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)

	writeTestFile(t, vaultPath, "Drafts/report.md", "source report")
	writeTestFile(t, vaultPath, "Drafts/shared/source.md", "source nested")
	writeTestFile(t, vaultPath, "Archive/Drafts/report.md", "destination report")
	writeTestFile(t, vaultPath, "Archive/Drafts/shared/destination.md", "destination nested")

	for path, style := range map[string]FileTreeStyle{
		"Drafts":                   {Icon: "FolderStar", Color: "#f59e0b"},
		"Drafts/report.md":         {Icon: "FileHeart", Color: "#14b8a6"},
		"Drafts/shared":            {Icon: "FolderTree", Color: "#3b82f6"},
		"Archive/Drafts":           {Icon: "FolderLock", Color: "#6b7280"},
		"Archive/Drafts/report.md": {Icon: "Shield", Color: "#ef4444"},
	} {
		if _, err := app.SetFileTreeStyle(path, style.Icon, style.Color); err != nil {
			t.Fatalf("style %q: %v", path, err)
		}
	}

	result, err := app.MergeDirectory("Drafts", "Archive")
	if err != nil || !result.Success {
		t.Fatalf("MergeDirectory: result=%+v err=%v", result, err)
	}
	if got := result.MovedPaths["Drafts/report.md"]; got != "Archive/Drafts/report (copy).md" {
		t.Fatalf("unexpected collision path: %+v", result.MovedPaths)
	}

	styles, err := app.GetFileTreeStyles()
	if err != nil {
		t.Fatalf("GetFileTreeStyles after merge: %v", err)
	}
	for path := range styles.Entries {
		if path == "Drafts" || strings.HasPrefix(path, "Drafts/") {
			t.Fatalf("merge retained stale source style %q: %+v", path, styles.Entries)
		}
	}
	for path, want := range map[string]FileTreeStyle{
		"Archive/Drafts":                  {Icon: "FolderLock", Color: "#6b7280"},
		"Archive/Drafts/report.md":        {Icon: "Shield", Color: "#ef4444"},
		"Archive/Drafts/report (copy).md": {Icon: "FileHeart", Color: "#14b8a6"},
		"Archive/Drafts/shared":           {Icon: "FolderTree", Color: "#3b82f6"},
	} {
		if got := styles.Entries[path]; got != want {
			t.Fatalf("style for %q = %+v, want %+v (all: %+v)", path, got, want, styles.Entries)
		}
	}
}

func TestFileTreeStyleValidationDoesNotOverwriteExistingConfiguration(t *testing.T) {
	app, vaultPath := newTestApp(t)
	defer os.RemoveAll(vaultPath)
	writeTestFile(t, vaultPath, "safe.md", "# Safe\n")

	if _, err := app.SetFileTreeStyle("safe.md", "ShieldCheck", "#22c55e"); err != nil {
		t.Fatalf("save baseline style: %v", err)
	}
	for name, input := range map[string][3]string{
		"unknown color": {"safe.md", "ShieldCheck", "#123456"},
		"unsafe icon":   {"safe.md", "<svg/onload>", "#22c55e"},
		"missing path":  {"missing.md", "File", "#22c55e"},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := app.SetFileTreeStyle(input[0], input[1], input[2]); err == nil {
				t.Fatal("expected style update to be refused")
			}
		})
	}

	styles, err := app.GetFileTreeStyles()
	if err != nil {
		t.Fatalf("GetFileTreeStyles: %v", err)
	}
	if got := styles.Entries["safe.md"]; got != (FileTreeStyle{Icon: "ShieldCheck", Color: "#22c55e"}) {
		t.Fatalf("failed update damaged the existing style: %+v", got)
	}
	if _, err := os.Stat(filepath.Join(vaultPath, fileTreeStylesPath)); err != nil {
		t.Fatalf("style configuration was not persisted adjacent to the vault: %v", err)
	}
}
