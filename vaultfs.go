package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"figaro/internal/vault"
)

// Vault-specific operations live in internal/vault. These App methods keep the
// Wails-facing service small while binding that generic, root-scoped layer to
// the currently selected vault.

func vaultRelativePath(rel string) (string, error) {
	return vault.RelativePath(rel)
}

func (a *App) openVaultRoot() (*os.Root, error) {
	root, err := os.OpenRoot(a.vaultPath)
	if err != nil {
		return nil, fmt.Errorf("open vault root: %w", err)
	}
	return root, nil
}

// readProjectAsset is only used as a development fallback when an embedded
// frontend asset is unavailable. It is root-scoped for the same reason as
// vault reads: a development checkout must not follow a raced symlink outside
// its working tree.
func readProjectAsset(rel string) ([]byte, error) {
	cleanRel, err := vault.RelativePath(rel)
	if err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(".")
	if err != nil {
		return nil, err
	}
	defer root.Close()
	return root.ReadFile(cleanRel)
}

func (a *App) vaultAbsolutePath(rel string) string {
	if rel == "" || rel == "." {
		return a.vaultPath
	}
	return filepath.Join(a.vaultPath, rel)
}

func (a *App) readVaultFile(rel string) ([]byte, error) {
	cleanRel, err := vault.RelativePath(rel)
	if err != nil {
		return nil, err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	return root.ReadFile(cleanRel)
}

func (a *App) writeVaultFileAtomic(rel string, data []byte, mode os.FileMode) error {
	cleanRel, err := vault.RelativePath(rel)
	if err != nil {
		return err
	}
	root, err := a.openVaultRoot()
	if err != nil {
		return err
	}
	defer root.Close()
	return vault.WriteFileAtomic(root, cleanRel, data, mode)
}

func (a *App) readSettingsFile() (map[string]interface{}, error) {
	data, err := a.readVaultFile(".config/settings.json")
	if os.IsNotExist(err) {
		return make(map[string]interface{}), nil
	}
	if err != nil {
		return nil, err
	}
	settings := make(map[string]interface{})
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil, fmt.Errorf("parse settings: %w", err)
	}
	return settings, nil
}

func (a *App) writeSettingsFile(settings map[string]interface{}) error {
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return a.writeVaultFileAtomic(".config/settings.json", data, 0600)
}

func validateRootPath(root *os.Root, rel string) error {
	return vault.ValidatePath(root, rel)
}

func writeRootFileAtomic(root *os.Root, rel string, data []byte, mode os.FileMode) error {
	return vault.WriteFileAtomic(root, rel, data, mode)
}

func createRootFile(root *os.Root, rel string, data []byte, mode os.FileMode) error {
	return vault.CreateFile(root, rel, data, mode)
}

type vaultMarkdownVisitor = vault.MarkdownVisitor

func (a *App) walkVaultMarkdown(visitor vaultMarkdownVisitor) error {
	root, err := a.openVaultRoot()
	if err != nil {
		return err
	}
	defer root.Close()
	return vault.WalkMarkdown(root, visitor)
}
