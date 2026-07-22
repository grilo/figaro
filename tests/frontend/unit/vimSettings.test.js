const mockToggleVim = jest.fn(() => Promise.resolve(true));
const mockSetVimVisualRows = jest.fn(() => true);

jest.mock('../frontend/js/editor.js', () => ({
    getEditorView: jest.fn(() => null),
    toggleVim: mockToggleVim,
    setVimVisualRows: mockSetVimVisualRows,
}));

function settingsDOM() {
    document.body.innerHTML = `
        <button id="theme-picker-btn"><span id="theme-current-name">Default</span></button>
        <div id="theme-picker-menu"></div>
        <input type="checkbox" id="vim-toggle">
        <input type="checkbox" id="vim-visual-rows-toggle">
    `;
}

async function settlePreferenceChange() {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
}

describe('Vim preference lifecycle', () => {
    test('startup, Settings, persistence, and reopened Settings share one state', async () => {
        const api = {
            ThemeLoad: jest.fn().mockResolvedValue({
                theme: 'default',
                font: 'inter',
                codeFont: 'theme-mono',
            }),
            GetThemeCSS: jest.fn().mockResolvedValue({ css: ':root {}' }),
            GetThemes: jest.fn().mockResolvedValue({
                themes: [{ id: 'default', name: 'Figaro Dark' }],
            }),
            VimLoad: jest.fn().mockResolvedValue({ enabled: true }),
            VimSave: jest.fn().mockResolvedValue({ success: true }),
            VimVisualRowsLoad: jest.fn().mockResolvedValue({ enabled: false }),
            VimVisualRowsSave: jest.fn().mockResolvedValue({ success: true }),
        };
        window.go = { main: { App: api } };
        settingsDOM();

        const {
            initTheme,
            initSettingsPanel,
            getVimPreference,
            getVimVisualRowsPreference,
        } = await import('../frontend/js/theme.js');

        await initTheme();
        expect(api.VimLoad).toHaveBeenCalledTimes(1);
        expect(mockToggleVim).toHaveBeenLastCalledWith(true);
        expect(api.VimVisualRowsLoad).toHaveBeenCalledTimes(1);
        expect(mockSetVimVisualRows).toHaveBeenLastCalledWith(false);
        expect(getVimPreference()).toBe(true);
        expect(getVimVisualRowsPreference()).toBe(false);

        await initSettingsPanel();
        const firstToggle = document.getElementById('vim-toggle');
        const visualRowsToggle = document.getElementById('vim-visual-rows-toggle');
        expect(firstToggle.checked).toBe(true);
        expect(visualRowsToggle.checked).toBe(false);
        expect(visualRowsToggle.disabled).toBe(false);

        visualRowsToggle.checked = true;
        visualRowsToggle.dispatchEvent(new Event('change', { bubbles: true }));
        await settlePreferenceChange();
        expect(mockSetVimVisualRows).toHaveBeenLastCalledWith(true);
        expect(api.VimVisualRowsSave).toHaveBeenCalledWith(true);
        expect(getVimVisualRowsPreference()).toBe(true);

        firstToggle.checked = false;
        firstToggle.dispatchEvent(new Event('change', { bubbles: true }));
        await settlePreferenceChange();

        expect(mockToggleVim).toHaveBeenLastCalledWith(false);
        expect(api.VimSave).toHaveBeenCalledWith(false);
        expect(getVimPreference()).toBe(false);
        expect(firstToggle.checked).toBe(false);
        expect(firstToggle.disabled).toBe(false);
        expect(visualRowsToggle.disabled).toBe(true);
        expect(visualRowsToggle.checked).toBe(true);

        // Reopening Settings must use the current application preference, not
        // re-read a stale backend value and turn Vim back on.
        settingsDOM();
        await initSettingsPanel();
        expect(document.getElementById('vim-toggle').checked).toBe(false);
        expect(document.getElementById('vim-visual-rows-toggle').checked).toBe(true);
        expect(document.getElementById('vim-visual-rows-toggle').disabled).toBe(true);
        expect(api.VimLoad).toHaveBeenCalledTimes(1);
        expect(api.VimVisualRowsLoad).toHaveBeenCalledTimes(1);

        // A failed persistence attempt restores both the control and editor to
        // the last value that is known to be on disk.
        api.VimSave.mockResolvedValueOnce({ success: false, error: 'disk unavailable' });
        const reopenedToggle = document.getElementById('vim-toggle');
        reopenedToggle.checked = true;
        reopenedToggle.dispatchEvent(new Event('change', { bubbles: true }));
        await settlePreferenceChange();

        expect(getVimPreference()).toBe(false);
        expect(reopenedToggle.checked).toBe(false);
        expect(reopenedToggle.title).toMatch(/previous setting was restored/i);
        expect(mockToggleVim).toHaveBeenLastCalledWith(false);

        // The visual-row mapping has its own persistence boundary and rolls
        // back without turning Vim itself on or off.
        const reopenedVisualRowsToggle = document.getElementById('vim-visual-rows-toggle');
        reopenedToggle.checked = true;
        reopenedToggle.dispatchEvent(new Event('change', { bubbles: true }));
        await settlePreferenceChange();
        expect(getVimPreference()).toBe(true);
        expect(reopenedVisualRowsToggle.disabled).toBe(false);
        api.VimVisualRowsSave.mockResolvedValueOnce({ success: false, error: 'disk unavailable' });
        reopenedVisualRowsToggle.checked = false;
        reopenedVisualRowsToggle.dispatchEvent(new Event('change', { bubbles: true }));
        await settlePreferenceChange();
        expect(getVimVisualRowsPreference()).toBe(true);
        expect(reopenedVisualRowsToggle.checked).toBe(true);
        expect(reopenedVisualRowsToggle.title).toMatch(/could not save the visual-row preference/i);
    });
});
