/** History requests must not update a panel after its file changes. */

import { testUtils } from './test_setup.js';
import { updateHistoryCount, refreshHistoryIfOpen } from '../frontend/js/historyPanel.js';

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
        window.pywebview.api.get_file_history.mockImplementationOnce(() => slow.promise);
        window.pywebview.api.get_commit_count.mockResolvedValue(0);

        updateHistoryCount('A.md');
        const refresh = refreshHistoryIfOpen();
        updateHistoryCount('B.md');

        slow.resolve([{ hash: 'abcdef1234567', timestamp: 1, message: 'A history' }]);
        await refresh;

        expect(document.getElementById('history-content').textContent).not.toContain('abcdef1');
    });
});
