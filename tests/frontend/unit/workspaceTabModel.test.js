import {
    beginWorkspaceTabSave,
    recordWorkspaceTabContent,
    recordWorkspaceTabCursor,
    recordWorkspaceTabEdit,
    recordWorkspaceTabTextScale,
    resetWorkspaceTabTextScale,
    resetWorkspaceTabTextScales,
    restoreWorkspaceTabCursors,
} from '../../../frontend/js/core/workspaceTabModel.js';

describe('workspace tab model', () => {
    test('records edits and content snapshots without mutating the prior state', () => {
        const originalTab = { id: 'note.md', type: 'file', dirty: false, _editGeneration: 2 };
        const original = [originalTab];

        const edited = recordWorkspaceTabEdit(original, 'note.md');
        expect(edited.tab).toEqual(expect.objectContaining({ dirty: true, _editGeneration: 3 }));
        expect(edited.becameDirty).toBe(true);
        expect(original[0]).toBe(originalTab);
        expect(originalTab.dirty).toBe(false);

        const content = recordWorkspaceTabContent(edited.tabs, 'note.md', 3, 'current body');
        expect(content.tab._content).toBe('current body');
        expect(recordWorkspaceTabContent(content.tabs, 'note.md', 2, 'stale').changed).toBe(false);
    });

    test('applies and clears temporary editor scale without mutating tab records', () => {
        const originalTab = { id: 'a.md', type: 'file' };
        const original = [originalTab, { id: 'settings', type: 'settings' }];
        const scaled = recordWorkspaceTabTextScale(original, 'a.md', 120);
        expect(scaled.tab._editorTextScale).toBe(120);
        expect(originalTab).not.toHaveProperty('_editorTextScale');

        const reset = resetWorkspaceTabTextScale(scaled.tabs, 'a.md');
        expect(reset.tab._editorTextScale).toBeUndefined();
        expect(scaled.tab._editorTextScale).toBe(120);

        const allScaled = [
            { id: 'a.md', type: 'file', _editorTextScale: 130 },
            { id: 'b.md', type: 'file' },
        ];
        const allReset = resetWorkspaceTabTextScales(allScaled);
        expect(allReset[0]).not.toHaveProperty('_editorTextScale');
        expect(allReset[1]).toBe(allScaled[1]);
    });

    test('restores cursors and advances saves as immutable transitions', () => {
        const tabs = [{ id: 'a.md', type: 'file' }, { id: 'settings', type: 'settings' }];
        const restored = restoreWorkspaceTabCursors(tabs, {
            'a.md': { anchor: 4, head: 7 },
            settings: { anchor: 1, head: 1 },
        });
        expect(restored[0].cursorState).toEqual({ anchor: 4, head: 7 });
        expect(restored[1].cursorState).toBeUndefined();

        const cursor = recordWorkspaceTabCursor(restored, 'a.md', { anchor: 8, head: 8 });
        expect(cursor.tab.cursorState).toEqual({ anchor: 8, head: 8 });
        expect(restored[0].cursorState).toEqual({ anchor: 4, head: 7 });

        const saving = beginWorkspaceTabSave(cursor.tabs, 'a.md');
        expect(saving.tab._saveGeneration).toBe(1);
        expect(cursor.tab._saveGeneration).toBeUndefined();
    });
});
