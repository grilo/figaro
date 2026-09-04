import { testUtils } from './test_setup.js';
import {
    initFileIssues,
    recordRuntimeFileIssue,
    refreshFileIssues,
    showFileIssues,
} from '../frontend/js/fileIssues.js';
import { getState } from '../frontend/js/state.js';

describe('file diagnostics UI', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        getState('fileIssues').splice(0);
        window.go.desktop.App.GetVaultFileIssues.mockResolvedValue([]);
        window.go.desktop.App.RecheckVaultFileIssues.mockResolvedValue([]);
        window.go.desktop.App.OpenWithDefaultApplication.mockResolvedValue({ success: true });
        window.go.desktop.App.RevealInExplorer.mockResolvedValue({ success: true });
        initFileIssues();
    });

    test('shows one calm persistent status action and opens keyboard-contained diagnostics', async () => {
        recordRuntimeFileIssue({
            path: 'Draft.md',
            code: 'save_failed',
            severity: 'danger',
            title: 'Saving is blocked',
            detail: 'Permission denied. The latest text remains in memory.',
            guidance: 'Check permissions and retry.',
        });

        const status = document.getElementById('status-file-issues');
        expect(status.hidden).toBe(false);
        expect(status.dataset.severity).toBe('danger');
        expect(status.textContent).toContain('Saving blocked — action required');
        expect(status.getAttribute('aria-label')).toContain('Action required');

        status.click();
        const dialog = document.querySelector('.file-issues-modal');
        expect(dialog.textContent).toContain('Files need attention');
        expect(dialog.textContent).toContain('Permission denied');
        expect(dialog.textContent).toContain('What to do:');
        expect([...dialog.querySelectorAll('button')].map(button => button.textContent.trim()))
            .toEqual(['Show in file tree', 'Reveal in folder', 'Close']);
        const recoveryActions = [...dialog.querySelectorAll('[data-file-issue-action]')];
        expect(recoveryActions).toHaveLength(2);
        expect(recoveryActions.every(button => (
            button.classList.contains('ui-button')
            && !button.classList.contains('ui-button--quiet')
        ))).toBe(true);

        dialog.querySelector('.custom-modal-btn-confirm').click();
        await testUtils.waitFor(0);
        expect(document.querySelector('.file-issues-modal')).toBeNull();
    });

    test('replaces backend findings while retaining runtime incidents and reveals exact paths', async () => {
        recordRuntimeFileIssue({
            path: 'Draft.md',
            code: 'history_failed',
            severity: 'warning',
            title: 'Local history could not be updated',
            detail: 'Git rejected the update.',
            guidance: 'Check the repository.',
        });
        window.go.desktop.App.GetVaultFileIssues.mockResolvedValueOnce([{
            path: 'Archive/large.md',
            code: 'too_large',
            severity: 'warning',
            title: 'Too large for Figaro',
            detail: 'The file exceeds the editor limit.',
            guidance: 'Open it externally.',
        }]);
        await refreshFileIssues();
        expect(getState('fileIssues')).toHaveLength(2);

        const reveal = jest.fn();
        document.addEventListener('vault-file-issue-reveal-requested', reveal, { once: true });
        const result = showFileIssues({ path: 'Archive/large.md' });
        document.querySelector('[data-file-issue-action="show"][data-path="Archive/large.md"]').click();
        await expect(result).resolves.toBe(true);
        expect(reveal).toHaveBeenCalledWith(expect.objectContaining({
            detail: { path: 'Archive/large.md' },
        }));
    });

    test('keeps an identical backend snapshot inert so mounted interactions are not remade', async () => {
        const issue = {
            path: 'Archive/large.md',
            code: 'too_large',
            severity: 'warning',
            title: 'Too large for Figaro',
            detail: 'The file exceeds the editor limit.',
            guidance: 'Open it externally.',
        };
        window.go.desktop.App.GetVaultFileIssues.mockResolvedValue([issue]);
        await refreshFileIssues();
        const published = getState('fileIssues');
        const changed = jest.fn();
        document.addEventListener('vault-file-issues-changed', changed);

        await refreshFileIssues();

        expect(getState('fileIssues')).toBe(published);
        expect(changed).not.toHaveBeenCalled();
    });

    test('uses an external note capability instead of granting arbitrary path-launch access', async () => {
        window.go.desktop.App.OpenLaunchExternalFile.mockResolvedValue({ success: true });
        window.go.desktop.App.RevealLaunchExternalFile.mockResolvedValue({ success: true });
        recordRuntimeFileIssue({
            path: '/tmp/large.md',
            code: 'too_large',
            severity: 'warning',
            title: 'Too large for Figaro',
            detail: 'The external note exceeds the editor limit.',
            guidance: 'Open it externally.',
            externalFileId: 'external-7',
        });

        const opened = showFileIssues({ path: '/tmp/large.md' });
        document.querySelector('[data-file-issue-action="open"]').click();
        await expect(opened).resolves.toBe(true);
        await testUtils.waitFor(0);
        expect(window.go.desktop.App.OpenLaunchExternalFile).toHaveBeenCalledWith('external-7');
        expect(window.go.desktop.App.OpenWithDefaultApplication).not.toHaveBeenCalled();

        const revealed = showFileIssues({ path: '/tmp/large.md' });
        document.querySelector('[data-file-issue-action="reveal"]').click();
        await expect(revealed).resolves.toBe(true);
        await testUtils.waitFor(0);
        expect(window.go.desktop.App.RevealLaunchExternalFile).toHaveBeenCalledWith('external-7');
    });

    test('keeps runtime findings aligned with successful tree moves and deletes', () => {
        recordRuntimeFileIssue({
            path: 'Drafts/note.md',
            code: 'history_failed',
            severity: 'warning',
            title: 'History failed',
            detail: 'Git failed.',
            guidance: 'Check Git.',
        });

        document.dispatchEvent(new CustomEvent('vault-file-issue-runtime-remap-requested', {
            detail: { oldPath: 'Drafts', newPath: 'Archive' },
        }));
        expect(getState('fileIssues')[0].path).toBe('Archive/note.md');

        document.dispatchEvent(new CustomEvent('vault-file-issue-runtime-clear-requested', {
            detail: { path: 'Archive' },
        }));
        expect(getState('fileIssues')).toEqual([]);
    });
});
