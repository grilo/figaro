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

describe('vault link style workflow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetLinkStyleForTests();
        document.body.innerHTML = '<select id="link-style-select"><option value="markdown">Markdown</option><option value="wikilink">Wikilinks</option></select>';
        window.pywebview.api.link_style_load = jest.fn().mockResolvedValue({ style: 'markdown' });
        window.pywebview.api.change_link_style = jest.fn().mockImplementation((style) =>
            Promise.resolve({ success: true, style, rewritten: 2, updated_links: ['index.md'] }));
        prepareTabsForVaultLinkRewrite.mockResolvedValue({ success: true });
    });

    test('loads the persisted preference into the Settings combobox', async () => {
        window.pywebview.api.link_style_load.mockResolvedValueOnce({ style: 'wikilink' });
        await initLinkStyleSetting(document);
        expect(getLinkStylePreference()).toBe('wikilink');
        expect(document.getElementById('link-style-select').value).toBe('wikilink');
    });

    test('cancellation restores the prior preference without backend changes', async () => {
        await initLinkStylePreference();
        confirmDialog.mockResolvedValueOnce(false);

        await expect(requestLinkStyleChange('wikilink')).resolves.toEqual(expect.objectContaining({ cancelled: true }));
        expect(window.pywebview.api.change_link_style).not.toHaveBeenCalled();
        expect(getLinkStylePreference()).toBe('markdown');
    });

    test('keep existing changes only the preference', async () => {
        await initLinkStylePreference();
        confirmDialog.mockResolvedValueOnce('extra');

        await expect(requestLinkStyleChange('wikilink')).resolves.toEqual(expect.objectContaining({ success: true }));
        expect(prepareTabsForVaultLinkRewrite).not.toHaveBeenCalled();
        expect(window.pywebview.api.change_link_style).toHaveBeenCalledWith('wikilink', false);
        expect(getLinkStylePreference()).toBe('wikilink');
    });

    test('rewrite saves dirty Markdown tabs first and refreshes changed open buffers', async () => {
        await initLinkStylePreference();
        confirmDialog.mockResolvedValueOnce('confirm');

        await requestLinkStyleChange('wikilink');
        expect(prepareTabsForVaultLinkRewrite).toHaveBeenCalledTimes(1);
        expect(window.pywebview.api.change_link_style).toHaveBeenCalledWith('wikilink', true);
        expect(refreshTabsForUpdatedLinks).toHaveBeenCalledWith(['index.md']);
    });

    test('a dirty-buffer save failure cancels the rewrite non-destructively', async () => {
        await initLinkStylePreference();
        confirmDialog.mockResolvedValueOnce('confirm');
        prepareTabsForVaultLinkRewrite.mockResolvedValueOnce({ success: false, error: 'Save conflict' });

        await expect(requestLinkStyleChange('wikilink')).resolves.toEqual(expect.objectContaining({ success: false }));
        expect(window.pywebview.api.change_link_style).not.toHaveBeenCalled();
        expect(errorDialog).toHaveBeenCalledWith('Links were not changed', 'Save conflict', expect.any(String));
        expect(getLinkStylePreference()).toBe('markdown');
    });
});
