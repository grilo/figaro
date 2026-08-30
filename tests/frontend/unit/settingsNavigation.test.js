import { initSettingsNavigation, requestSettingsTarget } from '../frontend/js/settingsNavigation.js';

describe('Settings search navigation', () => {
    beforeEach(() => {
        delete document.documentElement.dataset.settingsNavigationBound;
        document.body.innerHTML = '<main id="settings-host"></main>';
    });

    test('opens Settings, focuses the requested control, and quietly highlights its section', async () => {
        const openSettings = jest.fn(() => {
            document.getElementById('settings-host').innerHTML = `
                <section class="settings-section">
                    <span id="vim-label">Enable Vim</span>
                    <input id="vim-toggle" aria-labelledby="vim-label">
                </section>`;
        });
        initSettingsNavigation({ root: document, openSettings });

        requestSettingsTarget(document, '#vim-toggle');
        await new Promise(resolve => setTimeout(resolve, 0));

        const target = document.getElementById('vim-toggle');
        expect(openSettings).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(target);
        expect(target.closest('.settings-section').classList.contains('settings-search-target')).toBe(true);
    });
});
