package desktop

import (
	"path/filepath"
	"testing"
	"time"
)

func TestColdVaultIndexPublishesMonotonicLoadProgress(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "alpha.md", "alpha")
	writeTestFile(t, vaultPath, "nested/bravo.md", "bravo")
	writeTestFile(t, vaultPath, "nested/charlie.md", "charlie")

	var statuses []VaultLoadStatus
	app.eventEmitter = func(name string, data ...any) {
		if name != vaultLoadEventName || len(data) != 1 {
			return
		}
		status, ok := data[0].(VaultLoadStatus)
		if !ok {
			t.Fatalf("progress payload has type %T, want VaultLoadStatus", data[0])
		}
		statuses = append(statuses, status)
	}

	if _, err := app.SearchNotes("alpha", NoteSearchRequest{}); err != nil {
		t.Fatalf("build cold vault index: %v", err)
	}

	wantPhases := []string{
		VaultLoadDiscovering,
		VaultLoadLoading,
		VaultLoadFinalizing,
		VaultLoadReady,
	}
	phaseIndex := 0
	lastLoaded := 0
	for _, status := range statuses {
		if status.Loaded < lastLoaded {
			t.Fatalf("load progress moved backward: %d after %d", status.Loaded, lastLoaded)
		}
		lastLoaded = status.Loaded
		if phaseIndex < len(wantPhases) && status.Phase == wantPhases[phaseIndex] {
			phaseIndex++
		}
	}
	if phaseIndex != len(wantPhases) {
		t.Fatalf("observed phases %v, missing ordered phase %q", statuses, wantPhases[phaseIndex])
	}

	status := app.GetVaultLoadStatus()
	if status.Phase != VaultLoadReady || status.Loaded != 3 || status.Total != 3 {
		t.Fatalf("final load status = %+v, want ready 3/3", status)
	}
}

func TestVaultLoadProgressEmissionIsBoundedForLargeVaults(t *testing.T) {
	if got := vaultLoadEmissionStep(10_000); got != 100 {
		t.Fatalf("vaultLoadEmissionStep(10000) = %d, want 100", got)
	}
	if got := vaultLoadEmissionStep(17); got != 1 {
		t.Fatalf("vaultLoadEmissionStep(17) = %d, want 1", got)
	}
}

func TestVaultLoadStartsOnlyWhenExplicitlyRequested(t *testing.T) {
	app, vaultPath := newTestApp(t)
	t.Cleanup(app.stopVaultWatcher)
	writeTestFile(t, vaultPath, "tasks.md", "- requested startup #later\n")
	warmTree, err := app.GetFileTree()
	if err != nil {
		t.Fatalf("warm file tree before StartVaultLoad: %v", err)
	}

	if status := app.GetVaultLoadStatus(); status.Phase != VaultLoadPending {
		t.Fatalf("load phase before StartVaultLoad = %q, want %q", status.Phase, VaultLoadPending)
	}
	if !app.StartVaultLoad() {
		t.Fatal("first StartVaultLoad call did not start the vault work")
	}
	if app.StartVaultLoad() {
		t.Fatal("second StartVaultLoad call started duplicate vault work")
	}

	deadline := time.Now().Add(2 * time.Second)
	for app.GetVaultLoadStatus().Phase != VaultLoadReady && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	status := app.GetVaultLoadStatus()
	if status.Phase != VaultLoadReady || status.Loaded != 1 || status.Total != 1 {
		t.Fatalf("explicit vault load status = %+v, want ready 1/1", status)
	}
	reusedTree, err := app.GetFileTree()
	if err != nil {
		t.Fatalf("file tree after StartVaultLoad: %v", err)
	}
	if len(warmTree) == 0 || &warmTree[0] != &reusedTree[0] {
		t.Fatal("initial vault indexing invalidated the independently warm file-tree cache")
	}
}

func TestColdVaultIndexPublishesLoadError(t *testing.T) {
	app := NewApp(t.TempDir())
	app.vaultPath = filepath.Join(t.TempDir(), "missing-vault")
	var last VaultLoadStatus
	app.eventEmitter = func(name string, data ...any) {
		if name == vaultLoadEventName && len(data) == 1 {
			last, _ = data[0].(VaultLoadStatus)
		}
	}

	if _, err := app.SearchNotes("anything", NoteSearchRequest{}); err == nil {
		t.Fatal("cold index unexpectedly succeeded for a missing vault")
	}
	status := app.GetVaultLoadStatus()
	if status.Phase != VaultLoadError || status.Error == "" {
		t.Fatalf("error load status = %+v, want a descriptive error", status)
	}
	if last != status {
		t.Fatalf("last emitted status = %+v, want %+v", last, status)
	}
}

func TestVaultLoadStatusDoesNotWaitForVaultLock(t *testing.T) {
	app := NewApp(t.TempDir())
	app.vaultMu.Lock()
	defer app.vaultMu.Unlock()

	done := make(chan VaultLoadStatus, 1)
	go func() { done <- app.GetVaultLoadStatus() }()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("GetVaultLoadStatus waited for the main vault lock")
	}
}

func TestInitialFileTreeReadSharesTheVaultReadLock(t *testing.T) {
	app, vaultPath := newTestApp(t)
	writeTestFile(t, vaultPath, "restored.md", "# Restored\n")

	// The initial index owns this same read lock for its complete cold build.
	// GetFileTree must therefore remain a fellow reader rather than queueing a
	// writer which would put the restored workspace behind the index again.
	app.vaultMu.RLock()
	done := make(chan error, 1)
	go func() {
		_, err := app.GetFileTree()
		done <- err
	}()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("GetFileTree while vault read lock held: %v", err)
		}
	case <-time.After(time.Second):
		app.vaultMu.RUnlock()
		t.Fatal("GetFileTree waited for the initial index read lock")
	}
	app.vaultMu.RUnlock()
}
