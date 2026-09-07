package desktop

import (
	"figaro/internal/activity"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func activityApp(t *testing.T, dir string) *App {
	t.Helper()
	app := NewApp(dir)
	var err error
	app.history, err = NewHistoryService(dir)
	if err != nil {
		t.Fatal(err)
	}
	return app
}
func TestActivityFollowsUncommittedRenameFolderMoveAndMergeAcrossRestart(t *testing.T) {
	for _, kind := range []string{"rename", "folder", "merge"} {
		t.Run(kind, func(t *testing.T) {
			dir := t.TempDir()
			app := activityApp(t, dir)
			source := "Folder/Note.md"
			writeTestFile(t, dir, source, "Earlier meeting.\nKeep this decision.")
			if err := app.history.CommitFile(source); err != nil {
				t.Fatal(err)
			}
			prior, err := app.GetFileActivity(source)
			if err != nil {
				t.Fatal(err)
			}
			revision := prior.Events[0].Revision
			destination := "Folder/Renamed.md"
			var result *SaveFileResult
			switch kind {
			case "rename":
				result, err = app.RenamePath(source, destination)
			case "folder":
				destination = "Archive/Folder/Note.md"
				result, err = app.MovePath("Folder", "Archive")
			case "merge":
				writeTestFile(t, dir, "Archive/Folder/Note.md", "Destination stays.")
				destination = "Archive/Folder/Note (copy).md"
				result, err = app.MergeDirectory("Folder", "Archive")
			}
			if err != nil || !result.Success {
				t.Fatalf("move: %v %v", result, err)
			}
			app = activityApp(t, dir)
			after, err := app.GetFileActivity(destination)
			if err != nil || len(after.Events) == 0 {
				t.Fatalf("activity after restart: %#v %v", after, err)
			}
			if after.Events[after.Lines[0].Event].Revision != revision {
				t.Fatal("rename refreshed the old date")
			}
			writeTestFile(t, dir, destination, "New meeting.\n\nEarlier meeting.\nKeep this decision.")
			if err := app.history.CommitFile(destination); err != nil {
				t.Fatal(err)
			}
			after, err = activityApp(t, dir).GetFileActivity(destination)
			if err != nil {
				t.Fatal(err)
			}
			if after.Events[after.Lines[2].Event].Revision != revision {
				t.Fatal("later commit lost old attribution")
			}
			if kind == "merge" && readTestFile(t, dir, "Archive/Folder/Note.md") != "Destination stays." {
				t.Fatal("collision overwrote destination")
			}
			info, err := os.Stat(filepath.Join(dir, activity.PathsFile))
			if err != nil || (runtime.GOOS != "windows" && info.Mode().Perm() != 0600) {
				t.Fatalf("metadata permissions: %v %v", info, err)
			}
		})
	}
}
func TestActivityMoveCorruptionAndEscapingSymlinkLeaveSourceUntouched(t *testing.T) {
	for _, kind := range []string{"corrupt", "symlink"} {
		t.Run(kind, func(t *testing.T) {
			dir := t.TempDir()
			app := activityApp(t, dir)
			writeTestFile(t, dir, "Note.md", "Keep source.")
			if err := app.history.CommitFile("Note.md"); err != nil {
				t.Fatal(err)
			}
			outside := t.TempDir()
			writeTestFile(t, outside, "private.json", "Outside stays.")
			writeTestFile(t, dir, activity.PathsFile, "{broken")
			if kind == "symlink" {
				if err := os.Remove(filepath.Join(dir, activity.PathsFile)); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(filepath.Join(outside, "private.json"), filepath.Join(dir, activity.PathsFile)); err != nil {
					t.Skip(err)
				}
			}
			result, err := app.RenamePath("Note.md", "New.md")
			if err == nil && result.Success {
				t.Fatal("unsafe rename accepted")
			}
			if readTestFile(t, dir, "Note.md") != "Keep source." || readTestFile(t, outside, "private.json") != "Outside stays." {
				t.Fatal("failure modified source or outside file")
			}
			if _, err := os.Stat(filepath.Join(dir, "New.md")); !os.IsNotExist(err) {
				t.Fatal("destination created")
			}
		})
	}
}
func TestActivityMetadataRollbackRemovesNewSidecarAndRestoresWritingChoices(t *testing.T) {
	dir := t.TempDir()
	app := activityApp(t, dir)
	writeTestFile(t, dir, "Note.md", "Keep source.")
	if err := app.history.CommitFile("Note.md"); err != nil {
		t.Fatal(err)
	}
	saveWritingMoveState(t, app, "Note.md")
	before := readTestFile(t, dir, writingLensesPath)
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	changes, err := app.planDocumentPathMove(root, "Note.md", "New.md")
	if err != nil {
		t.Fatal(err)
	}
	rollback, err := applyWritingPathMove(root, changes)
	if err != nil {
		t.Fatal(err)
	}
	if err := rollback(); err != nil {
		t.Fatal(err)
	}
	if _, err := root.Stat(activity.PathsFile); !os.IsNotExist(err) {
		t.Fatal("rollback retained new identity file")
	}
	if readTestFile(t, dir, writingLensesPath) != before {
		t.Fatal("rollback lost writing choices")
	}
}
