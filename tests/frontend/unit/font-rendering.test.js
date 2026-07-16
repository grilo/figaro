/**
 * Font Rendering Integration Tests
 * Verifies that fonts actually render when applied (not just CSS variable changes)
 */
import { testUtils } from './test_setup.js';
import { readFileSync } from 'node:fs';

// Mock editor with querySelector for direct DOM manipulation
const mockCmEditor = document.createElement('div');
mockCmEditor.className = 'cm-editor';
const mockCmContent = document.createElement('div');
mockCmContent.className = 'cm-content';
const mockCmLine = document.createElement('div');
mockCmLine.className = 'cm-line';
mockCmLine.textContent = 'Hello World';
mockCmContent.appendChild(mockCmLine);
mockCmEditor.appendChild(mockCmContent);

// Mock getEditorView
const mockEditorView = {
    dom: mockCmEditor,
    requestMeasure: jest.fn(),
};
jest.mock('../frontend/js/editor.js', () => ({
    getEditorView: jest.fn(() => mockEditorView),
    toggleVim: jest.fn(() => Promise.resolve(true)),
}));

// Mock API
const mockApi = {
    theme_load: jest.fn(() => Promise.resolve({ theme: 'default', font: 'inter' })),
    font_save: jest.fn(() => Promise.resolve({ success: true })),
    get_theme_css: jest.fn(() => Promise.resolve({ css: ':root { --bg-color: #111; }' })),
    theme_save: jest.fn(() => Promise.resolve({ success: true })),
    get_themes: jest.fn(() => Promise.resolve({ themes: [{ id: 'default', name: 'Figaro Dark' }] })),
    vim_load: jest.fn(() => Promise.resolve({ enabled: false })),
};

beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
    window.pywebview = { api: mockApi };
    document.head.innerHTML = '';
    document.body.innerHTML = `
        <button id="font-picker-btn"><span id="font-current-name">Inter</span></button>
        <div id="font-picker-menu"></div>
        <button id="theme-picker-btn"><span id="theme-current-name">Default</span></button>
        <div id="theme-picker-menu"></div>
    `;
    document.body.appendChild(mockCmEditor);
    document.documentElement.style.removeProperty('--font-editor');
    document.documentElement.style.removeProperty('--font-ui');
});

async function loadThemeModule() {
    return await import('../frontend/js/theme.js');
}

describe('Font Rendering', () => {
    test('Injected style element contains correct font-family', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        const items = document.querySelectorAll('.font-picker-item');
        const figtree = Array.from(items).find(i => i.dataset.id === 'figtree');
        figtree.click();

        await new Promise(r => setTimeout(r, 300));
        const style = document.getElementById('dynamic-font-style');
        expect(style).toBeTruthy();
        expect(style.textContent).toContain("font-family: 'Figtree'");
        expect(style.textContent).toContain('!important');
    });

    test('Editor DOM elements get inline fontFamily set', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        const items = document.querySelectorAll('.font-picker-item');
        const figtree = Array.from(items).find(i => i.dataset.id === 'figtree');
        figtree.click();

        await new Promise(r => setTimeout(r, 300));
        // Check that the DOM elements have inline style set
        expect(mockCmEditor.style.fontFamily).toContain('Figtree');
        expect(mockCmContent.style.fontFamily).toContain('Figtree');
        expect(mockCmLine.style.fontFamily).toContain('Figtree');
    });

    test('requestMeasure is called after font change', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        const items = document.querySelectorAll('.font-picker-item');
        const ibm = Array.from(items).find(i => i.dataset.id === 'ibm-plex-sans');
        ibm.click();

        await new Promise(r => setTimeout(r, 300));
        expect(mockEditorView.requestMeasure).toHaveBeenCalled();
    });

    test('CSS variable --font-editor is set', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        const items = document.querySelectorAll('.font-picker-item');
        const figtree = Array.from(items).find(i => i.dataset.id === 'figtree');
        figtree.click();

        await new Promise(r => setTimeout(r, 300));
        expect(document.documentElement.style.getPropertyValue('--font-editor')).toContain('Figtree');
    });

    test('UI font variable follows the setting so dialogs and context menus inherit it', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        const items = document.querySelectorAll('.font-picker-item');
        Array.from(items).find(i => i.dataset.id === 'figtree').click();
        await new Promise(r => setTimeout(r, 300));

        expect(document.documentElement.style.getPropertyValue('--font-ui')).toContain('Figtree');
    });

    test('overlay surfaces use the UI font variable', () => {
        const stylesheet = readFileSync('frontend/styles.css', 'utf8');
        expect(stylesheet).toMatch(/\.context-menu\s*\{[^}]*font-family:\s*var\(--font-ui\)/s);
        expect(stylesheet).toMatch(/\.custom-modal\s*\{[^}]*font-family:\s*var\(--font-ui\)/s);
    });

    test('Font family string includes fallback', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        const items = document.querySelectorAll('.font-picker-item');
        const figtree = Array.from(items).find(i => i.dataset.id === 'figtree');
        figtree.click();

        await new Promise(r => setTimeout(r, 300));
        const value = document.documentElement.style.getPropertyValue('--font-editor');
        // Must include a fallback
        expect(value).toContain('var(--font-sans)');
    });
});
