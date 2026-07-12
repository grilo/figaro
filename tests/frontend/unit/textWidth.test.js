/**
 * Text Width Control Integration Tests
 */
import { testUtils } from './test_setup.js';

const mockEditorView = {
    dom: {
        style: { fontFamily: '' },
        querySelector: jest.fn(() => ({ style: { fontFamily: '' } })),
    },
    requestMeasure: jest.fn(),
};

jest.mock('../frontend/js/editor.js', () => ({
    getEditorView: jest.fn(() => mockEditorView),
}));

const mockApi = {
    theme_load: jest.fn(() => Promise.resolve({ theme: 'default', font: 'inter' })),
    font_save: jest.fn(() => Promise.resolve({ success: true })),
    get_theme_css: jest.fn(() => Promise.resolve({ css: ':root { --bg-color: #111; }' })),
    theme_save: jest.fn(() => Promise.resolve({ success: true })),
    get_themes: jest.fn(() => Promise.resolve({ themes: [{ id: 'default', name: 'Default Dark' }] })),
    vim_load: jest.fn(() => Promise.resolve({ enabled: false })),
};

beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
    window.pywebview = { api: mockApi };
    localStorage.clear();
    document.documentElement.style.removeProperty('--editor-width');
    document.body.innerHTML = `
        <button id="font-picker-btn"><span id="font-current-name">Inter</span></button>
        <div id="font-picker-menu"></div>
        <button id="theme-picker-btn"><span id="theme-current-name">Default</span></button>
        <div id="theme-picker-menu"></div>
        <div class="text-width-control">
            <button class="text-width-btn" id="text-width-down" title="Narrower">\u2212</button>
            <span class="text-width-value" id="text-width-value">100%</span>
            <button class="text-width-btn" id="text-width-up" title="Wider">+</button>
        </div>
    `;
});

async function loadThemeModule() {
    const mod = await import('../frontend/js/theme.js');
    return mod;
}

describe('Text Width Control', () => {
    test('--editor-width CSS variable is set to 700px at 100% (default)', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        await new Promise(r => setTimeout(r, 100));
        const width = document.documentElement.style.getPropertyValue('--editor-width');
        expect(width).toBe('700px');
    });

    test('increasing width updates --editor-width and display', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        const upBtn = document.getElementById('text-width-up');
        upBtn.click(); // 110%

        await new Promise(r => setTimeout(r, 100));
        const width = document.documentElement.style.getPropertyValue('--editor-width');
        expect(width).toBe('770px'); // 700 * 1.1 = 770
        expect(document.getElementById('text-width-value').textContent).toBe('110%');
    });

    test('decreasing width updates --editor-width and display', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        const downBtn = document.getElementById('text-width-down');
        downBtn.click(); // 90%

        await new Promise(r => setTimeout(r, 100));
        const width = document.documentElement.style.getPropertyValue('--editor-width');
        expect(width).toBe('630px'); // 700 * 0.9 = 630
        expect(document.getElementById('text-width-value').textContent).toBe('90%');
    });

    test('text width persists in localStorage', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        // Click up twice
        document.getElementById('text-width-up').click();
        document.getElementById('text-width-up').click();

        await new Promise(r => setTimeout(r, 100));
        expect(localStorage.getItem('editor-text-width')).toBe('120');
    });

    test('controlled by localStorage on init', async () => {
        localStorage.setItem('editor-text-width', '80');

        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        await new Promise(r => setTimeout(r, 100));
        const width = document.documentElement.style.getPropertyValue('--editor-width');
        expect(width).toBe('560px'); // 700 * 0.8 = 560
        expect(document.getElementById('text-width-value').textContent).toBe('80%');
    });

    test('clamped at minimum 50%', async () => {
        localStorage.setItem('editor-text-width', '70');

        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        await new Promise(r => setTimeout(r, 100));
        // Initial load respects stored value, even below MIN (clamping only on button click)
        // Click down from 70 — won't go below 50
        for (let i = 0; i < 5; i++) document.getElementById('text-width-down').click();

        await new Promise(r => setTimeout(r, 100));
        const width = document.documentElement.style.getPropertyValue('--editor-width');
        expect(width).toBe('350px'); // 700 * 0.5 = 350 (clamped at 50%, down from 70)
    });

    test('clamped at maximum 200%', async () => {
        const { initSettingsPanel } = await loadThemeModule();
        await initSettingsPanel();

        for (let i = 0; i < 20; i++) document.getElementById('text-width-up').click();

        await new Promise(r => setTimeout(r, 100));
        const width = document.documentElement.style.getPropertyValue('--editor-width');
        expect(width).toBe('1400px'); // 700 * 2.0 = 1400 (clamped at 200%)
    });
});
