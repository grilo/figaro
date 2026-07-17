jest.mock('../frontend/js/dialogs.js', () => ({
    confirmDialog: jest.fn(),
    errorDialog: jest.fn().mockResolvedValue(),
}));
jest.mock('../frontend/js/tabManager.js', () => ({
    prepareTabsForVaultLinkRewrite: jest.fn().mockResolvedValue({ success: true }),
    refreshTabsForUpdatedLinks: jest.fn().mockResolvedValue(true),
}));

import { confirmDialog, errorDialog } from '../frontend/js/dialogs.js';
import { prepareTabsForVaultLinkRewrite, refreshTabsForUpdatedLinks } from '../frontend/js/tabManager.js';
import {
    getLinkStylePreference,
    initLinkStylePreference,
    initLinkStyleSetting,
    requestLinkStyleChange,
    resetLinkStyleForTests,
} from '../frontend/js/linkStyle.js';

function renderLinkStyleSetting() {
    document.body.innerHTML = `<div class="settings-picker link-style-picker">
        <button type="button" id="link-style-select" class="settings-picker-btn" role="combobox"
                aria-controls="link-style-menu" aria-expanded="false">
            <span id="link-style-current-name">Markdown</span>
        </button>
        <div id="link-style-menu" class="settings-picker-menu" role="listbox" hidden>
            <button id="link-style-option-wikilink" data-link-style="wikilink" role="option" aria-selected="false">Wikilinks</button>
            <button id="link-style-option-markdown" data-link-style="markdown" role="option" aria-selected="false">Markdown</button>
        </div>
    </div>`;
}

describe('vault link style workflow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetLinkStyleForTests();
        renderLinkStyleSetting();
        window.go.main.App.LinkStyleLoad = jest.fn().mockResolvedValue({ style: 'markdown' });
        window.go.main.App.ChangeLinkStyle = jest.fn().mockImplementation((style) =>
            Promise.resolve({ success: true, style, rewritten: 2, updated_links: ['index.md'] }));
        prepareTabsForVaultLinkRewrite.mockResolvedValue({ success: true });
    });

    test('loads the persisted preference into the themed Settings combobox', async () => {
        window.go.main.App.LinkStyleLoad.mockResolvedValueOnce({ style: 'wikilink' });
        await initLinkStyleSetting(document);
        expect(getLinkStylePreference()).toBe('wikilink');
        expect(document.getElementById('link-style-select').value).toBe('wikilink');
        expect(document.getElementById('link-style-current-name').textContent).toBe('Wikilinks');
        expect(document.getElementById('link-style-option-wikilink').getAttribute('aria-selected')).toBe('true');
        expect(document.getElementById('link-style-option-markdown').getAttribute('aria-selected')).toBe('false');
    });

    test('opens and closes the themed combobox with pointer and keyboard controls', async () => {
        await initLinkStyleSetting(document);
        const trigger = document.getElementById('link-style-select');
        const menu = document.getElementById('link-style-menu');

        trigger.click();
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        expect(menu.hidden).toBe(false);
        expect(trigger.getAttribute('aria-activedescendant')).toBe('link-style-option-markdown');

        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        expect(trigger.getAttribute('aria-activedescendant')).toBe('link-style-option-wikilink');
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(menu.hidden).toBe(true);
        expect(document.activeElement).toBe(trigger);
    });

    test('applies a keyboard-selected link style and restores focus to the themed combobox', async () => {
        confirmDialog.mockResolvedValueOnce('extra');
        await initLinkStyleSetting(document);
        const trigger = document.getElementById('link-style-select');

        trigger.click();
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(window.go.main.App.ChangeLinkStyle).toHaveBeenCalledWith('wikilink', false);
        expect(trigger.value).toBe('wikilink');
        expect(document.getElementById('link-style-current-name').textContent).toBe('Wikilinks');
        expect(trigger.disabled).toBe(false);
        expect(document.activeElement).toBe(trigger);
    });

    test('restores the themed combobox after cancelling a pointer selection', async () => {
        confirmDialog.mockResolvedValueOnce(false);
        await initLinkStyleSetting(document);
        const trigger = document.getElementById('link-style-select');

        trigger.click();
        document.getElementById('link-style-option-wikilink').click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(window.go.main.App.ChangeLinkStyle).not.toHaveBeenCalled();
        expect(trigger.value).toBe('markdown');
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(trigger.disabled).toBe(false);
        expect(document.activeElement).toBe(trigger);
    });

    test('cancellation restores the prior preference without backend changes', async () => {
        await initLinkStylePreference();
        confirmDialog.mockResolvedValueOnce(false);

        await expect(requestLinkStyleChange('wikilink')).resolves.toEqual(expect.objectContaining({ cancelled: true }));
        expect(window.go.main.App.ChangeLinkStyle).not.toHaveBeenCalled();
        expect(getLinkStylePreference()).toBe('markdown');
    });

    test('keep existing changes only the preference', async () => {
        await initLinkStylePreference();
        confirmDialog.mockResolvedValueOnce('extra');

        await expect(requestLinkStyleChange('wikilink')).resolves.toEqual(expect.objectContaining({ success: true }));
        expect(prepareTabsForVaultLinkRewrite).not.toHaveBeenCalled();
        expect(window.go.main.App.ChangeLinkStyle).toHaveBeenCalledWith('wikilink', false);
        expect(getLinkStylePreference()).toBe('wikilink');
    });

    test('rewrite saves dirty Markdown tabs first and refreshes changed open buffers', async () => {
        await initLinkStylePreference();
        confirmDialog.mockResolvedValueOnce('confirm');

        await requestLinkStyleChange('wikilink');
        expect(prepareTabsForVaultLinkRewrite).toHaveBeenCalledTimes(1);
        expect(window.go.main.App.ChangeLinkStyle).toHaveBeenCalledWith('wikilink', true);
        expect(refreshTabsForUpdatedLinks).toHaveBeenCalledWith(['index.md']);
    });

    test('a dirty-buffer save failure cancels the rewrite non-destructively', async () => {
        await initLinkStylePreference();
        confirmDialog.mockResolvedValueOnce('confirm');
        prepareTabsForVaultLinkRewrite.mockResolvedValueOnce({ success: false, error: 'Save conflict' });

        await expect(requestLinkStyleChange('wikilink')).resolves.toEqual(expect.objectContaining({ success: false }));
        expect(window.go.main.App.ChangeLinkStyle).not.toHaveBeenCalled();
        expect(errorDialog).toHaveBeenCalledWith('Links were not changed', 'Save conflict', expect.any(String));
        expect(getLinkStylePreference()).toBe('markdown');
    });
});
