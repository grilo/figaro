package desktop

import (
	"figaro/internal/settings"
	"os"
)

const writingDecisionsPath = ".config/writing-decisions.json"

func (a *App) readWritingDecisionsFile() ([]byte, error) {
	data, err := a.readVaultFile(writingDecisionsPath)
	if os.IsNotExist(err) {
		return nil, nil
	}
	return data, err
}

func (a *App) WritingDecisionsLoad(document string) ([]settings.WritingDecision, error) {
	a.writingStateMu.RLock()
	defer a.writingStateMu.RUnlock()
	data, err := a.readWritingDecisionsFile()
	if err != nil {
		return nil, err
	}
	_, values, err := settings.ReadWritingDecisions(data, document)
	return values, err
}

func (a *App) WritingDecisionsChange(document string, command settings.WritingDecisionChange) ([]settings.WritingDecision, error) {
	a.writingStateMu.Lock()
	defer a.writingStateMu.Unlock()
	data, err := a.readWritingDecisionsFile()
	if err != nil {
		return nil, err
	}
	planned, values, err := settings.PlanWritingDecisionChange(data, document, command)
	if err != nil {
		return nil, err
	}
	if err := a.writeVaultFileAtomic(writingDecisionsPath, planned, 0600); err != nil {
		return nil, err
	}
	return values, nil
}
