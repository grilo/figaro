/** Backlink status must describe the currently active file, not a late result. */

import { testUtils } from './test_setup.js';
import { state, setState } from '../frontend/js/state.js';
import { initBacklinks } from '../frontend/js/backlinks.js';

function deferred() {
    let resolve;
    const promise = new Promise((finish) => {
        resolve = finish;
    });
    return { promise, resolve };
}

describe('backlinks async lifecycle', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();
        setState('openTabs', [
            { id: 'a', type: 'file', path: 'A.md' },
            { id: 'b', type: 'file', path: 'B.md' }
        ]);
        setState('activeTabId', null);
    });

    test('does not let a late prior-tab result overwrite the active file', async () => {
        const slow = deferred();
        const fast = deferred();
        window.go.main.App.SearchBacklinks
            .mockImplementationOnce(() => slow.promise)
            .mockImplementationOnce(() => fast.promise);
        initBacklinks();

        setState('activeTabId', 'a');
        setState('activeTabId', 'b');

        fast.resolve([{ path: 'Source.md', name: 'Source.md', line_num: 1, snippet: '[B](B.md)' }]);
        await Promise.resolve();
        await Promise.resolve();

        slow.resolve([]);
        await Promise.resolve();
        await Promise.resolve();

        expect(state.backlinksTargetPath).toBe('B.md');
        expect(state.backlinksData).toHaveLength(1);
        expect(document.getElementById('backlinks-status').textContent).toBe('1 backlink');
    });
});
