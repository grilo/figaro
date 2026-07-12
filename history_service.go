package main

import backendhistory "figaro/internal/history"

// These aliases retain the Wails-facing API while the Git implementation
// lives in its own cohesive internal package.
type HistoryEntry = backendhistory.Entry
type HistoryService = backendhistory.Service

func NewHistoryService(vaultPath string) (*HistoryService, error) {
	return backendhistory.New(vaultPath)
}
