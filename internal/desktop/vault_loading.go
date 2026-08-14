package desktop

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

// GetVaultLoadStatus remains responsive while the vault index is being built
// because it deliberately does not acquire vaultMu.
func (a *App) GetVaultLoadStatus() VaultLoadStatus {
	a.vaultLoadMu.RLock()
	defer a.vaultLoadMu.RUnlock()
	return a.vaultLoadStatus
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
	a.vaultLoadMu.Lock()
	generation := a.vaultLoadStatus.Generation + 1
	status := VaultLoadStatus{Generation: generation, Phase: VaultLoadDiscovering}
	a.vaultLoadStatus = status
	a.vaultLoadEmitStep = 1
	a.vaultLoadLastEmit = 0
	a.vaultLoadMu.Unlock()
	a.emitRuntimeEventData(vaultLoadEventName, status)
	return generation
}

func (a *App) reportVaultLoadProgress(generation int, loaded int, total int) {
	if total < 0 {
		total = 0
	}
	if loaded < 0 {
		loaded = 0
	}
	if loaded > total {
		loaded = total
	}

	a.vaultLoadMu.Lock()
	if a.vaultLoadStatus.Generation != generation {
		a.vaultLoadMu.Unlock()
		return
	}
	phaseChanged := a.vaultLoadStatus.Phase != VaultLoadLoading
	if phaseChanged || a.vaultLoadStatus.Total != total {
		a.vaultLoadEmitStep = vaultLoadEmissionStep(total)
		a.vaultLoadLastEmit = 0
	}
	a.vaultLoadStatus = VaultLoadStatus{
		Generation: generation,
		Phase:      VaultLoadLoading,
		Loaded:     loaded,
		Total:      total,
	}
	shouldEmit := phaseChanged || loaded == 0 || loaded == total || loaded-a.vaultLoadLastEmit >= a.vaultLoadEmitStep
	if shouldEmit {
		a.vaultLoadLastEmit = loaded
	}
	status := a.vaultLoadStatus
	a.vaultLoadMu.Unlock()

	if shouldEmit {
		a.emitRuntimeEventData(vaultLoadEventName, status)
	}
}

func (a *App) setVaultLoadPhase(generation int, phase string) {
	a.vaultLoadMu.Lock()
	if a.vaultLoadStatus.Generation != generation {
		a.vaultLoadMu.Unlock()
		return
	}
	a.vaultLoadStatus.Phase = phase
	a.vaultLoadStatus.Error = ""
	status := a.vaultLoadStatus
	a.vaultLoadMu.Unlock()
	a.emitRuntimeEventData(vaultLoadEventName, status)
}

func (a *App) failVaultLoad(generation int, loadErr error) {
	a.vaultLoadMu.Lock()
	if a.vaultLoadStatus.Generation != generation {
		a.vaultLoadMu.Unlock()
		return
	}
	a.vaultLoadStatus.Phase = VaultLoadError
	if loadErr != nil {
		a.vaultLoadStatus.Error = loadErr.Error()
	}
	status := a.vaultLoadStatus
	a.vaultLoadMu.Unlock()
	a.emitRuntimeEventData(vaultLoadEventName, status)
}
