import { testUtils } from './test_setup.js';

jest.mock('../frontend/js/statusBar.js', () => ({
    statusBar: {
        set: jest.fn(),
        clearAfter: jest.fn(),
        beginDelayedActivity: jest.fn(() => jest.fn()),
    },
}));

jest.mock('../frontend/js/dialogs.js', () => ({
    errorDialog: jest.fn().mockResolvedValue(undefined),
}));

import { initRecentlyDeletedSettings } from '../frontend/js/recentlyDeleted.js';
import { errorDialog } from '../frontend/js/dialogs.js';

async function settle() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
}

describe('recently deleted settings', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();
        const root = document.createElement('section');
        root.id = 'recovery-settings-test';
        root.innerHTML = '<div id="recently-deleted-list" aria-live="polite"></div>';
        document.body.append(root);
    });

    test('lists durable Git recovery records and restores one without replacing through the frontend', async () => {
        window.go.desktop.App.GetRecentlyDeleted
            .mockResolvedValueOnce([{
                id: 'delete-1',
                path: 'Drafts/Draft.md',
                kind: 'file',
                snapshot: 'abc123',
                deleted_at: 100,
            }])
            .mockResolvedValueOnce([]);
        window.go.desktop.App.RestoreRecentlyDeleted.mockResolvedValueOnce({
            success: true,
            path: 'Drafts/Draft.md',
        });
        const refreshed = jest.fn();
        document.addEventListener('vault-tree-refresh-requested', refreshed, { once: true });

        await initRecentlyDeletedSettings(document.getElementById('recovery-settings-test'));
        const row = document.querySelector('.recently-deleted-item');
        expect(row.textContent).toContain('Draft.md');
        expect(row.textContent).toContain('Drafts/Draft.md');
        row.querySelector('button').click();
        await settle();

        expect(window.go.desktop.App.RestoreRecentlyDeleted).toHaveBeenCalledWith('delete-1');
        expect(refreshed).toHaveBeenCalledTimes(1);
        expect(document.querySelector('.recently-deleted-item')).toBeNull();
        expect(document.querySelector('.recently-deleted-empty').textContent).toContain('No items');
    });

    test('keeps the recovery action available when a current path causes a collision', async () => {
        window.go.desktop.App.GetRecentlyDeleted.mockResolvedValueOnce([{
            id: 'delete-1', path: 'Draft.md', kind: 'file', snapshot: 'abc123', deleted_at: 100,
        }]);
        window.go.desktop.App.RestoreRecentlyDeleted.mockResolvedValueOnce({
            success: false,
            error: 'A file or folder already exists at the original location.',
        });

        await initRecentlyDeletedSettings(document.getElementById('recovery-settings-test'));
        const button = document.querySelector('.recently-deleted-item button');
        button.click();
        await settle();

        expect(errorDialog).toHaveBeenCalledWith(
            'Couldn’t restore item',
            expect.stringContaining('already exists'),
            'The archived item was not changed or replaced.',
        );
        expect(button.disabled).toBe(false);
        expect(button.hasAttribute('aria-busy')).toBe(false);
    });
});
