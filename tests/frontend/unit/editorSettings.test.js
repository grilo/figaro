const mockSetLineNumbers = jest.fn();
const mockSetMarkdownLint = jest.fn();
const mockSetSpellcheck = jest.fn();
const mockSetMarkdownBlockGuides = jest.fn();
const mockSetEditorTabSize = jest.fn();

jest.mock('../frontend/js/editor.js', () => ({
    getEditorView: jest.fn(() => ({ requestMeasure: jest.fn() })),
    toggleVim: jest.fn().mockResolvedValue(true),
    setLineNumbers: mockSetLineNumbers,
    setMarkdownLint: mockSetMarkdownLint,
    setSpellcheck: mockSetSpellcheck,
    setMarkdownBlockGuides: mockSetMarkdownBlockGuides,
    setEditorTabSize: mockSetEditorTabSize,
}));

import { getAutoCommitEnabled } from '../frontend/js/automation.js';
import { createBackendStub } from '../../../frontend/js/backendContract.js';

function settingsDOM() {
    document.body.innerHTML = `
        <button id="theme-picker-btn"><span id="theme-current-name">Default</span></button>
        <div id="theme-picker-menu"></div>
        <input type="checkbox" id="line-numbers-toggle" checked>
        <input type="checkbox" id="markdown-lint-toggle" checked>
        <input type="checkbox" id="editor-breadcrumbs-toggle">
        <div class="font-size-control">
            <button id="font-size-down">−</button>
            <span id="font-size-value">100%</span>
            <button id="font-size-up">+</button>
        </div>
        <div class="ui-stepper tab-size-control" role="group">
            <button type="button" class="ui-stepper-button tab-size-down" aria-label="Decrease tab size">−</button>
            <input class="ui-stepper-value tab-size-value" type="number" min="2" max="8" step="1" value="4" aria-label="Tab size in spaces">
            <button type="button" class="ui-stepper-button tab-size-up" aria-label="Increase tab size">+</button>
        </div>
        <select id="auto-save-interval">
            <option value="5">5 seconds</option><option value="300">5 minutes</option><option value="0">Off</option>
        </select>
        <input type="checkbox" id="auto-commit-toggle" checked>
    `;
}

async function settle() {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
}

describe('editor settings', () => {
    test('persists editor diagnostics and line numbers, uses the reduced 100% type scale, and saves the single-file auto-commit toggle', async () => {
        const api = {
            ThemeLoad: jest.fn().mockResolvedValue({ theme: 'default', font: 'inter', codeFont: 'theme-mono' }),
            GetThemeCSS: jest.fn().mockResolvedValue({ css: ':root {}' }),
            GetThemes: jest.fn().mockResolvedValue({ themes: [{ id: 'default', name: 'Figaro Dark' }] }),
            VimLoad: jest.fn().mockResolvedValue({ enabled: false }),
            TabSizeLoad: jest.fn().mockResolvedValue({ size: 4 }),
            TabSizeSave: jest.fn().mockResolvedValue({ success: true }),
            LineNumbersLoad: jest.fn().mockResolvedValue({ enabled: false }),
            LineNumbersSave: jest.fn().mockResolvedValue({ success: true }),
            MarkdownLintLoad: jest.fn().mockResolvedValue({ enabled: true }),
            MarkdownLintSave: jest.fn().mockResolvedValue({ success: true }),
            EditorNavigationLoad: jest.fn().mockResolvedValue({ stickyHeadings: true, blockGuides: true, documentOutline: true }),
            EditorNavigationSave: jest.fn().mockResolvedValue({ success: true }),
            SpellcheckLoad: jest.fn().mockResolvedValue({ enabled: true, language: 'en-US' }),
            SpellcheckSave: jest.fn().mockResolvedValue({ success: true }),
            AutoSaveLoad: jest.fn().mockResolvedValue(300),
            AutoSaveSave: jest.fn().mockResolvedValue({ success: true }),
            AutoCommitLoad: jest.fn().mockResolvedValue(true),
            AutoCommitSave: jest.fn().mockResolvedValue({ success: true }),
        };
        window.go = { desktop: { App: createBackendStub(api) } };
        localStorage.clear();
        settingsDOM();

        const { initTheme, initSettingsPanel } = await import('../frontend/js/theme.js');
        await initTheme();
        await initSettingsPanel();
        await settle();

        expect(mockSetLineNumbers).toHaveBeenCalledWith(false);
        expect(mockSetMarkdownLint).toHaveBeenCalledWith(true);
        expect(mockSetSpellcheck).not.toHaveBeenCalled();
        expect(api.SpellcheckLoad).not.toHaveBeenCalled();
        expect(document.getElementById('line-numbers-toggle').checked).toBe(false);
        expect(document.getElementById('markdown-lint-toggle').checked).toBe(true);
        expect(document.getElementById('editor-breadcrumbs-toggle').checked).toBe(false);
        expect(document.getElementById('font-size-value').textContent).toBe('100%');
        expect(document.querySelector('.tab-size-value').value).toBe('4');
        expect(mockSetEditorTabSize).toHaveBeenCalledWith(4);
        expect(document.documentElement.style.getPropertyValue('--font-size-editor')).toBe('16.2px');

        const selects = Array.from(document.querySelectorAll('select'));
        expect(selects).toHaveLength(1);
        expect(document.getElementById('auto-save-interval').classList.contains('select-combobox-native')).toBe(true);
        expect(document.querySelectorAll('.select-combobox-trigger')).toHaveLength(1);
        expect([...document.querySelectorAll('.select-combobox')]
            .every(picker => picker.classList.contains('ui-picker--quiet'))).toBe(true);
        expect(document.querySelector('#auto-commit-toggle').checked).toBe(true);

        document.querySelector('.tab-size-up').click();
        await settle();
        expect(api.TabSizeSave).toHaveBeenCalledWith(5);
        expect(mockSetEditorTabSize).toHaveBeenLastCalledWith(5);
        expect(document.querySelector('.tab-size-value').value).toBe('5');

        const breadcrumbToggle = document.getElementById('editor-breadcrumbs-toggle');
        breadcrumbToggle.checked = true;
        breadcrumbToggle.dispatchEvent(new Event('change', { bubbles: true }));
        expect(localStorage.getItem('showEditorBreadcrumbs')).toBe('true');

        const lineToggle = document.getElementById('line-numbers-toggle');
        lineToggle.checked = true;
        lineToggle.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();
        expect(api.LineNumbersSave).toHaveBeenCalledWith(true);
        expect(mockSetLineNumbers).toHaveBeenLastCalledWith(true);

        const markdownLintToggle = document.getElementById('markdown-lint-toggle');
        markdownLintToggle.checked = false;
        markdownLintToggle.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();
        expect(api.MarkdownLintSave).toHaveBeenCalledWith(false);
        expect(mockSetMarkdownLint).toHaveBeenLastCalledWith(false);

        api.MarkdownLintSave.mockResolvedValueOnce({ success: false, error: 'read-only settings' });
        markdownLintToggle.checked = true;
        markdownLintToggle.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();
        expect(markdownLintToggle.checked).toBe(false);
        expect(mockSetMarkdownLint).toHaveBeenLastCalledWith(false);

        api.LineNumbersSave.mockResolvedValueOnce({ success: false, error: 'read-only settings' });
        lineToggle.checked = false;
        lineToggle.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();
        expect(lineToggle.checked).toBe(true);
        expect(mockSetLineNumbers).toHaveBeenLastCalledWith(true);

        const autoCommit = document.getElementById('auto-commit-toggle');
        autoCommit.checked = false;
        autoCommit.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();
        expect(api.AutoCommitSave).toHaveBeenCalledWith(false);
        expect(getAutoCommitEnabled()).toBe(false);

        api.AutoCommitSave.mockRejectedValueOnce(new Error('read-only settings'));
        autoCommit.checked = true;
        autoCommit.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();
        expect(autoCommit.checked).toBe(false);
        expect(getAutoCommitEnabled()).toBe(false);
        expect(autoCommit.title).toMatch(/could not save auto-commit preference/i);

        const autoSave = document.getElementById('auto-save-interval');
        const autoSaveTrigger = autoSave._figaroCombobox.trigger;
        autoSaveTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        autoSaveTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        autoSaveTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(api.AutoSaveSave).toHaveBeenCalledWith(0);
    });
});
