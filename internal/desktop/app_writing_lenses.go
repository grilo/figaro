package desktop

import (
	"figaro/internal/settings"
	"os"
)

const writingLensesPath = ".config/writing-lenses.json"

func (a *App) readWritingLensesFile() ([]byte, error) {
	data, err := a.readVaultFile(writingLensesPath)
	if os.IsNotExist(err) {
		return nil, nil
	}
	return data, err
}

// WritingLensesLoad reads document preferences without creating a config file.
func (a *App) WritingLensesLoad(document string) (settings.WritingLensesPreferences, error) {
	a.writingStateMu.RLock()
	defer a.writingStateMu.RUnlock()
	data, err := a.readWritingLensesFile()
	if err != nil {
		return settings.DefaultWritingLenses(), err
	}
	_, value, err := settings.ReadWritingLenses(data, document)
	return value, err
}

// WritingLensesSave updates this document's choices through a rooted atomic write.
func (a *App) WritingLensesSave(document string, preferences settings.WritingLensesPreferences) error {
	a.writingStateMu.Lock()
	defer a.writingStateMu.Unlock()
	data, err := a.readWritingLensesFile()
	if err != nil {
		return err
	}
	planned, err := settings.PlanWritingLensesSave(data, document, preferences)
	if err != nil {
		return err
	}
	return a.writeVaultFileAtomic(writingLensesPath, planned, 0600)
}

// WritingLensesApplyAll atomically updates every document and future defaults.
func (a *App) WritingLensesApplyAll(preferences settings.WritingLensesPreferences) error {
	a.writingStateMu.Lock()
	defer a.writingStateMu.Unlock()
	data, err := a.readWritingLensesFile()
	if err != nil {
		return err
	}
	planned, err := settings.PlanWritingLensesApplyAll(data, preferences)
	if err != nil {
		return err
	}
	return a.writeVaultFileAtomic(writingLensesPath, planned, 0600)
}
