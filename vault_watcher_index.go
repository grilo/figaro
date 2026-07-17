package main

import "time"

const internalVaultWriteTTL = 2 * time.Second

// markInternalVaultWriteLocked prevents the native watcher from doing the
// same work again after Figaro atomically saves a known note. The caller must
// hold vaultMu for writing.
func (a *App) markInternalVaultWriteLocked(rel string) {
	if a.internalVaultWrites == nil {
		a.internalVaultWrites = make(map[string]time.Time)
	}
	now := time.Now()
	for path, expiry := range a.internalVaultWrites {
		if !expiry.After(now) {
			delete(a.internalVaultWrites, path)
		}
	}
	a.internalVaultWrites[rel] = now.Add(internalVaultWriteTTL)
}

// consumeInternalVaultWriteLocked reports whether a watcher event belongs to
// a recent Figaro save. The caller must hold vaultMu for writing.
func (a *App) consumeInternalVaultWriteLocked(rel string) bool {
	expiry, ok := a.internalVaultWrites[rel]
	if !ok {
		return false
	}
	delete(a.internalVaultWrites, rel)
	return expiry.After(time.Now())
}
