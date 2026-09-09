package check

import (
	"fmt"
	"io/fs"
	"strings"

	"github.com/vale-cli/vale/v3/internal/core"
)

// NewMemoryManager is deliberately restricted to Figaro's pinned standalone rules.
// General Vale configuration, inherited rules, dictionaries and external assets
// need a separate fs.FS-aware adapter before this can become a public library.
func NewMemoryManager(cfg *core.Config, assets fs.FS) (*Manager, error) {
	mgr := &Manager{Config: cfg, rules: map[string]Rule{}, scopes: map[string]struct{}{}}
	err := fs.WalkDir(assets, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(path, ".yml") {
			return nil
		}
		body, err := fs.ReadFile(assets, path)
		if err != nil {
			return err
		}
		generic, err := parse(body, path)
		if err != nil {
			return err
		}
		allowed := map[string]bool{"existence": true, "substitution": true, "conditional": true, "consistency": true, "repetition": true, "occurrence": true}
		kind, _ := generic["extends"].(string)
		if !allowed[kind] || generic["pos"] != nil {
			return fmt.Errorf("unsupported embedded writing rule: %s", path)
		}
		name := strings.ReplaceAll(strings.TrimSuffix(path, ".yml"), "/", ".")
		if err := mgr.addCheck(body, name, path); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		return nil
	})
	return mgr, err
}
