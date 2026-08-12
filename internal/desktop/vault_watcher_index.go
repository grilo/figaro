package desktop

import "time"

const internalVaultWriteTTL = 2 * time.Second

type internalVaultWriteAck struct {
	expiresAt time.Time
	remaining int
}

// markInternalVaultWriteLocked prevents the native watcher from doing the
// same work again after Figaro atomically saves a known note. The caller must
// hold vaultMu for writing.
func (a *App) markInternalVaultWriteLocked(rel string) {
	if a.internalVaultWrites == nil {
		a.internalVaultWrites = make(map[string]internalVaultWriteAck)
	}
	now := time.Now()
	for path, ack := range a.internalVaultWrites {
		if !ack.expiresAt.After(now) {
			delete(a.internalVaultWrites, path)
		}
	}
	ack := a.internalVaultWrites[rel]
	if !ack.expiresAt.After(now) {
		ack.remaining = 0
	}
	ack.remaining++
	ack.expiresAt = now.Add(internalVaultWriteTTL)
	a.internalVaultWrites[rel] = ack
}

// consumeInternalVaultWriteLocked reports whether a watcher event belongs to
// a recent Figaro save. The caller must hold vaultMu for writing.
func (a *App) consumeInternalVaultWriteLocked(rel string) bool {
	ack, ok := a.internalVaultWrites[rel]
	if !ok {
		return false
	}
	if !ack.expiresAt.After(time.Now()) {
		delete(a.internalVaultWrites, rel)
		return false
	}
	ack.remaining--
	if ack.remaining <= 0 {
		delete(a.internalVaultWrites, rel)
	} else {
		a.internalVaultWrites[rel] = ack
	}
	return true
}
