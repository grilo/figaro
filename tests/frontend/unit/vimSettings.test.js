const mockToggleVim = jest.fn(() => Promise.resolve(true));

jest.mock('../frontend/js/editor.js', () => ({
    getEditorView: jest.fn(() => null),
    toggleVim: mockToggleVim,
}));

function settingsDOM() {
    document.body.innerHTML = `
        <button id="theme-picker-btn"><span id="theme-current-name">Default</span></button>
        <div id="theme-picker-menu"></div>
        <input type="checkbox" id="vim-toggle">
    `;
}

async function settlePreferenceChange() {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
}

describe('Vim preference lifecycle', () => {
    test('startup, Settings, persistence, and reopened Settings share one state', async () => {
        const api = {
            theme_load: jest.fn().mockResolvedValue({
                theme: 'default',
                font: 'inter',
                codeFont: 'theme-mono',
            }),
            get_theme_css: jest.fn().mockResolvedValue({ css: ':root {}' }),
            get_themes: jest.fn().mockResolvedValue({
                themes: [{ id: 'default', name: 'Figaro Dark' }],
            }),
            vim_load: jest.fn().mockResolvedValue({ enabled: true }),
            vim_save: jest.fn().mockResolvedValue({ success: true }),
        };
        window.pywebview = { api };
        settingsDOM();

        const {
            initTheme,
            initSettingsPanel,
            getVimPreference,
        } = await import('../frontend/js/theme.js');

        await initTheme();
        expect(api.vim_load).toHaveBeenCalledTimes(1);
        expect(mockToggleVim).toHaveBeenLastCalledWith(true);
        expect(getVimPreference()).toBe(true);

        await initSettingsPanel();
        const firstToggle = document.getElementById('vim-toggle');
        expect(firstToggle.checked).toBe(true);

        firstToggle.checked = false;
        firstToggle.dispatchEvent(new Event('change', { bubbles: true }));
        await settlePreferenceChange();

        expect(mockToggleVim).toHaveBeenLastCalledWith(false);
        expect(api.vim_save).toHaveBeenCalledWith(false);
        expect(getVimPreference()).toBe(false);
        expect(firstToggle.checked).toBe(false);
        expect(firstToggle.disabled).toBe(false);

        // Reopening Settings must use the current application preference, not
        // re-read a stale backend value and turn Vim back on.
        settingsDOM();
        await initSettingsPanel();
        expect(document.getElementById('vim-toggle').checked).toBe(false);
        expect(api.vim_load).toHaveBeenCalledTimes(1);

        // A failed persistence attempt restores both the control and editor to
        // the last value that is known to be on disk.
        api.vim_save.mockResolvedValueOnce({ success: false, error: 'disk unavailable' });
        const reopenedToggle = document.getElementById('vim-toggle');
        reopenedToggle.checked = true;
        reopenedToggle.dispatchEvent(new Event('change', { bubbles: true }));
        await settlePreferenceChange();

        expect(getVimPreference()).toBe(false);
        expect(reopenedToggle.checked).toBe(false);
        expect(reopenedToggle.title).toMatch(/previous setting was restored/i);
        expect(mockToggleVim).toHaveBeenLastCalledWith(false);
    });
});
