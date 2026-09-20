import { createWorkspaceCursorStore } from '../../../frontend/js/core/workspaceCursorModel.js';
import { state, getTabCursorState, setTabCursorState, setState, subscribe } from '../../../frontend/js/state.js';
import { buildSessionSnapshot } from '../../../frontend/js/core/sessionModel.js';

test('cursor updates never revisit tab records after their lifetime index is prepared', () => {
    for (const count of [10, 1000, 10000]) {
        let reads = 0;
        const tabs = Array.from({ length: count }, (_, id) => ({ get id() { reads++; return id; }, type: 'file' }));
        const store = createWorkspaceCursorStore(); store.reconcile(tabs); reads = 0;
        const saved = [];
        for (let head = 1; head <= 20; head++) {
            saved.push(store.update(count - 1, { anchor: head, head }).cursorState);
            expect(store.read(count - 1).head).toBe(head);
        }
        expect(reads).toBe(0);
        expect(saved.map(cursor => cursor.head)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
        expect(store.update(count - 1, { anchor: 20, head: 20 })).toBeNull();
    }
});

test('cursor lifetime reconciliation keeps live values through metadata edits, seeds explicit restores and prunes closed files', () => {
    const store = createWorkspaceCursorStore();
    const tab = { id: 'a', type: 'file', cursorState: { anchor: 1, head: 2 } };
    store.reconcile([tab, { id: 'settings', type: 'settings' }]);
    const initial = store.snapshot();
    store.update('a', { anchor: 5, head: 8 });
    store.reconcile([{ ...tab, path: 'renamed.md', dirty: true }]);
    expect(store.read('a')).toEqual({ anchor: 5, head: 8 });
    expect(initial.a).toEqual({ anchor: 1, head: 2 });
    expect(store.update('settings', { anchor: 1, head: 2 })).toBeNull();
    expect(store.update('a', { anchor: -1, head: 0 })).toBeNull();
    store.reconcile([{ ...tab, cursorState: { anchor: 0, head: 0 } }]);
    expect(store.read('a')).toEqual({ anchor: 0, head: 0 });
    store.reconcile([]);
    expect(store.read('a')).toBeNull();
    expect(store.snapshot()).toEqual({});
    expect(store.update('a', { anchor: 3, head: 3 })).toBeNull();
    store.reconcile([{ ...tab, cursorState: null }]);
    expect(store.read('a')).toBeNull();
});

test('state publishes one immutable cursor delta and snapshots the current position without changing tabs', () => {
    const tabs = Array.from({ length: 1000 }, (_, id) => ({ id: String(id), type: 'file', path: `${id}.md` }));
    setState('openTabs', tabs);
    let reads = 0;
    const spy = jest.spyOn(tabs, Symbol.iterator).mockImplementation(function* () { reads++; yield* Array.prototype.values.call(this); });
    const presentation = jest.fn(), cursors = jest.fn();
    const stops = [subscribe('tabPresentation', presentation), subscribe('tabCursors', cursors)];
    try {
        for (let head = 1; head <= 20; head++) setTabCursorState('999', { anchor: head, head });
        expect(state.openTabs).toBe(tabs);
        expect(reads).toBe(0);
        expect(presentation).not.toHaveBeenCalled();
        expect(cursors).toHaveBeenCalledTimes(20);
        expect(cursors.mock.calls[0][0]).toEqual({ tabId: '999', previous: null, cursorState: { anchor: 1, head: 1 } });
        expect(getTabCursorState('999')).toEqual({ anchor: 20, head: 20 });
        const before = buildSessionSnapshot(state);
        setTabCursorState('999', { anchor: 21, head: 22 });
        expect(before.cursorStates['999']).toEqual({ anchor: 20, head: 20 });
        expect(buildSessionSnapshot(state).cursorStates['999']).toEqual({ anchor: 21, head: 22 });
    } finally { spy.mockRestore(); stops.forEach(stop => stop()); setState('openTabs', []); }
});
