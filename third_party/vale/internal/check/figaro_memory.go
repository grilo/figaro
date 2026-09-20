package check

import (
	"bytes"
	"crypto/sha256"
	"errors"
	"fmt"
	"github.com/vale-cli/vale/v3/internal/nlp"
	"io/fs"
	"strings"

	"github.com/vale-cli/vale/v3/internal/core"
)

// NewMemoryManager is deliberately restricted to Figaro's pinned standalone rules.
// General Vale configuration, inherited rules and external assets
// need a separate fs.FS-aware adapter before this can become a public library.
func NewMemoryManager(cfg *core.Config, assets fs.FS) (*Manager, error) {
	model := ""
	dictionary, err := fs.ReadFile(assets, "config/dictionaries/harper.dict")
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}
	if err == nil {
		model = fmt.Sprintf("harper-%x", sha256.Sum256(dictionary))
		if err := nlp.RegisterModelReader(model, bytes.NewReader(dictionary)); err != nil {
			return nil, err
		}
	}
	mgr := &Manager{Config: cfg, rules: map[string]Rule{}, scopes: map[string]struct{}{}}
	err = fs.WalkDir(assets, ".", func(path string, d fs.DirEntry, err error) error {
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
		allowed := map[string]bool{"existence": true, "substitution": true, "conditional": true, "consistency": true, "repetition": true, "occurrence": true, "sequence": true}
		kind, _ := generic["extends"].(string)
		if !allowed[kind] || generic["pos"] != nil {
			return fmt.Errorf("unsupported embedded writing rule: %s", path)
		}
		name := strings.ReplaceAll(strings.TrimSuffix(path, ".yml"), "/", ".")
		if requested, _ := generic["model"].(string); kind == "sequence" {
			if requested != "harper" || model == "" {
				return fmt.Errorf("unsupported embedded writing model: %s", requested)
			}
			// Pass the already loaded model to the compiler without changing YAML.
			if cfg.RuleToParams[name] == nil {
				cfg.RuleToParams[name] = map[string]string{}
			}
			cfg.RuleToParams[name]["model"] = model
		}

		if err := mgr.addCheck(body, name, path); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		return nil
	})
	return mgr, err
}
