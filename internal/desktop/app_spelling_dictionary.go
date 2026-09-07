package desktop

import (
	"figaro/internal/settings"
	"os"
)

const spellingDictionaryPath = ".config/spelling-dictionary.json"

func (a *App) readSpellingDictionary() ([]byte, error) {
	data, err := a.readVaultFile(spellingDictionaryPath)
	if os.IsNotExist(err) {
		return nil, nil
	}
	return data, err
}

// SpellingDictionaryLoad reads this vault's accepted words without creating a file.
func (a *App) SpellingDictionaryLoad() ([]string, error) {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()
	data, err := a.readSpellingDictionary()
	if err != nil {
		return nil, err
	}
	_, words, err := settings.ReadSpellingWords(data)
	return words, err
}

// SpellingDictionaryAdd atomically adds one word without rewriting notes or Git refs.
func (a *App) SpellingDictionaryAdd(word string) ([]string, error) {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	data, err := a.readSpellingDictionary()
	if err != nil {
		return nil, err
	}
	next, words, err := settings.AddSpellingWord(data, word)
	if err != nil {
		return nil, err
	}
	if err := a.writeVaultFileAtomic(spellingDictionaryPath, next, 0600); err != nil {
		return nil, err
	}
	return words, nil
}
