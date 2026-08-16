import {
    removeVaultLoading,
    renderVaultLoading,
} from '../frontend/js/views/vaultLoadingView.js';

describe('vault loading view', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="vault-loading-panel" aria-busy="true" hidden>
                <span id="vault-loading-title"></span>
                <span id="vault-loading-message"></span>
                <span id="vault-loading-progress" role="progressbar"></span>
                <span id="vault-loading-progress-value"></span>
                <output id="vault-loading-count"></output>
            </div>`;
    });

    test('updates visible and accessible determinate progress, then removes the startup panel', () => {
        expect(renderVaultLoading({
            phase: 'loading',
            title: 'Loading vault',
            message: 'Reading and indexing notes…',
            count: '100 / 2072 notes',
            percent: 5,
            ariaText: '100 of 2072 notes loaded',
            busy: true,
        })).toBe(true);

        expect(document.getElementById('vault-loading-title').textContent).toBe('Loading vault');
        expect(document.getElementById('vault-loading-count').textContent).toBe('100 / 2072 notes');
        expect(document.getElementById('vault-loading-progress').getAttribute('aria-valuenow')).toBe('5');
        expect(document.getElementById('vault-loading-progress').getAttribute('aria-valuetext')).toBe('100 of 2072 notes loaded');
        expect(document.getElementById('vault-loading-progress-value').style.getPropertyValue('--ui-progress')).toBe('5%');
        expect(document.getElementById('vault-loading-panel').getAttribute('aria-busy')).toBe('true');
        expect(document.getElementById('vault-loading-panel').hidden).toBe(false);

        expect(removeVaultLoading()).toBe(true);
        expect(document.getElementById('vault-loading-panel').hidden).toBe(true);
    });

    test('uses an indeterminate accessible state while discovering the file count', () => {
        const progress = document.getElementById('vault-loading-progress');
        progress.setAttribute('aria-valuenow', '50');
        renderVaultLoading({
            phase: 'discovering',
            title: 'Loading vault',
            message: 'Discovering notes…',
            count: 'Preparing file list…',
            percent: null,
            ariaText: 'Discovering notes',
            busy: true,
        });
        expect(progress.hasAttribute('aria-valuenow')).toBe(false);
        expect(progress.getAttribute('aria-valuetext')).toBe('Discovering notes');
    });

    test('uses the compact error state without hiding the editor workspace', () => {
        renderVaultLoading({
            phase: 'error',
            title: 'Vault could not load',
            message: 'permission denied',
            count: 'Loading stopped',
            percent: null,
            ariaText: 'permission denied',
            busy: false,
        });
        expect(document.getElementById('vault-loading-panel').dataset.phase).toBe('error');
        expect(document.getElementById('vault-loading-message').textContent).toBe('permission denied');
        expect(document.getElementById('vault-loading-panel').getAttribute('aria-busy')).toBe('false');
    });
});
