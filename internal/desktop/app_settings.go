package desktop

import (
	"encoding/json"
	"fmt"
	"log"
	pathpkg "path"
	goruntime "runtime"
	"strings"

	"figaro/internal/pdfexport"
	settingsmodel "figaro/internal/settings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ============================================================================
// 9. Theme Management
// ============================================================================

// ThemeInfo holds a theme's id and display name.
type ThemeInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// embeddedThemeAssetPath builds a logical embed.FS path. These paths are
// always slash-separated, including when the application itself runs on
// Windows, so filepath.Join must not be used here.
func embeddedThemeAssetPath(name string) string {
	return pathpkg.Join("frontend", "themes", name)
}

// GetThemes returns the list of available themes from themes/manifest.json.
func (a *App) GetThemes() (map[string]interface{}, error) {
	path := embeddedThemeAssetPath("manifest.json")
	data, err := assets.ReadFile(path)
	if err != nil {
		data, err = readProjectAsset(path) // fallback for dev mode
		if err != nil {
			return map[string]interface{}{
				"themes": []ThemeInfo{{ID: "default", Name: "Figaro Dark"}},
			}, nil
		}
	}
	var themes []ThemeInfo
	if err := json.Unmarshal(data, &themes); err != nil {
		return map[string]interface{}{
			"themes": []ThemeInfo{{ID: "default", Name: "Figaro Dark"}},
		}, nil
	}
	return map[string]interface{}{"themes": themes}, nil
}

// GetThemeCSS returns the raw CSS for a theme.
func (a *App) GetThemeCSS(themeID string) (map[string]string, error) {
	themeID = settingsmodel.CanonicalThemeID(themeID)
	if !themeIDRe.MatchString(themeID) {
		return nil, fmt.Errorf("invalid theme id")
	}
	path := embeddedThemeAssetPath(themeID + ".css")
	data, err := assets.ReadFile(path)
	if err != nil {
		data, err = readProjectAsset(path) // fallback for dev mode
		if err != nil {
			return map[string]string{"css": ""}, nil
		}
	}
	return map[string]string{"css": string(data)}, nil
}

// ensureSettingsDefaults makes the settings file a real, recoverable config
// record. Older versions could leave workspace-tab data in this file, while a
// missing, empty, or malformed file only happened to work through scattered
// frontend fallbacks.
func (a *App) ensureSettingsDefaults() {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	resetInvalid := false
	if err != nil || settings == nil {
		if err != nil {
			log.Printf("[settings] Resetting invalid settings file: %v", err)
		}
		settings = make(map[string]interface{})
		resetInvalid = true
	}
	normalized, changed := settingsmodel.Normalize(settings)
	if !resetInvalid && !changed {
		return
	}
	if err := a.writeSettingsFile(normalized); err != nil {
		log.Printf("[settings] Could not write normalized settings: %v", err)
	}
}

// PDFBrowserSettingResult describes the optional browser executable selected
// for PDF export. Cancelled is distinct from an invalid executable so the
// settings UI can leave an existing preference untouched.
type PDFBrowserSettingResult struct {
	Success   bool   `json:"success"`
	Cancelled bool   `json:"cancelled,omitempty"`
	Path      string `json:"path,omitempty"`
	Engine    string `json:"engine,omitempty"`
	Error     string `json:"error,omitempty"`
}

// PDFBrowserLoad returns the explicitly configured PDF browser, if any.
// Automatic discovery remains active when Path is empty.
func (a *App) PDFBrowserLoad() (*PDFBrowserSettingResult, error) {
	path, err := a.loadPDFBrowserPath()
	if err != nil {
		return &PDFBrowserSettingResult{Success: false, Error: err.Error()}, nil
	}
	return &PDFBrowserSettingResult{Success: true, Path: path}, nil
}

// PDFBrowserChoose opens the native file chooser, verifies the selected
// executable can run Chromium headless mode, and only then persists it.
func (a *App) PDFBrowserChoose() (*PDFBrowserSettingResult, error) {
	ctx := a.ctx
	if ctx == nil {
		return &PDFBrowserSettingResult{Success: false, Error: "application window is not ready"}, nil
	}
	options := runtime.OpenDialogOptions{Title: "Choose Chrome, Chromium, Edge, or Brave"}
	if goruntime.GOOS == "windows" {
		options.Filters = []runtime.FileFilter{{DisplayName: "Browser executables (*.exe)", Pattern: "*.exe"}}
	}
	selected, err := runtime.OpenFileDialog(ctx, options)
	if err != nil {
		return &PDFBrowserSettingResult{Success: false, Error: fmt.Sprintf("open browser chooser: %v", err)}, nil
	}
	if strings.TrimSpace(selected) == "" {
		return &PDFBrowserSettingResult{Success: false, Cancelled: true}, nil
	}

	browser, err := pdfexport.BrowserForExecutable(ctx, selected)
	if err != nil {
		return &PDFBrowserSettingResult{Success: false, Path: selected, Error: err.Error()}, nil
	}
	if err := pdfexport.ValidateChromiumHeadless(ctx, browser); err != nil {
		log.Printf("[pdf-browser] User-selected executable %q failed real headless startup validation: %v", browser.Executable, err)
		return &PDFBrowserSettingResult{
			Success: false,
			Path:    selected,
			Error:   fmt.Sprintf("selected browser could not start its PDF engine: %v", err),
		}, nil
	}
	if err := a.storePDFBrowserPath(browser.Executable); err != nil {
		return &PDFBrowserSettingResult{Success: false, Path: selected, Error: err.Error()}, nil
	}
	return &PDFBrowserSettingResult{
		Success: true,
		Path:    browser.Executable,
		Engine:  string(browser.Engine),
	}, nil
}

// PDFBrowserClear removes the override and restores automatic discovery.
func (a *App) PDFBrowserClear() (*PDFBrowserSettingResult, error) {
	if err := a.storePDFBrowserPath(""); err != nil {
		return &PDFBrowserSettingResult{Success: false, Error: err.Error()}, nil
	}
	return &PDFBrowserSettingResult{Success: true}, nil
}

// ThemeLoad loads the saved theme from vault/.config/settings.json.
func (a *App) ThemeLoad() (map[string]string, error) {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return settingsmodel.Theme(nil), nil
	}
	return settingsmodel.Theme(settings), nil
}

// ThemeSave saves the selected theme to settings.
func (a *App) ThemeSave(themeID string) (*SaveFileResult, error) {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	settings["theme"] = settingsmodel.CanonicalThemeID(themeID)
	if err := a.writeSettingsFile(settings); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

// FontSave saves the editor font preference to settings.
func (a *App) FontSave(fontID string) (*SaveFileResult, error) {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	settings["font"] = fontID
	if err := a.writeSettingsFile(settings); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

// CodeFontSave saves the separate monospaced font preference used only for
// syntax-highlighted code files. Markdown prose and Markdown code blocks keep
// their existing typography choices.
func (a *App) CodeFontSave(fontID string) (*SaveFileResult, error) {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	settings["code_font"] = fontID
	if err := a.writeSettingsFile(settings); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

// VimLoad loads the vim mode preference.
func (a *App) VimLoad() (map[string]bool, error) {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return map[string]bool{"enabled": false}, nil
	}
	return map[string]bool{"enabled": settingsmodel.Bool(settings, "vim", false)}, nil
}

// VimSave saves the vim mode preference.
func (a *App) VimSave(enabled bool) (*SaveFileResult, error) {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	settings["vim"] = enabled
	if err := a.writeSettingsFile(settings); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

// VimVisualRowsLoad loads the preferred Vim Normal/Visual vertical motion.
// It has no effect until Vim itself is enabled in the editor.
func (a *App) VimVisualRowsLoad() (map[string]bool, error) {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return map[string]bool{"enabled": false}, nil
	}
	return map[string]bool{"enabled": settingsmodel.Bool(settings, "vim_visual_rows", false)}, nil
}

// VimVisualRowsSave persists whether Vim j/k and arrow motions move across
// wrapped display rows rather than source lines.
func (a *App) VimVisualRowsSave(enabled bool) (*SaveFileResult, error) {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	settings["vim_visual_rows"] = enabled
	if err := a.writeSettingsFile(settings); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

// VimRevealBlocksLoad loads whether Vim j/k should enter rendered Markdown
// blocks instead of moving around their replacement widgets.
func (a *App) VimRevealBlocksLoad() (map[string]bool, error) {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return map[string]bool{"enabled": false}, nil
	}
	return map[string]bool{"enabled": settingsmodel.Bool(settings, "vim_reveal_blocks", false)}, nil
}

// VimRevealBlocksSave persists whether Vim j/k should enter rendered Markdown
// blocks instead of moving around their replacement widgets.
func (a *App) VimRevealBlocksSave(enabled bool) (*SaveFileResult, error) {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	settings["vim_reveal_blocks"] = enabled
	if err := a.writeSettingsFile(settings); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

// LineNumbersLoad loads the persisted editor gutter preference.
func (a *App) LineNumbersLoad() (map[string]bool, error) {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return map[string]bool{"enabled": false}, nil
	}
	return map[string]bool{"enabled": settingsmodel.Bool(settings, "line_numbers", false)}, nil
}

// LineNumbersSave saves the editor gutter preference.
func (a *App) LineNumbersSave(enabled bool) (*SaveFileResult, error) {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	settings["line_numbers"] = enabled
	if err := a.writeSettingsFile(settings); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

// MarkdownLintLoad loads the persisted local Markdown diagnostics preference.
// Diagnostics are enabled by default so existing notes retain their current
// feedback unless the user explicitly turns it off.
func (a *App) MarkdownLintLoad() (map[string]bool, error) {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return map[string]bool{"enabled": true}, nil
	}
	return map[string]bool{"enabled": settingsmodel.Bool(settings, "markdown_lint", true)}, nil
}

// MarkdownLintSave persists whether local Markdown diagnostics are displayed.
func (a *App) MarkdownLintSave(enabled bool) (*SaveFileResult, error) {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	settings["markdown_lint"] = enabled
	if err := a.writeSettingsFile(settings); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

// EditorNavigationPreference groups the Markdown navigation aids that work
// together in the editor. Keeping them in one settings record lets the
// frontend apply or roll back a complete, internally consistent snapshot.
type EditorNavigationPreference struct {
	StickyHeadings  bool `json:"stickyHeadings"`
	BlockGuides     bool `json:"blockGuides"`
	DocumentOutline bool `json:"documentOutline"`
}

// EditorNavigationLoad loads the persisted Markdown navigation preferences.
// All three features are on by default for existing vaults.
func (a *App) EditorNavigationLoad() (*EditorNavigationPreference, error) {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		settings = nil
	}
	return &EditorNavigationPreference{
		StickyHeadings:  settingsmodel.Bool(settings, "sticky_headings", true),
		BlockGuides:     settingsmodel.Bool(settings, "markdown_block_guides", true),
		DocumentOutline: settingsmodel.Bool(settings, "document_outline", true),
	}, nil
}

// EditorNavigationSave persists one complete Markdown navigation snapshot.
func (a *App) EditorNavigationSave(stickyHeadings, blockGuides, documentOutline bool) (*SaveFileResult, error) {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	settings["sticky_headings"] = stickyHeadings
	settings["markdown_block_guides"] = blockGuides
	settings["document_outline"] = documentOutline
	if err := a.writeSettingsFile(settings); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	return &SaveFileResult{Success: true}, nil
}

// SpellcheckPreference is the persisted global fallback for Markdown prose.
// Per-document frontmatter may override its language or disable checking.
type SpellcheckPreference struct {
	Enabled  bool   `json:"enabled"`
	Language string `json:"language"`
}

// SpellcheckLoad loads the enabled state and fallback language for offline
// Markdown spellchecking. New and older settings files safely default to off
// with US English retained as the language selected when checking is enabled.
func (a *App) SpellcheckLoad() (*SpellcheckPreference, error) {
	a.settingsMu.RLock()
	defer a.settingsMu.RUnlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return &SpellcheckPreference{Enabled: false, Language: "en-US"}, nil
	}
	enabled, language := settingsmodel.Spellcheck(settings)
	return &SpellcheckPreference{Enabled: enabled, Language: language}, nil
}

// SpellcheckSave persists the global offline spellcheck preference. The
// language validation mirrors the dictionary assets that ship with Figaro.
func (a *App) SpellcheckSave(enabled bool, language string) (*SaveFileResult, error) {
	canonicalLanguage, valid := settingsmodel.CanonicalSpellcheckLanguage(language)
	if !valid {
		return &SaveFileResult{Success: false, Error: "unsupported spellcheck language"}, nil
	}

	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()

	settings, err := a.readSettingsFile()
	if err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	settings["spellcheck"] = enabled
	settings["spellcheck_language"] = canonicalLanguage
	if err := a.writeSettingsFile(settings); err != nil {
		return &SaveFileResult{Success: false, Error: err.Error()}, nil
	}
	return &SaveFileResult{Success: true}, nil
}
