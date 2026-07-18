/** History requests must not update a panel after its file changes. */

import { testUtils } from './test_setup.js';
import { updateGitStatus, updateHistoryCount, refreshHistoryIfOpen } from '../frontend/js/historyPanel.js';

function deferred() {
    let resolve;
    const promise = new Promise((finish) => {
        resolve = finish;
    });
    return { promise, resolve };
}

describe('history panel async lifecycle', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();
        document.getElementById('right-sidebar').classList.add('open');
    });

    test('drops a late history list after the active file changes', async () => {
        const slow = deferred();
        window.go.main.App.GetFileHistory.mockImplementationOnce(() => slow.promise);
        window.go.main.App.GetCommitCount.mockResolvedValue(0);

        updateHistoryCount('A.md');
        const refresh = refreshHistoryIfOpen();
        updateHistoryCount('B.md');

        slow.resolve([{ hash: 'abcdef1234567', timestamp: 1, message: 'A history' }]);
        await refresh;

        expect(document.getElementById('history-content').textContent).not.toContain('abcdef1');
    });

    test('drops a late local-history result after the active file changes', async () => {
        const slow = deferred();
        window.go.main.App.FileHasUncommittedChanges
            .mockImplementationOnce(() => slow.promise)
            .mockResolvedValueOnce(false);

        const oldRequest = updateGitStatus('A.md');
        await updateGitStatus('B.md');
        slow.resolve(true);
        await oldRequest;

        expect(document.getElementById('git-status').textContent).toBe('Save to history');
        expect(document.getElementById('git-status').hidden).toBe(true);
        expect(document.getElementById('git-status').classList).not.toContain('is-uncommitted');
    });
});
