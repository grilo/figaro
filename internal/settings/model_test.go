package settings

import (
	"reflect"
	"testing"
)

func TestNormalizeMigratesLegacyValuesWithoutMutatingInput(t *testing.T) {
	input := map[string]any{
		"theme":               " FIGARO-DARK ",
		"spellcheck_language": "es_ES",
		"auto_save_minutes":   float64(7),
		"auto_commit_seconds": float64(0),
		"openTabs":            []any{map[string]any{"id": "note.md"}},
	}

	got, changed := Normalize(input)
	if !changed {
		t.Fatal("Normalize did not report migrated values")
	}
	if got["theme"] != "default" || got["spellcheck_language"] != "es" {
		t.Fatalf("canonical values = %#v", got)
	}
	if got["auto_save_seconds"] != 420 || got["auto_commit_enabled"] != false {
		t.Fatalf("migrated automation values = %#v", got)
	}
	for _, removed := range []string{"auto_save_minutes", "auto_commit_seconds", "openTabs"} {
		if _, exists := got[removed]; exists {
			t.Fatalf("legacy key %q remains in %#v", removed, got)
		}
	}
	if _, exists := input["openTabs"]; !exists {
		t.Fatal("Normalize mutated its input")
	}
}

func TestNormalizeIsStableForCanonicalSettings(t *testing.T) {
	input := Defaults()
	got, changed := Normalize(input)
	if changed {
		t.Fatalf("canonical defaults reported as changed: %#v", got)
	}
	if !reflect.DeepEqual(got, input) {
		t.Fatalf("Normalize(defaults) = %#v, want %#v", got, input)
	}
}

func TestSettingsSelectorsApplyIndependentFallbacks(t *testing.T) {
	theme := Theme(map[string]any{"theme": "zenburn"})
	if theme["theme"] != "zenburn" || theme["font"] != "inter" || theme["codeFont"] != "theme-mono" {
		t.Fatalf("Theme fallback = %#v", theme)
	}
	enabled, language := Spellcheck(map[string]any{"spellcheck": false, "spellcheck_language": "unknown"})
	if enabled || language != "en-US" {
		t.Fatalf("Spellcheck fallback = %v, %q", enabled, language)
	}
}

func TestNavigationDefaultsStayEnabledUnlessExplicitlyDisabled(t *testing.T) {
	for _, key := range []string{"sticky_headings", "markdown_block_guides", "document_outline"} {
		if !Bool(nil, key, true) {
			t.Fatalf("Bool(nil, %q, true) = false", key)
		}
		if Bool(map[string]any{key: false}, key, true) {
			t.Fatalf("explicit false for %q was ignored", key)
		}
	}
}

func TestSpellcheckDefaultsOffUntilExplicitlyEnabled(t *testing.T) {
	enabled, language := Spellcheck(nil)
	if enabled || language != "en-US" {
		t.Fatalf("Spellcheck(nil) = %v, %q; want disabled en-US", enabled, language)
	}
	enabled, language = Spellcheck(map[string]any{"spellcheck": true, "spellcheck_language": "es"})
	if !enabled || language != "es" {
		t.Fatalf("explicit spellcheck preference = %v, %q; want enabled es", enabled, language)
	}
}
