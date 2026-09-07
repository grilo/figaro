package desktop

import "sync"

const (
	VaultLoadPending     = "pending"
	VaultLoadDiscovering = "discovering"
	VaultLoadLoading     = "loading"
	VaultLoadFinalizing  = "finalizing"
	VaultLoadReady       = "ready"
	VaultLoadError       = "error"

	vaultLoadEventName     = "vault:load-progress"
	vaultLoadMaxEventCount = 100
)

// VaultLoadStatus is the lock-independent snapshot exposed to the frontend
// while the initial vault index owns vaultMu. Generation lets consumers ignore
// a delayed event from an older rebuild.
type VaultLoadStatus struct {
	Generation int    `json:"generation"`
	Phase      string `json:"phase"`
	Loaded     int    `json:"loaded"`
	Total      int    `json:"total"`
	Error      string `json:"error,omitempty"`
}

type vaultLoadTracker struct {
	mu       sync.RWMutex
	status   VaultLoadStatus
	emitStep int
	lastEmit int
}

func newVaultLoadTracker() *vaultLoadTracker {
	return &vaultLoadTracker{status: VaultLoadStatus{Phase: VaultLoadPending}}
}

func (t *vaultLoadTracker) snapshot() VaultLoadStatus {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.status
}

func (t *vaultLoadTracker) begin() VaultLoadStatus {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.status = VaultLoadStatus{Generation: t.status.Generation + 1, Phase: VaultLoadDiscovering}
	t.emitStep = 1
	t.lastEmit = 0
	return t.status
}

func (t *vaultLoadTracker) progress(generation int, loaded int, total int) (VaultLoadStatus, bool) {
	if total < 0 {
		total = 0
	}
	if loaded < 0 {
		loaded = 0
	}
	if loaded > total {
		loaded = total
	}

	t.mu.Lock()
	defer t.mu.Unlock()
	if t.status.Generation != generation {
		return VaultLoadStatus{}, false
	}
	phaseChanged := t.status.Phase != VaultLoadLoading
	if phaseChanged || t.status.Total != total {
		t.emitStep = vaultLoadEmissionStep(total)
		t.lastEmit = 0
	}
	t.status = VaultLoadStatus{
		Generation: generation,
		Phase:      VaultLoadLoading,
		Loaded:     loaded,
		Total:      total,
	}
	shouldEmit := phaseChanged || loaded == 0 || loaded == total || loaded-t.lastEmit >= t.emitStep
	if shouldEmit {
		t.lastEmit = loaded
	}
	return t.status, shouldEmit
}

func (t *vaultLoadTracker) setPhase(generation int, phase string) (VaultLoadStatus, bool) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.status.Generation != generation {
		return VaultLoadStatus{}, false
	}
	t.status.Phase = phase
	t.status.Error = ""
	return t.status, true
}

func (t *vaultLoadTracker) fail(generation int, loadErr error) (VaultLoadStatus, bool) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.status.Generation != generation {
		return VaultLoadStatus{}, false
	}
	t.status.Phase = VaultLoadError
	if loadErr != nil {
		t.status.Error = loadErr.Error()
	}
	return t.status, true
}

// GetVaultLoadStatus remains responsive while the vault index is being built
// because it deliberately does not acquire vaultMu.
func (a *App) GetVaultLoadStatus() VaultLoadStatus {
	return a.vaultLoad.snapshot()
}

func vaultLoadEmissionStep(total int) int {
	if total <= 0 {
		return 1
	}
	step := (total + vaultLoadMaxEventCount - 1) / vaultLoadMaxEventCount
	if step < 1 {
		return 1
	}
	return step
}

func (a *App) beginVaultLoad() int {
	status := a.vaultLoad.begin()
	a.emitRuntimeEventData(vaultLoadEventName, status)
	return status.Generation
}

func (a *App) reportVaultLoadProgress(generation int, loaded int, total int) {
	status, shouldEmit := a.vaultLoad.progress(generation, loaded, total)
	if shouldEmit {
		a.emitRuntimeEventData(vaultLoadEventName, status)
	}
}

func (a *App) setVaultLoadPhase(generation int, phase string) {
	if status, changed := a.vaultLoad.setPhase(generation, phase); changed {
		a.emitRuntimeEventData(vaultLoadEventName, status)
	}
}

func (a *App) failVaultLoad(generation int, loadErr error) {
	if status, changed := a.vaultLoad.fail(generation, loadErr); changed {
		a.emitRuntimeEventData(vaultLoadEventName, status)
	}
}
