/**
 * Font System Integration Tests — verifies real font changes
 */
import { testUtils } from './test_setup.js';

// Simulate the editor view
const mockEditorView = {
    dom: { 
        style: { fontFamily: '' },
        querySelector: jest.fn(() => ({ style: { fontFamily: '' } })),
    },
    requestMeasure: jest.fn(),
};

jest.mock('../frontend/js/editor.js', () => ({
    getEditorView: jest.fn(() => mockEditorView),
    __mockView: mockEditorView,
}));

const mockApi = {
    theme_load: jest.fn(() => Promise.resolve({ theme: 'default', font: 'inter' })),
    font_save: jest.fn(() => Promise.resolve({ success: true })),
    code_font_save: jest.fn(() => Promise.resolve({ success: true })),
    get_theme_css: jest.fn(() => Promise.resolve({ css: ':root { --bg-color: #111; }' })),
    theme_save: jest.fn(() => Promise.resolve({ success: true })),
    get_themes: jest.fn(() => Promise.resolve({ themes: [{ id: 'default', name: 'Default Dark' }] })),
    vim_load: jest.fn(() => Promise.resolve({ enabled: false })),
};

beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
    window.pywebview = { api: mockApi };
    mockEditorView.dom.style.fontFamily = '';
    document.documentElement.style.removeProperty('--font-editor');
    document.body.innerHTML = `
        <button id="font-picker-btn"><span id="font-current-name">Inter</span></button>
        <div id="font-picker-menu"></div>
        <button id="code-font-picker-btn"><span id="code-font-current-name">Theme default</span></button>
        <div id="code-font-picker-menu"></div>
        <button id="theme-picker-btn"><span id="theme-current-name">Default</span></button>
        <div id="theme-picker-menu"></div>
    `;
});

async function loadThemeModule() {
    // Force fresh import
    const mod = await import('../frontend/js/theme.js');
    return mod;
}

describe('Font Application', () => {
    test('--font-editor CSS variable is set when applyFont runs', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        // Simulate clicking "Figtree"
        const items = document.querySelectorAll('.font-picker-item');
        const figtree = Array.from(items).find(i => i.dataset.id === 'figtree');
        expect(figtree).toBeTruthy();
        figtree.click();

        // Check CSS variable was set
        await new Promise(r => setTimeout(r, 300));
        const value = document.documentElement.style.getPropertyValue('--font-editor');
        expect(value).toContain('Figtree');
    });

    test('Editor gets font via injected style element', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        const items = document.querySelectorAll('.font-picker-item');
        const ibm = Array.from(items).find(i => i.dataset.id === 'ibm-plex-sans');
        ibm.click();

        await new Promise(r => setTimeout(r, 300));
        const style = document.getElementById('dynamic-font-style');
        expect(style).toBeTruthy();
        expect(style.textContent).toContain('IBM Plex Sans');
        expect(style.textContent).toContain('font-family');
    });

    test('font_save API is called on font change', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        const items = document.querySelectorAll('.font-picker-item');
        const fira = Array.from(items).find(i => i.dataset.id === 'fira-sans');
        fira.click();

        await new Promise(r => setTimeout(r, 300));
        expect(mockApi.font_save).toHaveBeenCalledWith('fira-sans');
    });

    test('font-current-name updates on selection', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        const items = document.querySelectorAll('.font-picker-item');
        const figtree = Array.from(items).find(i => i.dataset.id === 'figtree');
        figtree.click();

        expect(document.getElementById('font-current-name').textContent).toBe('Figtree');
    });

    test('keeps a just-selected font when the settings panel is rebuilt', async () => {
        const { initTheme, initSettingsPanel } = await loadThemeModule();
        await initTheme();
        await initSettingsPanel();

        const fira = Array.from(document.querySelectorAll('.font-picker-item'))
            .find(item => item.dataset.id === 'fira-sans');
        fira.click();

        // Recreate the picker before the backend persistence round-trip is needed.
        document.body.innerHTML = `
            <button id="font-picker-btn"><span id="font-current-name">Inter</span></button>
            <div id="font-picker-menu"></div>
            <button id="theme-picker-btn"><span id="theme-current-name">Default</span></button>
            <div id="theme-picker-menu"></div>
        `;
        await initSettingsPanel();
        await Promise.resolve();

        expect(document.getElementById('font-current-name').textContent).toBe('Fira Sans');
        // Theme preferences are loaded once at startup; reopening settings must
        // not read a potentially stale value and overwrite the local choice.
        expect(mockApi.theme_load).toHaveBeenCalledTimes(1);
    });

    test('all 10 fonts are in the dropdown', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        const items = document.querySelectorAll('.font-picker-item');
        expect(items.length).toBe(16);
    });

    test('persists a separate font for CodeMirror code files only', async () => {
        const codeEditor = document.createElement('div');
        codeEditor.className = 'cm-editor cm-code-file';
        const codeContent = document.createElement('div');
        codeContent.className = 'cm-content';
        codeEditor.appendChild(codeContent);
        document.body.appendChild(codeEditor);

        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        const cascadia = Array.from(document.querySelectorAll('.code-font-picker-item'))
            .find(item => item.dataset.id === 'cascadia-code');
        expect(cascadia).toBeTruthy();
        cascadia.click();

        await new Promise(resolve => setTimeout(resolve, 300));
        expect(document.documentElement.style.getPropertyValue('--font-code')).toContain('Cascadia Code');
        expect(document.getElementById('dynamic-code-font-style').textContent).toContain('.cm-code-file');
        expect(codeContent.style.fontFamily).toContain('Cascadia Code');
        expect(mockApi.code_font_save).toHaveBeenCalledWith('cascadia-code');
    });
});
