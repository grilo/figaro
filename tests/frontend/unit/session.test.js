/** Session persistence must retain call order when tab changes are rapid. */

import { testUtils } from './test_setup.js';
import { state, setState } from '../frontend/js/state.js';
import { loadSession, saveSession } from '../frontend/js/session.js';
import { restoredTabOpenArgs } from '../frontend/js/sessionTabs.js';

function deferred() {
    let resolve;
    const promise = new Promise((finish) => {
        resolve = finish;
    });
    return { promise, resolve };
}

describe('session persistence', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();
        setState('expandedDirs', new Set());
        setState('pinnedTabs', []);
        setState('selectedFilePath', null);
        setState('openTabs', []);
        setState('activeTabId', null);
        state._restoredTabs = null;
        state._restoredActiveTabId = null;
    });

    test('sends a newer snapshot only after the older one finishes', async () => {
        const slow = deferred();
        const fast = deferred();
        window.pywebview.api.save_session
            .mockImplementationOnce(() => slow.promise)
            .mockImplementationOnce(() => fast.promise);

        setState('openTabs', [{ id: 'first.md', type: 'file', title: 'First', path: 'first.md' }]);
        setState('activeTabId', 'first.md');
        const firstSave = saveSession();

        setState('openTabs', [{ id: 'second.md', type: 'file', title: 'Second', path: 'second.md' }]);
        setState('activeTabId', 'second.md');
        const secondSave = saveSession();
        await Promise.resolve();

        expect(window.pywebview.api.save_session).toHaveBeenCalledTimes(1);
        expect(window.pywebview.api.save_session.mock.calls[0][0].activeTabId).toBe('first.md');

        slow.resolve({ success: true });
        await firstSave;
        await Promise.resolve();

        expect(window.pywebview.api.save_session).toHaveBeenCalledTimes(2);
        expect(window.pywebview.api.save_session.mock.calls[1][0].activeTabId).toBe('second.md');

        fast.resolve({ success: true });
        await secondSave;
    });

    test('persists the Welcome tab alongside ordinary workspace tabs', async () => {
        setState('openTabs', [
            { id: 'home', type: 'home', title: 'Welcome' },
            { id: 'note.md', type: 'file', title: 'Note', path: 'note.md' },
        ]);
        setState('activeTabId', 'note.md');
        setState('pinnedTabs', ['home']);

        await saveSession();

        const payload = window.pywebview.api.save_session.mock.calls.at(-1)[0];
        expect(payload.openTabs).toEqual([
            { id: 'home', type: 'home', title: 'Welcome' },
            { id: 'note.md', type: 'file', title: 'Note', path: 'note.md' },
        ]);
        expect(payload.pinnedTabs).toEqual(['home']);
    });

    test('persists an editable Draw.io diagram with its vault path', async () => {
        setState('openTabs', [
            { id: 'diagrams/system.drawio.svg', type: 'drawio', title: 'system.drawio.svg', path: 'diagrams/system.drawio.svg' },
        ]);
        setState('activeTabId', 'diagrams/system.drawio.svg');

        await saveSession();

        const payload = window.pywebview.api.save_session.mock.calls.at(-1)[0];
        expect(payload.openTabs).toEqual([
            { id: 'diagrams/system.drawio.svg', type: 'drawio', title: 'system.drawio.svg', path: 'diagrams/system.drawio.svg' },
        ]);
    });

    test('restores a persisted Draw.io diagram into an editor tab', () => {
        expect(restoredTabOpenArgs({
            id: 'diagrams/system.drawio.svg',
            type: 'drawio',
            title: 'system.drawio.svg',
            path: 'diagrams/system.drawio.svg',
        })).toEqual({
            id: 'diagrams/system.drawio.svg',
            title: 'system.drawio.svg',
            type: 'drawio',
            data: { path: 'diagrams/system.drawio.svg' },
        });
    });

    test('repairs a legacy session where a pinned Welcome tab was omitted from open tabs', async () => {
        window.pywebview.api.load_session.mockResolvedValueOnce({
            openTabs: [{ id: 'note.md', type: 'file', title: 'Note', path: 'note.md' }],
            activeTabId: 'note.md',
            pinnedTabs: ['home'],
        });

        await expect(loadSession()).resolves.toBe(true);

        expect(state._restoredTabs).toEqual([
            { id: 'home', type: 'home', title: 'Welcome' },
            { id: 'note.md', type: 'file', title: 'Note', path: 'note.md' },
        ]);
        expect(state._restoredActiveTabId).toBe('note.md');
    });
});
