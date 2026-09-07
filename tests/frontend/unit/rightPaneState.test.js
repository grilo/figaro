import { switchRightPaneState } from '../../../frontend/js/core/rightPaneState.js';

test('leaving a document saves its pane selection without mutating other document state', () => {
    const before = { activeId: 'note-a', selections: { 'note-b': 'raw-text-preview' } };
    expect(switchRightPaneState(before, 'settings', 'outline')).toEqual({ activeId: 'settings', selections: { 'note-a': 'outline', 'note-b': 'raw-text-preview' } });
    expect(before.selections).toEqual({ 'note-b': 'raw-text-preview' });
});

test('closing or reactivating a document remembers the current closed pane state', () => {
    const before = { activeId: 'note-a', selections: { 'note-a': 'outline' } };
    expect(switchRightPaneState(before, 'note-a', null).selections['note-a']).toBeNull();
    expect(switchRightPaneState({ activeId: null, selections: {} }, 'note-a', null)).toEqual({ activeId: 'note-a', selections: {} });
});
