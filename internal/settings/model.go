// Package settings owns the pure portable-settings schema and migration rules.
// Filesystem persistence remains in the application adapter.
package settings

import (
	"math"
	"strings"

	"figaro/internal/links"
)

const legacyFigaroDarkThemeID = "figaro-dark"

var legacyWorkspaceKeys = []string{
	"openTabs",
	"activeTabId",
	"selectedFilePath",
	"selectedTreePath",
	"expandedDirs",
	"pinnedTabs",
	"cursorStates",
}

func Defaults() map[string]any {
	return map[string]any{
		"theme":               "default",
		"font":                "inter",
		"code_font":           "theme-mono",
		"link_style":          string(links.MarkdownLinkStyle),
		"vim":                 false,
		"vim_visual_rows":     false,
		"vim_reveal_blocks":   false,
		"line_numbers":        false,
		"markdown_lint":       true,
		"spellcheck":          true,
		"spellcheck_language": "en-US",
		"auto_save_seconds":   300,
		"auto_commit_enabled": true,
	}
}

func CanonicalThemeID(themeID string) string {
	normalized := strings.TrimSpace(strings.ToLower(themeID))
	if normalized == legacyFigaroDarkThemeID {
		return "default"
	}
	return normalized
}

func CanonicalSpellcheckLanguage(value string) (string, bool) {
	switch strings.ToLower(strings.ReplaceAll(strings.TrimSpace(value), "_", "-")) {
	case "en", "en-us":
		return "en-US", true
	case "en-gb":
		return "en-GB", true
	case "es", "es-es":
		return "es", true
	default:
		return "", false
	}
}

func nonNegativeWhole(value any) (int, bool) {
	switch number := value.(type) {
	case int:
		return number, number >= 0
	case float64:
		if number < 0 || math.Trunc(number) != number || number > float64(math.MaxInt) {
			return 0, false
		}
		return int(number), true
	default:
		return 0, false
	}
}

func LegacyAutoCommitEnabled(value any) (bool, bool) {
	switch number := value.(type) {
	case int:
		return number != 0, number >= -1
	case float64:
		if math.Trunc(number) != number || number < -1 || number > float64(math.MaxInt) {
			return false, false
		}
		return number != 0, true
	default:
		return false, false
	}
}

// Normalize returns a canonical copy without mutating the supplied map.
func Normalize(input map[string]any) (map[string]any, bool) {
	normalized := make(map[string]any, len(input)+len(Defaults()))
	for key, value := range input {
		normalized[key] = value
	}
	changed := input == nil

	if _, hasSeconds := normalized["auto_save_seconds"]; !hasSeconds {
		if minutes, valid := nonNegativeWhole(normalized["auto_save_minutes"]); valid {
			normalized["auto_save_seconds"] = minutes * 60
			changed = true
		}
	}
	if _, hasEnabled := normalized["auto_commit_enabled"].(bool); !hasEnabled {
		enabled := true
		if legacyValue, exists := normalized["auto_commit_seconds"]; exists {
			if migrated, valid := LegacyAutoCommitEnabled(legacyValue); valid {
				enabled = migrated
			}
		}
		normalized["auto_commit_enabled"] = enabled
		changed = true
	}

	for key, fallback := range Defaults() {
		switch fallbackValue := fallback.(type) {
		case string:
			rawValue, ok := normalized[key].(string)
			value := strings.TrimSpace(rawValue)
			switch key {
			case "theme":
				value = CanonicalThemeID(value)
			case "link_style":
				if style, valid := links.ParseLinkStyle(value); valid {
					value = string(style)
				} else {
					value = ""
				}
			case "spellcheck_language":
				if language, valid := CanonicalSpellcheckLanguage(value); valid {
					value = language
				} else {
					value = ""
				}
			}
			if !ok || value == "" {
				normalized[key] = fallbackValue
				changed = true
			} else if value != rawValue {
				normalized[key] = value
				changed = true
			}
		case bool:
			if _, ok := normalized[key].(bool); !ok {
				normalized[key] = fallbackValue
				changed = true
			}
		case int:
			if _, valid := nonNegativeWhole(normalized[key]); !valid {
				normalized[key] = fallbackValue
				changed = true
			}
		}
	}

	for _, key := range []string{"auto_save_minutes", "auto_commit_seconds"} {
		if _, exists := normalized[key]; exists {
			delete(normalized, key)
			changed = true
		}
	}
	for _, key := range legacyWorkspaceKeys {
		if _, exists := normalized[key]; exists {
			delete(normalized, key)
			changed = true
		}
	}
	return normalized, changed
}

func Theme(values map[string]any) map[string]string {
	theme, _ := values["theme"].(string)
	theme = CanonicalThemeID(theme)
	if theme == "" {
		theme = "default"
	}
	font, _ := values["font"].(string)
	if font == "" {
		font = "inter"
	}
	codeFont, _ := values["code_font"].(string)
	if codeFont == "" {
		codeFont = "theme-mono"
	}
	return map[string]string{"theme": theme, "font": font, "codeFont": codeFont}
}

func Bool(values map[string]any, key string, fallback bool) bool {
	value, ok := values[key].(bool)
	if !ok {
		return fallback
	}
	return value
}

func Spellcheck(values map[string]any) (bool, string) {
	enabled := Bool(values, "spellcheck", true)
	rawLanguage, _ := values["spellcheck_language"].(string)
	language, valid := CanonicalSpellcheckLanguage(rawLanguage)
	if !valid {
		language = "en-US"
	}
	return enabled, language
}

func AutoSaveSeconds(values map[string]any) int {
	if seconds, valid := nonNegativeWhole(values["auto_save_seconds"]); valid {
		return seconds
	}
	if minutes, valid := nonNegativeWhole(values["auto_save_minutes"]); valid {
		return minutes * 60
	}
	return 300
}

func AutoCommitEnabled(values map[string]any) bool {
	if enabled, ok := values["auto_commit_enabled"].(bool); ok {
		return enabled
	}
	if legacy, exists := values["auto_commit_seconds"]; exists {
		if enabled, valid := LegacyAutoCommitEnabled(legacy); valid {
			return enabled
		}
	}
	return true
}
