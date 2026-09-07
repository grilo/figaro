/**
 * Font application component tests. The production-bundle browser smoke owns
 * actual FontFace loading; these cases keep DOM styling and editor measurement deterministic.
 */
import { testUtils } from './test_setup.js';
import { readFileSync } from 'node:fs';
import { createBackendStub } from '../../../frontend/js/backendContract.js';

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
    setEditorTabSize: jest.fn(),
}));

// Mock API
const mockApi = {
    ThemeLoad: jest.fn(() => Promise.resolve({ theme: 'default', font: 'inter' })),
    FontSave: jest.fn(() => Promise.resolve({ success: true })),
    GetThemeCSS: jest.fn(() => Promise.resolve({ css: ':root { --bg-color: #111; }' })),
    ThemeSave: jest.fn(() => Promise.resolve({ success: true })),
    GetThemes: jest.fn(() => Promise.resolve({ themes: [{ id: 'default', name: 'Figaro Dark' }] })),
    VimLoad: jest.fn(() => Promise.resolve({ enabled: false })),
};

let animationFrame;

beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
    window.go = { desktop: { App: createBackendStub(mockApi) } };
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
    animationFrame = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
        callback(performance.now());
        return 1;
    });
});

afterEach(() => animationFrame.mockRestore());

async function loadThemeModule() {
    return await import('../frontend/js/theme.js');
}

function chooseFont(fontId) {
    const items = [...document.querySelectorAll('.font-picker-item')];
    const target = items.find(item => item.dataset.id === fontId);
    if (target?.getAttribute('aria-selected') === 'true') {
        items.find(item => item !== target)?.click();
    }
    target?.click();
    return target;
}

async function settleFontSelection() {
    await Promise.resolve();
    await Promise.resolve();
}

describe('Font Rendering', () => {
    test('Injected style element contains correct font-family', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        chooseFont('figtree');

        await settleFontSelection();
        const style = document.getElementById('dynamic-font-style');
        expect(style).toBeTruthy();
        expect(style.textContent).toContain("font-family: 'Figtree'");
        expect(style.textContent).toContain('!important');
    });

    test('Editor DOM elements get inline fontFamily set', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        chooseFont('figtree');

        await settleFontSelection();
        // Check that the DOM elements have inline style set
        expect(mockCmEditor.style.fontFamily).toContain('Figtree');
        expect(mockCmContent.style.fontFamily).toContain('Figtree');
        expect(mockCmLine.style.fontFamily).toContain('Figtree');
    });

    test('requestMeasure is called after font change', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        chooseFont('ibm-plex-sans');

        await settleFontSelection();
        expect(mockEditorView.requestMeasure).toHaveBeenCalled();
    });

    test('CSS variable --font-editor is set', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        chooseFont('figtree');

        await settleFontSelection();
        expect(document.documentElement.style.getPropertyValue('--font-editor')).toContain('Figtree');
    });

    test('UI font variable follows the setting so dialogs and context menus inherit it', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        chooseFont('figtree');
        await settleFontSelection();

        expect(document.documentElement.style.getPropertyValue('--font-ui')).toContain('Figtree');
    });

    test('overlay surfaces use the UI font variable', () => {
        const featureStylesheet = readFileSync('frontend/styles/dialogs.css', 'utf8');
        const primitiveStylesheet = readFileSync('frontend/design-system/primitives.css', 'utf8');
        expect(primitiveStylesheet).toMatch(/\.ui-menu\s*\{[^}]*font-family:\s*var\(--font-ui\)/s);
        expect(featureStylesheet).toMatch(/\.custom-modal\s*\{[^}]*font-family:\s*var\(--font-ui\)/s);
    });

    test('Font family string includes fallback', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        chooseFont('figtree');

        await settleFontSelection();
        const value = document.documentElement.style.getPropertyValue('--font-editor');
        // Must include a fallback
        expect(value).toContain('var(--font-sans)');
    });
});
