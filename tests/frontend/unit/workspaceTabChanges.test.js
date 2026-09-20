import { workspaceTabChanges } from '../../../frontend/js/core/workspaceTabChanges.js';
import { state, setState, subscribe, setTabCursorState, getTabCursorState } from '../../../frontend/js/state.js';
import { buildSessionSnapshot } from '../../../frontend/js/core/sessionModel.js';

const tab = { id: 'a', type: 'file', title: 'A', path: 'a.md', dirty: false };

describe('workspace tab notification boundaries', () => {
    test.each(['id', 'type', 'title', 'path', 'externalFileId', 'dateStr', 'dirty'])('%s wakes presentation', field => {
        expect(workspaceTabChanges([tab], [{ ...tab, [field]: 'changed' }]).presentation).toBe(true);
    });
    test('cursor/buffer updates retain authoritative snapshots without notifying presentation or storage', () => {
        setState('openTabs', [tab]);
        const presentation = jest.fn(), cursor = jest.fn(), buffer = jest.fn();
        const stop = [subscribe('tabPresentation', presentation), subscribe('tabCursors', cursor), subscribe('tabBuffers', buffer)];
        const write = jest.spyOn(localStorage, 'setItem');
        try {
            for (let head = 1; head <= 100; head++) {
                setTabCursorState('a', { anchor: head, head });
            }
            expect(cursor).toHaveBeenCalledTimes(100);
            expect(presentation).not.toHaveBeenCalled();
            expect(buffer).not.toHaveBeenCalled();
            expect(write).not.toHaveBeenCalled();
            expect(buildSessionSnapshot(state).cursorStates.a).toEqual({ anchor: 100, head: 100 });
            expect(setTabCursorState('a', { anchor: 100, head: 100 })).toBe(false);
            expect(getTabCursorState('a')).toEqual({ anchor: 100, head: 100 });
            expect(state.openTabs[0]).toBe(tab);
            setState('openTabs', [{ ...state.openTabs[0], _content: 'latest', _editGeneration: 1 }]);
            expect(buffer).toHaveBeenCalledTimes(1);
            expect(presentation).not.toHaveBeenCalled();
            expect(write).not.toHaveBeenCalled();
            setState('openTabs', [{ ...state.openTabs[0], dirty: true }]);
            expect(presentation).toHaveBeenCalledTimes(1);
            setState('openTabs', [{ ...state.openTabs[0], path: 'renamed.md' }]);
            expect(presentation).toHaveBeenCalledTimes(2);
            expect(write).toHaveBeenCalledTimes(1);
            setState('openTabs', []);
            expect(presentation).toHaveBeenCalledTimes(3);
            expect(buildSessionSnapshot(state).cursorStates).toEqual({});
        } finally { stop.forEach(unsubscribe => unsubscribe()); write.mockRestore(); }
    });
    test('tab add/remove/order and immutable metadata update stay observable', () => {
        const other = { ...tab, id: 'b' };
        for (const [before, after] of [[[], [tab]], [[tab], []], [[tab, other], [other, tab]]]) {
            expect(workspaceTabChanges(before, after).presentation).toBe(true);
        }
        expect(workspaceTabChanges([tab], [{ ...tab }])).toEqual({ presentation: false, cursors: false, buffers: false });
        expect(() => subscribe('openTabs', () => {})).toThrow('tabPresentation');
    });
});

test('rename planning preserves old snapshots, cursors, and the presentation notification', () => {
    const { moveWorkspaceTabPaths } = require('../../../frontend/js/core/workspaceTabModel.js');
    const before = [{ ...tab, cursorState: { anchor: 2, head: 4 } }];
    const result = moveWorkspaceTabPaths(before, 'a.md', 'b.md');
    expect(before[0].path).toBe('a.md');
    expect(result.tabs[0]).toMatchObject({ path: 'b.md', cursorState: { anchor: 2, head: 4 } });
    expect(workspaceTabChanges(before, result.tabs).presentation).toBe(true);
});

test('a rename that changes the tab id transfers the latest live cursor and drops the old session key', () => {
    const { updateTabsForMovedPath } = require('../../../frontend/js/tabManager.js');
    window.go.desktop.App.SaveSession.mockResolvedValue({ success: true });
    setState('openTabs', [{ id: 'old.md', path: 'old.md', title: 'Old', type: 'file' }]);
    setState('pinnedTabs', []); setState('activeTabId', null);
    setTabCursorState('old.md', { anchor: 9, head: 14 });
    expect(updateTabsForMovedPath('old.md', 'new.md')).toBe(true);
    expect(getTabCursorState('old.md')).toBeNull();
    expect(getTabCursorState('new.md')).toEqual({ anchor: 9, head: 14 });
    expect(buildSessionSnapshot(state).cursorStates).toEqual({ 'new.md': { anchor: 9, head: 14 } });
    setState('openTabs', []);
});
